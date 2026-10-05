import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaintextTestCipher } from '../storage/persistence.js';
import { LocalCredentialStore, newLocalConnectionId } from './credential-store.js';
import { LocalConnectorService } from './local-connectors.js';
import { NotionMcpClient, runNotionTool } from './notion.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function store(): LocalCredentialStore {
  const directory = mkdtempSync(join(tmpdir(), 'sia-connectors-'));
  directories.push(directory);
  return new LocalCredentialStore(join(directory, 'connectors'), new PlaintextTestCipher());
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

describe('LocalCredentialStore', () => {
  it('keeps each connection in its own owner-only encrypted file', () => {
    const credentials = store();
    const id = newLocalConnectionId('github');
    credentials.save(id, {
      app: 'github',
      accessToken: 'token-1',
      clientId: 'client',
      account: 'octo',
    });
    expect(credentials.read(id)).toMatchObject({ accessToken: 'token-1', account: 'octo' });
    expect(statSync(join(credentials.directory, `${id}.enc`)).mode & 0o777).toBe(0o600);
    credentials.remove(id);
    expect(credentials.read(id)).toBeUndefined();
  });

  it('rejects ids that could escape the store or name another app', () => {
    const credentials = store();
    expect(() => credentials.read('../../etc/passwd')).toThrow('Unknown local connection');
    const id = newLocalConnectionId('notion');
    credentials.save(id, { app: 'github', accessToken: 't', clientId: 'c', account: 'a' });
    expect(() => credentials.read(id)).toThrow('does not match');
  });
});

describe('LocalConnectorService', () => {
  it('is unavailable without a registered client, except Notion', () => {
    const service = new LocalConnectorService({
      store: store(),
      clients: {},
      openExternal: async () => undefined,
    });
    expect(service.available('notion')).toBe(true);
    expect(service.available('outlook')).toBe(false);
    expect(service.available('github')).toBe(false);
  });

  it('signs in to GitHub with a device code and saves the account', async () => {
    const credentials = store();
    const { fetch } = fakeFetch((url) => {
      if (url === 'https://github.com/login/device/code') {
        return json({
          device_code: 'device',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          interval: 0,
          expires_in: 60,
        });
      }
      if (url === 'https://github.com/login/oauth/access_token') {
        return json({ access_token: 'gho_token', token_type: 'bearer' });
      }
      if (url === 'https://api.github.com/user') return json({ login: 'octocat' });
      return json({}, 404);
    });
    const openExternal = vi.fn(async () => undefined);
    const onUserCode = vi.fn();
    const service = new LocalConnectorService({
      store: credentials,
      clients: { github: 'Iv1.testclient' },
      openExternal,
      fetch,
    });

    const result = await service.connect('github', { onUserCode });

    expect(onUserCode).toHaveBeenCalledWith('ABCD-1234', 'https://github.com/login/device');
    expect(openExternal).toHaveBeenCalledWith('https://github.com/login/device');
    expect(result.account).toBe('octocat');
    expect(credentials.read(result.connectionId)).toMatchObject({
      app: 'github',
      accessToken: 'gho_token',
      account: 'octocat',
    });
  });

  it('refreshes an expired Outlook token before calling Microsoft Graph', async () => {
    const credentials = store();
    const id = newLocalConnectionId('outlook');
    credentials.save(id, {
      app: 'outlook',
      accessToken: 'old',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
      clientId: 'ms-client',
      account: 'me@example.com',
    });
    const { fetch, calls } = fakeFetch((url) => {
      if (url.endsWith('/oauth2/v2.0/token')) {
        return json({ access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 });
      }
      if (url.startsWith('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages')) {
        return json({
          value: [
            {
              id: 'm1',
              subject: 'Hello',
              from: { emailAddress: { name: 'Ana', address: 'ana@example.com' } },
              isRead: false,
              flag: { flagStatus: 'flagged' },
            },
          ],
        });
      }
      return json({}, 404);
    });
    const service = new LocalConnectorService({
      store: credentials,
      clients: { microsoft: 'ms-client' },
      openExternal: async () => undefined,
      fetch,
    });

    const result = await service.execute('outlook', id, 'outlook_search', {
      unread_only: true,
    });

    expect(result).toEqual({
      messages: [
        expect.objectContaining({
          id: 'm1',
          from: 'Ana <ana@example.com>',
          isRead: false,
          flagged: true,
        }),
      ],
    });
    const refresh = new URLSearchParams(String(calls[0]!.init.body));
    expect(refresh.get('grant_type')).toBe('refresh_token');
    expect(refresh.get('client_id')).toBe('ms-client');
    const graph = new URL(calls[1]!.url);
    expect(graph.searchParams.get('$filter')).toBe('isRead eq false');
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer new');
    expect(credentials.read(id)).toMatchObject({
      accessToken: 'new',
      refreshToken: 'refresh-2',
    });
  });

  it('sends Outlook mail as plain text to the exact recipients', async () => {
    const credentials = store();
    const id = newLocalConnectionId('outlook');
    credentials.save(id, {
      app: 'outlook',
      accessToken: 't',
      clientId: 'c',
      account: 'me@example.com',
    });
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 202 }));
    const service = new LocalConnectorService({
      store: credentials,
      clients: { microsoft: 'c-client-id' },
      openExternal: async () => undefined,
      fetch,
    });

    await service.execute('outlook', id, 'outlook_send', {
      to: ['ana@example.com'],
      subject: 'Lunch',
      body: 'Noon?',
    });

    expect(calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      message: {
        subject: 'Lunch',
        body: { contentType: 'Text', content: 'Noon?' },
        toRecipients: [{ emailAddress: { address: 'ana@example.com' } }],
      },
      saveToSentItems: true,
    });
  });

  it('reports an expired GitHub grant as a reconnect, not a crash', async () => {
    const credentials = store();
    const id = newLocalConnectionId('github');
    credentials.save(id, { app: 'github', accessToken: 't', clientId: 'c', account: 'octo' });
    const { fetch } = fakeFetch(() => json({ message: 'Bad credentials' }, 401));
    const service = new LocalConnectorService({
      store: credentials,
      clients: { github: 'Iv1.testclient' },
      openExternal: async () => undefined,
      fetch,
    });
    await expect(
      service.execute('github', id, 'github_read_issue', { repo: 'o/r', number: 1 }),
    ).rejects.toMatchObject({ reconnectRequired: true });
  });

  it('refuses a connection id that belongs to another app', async () => {
    const service = new LocalConnectorService({
      store: store(),
      clients: { github: 'Iv1.testclient' },
      openExternal: async () => undefined,
    });
    await expect(
      service.execute('github', newLocalConnectionId('notion'), 'github_search', {}),
    ).rejects.toThrow('different app');
  });
});

