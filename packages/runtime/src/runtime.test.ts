import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderSessionOptions, ThreadEventEnvelope } from '@sia/protocol';
import type { JsonRpcMessage, JsonRpcTransport } from './json-rpc.js';
import { JsonLinesTransport, JsonRpcPeer, parseJsonRpcMessage } from './json-rpc.js';
import {
  compareVersions,
  discoverCli,
  isVersionSupported,
  parseCliVersion,
} from './discovery.js';
import { ProcessSupervisor, sanitizedEnvironment } from './supervisor.js';
import {
  codexAppServerArgs,
  SIA_CODEX_DISABLED_FEATURES,
  SIA_CODEX_ENABLED_FEATURES,
} from './providers/codex-isolation.js';
import { CodexAppServerAdapter } from './providers/codex.js';
import {
  AcpAdapter,
  createGeminiAdapter,
  createGrokAdapter,
  defaultAcpCommandArgs,
} from './providers/acp.js';
import {
  claudeCliArgs,
  claudeMcpConfig,
  ClaudeCliAdapter,
  parseClaudeAuthStatus,
} from './providers/claude.js';
import {
  MetaStreamingAdapter,
  type MetaStreamEvent,
  type MetaTransport,
  type MetaTurnRequest,
} from './providers/meta.js';

class MemoryTransport implements JsonRpcTransport {
  peer?: MemoryTransport;
  readonly listeners = new Set<(message: JsonRpcMessage) => void>();
  sent: JsonRpcMessage[] = [];
  send(message: JsonRpcMessage): void {
    this.sent.push(message);
    queueMicrotask(() => {
      for (const listener of this.peer?.listeners ?? []) listener(message);
    });
  }
  onMessage(listener: (message: JsonRpcMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    this.listeners.clear();
  }
}

function linkedPeers(): { client: JsonRpcPeer; server: JsonRpcPeer } {
  const a = new MemoryTransport();
  const b = new MemoryTransport();
  a.peer = b;
  b.peer = a;
  return { client: new JsonRpcPeer(a), server: new JsonRpcPeer(b) };
}

const sessionOptions = {
  threadId: 'thread-1',
  model: 'model-1',
  workspace: '/tmp/workspace',
  instructions: 'Be useful',
  tools: [
    {
      name: 'browser_tabs',
      description: 'List tabs',
      inputSchema: { type: 'object' },
      annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
    },
  ],
} as const;

const isolatedCodexFeatures = Object.fromEntries([
  ...SIA_CODEX_DISABLED_FEATURES.map((feature) => [feature, false] as const),
  ...SIA_CODEX_ENABLED_FEATURES.map((feature) => [feature, true] as const),
]);

const isolatedCodexConfig = {
  features: isolatedCodexFeatures,
  web_search: 'live',
  notify: [],
  orchestrator: { skills: { enabled: false }, mcp: { enabled: false } },
  skills: { include_instructions: false, bundled: { enabled: false } },
  mcp_servers: { inherited: { command: 'do-not-run' } },
};

function codexIsolationResponse(method: string, params: unknown): unknown {
  if (method === 'config/read') return { config: isolatedCodexConfig };
  if (method === 'skills/list')
    return {
      data: [
        {
          cwd: '/tmp/workspace',
          skills: [
            {
              name: 'inherited-skill',
              path: '/tmp/inherited/SKILL.md',
              scope: 'user',
              enabled: true,
            },
          ],
          errors: [],
        },
      ],
    };
  if (method === 'hooks/list')
    return {
      data: [{ cwd: '/tmp/workspace', hooks: [{ enabled: false }], errors: [], warnings: [] }],
    };
  if (method === 'experimentalFeature/list')
    return {
      data: Object.entries(isolatedCodexFeatures).map(([name, enabled]) => ({ name, enabled })),
      nextCursor: null,
    };
  if (method === 'app/list') return { data: [], nextCursor: null };
  if (method === 'plugin/list')
    return { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] };
  if (method === 'mcpServerStatus/list')
    return {
      data: [
        {
          name: 'inherited',
          serverInfo: null,
          tools: {},
          resources: [],
          resourceTemplates: [],
        },
      ],
      nextCursor: null,
    };
  if (method === 'thread/unsubscribe') return { status: 'unsubscribed' };
  return undefined;
}

describe('JSON-RPC transport and peer', () => {
  it('frames split JSON lines and ignores invalid lines', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new JsonLinesTransport(input, output);
    const messages: JsonRpcMessage[] = [];
    transport.onMessage((message) => messages.push(message));
    input.write('not-json\n{"jsonrpc":"2.0","method":"hel');
    input.write('lo","params":{}}\n');
    await new Promise((resolve) => setImmediate(resolve));
    expect(messages).toEqual([{ jsonrpc: '2.0', method: 'hello', params: {} }]);
    transport.close();
  });

  it('rejects pending requests as soon as the peer’s output ends', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const peer = new JsonRpcPeer(new JsonLinesTransport(input, output));
    const pending = peer.request('slow');
    input.end();
    await expect(pending).rejects.toThrow('JSON-RPC input ended');
    await expect(peer.request('after')).rejects.toThrow('closed');
    await peer.close();
  });

  it('closes with an error instead of buffering an unbounded line', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new JsonLinesTransport(input, output, { maxBufferCharacters: 16 });
    const peer = new JsonRpcPeer(transport);
    const pending = peer.request('slow');
    const closed = new Promise<Error | undefined>((resolve) => transport.onClose(resolve));
    input.write('{"jsonrpc":"2.0","method":"x",');
    input.write('"params":"0123456789"');
    await expect(closed).resolves.toMatchObject({
      message: expect.stringContaining('size limit'),
    });
    await expect(pending).rejects.toThrow('size limit');
    expect(input.destroyed).toBe(true);
    await peer.close();
  });

  it('normalizes Codex app-server envelopes that omit the jsonrpc member', () => {
    expect(parseJsonRpcMessage({ id: 1, result: { ok: true } })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true },
    });
    expect(parseJsonRpcMessage({ method: 'thread/started', params: {} })).toEqual({
      jsonrpc: '2.0',
      method: 'thread/started',
      params: {},
    });
    expect(() => parseJsonRpcMessage({ jsonrpc: '1.0', id: 1, result: {} })).toThrow(
      'Invalid JSON-RPC envelope',
    );
  });

  it('supports requests, notifications, and server callbacks', async () => {
    const { client, server } = linkedPeers();
    let notification = '';
    server.onNotification((method) => {
      notification = method;
    });
    server.onRequest(async (method, params) => ({ method, params }));
    await client.notify('ready');
    const result = await client.request<{ method: string }>('echo', { ok: true });
    expect(notification).toBe('ready');
    expect(result.method).toBe('echo');
    await Promise.all([client.close(), server.close()]);
  });

  it('does not reject an event callback when an error response cannot reach a dead peer', async () => {
    let receive: ((message: JsonRpcMessage) => void) | undefined;
    const transport: JsonRpcTransport = {
      send: vi.fn(async () => {
        throw new Error('peer disconnected');
      }),
      onMessage: (listener) => {
        receive = listener;
        return () => {
          receive = undefined;
        };
      },
      close: () => undefined,
    };
    const peer = new JsonRpcPeer(transport);
    peer.onRequest(async () => {
      throw new Error('request failed');
    });

    receive?.({ jsonrpc: '2.0', id: 7, method: 'failing/request' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(transport.send).toHaveBeenCalledTimes(1);
    await peer.close();
  });
});

describe('CLI discovery', () => {
  it('parses and compares semantic CLI versions', () => {
    expect(parseCliVersion('codex-cli 0.147.0')).toBe('0.147.0');
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('0.155.0-alpha.9.2', '0.155.0-alpha.9')).toBe(1);
    expect(compareVersions('0.155.0-alpha.10', '0.155.0-alpha.9.2')).toBe(1);
    expect(compareVersions('0.155.0', '0.155.0-alpha.9.2')).toBe(1);
    const pinned = {
      minimum: '0.147.0',
      maximumExclusive: '0.154.0',
      additionalVersions: ['0.155.0-alpha.9', '0.155.0-alpha.9.2'],
    };
    expect(isVersionSupported('0.155.0-alpha.9', pinned)).toBe(true);
    expect(isVersionSupported('0.155.0-alpha.9.2', pinned)).toBe(true);
    for (const version of [
      '0.154.0',
      '0.154.0-alpha.1',
      '0.150.0-alpha.1',
      '0.155.0-alpha.8',
      '0.155.0-alpha.10',
      '0.155.0',
      '0.156.0',
    ])
      expect(isVersionSupported(version, pinned)).toBe(false);
    expect(
      isVersionSupported('0.147.2', { minimum: '0.147.0', maximumExclusive: '0.148.0' }),
    ).toBe(true);
  });

  it('reports unsupported versions without throwing', async () => {
    const result = await discoverCli({
      command: 'codex',
      range: { minimum: '2.0.0' },
      runner: { run: async () => ({ code: 0, stdout: 'codex 1.0.0', stderr: '' }) },
    });
    expect(result).toMatchObject({ available: true, supported: false, version: '1.0.0' });
  });

  it('strips secret-looking environment values', () => {
    expect(
      sanitizedEnvironment({
        PATH: '/bin',
        API_TOKEN: 'secret',
        USER: 'sia',
        DATABASE_URL: 'postgres://secret',
        SENTRY_DSN: 'https://secret',
      }),
    ).toEqual({
      PATH: '/bin',
      USER: 'sia',
    });
    expect(() => sanitizedEnvironment({}, { PASSWORD: 'no' })).toThrow(/not permitted/);
    expect(() => sanitizedEnvironment({}, { DATABASE_URL: 'postgres://secret' })).toThrow(
      /not permitted/,
    );
  });

  it('observes provider spawn failures without creating a second rejected promise', async () => {
    const supervisor = new ProcessSupervisor();
    const process = supervisor.spawn({
      command: '/definitely/not/a/sia-provider',
      args: [],
    });

    await expect(process.exited).rejects.toBeInstanceOf(Error);
    await new Promise((resolve) => setImmediate(resolve));
    expect(supervisor.size).toBe(0);
    await supervisor.dispose();
  });
});

