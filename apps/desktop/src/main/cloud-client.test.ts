import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CloudClient,
  CloudRequestError,
  isConnectionReconnectRequired,
} from './cloud-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('CloudClient', () => {
  it('lists and creates alpha invitations without exposing internal identity fields', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const invite = {
        email: 'participant@example.edu',
        invitedAt: '2026-08-24T02:00:00.000Z',
        status: 'invited',
        subject: 'internal-cognito-subject',
        invitedBy: 'internal-admin-subject',
      };
      if (init?.method === 'POST') return Response.json(invite, { status: 201 });
      return Response.json({ invites: [invite], limit: 20 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'admin-token',
    });

    await expect(client.listAdminInvites()).resolves.toEqual({
      invites: [
        {
          email: 'participant@example.edu',
          invitedAt: '2026-08-24T02:00:00.000Z',
          status: 'invited',
        },
      ],
      limit: 20,
    });
    await expect(client.createAdminInvite('participant@example.edu')).resolves.toEqual({
      invite: {
        email: 'participant@example.edu',
        invitedAt: '2026-08-24T02:00:00.000Z',
        status: 'invited',
      },
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ email: 'participant@example.edu' }),
    });
  });

  it('rejects cloud endpoints that could expose a bearer token over an unsafe URL', () => {
    const tokens = { read: async () => 'secret-relay-token' };
    expect(() => new CloudClient('http://sia.test', tokens)).toThrow(/HTTPS/);
    expect(() => new CloudClient('https://user:pass@sia.test', tokens)).toThrow(/HTTPS/);
  });

  it('preserves only the safe reconnect code from a failed cloud response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            code: 'connection_reconnect_required',
            message: 'provider response containing private upstream details',
          },
          { status: 409, headers: { 'x-request-id': 'request-1' } },
        ),
      ),
    );
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'test-id-token',
    });

    const error: unknown = await client.startConnection('docs').catch((reason) => reason);

    expect(error).toBeInstanceOf(CloudRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: 'connection_reconnect_required',
      requestId: 'request-1',
    });
    expect(isConnectionReconnectRequired(error)).toBe(true);
    expect(String(error)).not.toContain('private upstream details');
  });

  it.each(['https://api.example.test/alpha', 'https://api.example.test/alpha/'])(
    'preserves the API Gateway stage when resolving JSON routes from %s',
    async (baseUrl) => {
      const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
        Response.json({ redirectUrl: 'https://connect.example.test', connectionId: 'one' }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const client = new CloudClient(baseUrl, { read: async () => 'test-id-token' });

      await client.startConnection('gmail');

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'https://api.example.test/alpha/v1/connections/google_workspace',
      );
    },
  );

  it('uses an authenticated cloud capability check for Meta', async () => {
    const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
      Response.json({
        available: true,
        models: ['super_nova_ext'],
        streaming: true,
        tools: true,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test/alpha', {
      read: async () => 'test-id-token',
    });

    await expect(client.capabilities()).resolves.toEqual({
      available: true,
      models: ['super_nova_ext'],
      streaming: true,
      tools: true,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.example.test/alpha/v1/meta/capabilities',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer test-id-token',
    });
  });

  it('rejects an incomplete positive Meta capability response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ available: true, models: [], streaming: true, tools: true }),
      ),
    );
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'test-id-token',
    });

    await expect(client.capabilities()).rejects.toThrow(/incomplete Meta capabilities/);
  });

  it.each(['gmail', 'drive', 'docs', 'sheets', 'slides'] as const)(
    'maps the desktop %s id to the unified Google Workspace app',
    async (desktopId) => {
      const fetchMock = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) =>
        Response.json({
          redirectUrl: 'https://connect.example.test/link',
          connectionId: 'connection-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const client = new CloudClient('https://api.example.test', {
        read: async () => 'test-token',
      });

      await client.startConnection(desktopId);

      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        'https://api.example.test/v1/connections/google_workspace',
      );
    },
  );

  it('uploads connector bytes only to the presigned URL without forwarding bearer credentials', async () => {
    const bytes = new TextEncoder().encode('quarterly totals');
    const request = {
      connectionId: 'drive-connection',
      fileName: 'totals.txt',
      mimeType: 'text/plain',
      byteLength: bytes.byteLength,
      md5: 'a'.repeat(32),
      sha256: 'A'.repeat(43),
    };
    let stagedRequest: Record<string, unknown> | undefined;
    let uploadedBytes: Buffer | undefined;
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.example.test/v1/connector-files/upload-request') {
        stagedRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          file: {
            uploadId: 'upload-1',
            fileName: request.fileName,
            mimeType: request.mimeType,
            byteLength: request.byteLength,
            sha256: request.sha256,
          },
          upload: {
            method: 'PUT',
            url: 'https://provider-upload.example.test/object?signed=yes',
            headers: {
              'content-type': request.mimeType,
              'content-length': String(request.byteLength),
            },
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        });
      }
      uploadedBytes = Buffer.from(new Uint8Array(init?.body as ArrayBuffer));
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'secret-relay-token',
    });

    const descriptor = await client.stageConnectorFile(request, bytes);

    expect(descriptor.uploadId).toBe('upload-1');
    expect(stagedRequest).toEqual(request);
    expect(uploadedBytes).toEqual(Buffer.from('quarterly totals'));
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer secret-relay-token',
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      'content-type': 'text/plain',
      'content-length': String(bytes.byteLength),
    });
    expect(JSON.stringify(fetchMock.mock.calls[1]?.[1]?.headers)).not.toContain(
      'secret-relay-token',
    );
  });

  it('rejects an unsafe provider upload URL before sending file bytes', async () => {
    const bytes = new Uint8Array([1]);
    const fetchMock = vi.fn(async () =>
      Response.json({
        file: {
          uploadId: 'upload-1',
          fileName: 'one.txt',
          mimeType: 'text/plain',
          byteLength: 1,
          sha256: 'A'.repeat(43),
        },
        upload: {
          method: 'PUT',
          url: 'http://provider-upload.example.test/object?signed=yes',
          headers: { 'content-type': 'text/plain', 'content-length': '1' },
          expiresAt: '2030-01-01T00:00:00.000Z',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test', { read: async () => 'token' });

    await expect(
      client.stageConnectorFile(
        {
          connectionId: 'drive-connection',
          fileName: 'one.txt',
          mimeType: 'text/plain',
          byteLength: 1,
          md5: 'a'.repeat(32),
          sha256: 'A'.repeat(43),
        },
        bytes,
      ),
    ).rejects.toThrow(/unsafe file upload URL/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls an accepted research deletion until the exact job completes', async () => {
    const responses = [
      { id: 'deletion-1', scope: 'research', state: 'requested' },
      { deletion: { id: 'deletion-1', scope: 'research', state: 'processing' } },
      { deletion: { id: 'deletion-1', scope: 'research', state: 'completed' } },
    ];
    const calls: Array<{ url: string; method: string | undefined }> = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method });
      return Response.json(responses.shift());
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test/alpha', {
      read: async () => 'test-id-token',
    });

    await expect(
      client.deleteResearchData({ timeoutMs: 100, pollIntervalMs: 0 }),
    ).resolves.toEqual({ id: 'deletion-1', scope: 'research', state: 'completed' });
    expect(calls.map(({ url }) => url)).toEqual([
      'https://api.example.test/alpha/v1/research/delete',
      'https://api.example.test/alpha/v1/research/delete',
      'https://api.example.test/alpha/v1/research/delete',
    ]);
    expect(calls.map(({ method }) => method)).toEqual(['POST', 'GET', 'GET']);
  });

  it('surfaces a failed research deletion and times out bounded polling', async () => {
    const failedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: 'deletion-1', scope: 'research', state: 'requested' }),
      )
      .mockResolvedValueOnce(
        Response.json({
          deletion: {
            id: 'deletion-1',
            scope: 'research',
            state: 'failed',
            failureCode: 'worker_failed',
          },
        }),
      );
    vi.stubGlobal('fetch', failedFetch);
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'test-id-token',
    });

    await expect(
      client.deleteResearchData({ timeoutMs: 100, pollIntervalMs: 0 }),
    ).rejects.toThrow('worker_failed');

    const pendingFetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) =>
      Response.json(
        init?.method === 'POST'
          ? { id: 'deletion-2', scope: 'research', state: 'requested' }
          : { deletion: { id: 'deletion-2', scope: 'research', state: 'processing' } },
      ),
    );
    vi.stubGlobal('fetch', pendingFetch);
    await expect(
      client.deleteResearchData({ timeoutMs: 2, pollIntervalMs: 0 }),
    ).rejects.toThrow('safety timeout');
    expect(pendingFetch).toHaveBeenCalledTimes(3);
  });

  it('requires the exact accepted account deletion job to complete', async () => {
    const responses = [
      { id: 'account-deletion-1', scope: 'account', state: 'requested' },
      {
        deletion: {
          id: 'account-deletion-1',
          scope: 'account',
          state: 'identity_deleted',
        },
      },
      { deletion: { id: 'account-deletion-1', scope: 'account', state: 'completed' } },
    ];
    const bodies: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        if (init?.body) bodies.push(JSON.parse(String(init.body)));
        return Response.json(responses.shift());
      }),
    );
    const client = new CloudClient('https://api.example.test', {
      read: async () => 'test-id-token',
    });

    await expect(
      client.deleteAccountData({ timeoutMs: 100, pollIntervalMs: 0 }),
    ).resolves.toEqual({
      id: 'account-deletion-1',
      scope: 'account',
      state: 'completed',
    });
    expect(bodies).toEqual([{ scope: 'account' }]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ id: 'wrong-scope', scope: 'research', state: 'completed' }),
      ),
    );
    await expect(client.deleteAccountData()).rejects.toThrow(
      'returned a research job for account deletion',
    );
  });

  it('translates streamed Meta tool calls without exposing the relay credential', async () => {
    const frames = [
      { type: 'started', turnId: 'turn-1', sessionId: 'session-1', model: 'meta-model' },
      { type: 'delta', text: 'Checking.' },
      {
        type: 'tool_call_delta',
        delta: [
          {
            index: 0,
            id: 'call-1',
            function: { name: 'browser_tabs', arguments: '{}' },
          },
        ],
      },
      { type: 'done', finishReason: 'tool_calls' },
    ];
    let submitted: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const body = frames
        .map((frame) => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`)
        .join('');
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test/alpha', {
      read: async () => 'secret-relay-token',
    });
    const events = [];

    for await (const event of client.stream({
      sessionId: 'session-1',
      turnId: 'turn-1',
      model: 'meta-model',
      instructions: 'Be careful.',
      input: [{ type: 'user_message', text: 'List tabs.' }],
      tools: [
        {
          name: 'browser_tabs',
          description: 'List granted tabs.',
          inputSchema: { type: 'object', properties: {} },
          annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
        },
      ],
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'tool_call',
      callId: 'call-1',
      name: 'browser_tabs',
      arguments: {},
    });
    expect(events.at(-1)).toMatchObject({ type: 'completed', stopReason: 'tool_calls' });
    expect(JSON.stringify(submitted)).not.toContain('secret-relay-token');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer secret-relay-token',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.example.test/alpha/v1/meta/turns',
    );
  });

  it('does not duplicate a user message when a failed Meta relay turn is retried', async () => {
    const submitted: Array<{ messages?: Array<{ role: string; content: string }> }> = [];
    const fetchMock = vi
      .fn(async (_url: URL, init?: RequestInit) => {
        submitted.push(
          JSON.parse(String(init?.body)) as {
            messages?: Array<{ role: string; content: string }>;
          },
        );
        return new Response('unavailable', { status: 503 });
      })
      .mockImplementationOnce(async (_url: URL, init?: RequestInit) => {
        submitted.push(
          JSON.parse(String(init?.body)) as {
            messages?: Array<{ role: string; content: string }>;
          },
        );
        return new Response('unavailable', { status: 503 });
      })
      .mockImplementationOnce(async (_url: URL, init?: RequestInit) => {
        submitted.push(
          JSON.parse(String(init?.body)) as {
            messages?: Array<{ role: string; content: string }>;
          },
        );
        return sseResponse([{ type: 'done', finishReason: 'stop' }]);
      });
    vi.stubGlobal('fetch', fetchMock);
    const client = new CloudClient('https://api.example.test', { read: async () => 'token' });
    const request = {
      sessionId: 'session-retry',
      turnId: 'turn-retry',
      model: 'meta-model',
      instructions: 'Be careful.',
      input: [{ type: 'user_message' as const, text: 'Try this exactly once.' }],
      tools: [],
    };

    await expect(consume(client.stream(request))).rejects.toThrow('Meta relay failed (503)');
    await consume(client.stream(request));

    expect(submitted).toHaveLength(2);
    for (const body of submitted) {
      expect(
        body.messages?.filter(
          ({ role, content }) => role === 'user' && content === 'Try this exactly once.',
        ),
      ).toHaveLength(1);
    }
  });

  it('bounds retained Meta relay history across long sessions', async () => {
    let lastMessages: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { messages?: unknown[] };
        lastMessages = body.messages ?? [];
        return sseResponse([
          { type: 'delta', text: 'Done.' },
          { type: 'done', finishReason: 'stop' },
        ]);
      }),
    );
    const client = new CloudClient('https://api.example.test', { read: async () => 'token' });

    for (let index = 0; index < 50; index += 1) {
      await consume(
        client.stream({
          sessionId: 'long-session',
          turnId: `turn-${index}`,
          model: 'meta-model',
          instructions: 'Stay concise.',
          input: [{ type: 'user_message', text: `Request ${index}` }],
          tools: [],
        }),
      );
    }

    expect(lastMessages.length).toBeLessThanOrEqual(81);
    expect(lastMessages[0]).toMatchObject({ role: 'system' });
    expect(lastMessages.at(-1)).toMatchObject({ role: 'user', content: 'Request 49' });
  });
});

async function consume<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

function sseResponse(frames: readonly Record<string, unknown>[]): Response {
  return new Response(
    frames
      .map((frame) => `event: ${String(frame.type)}\ndata: ${JSON.stringify(frame)}\n\n`)
      .join(''),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}
