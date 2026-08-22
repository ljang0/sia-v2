import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridgeApi, DesktopSnapshot } from '../shared/bridge';
import { createBridgeRendererApi, mapDesktopSnapshot } from './bridgeAdapter';

function snapshot(timeline: DesktopSnapshot['timeline']): DesktopSnapshot {
  return {
    revision: 1,
    agents: [
      {
        id: 'agent-1',
        name: 'Agent',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/workspace',
        threadIds: ['thread-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    threads: [
      {
        id: 'thread-1',
        agentId: 'agent-1',
        title: 'Failed task',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/workspace',
        agentRevision: 'revision-1',
        instructionsSnapshot: '',
        agentNameSnapshot: 'Agent',
        status: 'failed',
        unread: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    timeline,
    approvals: [],
    providers: [],
    connections: [],
    capture: { status: 'paused', pendingCount: 0 },
    computer: {
      status: 'needs_permission',
      accessibility: false,
      screenRecording: false,
      trust: 'auto',
      trajectoryLog: true,
    },
    browser: { status: 'detached', grantedOrigins: [] },
    voice: { status: 'disconnected', voices: [] },
    preferences: { completionSound: false },
    activeAgentId: 'agent-1',
    activeThreadId: 'thread-1',
    cloud: { status: 'online', auth: 'signed_in' },
  };
}

function bridgeFor(initial: DesktopSnapshot) {
  const retry = vi.fn(async () => ({ turnId: 'retry-turn', snapshot: initial }));
  const bridge = {
    bootstrap: async () => initial,
    threads: { retry },
    subscribe: () => () => undefined,
  } as unknown as DesktopBridgeApi;
  return { bridge, retry };
}

describe('bridge renderer retry', () => {
  it('uses the dedicated retry method and publishes the returned snapshot', async () => {
    const initial = snapshot([
      {
        id: 'user-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequence: 0,
        kind: 'user',
        text: 'first request',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'user-2',
        threadId: 'thread-1',
        turnId: 'turn-2',
        sequence: 1,
        kind: 'user',
        text: 'retry this request',
        timestamp: '2026-01-01T00:01:00.000Z',
      },
      {
        id: 'error-1',
        threadId: 'thread-1',
        turnId: 'turn-2',
        sequence: 2,
        kind: 'error',
        text: 'Provider failed.',
        timestamp: '2026-01-01T00:01:01.000Z',
      },
    ]);
    const retried = structuredClone(initial);
    retried.revision = 2;
    retried.threads[0]!.status = 'running';
    const { bridge, retry } = bridgeFor(initial);
    retry.mockResolvedValue({ turnId: 'retry-turn', snapshot: retried });
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();
    let publishedRevision = 0;
    api.subscribe((value) => {
      if (value.activeThread?.status === 'running') publishedRevision = 2;
    });

    await api.retryThread('thread-1');

    expect(retry).toHaveBeenCalledWith('thread-1');
    expect(publishedRevision).toBe(2);
  });

  it('propagates a retry rejection from the main process', async () => {
    const initial = snapshot([]);
    const { bridge, retry } = bridgeFor(initial);
    retry.mockRejectedValue(new Error('There is no failed user turn to retry.'));
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();

    await expect(api.retryThread('thread-1')).rejects.toThrow('no failed user turn');
    expect(retry).toHaveBeenCalledWith('thread-1');
  });
});

describe('bridge renderer selection', () => {
  it('preserves a local agent selection across background snapshots', async () => {
    const initial = snapshot([]);
    initial.agents.push({
      id: 'agent-2',
      name: 'Second agent',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/second',
      threadIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    let push: ((event: { type: 'snapshot'; snapshot: DesktopSnapshot }) => void) | undefined;
    const bridge = {
      bootstrap: async () => initial,
      subscribe: (listener: typeof push) => {
        push = listener;
        return () => undefined;
      },
    } as unknown as DesktopBridgeApi;
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();
    let latest = await api.getSnapshot();
    api.subscribe((value) => {
      latest = value;
    });

    await api.selectAgent('agent-2');
    push?.({ type: 'snapshot', snapshot: { ...initial, revision: 2 } });

    expect(latest.selectedAgentId).toBe('agent-2');
    expect(latest.selectedThreadId).toBeUndefined();
    expect(latest.activeThread).toBeUndefined();
  });
});

describe('bridge renderer truthfulness', () => {
  it('passes the exact selected app list through the typed bridge', async () => {
    const initial = snapshot([]);
    const startSelected = vi.fn(async () => ({ opened: true, snapshot: initial }));
    const bridge = {
      bootstrap: async () => initial,
      connections: { startSelected },
      subscribe: () => () => undefined,
    } as unknown as DesktopBridgeApi;
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();

    await api.connectSelectedApps(['docs', 'slack']);

    expect(startSelected).toHaveBeenCalledWith(['docs', 'slack']);
  });

  it('passes the exact account-deletion confirmation through the typed bridge', async () => {
    const initial = snapshot([]);
    const deleted = structuredClone(initial);
    deleted.revision = 2;
    deleted.agents = [];
    deleted.threads = [];
    deleted.cloud = { status: 'offline', auth: 'signed_out' };
    const deleteAccount = vi.fn(async () => deleted);
    const bridge = {
      bootstrap: async () => initial,
      auth: { deleteAccount },
      subscribe: () => () => undefined,
    } as unknown as DesktopBridgeApi;
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();

    await api.deleteCloudAccount('DELETE ACCOUNT');

    expect(deleteAccount).toHaveBeenCalledWith('DELETE ACCOUNT');
  });

  it('preserves provider setup reasons and canonical model IDs', () => {
    const initial = snapshot([]);
    initial.providers = [
      {
        id: 'codex',
        label: 'Codex',
        status: 'needs_install',
        model: 'gpt-5.6-sol',
        detail: 'Install Codex.',
        billing: 'Uses your ChatGPT plan or OpenAI API account.',
      },
      {
        id: 'meta',
        label: 'Meta',
        status: 'needs_login',
        model: 'meta_super_nova_ext',
        detail: 'Sign in to Sia cloud.',
        billing: 'Included when Sia cloud is configured.',
      },
      {
        id: 'gemini',
        label: 'Gemini',
        status: 'incompatible',
        model: 'gemini-2.5-pro',
        detail: 'Update Gemini.',
        billing: 'Requires a billing-enabled account.',
      },
    ];

    expect(mapDesktopSnapshot(initial).providers).toMatchObject([
      { id: 'codex', status: 'needs-install', model: 'gpt-5.6-sol' },
      { id: 'meta', status: 'needs-login', model: 'meta_super_nova_ext' },
      { id: 'gemini', status: 'incompatible', model: 'gemini-2.5-pro' },
    ]);
  });

  it('does not imply a connector account was verified when none is supplied', () => {
    const initial = snapshot([]);
    initial.approvals = [
      {
        id: 'approval-1',
        threadId: 'thread-1',
        callId: 'call-1',
        kind: 'connector_write',
        title: 'Approve Slack Post',
        summary: 'Post the reviewed message.',
        target: '#updates',
        dataLeaving: 'Status is ready.',
        reversible: false,
        expiresAt: '2026-01-01T00:02:00.000Z',
        status: 'pending',
      },
    ];

    const approval = mapDesktopSnapshot(initial).activeThread?.events.find(
      (event) => event.type === 'approval',
    );
    expect(approval).toMatchObject({
      request: { kind: 'connector', account: 'Account unspecified' },
    });
  });
});