describe('Codex app-server adapter', () => {
  it('pins the provider-native surface off at process launch', () => {
    expect(SIA_CODEX_DISABLED_FEATURES).toEqual([
      'apps',
      'plugins',
      'hooks',
      'skill_search',
      'skill_mcp_dependency_install',
      'browser_use',
      'browser_use_external',
      'browser_use_full_cdp_access',
      'in_app_browser',
      'computer_use',
      'image_generation',
      'terminal_visualization_instructions',
      'artifact',
    ]);
    expect(SIA_CODEX_ENABLED_FEATURES).toEqual([
      'shell_tool',
      'unified_exec',
      'view_image',
      'multi_agent',
    ]);
    const args = codexAppServerArgs();
    expect(args.slice(0, 3)).toEqual(['app-server', '--listen', 'stdio://']);
    for (const feature of SIA_CODEX_DISABLED_FEATURES) {
      const index = args.findIndex(
        (value, candidate) => value === '--disable' && args[candidate + 1] === feature,
      );
      expect(index, `missing --disable ${feature}`).toBeGreaterThanOrEqual(0);
    }
    for (const feature of SIA_CODEX_ENABLED_FEATURES) {
      const index = args.findIndex(
        (value, candidate) => value === '--enable' && args[candidate + 1] === feature,
      );
      expect(index, `missing --enable ${feature}`).toBeGreaterThanOrEqual(0);
    }
    expect(args).toContain('skills.include_instructions=false');
    expect(args).toContain('skills.bundled.enabled=false');
    expect(args).toContain('orchestrator.skills.enabled=false');
    expect(args).toContain('orchestrator.mcp.enabled=false');
    expect(args).toContain('notify=[]');
    expect(args).toContain('web_search="live"');
    expect(args.at(-1)).toBe('--strict-config');
  });

  it('holds concurrent account requests until the Codex handshake completes', async () => {
    const peers = linkedPeers();
    const methods: string[] = [];
    let finishInitialize!: () => void;
    const initialized = new Promise<void>((resolve) => {
      finishInitialize = resolve;
    });
    peers.server.onNotification((method) => {
      methods.push(method);
    });
    peers.server.onRequest(async (method) => {
      methods.push(method);
      if (method === 'initialize') {
        await initialized;
        return {};
      }
      if (method === 'account/read') return { account: null };
      throw new Error(`unexpected ${method}`);
    });
    const dispose = vi.fn(async () => {
      await peers.client.close();
      await peers.server.close();
    });
    const factory = vi.fn(async () => ({ peer: peers.client, dispose }));
    const adapter = new CodexAppServerAdapter({ peerFactory: factory });
    const first = adapter.account();
    await vi.waitFor(() => expect(methods).toEqual(['initialize']));
    const second = adapter.account();
    await new Promise((resolve) => setImmediate(resolve));
    const beforeHandshake = [...methods];
    finishInitialize();
    try {
      await Promise.all([first, second]);
      expect(beforeHandshake).toEqual(['initialize']);
      expect(methods).toEqual(['initialize', 'initialized', 'account/read', 'account/read']);
      expect(factory).toHaveBeenCalledTimes(1);
    } finally {
      await adapter.dispose();
    }
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a failed Codex handshake and retries with a fresh peer', async () => {
    const failed = linkedPeers();
    const fresh = linkedPeers();
    failed.server.onRequest(async () => {
      throw new Error('handshake failed');
    });
    const methods: string[] = [];
    fresh.server.onRequest(async (method) => {
      methods.push(method);
      return method === 'account/read' ? { account: null } : {};
    });
    const disposeFailed = vi.fn(async () => {
      await failed.client.close();
      await failed.server.close();
    });
    const factory = vi
      .fn()
      .mockResolvedValueOnce({ peer: failed.client, dispose: disposeFailed })
      .mockResolvedValueOnce({
        peer: fresh.client,
        dispose: async () => {
          await fresh.client.close();
          await fresh.server.close();
        },
      });
    const adapter = new CodexAppServerAdapter({ peerFactory: factory });
    try {
      await expect(adapter.account()).rejects.toThrow('handshake failed');
      expect(disposeFailed).toHaveBeenCalledTimes(1);
      await expect(adapter.account()).resolves.toMatchObject({ state: 'unauthenticated' });
      expect(methods).toEqual(['initialize', 'account/read']);
      expect(factory).toHaveBeenCalledTimes(2);
    } finally {
      await adapter.dispose();
    }
  });

  it('keeps reset reusable and retires a late pre-reset peer without replacing the new connection', async () => {
    const old = linkedPeers();
    const fresh = linkedPeers();
    let releaseOld!: (value: { peer: JsonRpcPeer; dispose(): Promise<void> }) => void;
    const pending = new Promise<{ peer: JsonRpcPeer; dispose(): Promise<void> }>((resolve) => {
      releaseOld = resolve;
    });
    const oldDispose = vi.fn(async () => {
      await old.client.close();
      await old.server.close();
    });
    const freshDispose = vi.fn(async () => {
      await fresh.client.close();
      await fresh.server.close();
    });
    const methods: string[] = [];
    fresh.server.onRequest(async (method) => {
      methods.push(method);
      return method === 'account/read' ? { account: null } : {};
    });
    const factory = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ peer: fresh.client, dispose: freshDispose });
    const adapter = new CodexAppServerAdapter({ peerFactory: factory });
    const first = adapter.account();
    const firstRejected = expect(first).rejects.toThrow('reset during initialization');
    await adapter.dispose();
    try {
      await expect(adapter.account()).resolves.toMatchObject({ state: 'unauthenticated' });
      releaseOld({ peer: old.client, dispose: oldDispose });
      await firstRejected;
      await adapter.account();
      expect(oldDispose).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledTimes(2);
      expect(methods).toEqual(['initialize', 'account/read', 'account/read']);
    } finally {
      await adapter.dispose();
    }
    expect(freshDispose).toHaveBeenCalledTimes(1);
  });

  it('runs an included model through a scoped Responses provider without Codex-plan login', async () => {
    const peers = linkedPeers();
    let threadStartParams: unknown;
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'account/read') throw new Error('native account must not be read');
      if (method === 'thread/start') {
        threadStartParams = params;
        return { thread: { id: 'native-meta-thread' } };
      }
      if (method === 'experimentalFeature/list') {
        return {
          data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
            ([name, enabled]) => ({ name, enabled }),
          ),
          nextCursor: null,
        };
      }
      const isolationResponse = codexIsolationResponse(method, params);
      if (isolationResponse !== undefined) return isolationResponse;
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      providerId: 'meta',
      accountOverride: {
        state: 'authenticated',
        billing: 'included',
        label: 'Included with Sia',
      },
      customModelProvider: async (session) => ({
        id: 'sia_included',
        name: 'Sia included models',
        baseUrl: 'http://127.0.0.1:43210/v1',
        bearerToken: `scoped-${session.model}`,
      }),
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });

    expect(adapter.id).toBe('meta');
    await expect(adapter.account()).resolves.toEqual({
      state: 'authenticated',
      billing: 'included',
      label: 'Included with Sia',
    });
    await adapter.createSession({ ...sessionOptions, model: 'meta/spark' });
    expect(threadStartParams).toMatchObject({
      model: 'meta/spark',
      config: {
        features: { ...isolatedCodexFeatures, multi_agent: false },
        web_search: 'disabled',
        model_provider: 'sia_included',
        model_providers: {
          sia_included: {
            name: 'Sia included models',
            base_url: 'http://127.0.0.1:43210/v1',
            wire_api: 'responses',
            experimental_bearer_token: 'scoped-meta/spark',
            supports_standalone_web_search: false,
          },
        },
      },
    });
    await adapter.dispose();
  });

  it('runs the official Codex ChatGPT browser login and verifies the connected plan', async () => {
    const peers = linkedPeers();
    const requests: Array<{ method: string; params: unknown }> = [];
    peers.server.onRequest(async (method, params) => {
      requests.push({ method, params });
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'account/login/start') {
        return {
          type: 'chatgpt',
          loginId: 'login-1',
          authUrl: 'https://auth.openai.com/authorize?client_id=sia-test',
        };
      }
      if (method === 'account/read') {
        return { account: { email: 'person@example.com', type: 'chatgpt' } };
      }
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });

    const login = await adapter.startChatGptLogin();
    expect(login).toEqual({
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/authorize?client_id=sia-test',
    });
    expect(requests).toContainEqual({
      method: 'account/login/start',
      params: {
        type: 'chatgpt',
        useHostedLoginSuccessPage: true,
        appBrand: 'chatgpt',
      },
    });

    const completed = adapter.waitForChatGptLogin(login.loginId);
    await peers.server.notify('account/login/completed', {
      loginId: login.loginId,
      success: true,
      error: null,
    });
    await expect(completed).resolves.toEqual({
      state: 'authenticated',
      label: 'person@example.com',
      billing: 'subscription',
    });
    expect(requests).toContainEqual({
      method: 'account/read',
      params: { refreshToken: true },
    });
    await adapter.dispose();
  });

  it('refuses a Codex login URL outside OpenAI and ChatGPT', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method) => {
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'account/login/start') {
        return {
          type: 'chatgpt',
          loginId: 'login-unsafe',
          authUrl: 'https://example.com/steal-session',
        };
      }
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });

    await expect(adapter.startChatGptLogin()).rejects.toThrow('untrusted sign-in link');
    await adapter.dispose();
  });

  it('performs handshake/account/session/turn and dynamic tool callbacks', async () => {
    const peers = linkedPeers();
    const methods: string[] = [];
    const requests: Array<{ method: string; params: unknown }> = [];
    let threadStartParams: unknown;
    peers.server.onNotification((method) => methods.push(method));
    peers.server.onRequest(async (method, params) => {
      methods.push(method);
      requests.push({ method, params });
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'account/read')
        return { account: { email: 'person@example.com', type: 'chatgpt' } };
      if (method === 'thread/start') {
        threadStartParams = params;
        return { thread: { id: 'native-thread' } };
      }
      if (method === 'thread/inject_items') return {};
      if (method === 'turn/start') {
        await peers.server.notify('item/agentMessage/delta', {
          threadId: 'native-thread',
          turnId: 'native-turn',
          itemId: 'm1',
          delta: 'Hi',
        });
        for (const item of [
          {
            id: 'commandExecution',
            type: 'commandExecution',
            command: 'pnpm test',
            cwd: '/tmp/workspace',
            status: 'completed',
            aggregatedOutput: '20 passed',
            exitCode: 0,
            durationMs: 912,
          },
          {
            id: 'fileChange',
            type: 'fileChange',
            status: 'completed',
            changes: [
              { path: 'src/index.ts', kind: 'update', diff: '+ready' },
              // App Server v2 shape: PatchChangeKind is an object.
              { path: 'notes/new.md', kind: { type: 'add' }, diff: 'one\ntwo\n' },
              { path: 'old.txt', kind: { type: 'delete' }, diff: 'gone\n' },
              {
                path: 'draft.md',
                kind: { type: 'update', move_path: 'final.md' },
                diff: '@@ -1 +1 @@\n-a\n+b\n',
              },
              { path: 'plain.md', kind: { type: 'update', move_path: null }, diff: '' },
            ],
          },
          {
            id: 'webSearch',
            type: 'webSearch',
            query: 'Sia docs',
            results: [{ title: 'Sia', url: 'https://example.com/sia' }],
          },
          { id: 'imageView', type: 'imageView', path: '/tmp/workspace/screenshot.png' },
          {
            id: 'dynamicToolCall',
            type: 'dynamicToolCall',
            name: 'browser_tabs',
            status: 'completed',
          },
        ]) {
          await peers.server.notify('item/completed', {
            threadId: 'native-thread',
            turnId: 'native-turn',
            item,
          });
        }
        await peers.server.notify('item/completed', {
          threadId: 'native-thread',
          turnId: 'native-turn',
          item: {
            id: 'spawn-1',
            type: 'collabAgentToolCall',
            tool: 'spawnAgent',
            status: 'completed',
            senderThreadId: 'native-thread',
            receiverThreadIds: ['child-thread'],
            prompt: 'Audit the renderer',
            model: 'gpt-5.6',
            reasoningEffort: 'high',
            agentsStates: { 'child-thread': { status: 'running', message: null } },
          },
        });
        await peers.server.notify('turn/completed', {
          threadId: 'native-thread',
          turn: { id: 'native-turn', status: 'completed' },
        });
        return { turn: { id: 'native-turn' } };
      }
      if (method === 'review/start') {
        await peers.server.notify('item/started', {
          threadId: 'native-thread',
          turnId: 'review-turn',
          item: {
            id: 'review-mode',
            type: 'enteredReviewMode',
            review: 'Review uncommitted changes',
          },
        });
        await peers.server.notify('turn/completed', {
          threadId: 'native-thread',
          turn: { id: 'review-turn', status: 'completed' },
        });
        return { turn: { id: 'review-turn' }, reviewThreadId: 'native-thread' };
      }
      if (method === 'turn/interrupt') return {};
      const isolationResponse = codexIsolationResponse(method, params);
      if (isolationResponse !== undefined) return isolationResponse;
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
      dynamicToolHandler: async (call) => ({
        success: true,
        content: {
          called: call.name,
          images: [{ mimeType: 'image/png', dataBase64: 'cGl4ZWxz' }],
        },
      }),
    });
    expect(await adapter.account()).toMatchObject({
      state: 'authenticated',
      label: 'person@example.com',
    });
    const session = await adapter.createSession({
      ...sessionOptions,
      history: [
        { id: 'prior-user', role: 'user', text: 'Keep this private.' },
        { id: 'prior-assistant', role: 'assistant', text: 'Understood.' },
      ],
    });
    expect(requests.filter(({ method }) => method === 'config/read')).toEqual([
      { method: 'config/read', params: { cwd: '/tmp/workspace', includeLayers: false } },
      { method: 'config/read', params: { cwd: '/tmp/workspace', includeLayers: false } },
    ]);
    for (const method of ['skills/list', 'hooks/list']) {
      const inventoryRequests = requests.filter((request) => request.method === method);
      expect(inventoryRequests).toHaveLength(2);
      for (const request of inventoryRequests) {
        expect(request.params).toMatchObject({ cwds: ['/tmp/workspace'] });
      }
    }
    expect(threadStartParams).toMatchObject({
      ephemeral: true,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      developerInstructions: 'Be useful',
      config: {
        features: isolatedCodexFeatures,
        web_search: 'live',
        notify: [],
        orchestrator: { skills: { enabled: false }, mcp: { enabled: false } },
        skills: {
          include_instructions: false,
          bundled: { enabled: false },
          config: [{ path: '/tmp/inherited/SKILL.md', enabled: false }],
        },
        mcp_servers: { inherited: { enabled: false } },
      },
    });
    expect(requests.find(({ method }) => method === 'thread/inject_items')?.params).toEqual({
      threadId: 'native-thread',
      items: [
        {
          type: 'message',
          id: 'prior-user',
          role: 'user',
          content: [{ type: 'input_text', text: 'Keep this private.' }],
        },
        {
          type: 'message',
          id: 'prior-assistant',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Understood.' }],
        },
      ],
    });
    const events = [];
    for await (const event of adapter.sendTurn(session, { turnId: 'turn-1', text: 'hello' }))
      events.push(event);
    expect(events.map((event) => event.type)).toEqual([
      'message',
      'tool',
      'tool',
      'tool',
      'tool',
      'tool',
      'subagent',
      'completion',
    ]);
    expect(
      events.filter((event) => event.type === 'tool').map((event) => event.payload.name),
    ).toEqual(['commandExecution', 'fileChange', 'webSearch', 'imageView', 'browser_tabs']);
    expect(events.find((event) => event.type === 'tool')?.payload.presentation).toMatchObject({
      kind: 'command',
      command: 'pnpm test',
      output: '20 passed',
      exitCode: 0,
    });
    const fileChangeEvent = events.find(
      (event) => event.type === 'tool' && event.payload.name === 'fileChange',
    );
    expect(fileChangeEvent?.type === 'tool' && fileChangeEvent.payload.presentation).toEqual({
      kind: 'file_change',
      files: [
        { path: 'src/index.ts', change: 'update', diff: '+ready' },
        { path: 'notes/new.md', change: 'add', diff: 'one\ntwo\n' },
        { path: 'old.txt', change: 'delete', diff: 'gone\n' },
        {
          path: 'draft.md',
          change: 'rename',
          movePath: 'final.md',
          diff: '@@ -1 +1 @@\n-a\n+b\n',
        },
        { path: 'plain.md', change: 'update' },
      ],
    });
    const dynamicToolEvent = events.find(
      (event) => event.type === 'tool' && event.payload.name === 'browser_tabs',
    );
    const nativeToolEvent = events.find(
      (event) => event.type === 'tool' && event.payload.name === 'webSearch',
    );
    expect(dynamicToolEvent?.type).toBe('tool');
    expect(nativeToolEvent?.type).toBe('tool');
    if (dynamicToolEvent?.type !== 'tool' || nativeToolEvent?.type !== 'tool') {
      throw new Error('Expected both dynamic and provider-native tool events.');
    }
    expect(dynamicToolEvent.payload.native).toBe(false);
    expect(nativeToolEvent.payload.native).toBe(true);
    expect(events.find((event) => event.type === 'subagent')?.payload).toMatchObject({
      subagentId: 'child-thread',
      operation: 'spawn',
      model: 'gpt-5.6',
      phase: 'started',
    });
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const reviewEvents = [];
    for await (const event of adapter.startReview(session, {
      turnId: 'review-1',
      target: { type: 'uncommitted_changes' },
    })) {
      reviewEvents.push(event);
    }
    expect(requests.find(({ method }) => method === 'review/start')?.params).toEqual({
      threadId: 'native-thread',
      target: { type: 'uncommittedChanges' },
      delivery: 'inline',
    });
    expect(reviewEvents.map((event) => event.type)).toEqual(['tool', 'completion']);
    expect(reviewEvents[0]?.type === 'tool' && reviewEvents[0].payload.presentation).toEqual({
      kind: 'review',
      phase: 'entered',
      review: 'Review uncommitted changes',
    });
    const toolResult = await peers.server.request<Record<string, unknown>>('item/tool/call', {
      callId: 'call-1',
      name: 'browser_tabs',
      arguments: {},
    });
    expect(toolResult.success).toBe(true);
    expect(toolResult.contentItems).toEqual([
      { type: 'inputText', text: '{"called":"browser_tabs"}' },
      { type: 'inputImage', imageUrl: 'data:image/png;base64,cGl4ZWxz' },
    ]);
    expect(JSON.stringify(toolResult.contentItems)).not.toContain('"images"');
    expect(methods).toContain('initialized');
    await adapter.dispose();
  });

  it('fails closed without surfacing sensitive provider inventory errors', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method) => {
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'config/read')
        throw new Error('credential and private server details must not escape');
      if (method === 'skills/list' || method === 'hooks/list') return { data: [] };
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const error = await adapter.createSession(sessionOptions).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Codex isolation failed closed: Codex extension inventory could not be read safely.',
    );
    expect((error as Error).message).not.toMatch(/credential|private server/);
    await adapter.dispose();
  });

  it('fails closed when workspace hook enumeration reports a warning', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'hooks/list') {
        return {
          data: [
            {
              cwd: '/tmp/workspace',
              hooks: [],
              errors: [],
              warnings: ['private hook details must not escape'],
            },
          ],
        };
      }
      const isolationResponse = codexIsolationResponse(method, params);
      if (isolationResponse !== undefined) return isolationResponse;
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const error = await adapter.createSession(sessionOptions).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Codex isolation failed closed: Codex extension inventory could not be read safely.',
    );
    expect((error as Error).message).not.toContain('private hook details');
    await adapter.dispose();
  });

  it('rejects a session when an inherited MCP server exposes any tool', async () => {
    const peers = linkedPeers();
    let unsubscribeCount = 0;
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { userAgent: 'fake' };
      if (method === 'thread/start') return { thread: { id: 'native-thread' } };
      if (method === 'mcpServerStatus/list')
        return {
          data: [
            {
              name: 'inherited',
              serverInfo: null,
              tools: { unsafe: { name: 'unsafe' } },
              resources: [],
              resourceTemplates: [],
            },
          ],
          nextCursor: null,
        };
      if (method === 'thread/unsubscribe') {
        unsubscribeCount += 1;
        return { status: 'unsubscribed' };
      }
      const isolationResponse = codexIsolationResponse(method, params);
      if (isolationResponse !== undefined) return isolationResponse;
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    await expect(adapter.createSession(sessionOptions)).rejects.toThrow(
      'Codex isolation failed closed: Codex isolation verification failed.',
    );
    expect(unsubscribeCount).toBe(1);
    await adapter.dispose();
  });
});

