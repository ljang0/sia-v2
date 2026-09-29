import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridgeApi, DesktopSnapshot } from '../shared/bridge';
import { createBridgeRendererApi, mapDesktopSnapshot } from './bridgeAdapter';
import type { RendererSnapshot } from './types';

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

describe('bridge renderer drafts', () => {
  it('shows a saved draft without waiting for a snapshot from the main process', async () => {
    const setDraft = vi.fn(async () => ({ saved: true as const }));
    const initial = snapshot([]);
    const bridge = {
      bootstrap: async () => initial,
      threads: { setDraft },
      subscribe: () => () => undefined,
    } as unknown as DesktopBridgeApi;
    const api = createBridgeRendererApi(bridge);
    await api.getSnapshot();
    let latest: RendererSnapshot | undefined;
    api.subscribe((value) => {
      latest = value;
    });

    await api.saveDraft('thread-1', 'Finish the checklist');

    expect(setDraft).toHaveBeenCalledWith('thread-1', 'Finish the checklist');
    expect(latest?.agents[0]?.threads[0]?.draft).toBe('Finish the checklist');
    expect(latest?.activeThread?.draft).toBe('Finish the checklist');

    await api.saveDraft('thread-1', '');

    expect(latest?.agents[0]?.threads[0]?.draft).toBeUndefined();
    expect(latest?.activeThread?.draft).toBeUndefined();
  });
});

describe('bridge renderer truthfulness', () => {
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
        billing: 'Uses your existing ChatGPT Codex plan or OpenAI API account.',
      },
      {
        id: 'meta',
        label: 'Meta',
        status: 'needs_login',
        model: 'super_nova_ext',
        detail: 'Sign in to Sia cloud.',
        billing: 'Included for invited Sia alpha accounts; shared preview limits apply.',
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
      { id: 'meta', status: 'needs-login', model: 'super_nova_ext' },
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

describe('bridge renderer queued follow-ups', () => {
  it('shows pending user messages as queued follow-ups outside the transcript', async () => {
    const source = snapshot([
      {
        id: 'user-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequence: 1,
        kind: 'user',
        text: 'Draft the plan',
        status: 'complete',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'user-2',
        threadId: 'thread-1',
        turnId: 'turn-2',
        sequence: 2,
        kind: 'user',
        text: 'Also add dates',
        status: 'pending',
        timestamp: '2026-01-01T00:00:05.000Z',
      },
      {
        id: 'reply-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        sequence: 3,
        kind: 'assistant',
        text: 'Working on it',
        status: 'running',
        timestamp: '2026-01-01T00:00:06.000Z',
      },
    ]);
    source.threads[0]!.status = 'running';
    const mapped = mapDesktopSnapshot(source);
    expect(mapped.activeThread?.events.map(({ id }) => id)).toEqual(['user-1', 'reply-1']);
    expect(mapped.activeThread?.queuedMessages).toEqual([
      expect.objectContaining({ id: 'user-2', role: 'user', content: 'Also add dates' }),
    ]);
    expect(mapped.agents[0]?.threads[0]?.preview).toEqual({
      label: 'Latest reply',
      text: 'Working on it',
    });

    const unqueue = vi.fn(async () => structuredClone(source));
    const api = createBridgeRendererApi({
      bootstrap: async () => source,
      threads: { unqueue },
      subscribe: () => () => undefined,
    } as unknown as DesktopBridgeApi);
    await api.getSnapshot();
    await api.removeQueuedMessage('thread-1', 'user-2');
    expect(unqueue).toHaveBeenCalledWith('thread-1', 'user-2');
  });
});

describe('bridge renderer scoped snapshots', () => {
  it('keeps unchanged transcript events identical while one reply streams', async () => {
    const item = (id: string, sequence: number, text: string) => ({
      id,
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence,
      kind: 'assistant' as const,
      text,
      status: 'complete' as const,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    let push!: (event: { type: 'snapshot'; snapshot: DesktopSnapshot }) => void;
    const first = snapshot([item('earlier', 1, 'Done'), item('streaming', 2, 'Hel')]);
    const api = createBridgeRendererApi({
      bootstrap: async () => first,
      subscribe: (listener: typeof push) => {
        push = listener;
        return () => undefined;
      },
    } as unknown as DesktopBridgeApi);
    const published: Array<RendererSnapshot> = [];
    api.subscribe((next) => published.push(next));
    await api.getSnapshot();
    push({
      type: 'snapshot',
      snapshot: snapshot([item('earlier', 1, 'Done'), item('streaming', 2, 'Hello')]),
    });
    const [before, after] = [published.at(-2)!, published.at(-1)!];
    expect(after.activeThread!.events[0]).toBe(before.activeThread!.events[0]);
    expect(after.activeThread!.events[1]).not.toBe(before.activeThread!.events[1]);
    push({
      type: 'snapshot',
      snapshot: snapshot([item('earlier', 1, 'Done'), item('streaming', 2, 'Hello')]),
    });
    expect(published.at(-1)!.activeThread!.events).toBe(after.activeThread!.events);
  });

  it('uses pushed previews for threads whose history was not sent', () => {
    const source = snapshot([]);
    source.previews = { 'thread-1': { label: 'Request', text: 'Plan the trip' } };
    expect(mapDesktopSnapshot(source).agents[0]?.threads[0]?.preview).toEqual({
      label: 'Request',
      text: 'Plan the trip',
    });
  });
});