describe('Notion MCP client', () => {
  function notionServer(updateSchema: Record<string, unknown>) {
    const calls: { method: string; params: unknown }[] = [];
    const { fetch } = fakeFetch(async (_url, init) => {
      const message = JSON.parse(String(init.body)) as {
        id?: number;
        method: string;
        params?: { name?: string };
      };
      calls.push({ method: message.method, params: message.params });
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result =
        message.method === 'initialize'
          ? { protocolVersion: '2025-06-18', capabilities: {} }
          : message.method === 'tools/list'
            ? {
                tools: [
                  { name: 'notion-update-page', inputSchema: { properties: updateSchema } },
                ],
              }
            : { content: [{ type: 'text', text: '{"ok":true}' }] };
      // Reply over SSE, as the hosted server does.
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`,
        {
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'session-1' },
        },
      );
    });
    return { client: new NotionMcpClient(fetch, async () => 'token'), calls };
  }

  it('maps a search onto notion-search after initializing a session', async () => {
    const { client, calls } = notionServer({});
    await expect(runNotionTool(client, 'notion_search', { query: 'roadmap' })).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(calls.map(({ method }) => method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
    ]);
    expect(calls[2]!.params).toEqual({
      name: 'notion-search',
      arguments: { query: 'roadmap' },
    });
  });

  it('shapes a text edit from the schema the server advertises', async () => {
    const flat = notionServer({ page_id: {}, command: {}, old_str: {}, new_str: {} });
    await runNotionTool(flat.client, 'notion_edit_page', {
      page_id: 'p',
      old_text: 'a',
      new_text: 'b',
    });
    expect(flat.calls.at(-1)!.params).toEqual({
      name: 'notion-update-page',
      arguments: { page_id: 'p', command: 'update_content', old_str: 'a', new_str: 'b' },
    });

    const wrapped = notionServer({
      data: { properties: { page_id: {}, command: {}, content_updates: {} } },
    });
    await runNotionTool(wrapped.client, 'notion_edit_page', {
      page_id: 'p',
      old_text: 'a',
      new_text: 'b',
    });
    expect(wrapped.calls.at(-1)!.params).toEqual({
      name: 'notion-update-page',
      arguments: {
        data: {
          page_id: 'p',
          command: 'update_content',
          content_updates: [{ old_str: 'a', new_str: 'b' }],
        },
      },
    });
  });
});