describe('ACP adapter', () => {
  it('normalizes updates and supplies saved instructions only on the first prompt', async () => {
    const peers = linkedPeers();
    const prompts: string[] = [];
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { protocolVersion: 1 };
      if (method === 'session/new')
        return {
          sessionId: 'acp-session',
          configOptions: [
            {
              id: 'model-selector',
              name: 'Model',
              category: 'model',
              type: 'select',
              currentValue: 'model-1',
              options: [{ value: 'model-1', name: 'Model 1' }],
            },
          ],
        };
      if (method === 'session/prompt') {
        const prompt = (params as { prompt?: { text?: string }[] }).prompt?.[0]?.text;
        if (prompt) prompts.push(prompt);
        await peers.server.notify('session/update', {
          sessionId: 'acp-session',
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'thinking' },
          },
        });
        await peers.server.notify('session/update', {
          sessionId: 'acp-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'answer' },
          },
        });
        await peers.server.notify('session/update', {
          sessionId: 'acp-session',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 't1',
            title: 'shell',
            rawInput: { command: 'pwd' },
          },
        });
        return { stopReason: 'end_turn' };
      }
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new AcpAdapter({
      provider: 'grok',
      supportedVersions: { minimum: '0.1.0' },
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const events = [];
    for await (const event of adapter.sendTurn(session, { turnId: 'turn-1', text: 'hello' }))
      events.push(event);
    expect(events.map((event) => event.type)).toEqual([
      'reasoning',
      'message',
      'tool',
      'completion',
    ]);
    for await (const _event of adapter.sendTurn(session, {
      turnId: 'turn-2',
      text: 'follow up',
    })) {
      // Drain the second prompt so its wire content can be asserted.
    }
    expect(prompts[0]).toContain('<agent_instructions>\nBe useful\n</agent_instructions>');
    expect(prompts[0]).toContain('User request:\nhello');
    expect(prompts[1]).toBe('follow up');
    expect(prompts.filter((prompt) => prompt.includes('Be useful'))).toHaveLength(1);
    await adapter.dispose();
  });

  it('selects an advertised model and verifies the resulting config state', async () => {
    const peers = linkedPeers();
    let setConfigParams: unknown;
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { protocolVersion: 1 };
      if (method === 'session/new')
        return {
          sessionId: 'acp-session',
          configOptions: [
            {
              id: 'model-selector',
              category: 'model',
              type: 'select',
              currentValue: 'model-default',
              options: [
                { value: 'model-default', name: 'Default' },
                { value: 'model-1', name: 'Model 1' },
              ],
            },
          ],
        };
      if (method === 'session/set_config_option') {
        setConfigParams = params;
        return {
          configOptions: [
            {
              id: 'model-selector',
              category: 'model',
              type: 'select',
              currentValue: 'model-1',
              options: [
                { value: 'model-default', name: 'Default' },
                { value: 'model-1', name: 'Model 1' },
              ],
            },
          ],
        };
      }
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new AcpAdapter({
      provider: 'gemini',
      supportedVersions: { minimum: '0.1.0' },
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });

    await adapter.createSession(sessionOptions);
    expect(setConfigParams).toEqual({
      sessionId: 'acp-session',
      configId: 'model-selector',
      value: 'model-1',
    });
    await adapter.dispose();
  });

  it('fails closed when the server cannot prove the requested model is active', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method) => {
      if (method === 'initialize') return { protocolVersion: 1 };
      if (method === 'session/new') return { sessionId: 'acp-session' };
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new AcpAdapter({
      provider: 'gemini',
      supportedVersions: { minimum: '0.1.0' },
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });

    await expect(adapter.createSession(sessionOptions)).rejects.toThrow(
      'did not advertise a selectable model config',
    );
    await adapter.dispose();
  });

  it('restores saved instructions when the first prompt fails and is retried', async () => {
    const peers = linkedPeers();
    const prompts: string[] = [];
    let promptCount = 0;
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return { protocolVersion: 1 };
      if (method === 'session/new')
        return {
          sessionId: 'acp-session',
          configOptions: [
            {
              id: 'model',
              category: 'model',
              type: 'select',
              currentValue: 'model-1',
              options: [{ value: 'model-1', name: 'Model 1' }],
            },
          ],
        };
      if (method === 'session/prompt') {
        const prompt = (params as { prompt?: { text?: string }[] }).prompt?.[0]?.text;
        if (prompt) prompts.push(prompt);
        promptCount += 1;
        if (promptCount === 1) throw new Error('temporary provider failure');
        return { stopReason: 'end_turn' };
      }
      throw new Error(`unexpected ${method}`);
    });
    const adapter = new AcpAdapter({
      provider: 'gemini',
      supportedVersions: { minimum: '0.1.0' },
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    for await (const _event of adapter.sendTurn(session, {
      turnId: 'turn-1',
      text: 'original request',
    })) {
      // The adapter reports the first request failure as normalized events.
    }
    for await (const _event of adapter.sendTurn(session, {
      turnId: 'turn-2',
      text: 'original request',
    })) {
      // Drain the retried request.
    }

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => prompt.includes('Be useful'))).toBe(true);
    await adapter.dispose();
  });

  it('isolates Gemini extensions and MCP while keeping both ACP adapters production-disabled', async () => {
    expect(defaultAcpCommandArgs('gemini')).toEqual([
      '--acp',
      '--extensions',
      'none',
      '--allowed-mcp-server-names',
      'sia',
    ]);
    expect(defaultAcpCommandArgs('grok')).toEqual(['agent', 'stdio']);

    const gemini = createGeminiAdapter();
    const grok = createGrokAdapter();
    expect(gemini.productionEnabled).toBe(false);
    expect(grok.productionEnabled).toBe(false);
    await Promise.all([gemini.dispose(), grok.dispose()]);
  });
});

describe('Meta streaming adapter', () => {
  it('continues the stream with tool outputs and preserves normalized ordering', async () => {
    const requests: MetaTurnRequest[] = [];
    const transport: MetaTransport = {
      capabilities: async () => ({
        available: true,
        models: ['meta-model'],
        streaming: true,
        tools: true,
      }),
      async *stream(request): AsyncIterable<MetaStreamEvent> {
        requests.push(request);
        if (requests.length === 1) {
          yield { type: 'tool_call', callId: 'call-1', name: 'browser_tabs', arguments: {} };
          yield { type: 'completed', responseId: 'response-1', stopReason: 'tool_calls' };
        } else {
          yield { type: 'text_delta', messageId: 'message-1', text: 'done' };
          yield { type: 'completed', responseId: 'response-2', stopReason: 'complete' };
        }
      },
    };
    const adapter = new MetaStreamingAdapter({
      transport,
      toolHandler: async () => ({ success: true, content: { tabs: [] } }),
    });
    const metaSessionOptions: ProviderSessionOptions = {
      ...sessionOptions,
      model: 'meta-model',
    };
    const session = await adapter.createSession(metaSessionOptions);
    const events = [];
    for await (const event of adapter.sendTurn(session, {
      turnId: 'turn-1',
      text: 'list tabs',
    }))
      events.push(event);
    expect(events.map((event) => event.type)).toEqual([
      'tool',
      'tool',
      'message',
      'completion',
    ]);
    expect(requests[1]?.previousResponseId).toBe('response-1');
    expect(requests[1]?.input[0]).toMatchObject({
      type: 'tool_output',
      callId: 'call-1',
      success: true,
    });
  });

  it('isolates Claude Code while retaining only the short-lived Sia MCP bridge', async () => {
    const args = claudeCliArgs({
      model: 'claude-sonnet-4-5',
      systemPromptPath: '/private/session/system-prompt.txt',
      mcpConfigPath: '/private/session/mcp.json',
      mcpServerNames: ['sia'],
    });
    expect(args).toEqual(
      expect.arrayContaining([
        '--no-session-persistence',
        '--setting-sources',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--no-chrome',
        '--tools',
        'mcp__sia__*',
        '--permission-mode',
        'dontAsk',
        '--allowedTools',
        '--system-prompt-file',
      ]),
    );
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet');
    expect(args.join(' ')).not.toContain('Be useful');

    expect(
      claudeMcpConfig([
        {
          name: 'sia',
          command: '/Applications/Sia.app/Contents/MacOS/Sia',
          args: ['--capability', 'opaque'],
          env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
        },
      ]),
    ).toEqual({
      mcpServers: {
        sia: {
          type: 'stdio',
          command: '/Applications/Sia.app/Contents/MacOS/Sia',
          args: ['--capability', 'opaque'],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        },
      },
    });
  });

  it('uses Claude machine-readable auth state instead of credential-file presence', async () => {
    expect(
      parseClaudeAuthStatus(
        JSON.stringify({
          loggedIn: true,
          authMethod: 'claude.ai',
          apiProvider: 'firstParty',
          subscriptionType: 'max',
        }),
      ),
    ).toEqual({ state: 'authenticated', label: 'Claude Max', billing: 'subscription' });
    expect(parseClaudeAuthStatus('{"loggedIn":false}')).toEqual({
      state: 'unauthenticated',
      billing: 'unknown',
    });
    expect(
      parseClaudeAuthStatus('Update notice\n{"loggedIn":true,"authMethod":"console"}\n'),
    ).toEqual({ state: 'authenticated', label: 'Claude (Console)', billing: 'api' });

    const runner = {
      run: vi.fn(async (_command: string, args: readonly string[]) => ({
        code: 0,
        stdout:
          args[0] === '--version'
            ? '2.1.238 (Claude Code)'
            : '{"loggedIn":true,"subscriptionType":"pro"}',
        stderr: '',
      })),
    };
    const adapter = new ClaudeCliAdapter({ commandRunner: runner });
    expect(adapter.productionEnabled).toBe(true);
    await expect(adapter.probe()).resolves.toMatchObject({
      available: true,
      supported: true,
      version: '2.1.238',
    });
    await expect(adapter.account()).resolves.toEqual({
      state: 'authenticated',
      label: 'Claude Pro',
      billing: 'subscription',
    });
    await adapter.dispose();
  });
});

describe('Codex library review isolation', () => {
  it.each([
    { unsafe: false, normalizedExec: false, background: false },
    { unsafe: false, normalizedExec: true, background: false },
    { unsafe: true, normalizedExec: true, background: false },
    { unsafe: false, normalizedExec: true, background: true },
    { unsafe: true, normalizedExec: true, background: true },
    { unsafe: false, normalizedExec: true, background: true, invalidPermissions: true },
  ])(
    'disables native tools and checks the shell gate with normalized execution flags (%j)',
    async (testCase) => {
      const { unsafe, normalizedExec, background } = testCase;
      const invalidPermissions =
        'invalidPermissions' in testCase && testCase.invalidPermissions;
      const peers = linkedPeers();
      let request: Record<string, unknown> | undefined;
      peers.server.onRequest(async (method, params) => {
        if (method === 'initialize') return { userAgent: 'fake' };
        if (method === 'thread/start') {
          request = params as Record<string, unknown>;
          return {
            thread: { id: 'review-native' },
            sandbox: background
              ? {
                  type: 'workspaceWrite',
                  networkAccess: false,
                  writableRoots: invalidPermissions ? ['/'] : [],
                  excludeSlashTmp: true,
                  excludeTmpdirEnvVar: true,
                }
              : { type: 'readOnly' },
          };
        }
        if (method === 'experimentalFeature/list')
          return {
            data: Object.keys(isolatedCodexFeatures).map((name) => ({
              name,
              enabled:
                (unsafe && name === 'shell_tool') ||
                (normalizedExec && name === 'unified_exec'),
            })),
            nextCursor: null,
          };
        const response = codexIsolationResponse(method, params);
        if (response !== undefined) return response;
        throw new Error(`unexpected ${method}`);
      });
      const adapter = new CodexAppServerAdapter({
        peerFactory: async () => ({
          peer: peers.client,
          dispose: async () => {
            await peers.client.close();
            await peers.server.close();
          },
        }),
      });
      try {
        const start = adapter.createSession({
          ...sessionOptions,
          tools: [],
          nativeTools: background ? 'mac-background' : 'disabled',
          ...(background ? { baseInstructions: 'Use only background window tools.' } : {}),
        });
        if (unsafe || invalidPermissions)
          await expect(start).rejects.toThrow('verification failed');
        else await expect(start).resolves.toMatchObject({ nativeId: 'review-native' });
        if (background)
          expect(request?.baseInstructions).toBe('Use only background window tools.');
        else expect(request).not.toHaveProperty('baseInstructions');
        if (background)
          expect(request).toMatchObject({
            config: {
              sandbox_workspace_write: {
                network_access: false,
                writable_roots: [],
                exclude_slash_tmp: true,
                exclude_tmpdir_env_var: true,
              },
            },
          });
        expect(request).toMatchObject({
          sandbox: background ? 'workspace-write' : 'read-only',
          approvalPolicy: 'never',
          config: {
            web_search: 'disabled',
            features: {
              shell_tool: false,
              unified_exec: false,
              view_image: false,
              multi_agent: false,
            },
          },
        });
      } finally {
        await adapter.dispose();
      }
    },
  );
});

describe('Notch-style native Mac sessions', () => {
  it.each([false, true])(
    'waits for a host tool and reports exactly one terminal result (watchdog: %s)',
    async (watchdog) => {
      const peers = linkedPeers();
      const started = Promise.withResolvers<void>();
      const entered = Promise.withResolvers<void>();
      const startReply = Promise.withResolvers<unknown>();
      const toolReply = Promise.withResolvers<{ success: boolean; content: unknown }>();
      let interrupts = 0;
      peers.server.onRequest(async (method, params) => {
        if (method === 'initialize') return {};
        if (method === 'thread/start')
          return {
            thread: { id: 'mac-wait' },
            sandbox: { type: 'dangerFullAccess' },
            approvalPolicy: 'never',
          };
        if (method === 'experimentalFeature/list')
          return {
            data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
              ([name, enabled]) => ({ name, enabled }),
            ),
            nextCursor: null,
          };
        if (method === 'turn/start') {
          started.resolve();
          return startReply.promise;
        }
        if (method === 'turn/interrupt') {
          interrupts++;
          await peers.server.notify('turn/completed', {
            threadId: 'mac-wait',
            turn: { id: 'turn-wait', status: 'interrupted' },
          });
          return {};
        }
        if (method === 'thread/backgroundTerminals/clean') return {};
        const response = codexIsolationResponse(method, params);
        if (response !== undefined) return response;
        throw new Error(`Unexpected ${method}`);
      });
      const adapter = new CodexAppServerAdapter({
        peerFactory: async () => ({
          peer: peers.client,
          dispose: async () => {
            await peers.client.close();
            await peers.server.close();
          },
        }),
        dynamicToolHandler: async () => {
          entered.resolve();
          return toolReply.promise;
        },
      });
      try {
        const session = await adapter.createSession({
          ...sessionOptions,
          nativeTools: 'mac',
          nativeApproval: 'auto',
          baseInstructions: 'Use the provided tools.',
        });
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
        const events: ThreadEventEnvelope[] = [];
        const finished = (async () => {
          for await (const event of adapter.sendTurn(session, {
            turnId: 'turn-wait',
            text: 'Run a workflow',
          }))
            events.push(event);
        })();
        await started.promise;
        const tool = peers.server.request('item/tool/call', {
          threadId: session.nativeId,
          callId: 'call',
          name: 'browser_tabs',
          arguments: {},
        });
        await entered.promise;
        await vi.advanceTimersByTimeAsync(185000);
        expect(interrupts).toBe(0);
        toolReply.resolve({ success: true, content: { outcome: 'verified' } });
        await tool;
        if (watchdog) await vi.advanceTimersByTimeAsync(185000);
        else {
          await peers.server.notify('item/completed', {
            threadId: session.nativeId,
            item: {
              id: 'answer',
              type: 'agentMessage',
              phase: 'final_answer',
              text: '{"type":"action","response":"Verified.","success":true}',
            },
          });
          await peers.server.notify('turn/completed', {
            threadId: session.nativeId,
            turn: { id: 'turn-wait', status: 'completed' },
          });
        }
        await finished;
        startReply.reject(new Error('Late start failure'));
        await new Promise((resolve) => setImmediate(resolve));
        expect(events.filter((event) => event.type === 'completion')).toHaveLength(1);
        expect(events.some((event) => event.type === 'error')).toBe(watchdog);
        if (watchdog) {
          expect(JSON.stringify(events)).toContain('stopped responding');
          expect(events.at(-1)).toMatchObject({
            type: 'completion',
            payload: { status: 'failed' },
          });
        }
      } finally {
        vi.useRealTimers();
        await adapter.dispose();
      }
    },
  );
  it('discovers Astra from the live model catalog contract, preserving the account reasoning options', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return {};
      if (method === 'model/list') {
        expect(params).toMatchObject({ limit: 100 });
        return {
          data: [
            {
              id: 'astra',
              model: 'gpt-6-astra',
              displayName: 'GPT-6 Astra',
              supportedReasoningEfforts: [
                { reasoningEffort: 'low' },
                { reasoningEffort: 'medium' },
                { reasoningEffort: 'ultra' },
              ],
              defaultReasoningEffort: 'medium',
            },
            { model: 'private-model', hidden: true },
          ],
          nextCursor: null,
        };
      }
      throw new Error(`Unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      expect(await adapter.listModels()).toEqual([
        {
          id: 'gpt-6-astra',
          label: 'GPT-6 Astra',
          description: '',
          reasoningEfforts: ['low', 'medium', 'ultra'],
          defaultReasoningEffort: 'medium',
        },
      ]);
    } finally {
      await adapter.dispose();
    }
  });
  it('answers Codex request_user_input questions by id with distinct request ids', async () => {
    const peers = linkedPeers();
    const answers: unknown[] = [];
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return {};
      if (method === 'thread/start')
        return {
          thread: { id: 'native-questions' },
          sandbox: { type: 'dangerFullAccess' },
          approvalPolicy: 'never',
        };
      if (method === 'experimentalFeature/list')
        return {
          data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
            ([name, enabled]) => ({ name, enabled }),
          ),
          nextCursor: null,
        };
      if (method === 'turn/start') {
        setImmediate(() => {
          void (async () => {
            const question = (id: string, text: string, options: string[] | null = null) => ({
              id,
              header: `About ${id}`,
              question: text,
              isOther: false,
              isSecret: false,
              options: options?.map((label) => ({ label, description: '' })) ?? null,
            });
            answers.push(
              ...(await Promise.all([
                peers.server.request('item/tool/requestUserInput', {
                  threadId: 'native-questions',
                  turnId: 'native-turn',
                  itemId: 'ask-1',
                  isBlocking: true,
                  autoResolutionMs: null,
                  questions: [
                    question('size', 'Which size?', ['Small', 'Large']),
                    question('color', 'Which color?'),
                  ],
                }),
                peers.server.request('item/tool/requestUserInput', {
                  threadId: 'native-questions',
                  turnId: 'native-turn',
                  isBlocking: true,
                  autoResolutionMs: null,
                  questions: [question('size', 'Which size again?')],
                }),
              ])),
            );
            await peers.server.notify('turn/completed', {
              threadId: 'native-questions',
              turn: { id: 'native-turn', status: 'completed' },
            });
          })();
        });
        return { turn: { id: 'native-turn' } };
      }
      if (method === 'thread/backgroundTerminals/clean') return {};
      const isolated = codexIsolationResponse(method, params);
      if (isolated !== undefined) return isolated;
      throw new Error(`Unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const session = await adapter.createSession({
        ...sessionOptions,
        tools: [],
        nativeTools: 'mac',
        nativeApproval: 'auto',
        baseInstructions: 'You are Sia.',
      });
      const requestIds: string[] = [];
      const prompts: string[] = [];
      for await (const event of adapter.sendTurn(session, { turnId: 'turn', text: 'Ask me' })) {
        if (event.type !== 'question' || event.payload.phase !== 'requested') continue;
        requestIds.push(event.payload.requestId);
        prompts.push(event.payload.prompt);
        await adapter.respondToRequest(session, {
          requestId: event.payload.requestId,
          text: event.payload.prompt.includes('again')
            ? 'Medium'
            : event.payload.prompt.includes('size')
              ? 'Large'
              : 'Blue',
        });
      }
      expect(requestIds).toHaveLength(3);
      expect(new Set(requestIds).size).toBe(3);
      expect(prompts).toContain('About size\nWhich size?\nOptions: Small, Large');
      expect(answers).toEqual([
        { answers: { size: { answers: ['Large'] }, color: { answers: ['Blue'] } } },
        { answers: { size: { answers: ['Medium'] } } },
      ]);
    } finally {
      clock.mockRestore();
      await adapter.dispose();
    }
  });

  it.each(['ask', 'auto'] as const)(
    'retains native tools, replaces the coding persona, and honors %s approval',
    async (nativeApproval) => {
      const peers = linkedPeers();
      let start: unknown;
      let approvalDecision: unknown;
      let turnParams: { outputSchema?: unknown } | undefined;
      const finalText = JSON.stringify({
        type: 'action',
        steps: ['Open app'],
        response: 'Opened.',
        success: true,
        learned_skill: null,
        output_file: null,
      });
      peers.server.onRequest(async (method, params) => {
        if (method === 'initialize') return {};
        if (method === 'thread/start') {
          start = params;
          return {
            thread: { id: 'native-mac' },
            sandbox: { type: 'dangerFullAccess' },
            approvalPolicy: nativeApproval === 'auto' ? 'never' : 'untrusted',
          };
        }
        if (method === 'experimentalFeature/list')
          return {
            data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
              ([name, enabled]) => ({ name, enabled }),
            ),
            nextCursor: null,
          };
        if (method === 'turn/start') {
          turnParams = params as typeof turnParams;
          setImmediate(() => {
            void (async () => {
              approvalDecision = await peers.server.request(
                'item/commandExecution/requestApproval',
                {
                  threadId: 'native-mac',
                  turnId: 'native-turn',
                  itemId: 'command',
                  command: 'open -a TextEdit',
                },
              );
              await peers.server.notify('item/completed', {
                threadId: 'native-mac',
                item: {
                  type: 'commandExecution',
                  id: 'failed-command',
                  command: 'false',
                  status: 'completed',
                  exitCode: 1,
                },
              });
              await peers.server.notify('item/agentMessage/delta', {
                threadId: 'native-mac',
                itemId: 'answer',
                delta: '{"type":',
              });
              await peers.server.notify('item/completed', {
                threadId: 'native-mac',
                item: {
                  type: 'agentMessage',
                  id: 'answer',
                  phase: 'final_answer',
                  text: finalText,
                },
              });
              await peers.server.notify('turn/completed', {
                threadId: 'native-mac',
                turn: { id: 'native-turn', status: 'completed' },
              });
            })();
          });
          return { turn: { id: 'native-turn' } };
        }
        if (method === 'thread/backgroundTerminals/clean') return {};
        const isolated = codexIsolationResponse(method, params);
        if (isolated !== undefined) return isolated;
        throw new Error(`Unexpected ${method}`);
      });
      const adapter = new CodexAppServerAdapter({
        peerFactory: async () => ({
          peer: peers.client,
          dispose: async () => {
            await peers.client.close();
            await peers.server.close();
          },
        }),
      });
      try {
        const session = await adapter.createSession({
          ...sessionOptions,
          model: 'gpt-6-astra',
          tools: [],
          nativeTools: 'mac',
          nativeApproval,
          baseInstructions: 'You are Sia. PERCEIVE → ACT → VERIFY.',
        });
        expect(start).toMatchObject({
          model: 'gpt-6-astra',
          sandbox: 'danger-full-access',
          approvalPolicy: nativeApproval === 'auto' ? 'never' : 'untrusted',
          baseInstructions: 'You are Sia. PERCEIVE → ACT → VERIFY.',
          dynamicTools: [],
          config: {
            web_search: 'disabled',
            project_doc_max_bytes: 0,
            features: {
              shell_tool: true,
              unified_exec: true,
              view_image: true,
              multi_agent: false,
              computer_use: false,
              apps: false,
            },
          },
        });
        const events = [];
        for await (const event of adapter.sendTurn(session, {
          turnId: 'turn',
          text: 'Open TextEdit',
          outputSchema: { type: 'object' },
        })) {
          events.push(event);
          if (event.type === 'approval')
            await adapter.respondToRequest(session, {
              requestId: event.payload.requestId,
              choiceId: 'deny',
            });
        }
        expect(approvalDecision).toEqual({
          decision: nativeApproval === 'auto' ? 'accept' : 'decline',
        });
        expect(
          events.flatMap((e) => (e.type === 'approval' ? [e.payload.description] : [])),
        ).toEqual(nativeApproval === 'auto' ? [] : ['Run a command: open -a TextEdit']);
        expect(events.filter((e) => e.type === 'message')).toMatchObject([
          { payload: { delta: false, parts: [{ text: finalText }] } },
        ]);
        expect(events.filter((e) => e.type === 'tool')).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              payload: expect.objectContaining({
                phase: 'failed',
                presentation: expect.objectContaining({ exitCode: 1 }),
              }),
            }),
          ]),
        );
        expect(turnParams?.outputSchema).toEqual({ type: 'object' });
      } finally {
        await adapter.dispose();
      }
    },
  );
  it('names the files a native file-change approval will touch', async () => {
    const peers = linkedPeers();
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return {};
      if (method === 'thread/start')
        return {
          thread: { id: 'native-mac' },
          sandbox: { type: 'dangerFullAccess' },
          approvalPolicy: 'untrusted',
        };
      if (method === 'experimentalFeature/list')
        return {
          data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
            ([name, enabled]) => ({ name, enabled }),
          ),
          nextCursor: null,
        };
      if (method === 'turn/start') {
        setImmediate(() => {
          void (async () => {
            await peers.server.notify('item/started', {
              threadId: 'native-mac',
              item: {
                type: 'fileChange',
                id: 'patch',
                status: 'inProgress',
                changes: [
                  { path: '/Users/me/notes.md', kind: 'update' },
                  { path: '/Users/me/todo.md', kind: 'add' },
                ],
              },
            });
            await peers.server.request('item/fileChange/requestApproval', {
              threadId: 'native-mac',
              turnId: 'native-turn',
              itemId: 'patch',
            });
            await peers.server.notify('turn/completed', {
              threadId: 'native-mac',
              turn: { id: 'native-turn', status: 'completed' },
            });
          })();
        });
        return { turn: { id: 'native-turn' } };
      }
      if (method === 'thread/backgroundTerminals/clean') return {};
      const isolated = codexIsolationResponse(method, params);
      if (isolated !== undefined) return isolated;
      throw new Error(`Unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      const session = await adapter.createSession({
        ...sessionOptions,
        model: 'gpt-6-astra',
        tools: [],
        nativeTools: 'mac',
        nativeApproval: 'ask',
        baseInstructions: 'You are Sia.',
      });
      const approvals = [];
      for await (const event of adapter.sendTurn(session, {
        turnId: 'turn',
        text: 'Tidy notes',
      })) {
        if (event.type !== 'approval') continue;
        approvals.push(event.payload.description);
        await adapter.respondToRequest(session, {
          requestId: event.payload.requestId,
          choiceId: 'deny',
        });
      }
      expect(approvals).toEqual(['Change 2 files: /Users/me/notes.md, /Users/me/todo.md']);
    } finally {
      await adapter.dispose();
    }
  });
  it('allows an equivalent native request for the rest of the task only', async () => {
    const peers = linkedPeers();
    const decisions: unknown[] = [];
    let turn = 0;
    peers.server.onRequest(async (method, params) => {
      if (method === 'initialize') return {};
      if (method === 'thread/start')
        return {
          thread: { id: 'native-mac' },
          sandbox: { type: 'dangerFullAccess' },
          approvalPolicy: 'untrusted',
        };
      if (method === 'experimentalFeature/list')
        return {
          data: Object.entries({ ...isolatedCodexFeatures, multi_agent: false }).map(
            ([name, enabled]) => ({ name, enabled }),
          ),
          nextCursor: null,
        };
      if (method === 'turn/start') {
        turn += 1;
        const nativeTurn = `native-turn-${turn}`;
        const command = (value: string, extra: Record<string, unknown> = {}) =>
          peers.server.request('item/commandExecution/requestApproval', {
            threadId: 'native-mac',
            turnId: nativeTurn,
            itemId: `command-${decisions.length}`,
            command: value,
            cwd: '/Users/me',
            ...extra,
          });
        setImmediate(() => {
          void (async () => {
            decisions.push(await command('open -a TextEdit'));
            if (turn === 1) {
              decisions.push(await command('open -a TextEdit'));
              decisions.push(await command('rm notes.md'));
              decisions.push(
                await command('open -a TextEdit', {
                  networkApprovalContext: { host: 'example.com', protocol: 'https' },
                }),
              );
              await peers.server.notify('item/started', {
                threadId: 'native-mac',
                item: {
                  type: 'fileChange',
                  id: 'patch',
                  status: 'inProgress',
                  changes: [{ path: '/Users/me/notes.md', kind: 'update' }],
                },
              });
              decisions.push(
                await peers.server.request('item/fileChange/requestApproval', {
                  threadId: 'native-mac',
                  turnId: nativeTurn,
                  itemId: 'patch',
                }),
              );
              decisions.push(
                await peers.server.request('item/fileChange/requestApproval', {
                  threadId: 'native-mac',
                  turnId: nativeTurn,
                  itemId: 'patch',
                }),
              );
            }
            await peers.server.notify('turn/completed', {
              threadId: 'native-mac',
              turn: { id: nativeTurn, status: 'completed' },
            });
          })();
        });
        return { turn: { id: nativeTurn } };
      }
      if (method === 'thread/backgroundTerminals/clean') return {};
      const isolated = codexIsolationResponse(method, params);
      if (isolated !== undefined) return isolated;
      throw new Error(`Unexpected ${method}`);
    });
    const adapter = new CodexAppServerAdapter({
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      const session = await adapter.createSession({
        ...sessionOptions,
        model: 'gpt-6-astra',
        tools: [],
        nativeTools: 'mac',
        nativeApproval: 'ask',
        baseInstructions: 'You are Sia.',
      });
      const asked: { description: string; choices: string[] }[] = [];
      const answers = ['allow_task', 'deny', 'allow_once', 'allow_task', 'deny'];
      for (const text of ['Open TextEdit', 'Open TextEdit again']) {
        for await (const event of adapter.sendTurn(session, { turnId: `turn-${text}`, text })) {
          if (event.type !== 'approval') continue;
          asked.push({
            description: event.payload.description,
            choices: event.payload.choices.map(({ kind }) => kind),
          });
          await adapter.respondToRequest(session, {
            requestId: event.payload.requestId,
            choiceId: answers[asked.length - 1]!,
          });
        }
      }
      expect(asked).toEqual([
        {
          description: 'Run a command: open -a TextEdit',
          choices: ['allow_once', 'allow_task', 'deny'],
        },
        {
          description: 'Run a command: rm notes.md',
          choices: ['allow_once', 'allow_task', 'deny'],
        },
        // Network access is never covered by a task grant.
        { description: 'Run a command: open -a TextEdit', choices: ['allow_once', 'deny'] },
        {
          description: 'Change /Users/me/notes.md',
          choices: ['allow_once', 'allow_task', 'deny'],
        },
        // A new task asks again.
        {
          description: 'Run a command: open -a TextEdit',
          choices: ['allow_once', 'allow_task', 'deny'],
        },
      ]);
      expect(decisions).toEqual([
        { decision: 'accept' },
        { decision: 'accept' },
        { decision: 'decline' },
        { decision: 'accept' },
        { decision: 'accept' },
        { decision: 'accept' },
        { decision: 'decline' },
      ]);
    } finally {
      await adapter.dispose();
    }
  });
});

describe('Codex turn resilience', () => {
  function codexServer(
    onTurn: (peers: ReturnType<typeof linkedPeers>, params: unknown) => Promise<unknown>,
    onInterrupt: (params: unknown) => unknown = () => ({}),
    onMethod: (method: string, params: unknown) => void = () => undefined,
  ) {
    const peers = linkedPeers();
    peers.server.onRequest(async (method, params) => {
      onMethod(method, params);
      if (method === 'initialize') return {};
      if (method === 'account/read') return { account: { type: 'chatgpt', email: 'a@b.c' } };
      if (method === 'thread/start')
        return { thread: { id: 'native-thread' }, sandbox: { type: 'workspaceWrite' } };
      if (method === 'turn/start') return await onTurn(peers, params);
      if (method === 'turn/interrupt') return await onInterrupt(params);
      if (method === 'turn/steer') return { turnId: 'native-turn' };
      const isolationResponse = codexIsolationResponse(method, params);
      if (isolationResponse !== undefined) return isolationResponse;
      throw new Error(`unexpected ${method}`);
    });
    return peers;
  }

  it('steers the running turn with its native turn id, waiting for Codex to report it', async () => {
    const steers: unknown[] = [];
    const turnStarted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const peers = codexServer(
      async (p) => {
        turnStarted.resolve();
        await release.promise;
        setTimeout(() => {
          void p.server.notify('turn/completed', {
            threadId: 'native-thread',
            turn: { id: 'native-turn', status: 'completed' },
          });
        }, 5);
        return { turn: { id: 'native-turn' } };
      },
      undefined,
      (method, params) => {
        if (method === 'turn/steer') steers.push(params);
      },
    );
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const done = (async () => {
      for await (const event of adapter.sendTurn(session, { turnId: 't1', text: 'hi' }))
        void event;
    })();
    await turnStarted.promise;
    const steered = adapter.steerTurn(session, 't1', { text: 'Also check Friday' });
    // The native turn id is not known yet; the steer waits for it instead of failing.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(steers).toEqual([]);
    release.resolve();
    await steered;
    expect(steers).toEqual([
      {
        threadId: 'native-thread',
        input: [{ type: 'text', text: 'Also check Friday', text_elements: [] }],
        expectedTurnId: 'native-turn',
      },
    ]);
    await done;
    await expect(adapter.steerTurn(session, 't1', { text: 'Too late' })).rejects.toThrow(
      'This task already finished.',
    );
    await adapter.dispose();
  });

  it('keeps reasoning summaries apart from raw reasoning text', async () => {
    const peers = codexServer(async (p) => {
      setTimeout(() => {
        void (async () => {
          await p.server.notify('item/reasoning/summaryTextDelta', {
            threadId: 'native-thread',
            turnId: 'native-turn',
            itemId: 'rs_1',
            delta: '**Checking the calendar**',
            summaryIndex: 0,
          });
          await p.server.notify('item/reasoning/textDelta', {
            threadId: 'native-thread',
            turnId: 'native-turn',
            itemId: 'rs_1',
            delta: 'raw chain',
            contentIndex: 0,
          });
          await p.server.notify('turn/completed', {
            threadId: 'native-thread',
            turn: { id: 'native-turn', status: 'completed' },
          });
        })();
      }, 5);
      return { turn: { id: 'native-turn' } };
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const reasoning: unknown[] = [];
    for await (const event of adapter.sendTurn(session, { turnId: 't1', text: 'hi' }))
      if (event.type === 'reasoning') reasoning.push(event.payload);
    expect(reasoning).toEqual([
      { reasoningId: 'rs_1', text: '**Checking the calendar**', delta: true, part: 'summary' },
      { reasoningId: 'rs_1', text: 'raw chain', delta: true, part: 'text' },
    ]);
    await adapter.dispose();
  });

  it('carries the plan usage window from account rate-limit updates', async () => {
    const resetsAt = Date.parse('2026-09-29T18:30:00.000Z') / 1_000;
    const peers = codexServer(async (p) => {
      setTimeout(() => {
        void (async () => {
          await p.server.notify('account/rateLimits/updated', {
            rateLimits: {
              limitId: 'codex',
              limitName: null,
              primary: { usedPercent: 42, windowDurationMins: 300, resetsAt },
              secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: null },
              credits: null,
              individualLimit: null,
              spendControlReached: null,
              planType: 'plus',
              rateLimitReachedType: null,
            },
          });
          // Sparse update: a null window keeps the one seen before.
          await p.server.notify('account/rateLimits/updated', {
            rateLimits: {
              limitId: 'codex',
              limitName: null,
              primary: null,
              secondary: { usedPercent: 85, windowDurationMins: 10080, resetsAt: null },
              credits: null,
              individualLimit: null,
              spendControlReached: null,
              planType: null,
              rateLimitReachedType: null,
            },
          });
          await p.server.notify('thread/tokenUsage/updated', {
            threadId: 'native-thread',
            turnId: 'native-turn',
            tokenUsage: { last: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 } },
          });
          await p.server.notify('turn/completed', {
            threadId: 'native-thread',
            turn: { id: 'native-turn', status: 'completed' },
          });
        })();
      }, 5);
      return { turn: { id: 'native-turn' } };
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const usage: unknown[] = [];
    for await (const event of adapter.sendTurn(session, { turnId: 't1', text: 'hi' }))
      if (event.type === 'usage') usage.push(event.payload);
    expect(usage).toEqual([
      {
        limits: { usedPercent: 42, resetsAt: '2026-09-29T18:30:00.000Z', windowMinutes: 300 },
        providerReported: true,
      },
      { limits: { usedPercent: 85, windowMinutes: 10080 }, providerReported: true },
      {
        inputTokens: 10,
        outputTokens: 2,
        cachedInputTokens: 0,
        limits: { usedPercent: 85, windowMinutes: 10080 },
        providerReported: true,
      },
    ]);
    await adapter.dispose();
  });

  it('does not surface an error that Codex is about to retry', async () => {
    const peers = codexServer(async (p) => {
      setTimeout(() => {
        void (async () => {
          await p.server.notify('error', {
            threadId: 'native-thread',
            turnId: 'native-turn',
            willRetry: true,
            error: { message: 'Reconnecting... 1/5' },
          });
          await p.server.notify('turn/completed', {
            threadId: 'native-thread',
            turn: { id: 'native-turn', status: 'completed' },
          });
        })();
      }, 5);
      return { turn: { id: 'native-turn' } };
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const types: string[] = [];
    for await (const event of adapter.sendTurn(session, { turnId: 't1', text: 'hi' }))
      types.push(event.type);
    expect(types).toEqual(['completion']);
    await adapter.dispose();
  });

  it('names attached files in the text and inlines small text files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sia-attach-'));
    await writeFile(join(dir, 'notes.txt'), 'quarterly numbers');
    await writeFile(join(dir, 'report.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 1]));
    let turnParams!: { input: [{ text: string }, ...unknown[]] };
    const peers = codexServer(async (p, params) => {
      turnParams = params as typeof turnParams;
      setTimeout(() => {
        void p.server.notify('turn/completed', {
          threadId: 'native-thread',
          turn: { id: 'native-turn', status: 'completed' },
        });
      }, 5);
      return { turn: { id: 'native-turn' } };
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      const session = await adapter.createSession(sessionOptions);
      for await (const _event of adapter.sendTurn(session, {
        turnId: 't1',
        text: 'Review these.',
        attachments: [
          { kind: 'file', name: 'notes.txt', path: join(dir, 'notes.txt') },
          { kind: 'file', name: 'report.pdf', path: join(dir, 'report.pdf') },
          { kind: 'image', name: 'shot.png', path: join(dir, 'shot.png') },
        ],
      }));
      expect(JSON.stringify(turnParams.input)).not.toContain('mention');
      expect(turnParams.input.slice(1)).toEqual([
        { type: 'localImage', path: join(dir, 'shot.png') },
      ]);
      const text: string = turnParams.input[0].text;
      expect(text.startsWith('Review these.\n\nAttached files')).toBe(true);
      expect(text).toContain(`- notes.txt: ${join(dir, 'notes.txt')}`);
      expect(text).toContain(`- report.pdf: ${join(dir, 'report.pdf')}`);
      expect(text).toContain('quarterly numbers');
      expect(text).not.toContain('PDF');
    } finally {
      await adapter.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sends a Stop that arrives before turn/start returns once the turn id is known', async () => {
    const startReply = Promise.withResolvers<unknown>();
    const started = Promise.withResolvers<void>();
    const interrupts: unknown[] = [];
    let server!: ReturnType<typeof linkedPeers>;
    const peers = codexServer(
      async (p) => {
        server = p;
        started.resolve();
        return await startReply.promise;
      },
      async (params) => {
        interrupts.push(params);
        setTimeout(() => {
          void server.server.notify('turn/completed', {
            threadId: 'native-thread',
            turn: { id: 'native-turn', status: 'interrupted' },
          });
        }, 1);
        return {};
      },
    );
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      const session = await adapter.createSession(sessionOptions);
      const controller = new AbortController();
      const events: ThreadEventEnvelope[] = [];
      const finished = (async () => {
        for await (const event of adapter.sendTurn(
          session,
          { turnId: 't1', text: 'hi' },
          controller.signal,
        ))
          events.push(event);
      })();
      await started.promise;
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(interrupts).toEqual([]);
      startReply.resolve({ turn: { id: 'native-turn' } });
      await finished;
      expect(interrupts).toEqual([{ threadId: 'native-thread', turnId: 'native-turn' }]);
      expect(events.at(-1)).toMatchObject({ type: 'completion' });
      expect(events.some((event) => event.type === 'error')).toBe(false);
    } finally {
      await adapter.dispose();
    }
  });

  it('unsubscribes and forgets a closed session', async () => {
    const unsubscribed: unknown[] = [];
    const peers = codexServer(
      async () => ({ turn: { id: 'native-turn' } }),
      undefined,
      (method, params) => {
        if (method === 'thread/unsubscribe') unsubscribed.push(params);
      },
    );
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    try {
      const session = await adapter.createSession(sessionOptions);
      await adapter.closeSession(session);
      expect(adapter.hasSession(session)).toBe(false);
      expect(unsubscribed).toEqual([{ threadId: 'native-thread' }]);
    } finally {
      await adapter.dispose();
    }
  });

  it('ends the active turn and forgets sessions when the app-server exits', async () => {
    let exit!: () => void;
    const exited = new Promise<void>((resolve) => {
      exit = resolve;
    });
    const peers = codexServer(async () => {
      setTimeout(exit, 5);
      return { turn: { id: 'native-turn' } };
    });
    const adapter = new CodexAppServerAdapter({
      sessionEphemeral: true,
      peerFactory: async () => ({
        peer: peers.client,
        exited,
        dispose: async () => {
          await peers.client.close();
          await peers.server.close();
        },
      }),
    });
    const session = await adapter.createSession(sessionOptions);
    const events: ThreadEventEnvelope[] = [];
    for await (const event of adapter.sendTurn(session, { turnId: 't1', text: 'hi' }))
      events.push(event);
    expect(events.map(({ type }) => type)).toEqual(['error', 'completion']);
    expect(events[1]).toMatchObject({ payload: { status: 'failed' } });
    expect(adapter.hasSession(session)).toBe(false);
    await adapter.dispose();
  });
});
