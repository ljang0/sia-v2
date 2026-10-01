import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CloudClient } from '../cloud-client.js';
import type { RuntimeTurnInput } from '../runtime-coordinator.js';
import type { DesktopController } from './desktop-controller.js';
import { createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('creates a private default workspace, color, and first thread for a new agent', async () => {
    const createDirectory = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory,
    });

    const created = await controller.invoke('agents.save', {
      name: 'Release Partner',
      instructions: 'Keep release work focused.',
      model: 'gpt-5.6-sol',
    });
    const agent = created.snapshot.agents.find(({ id }) => id === created.agentId)!;

    expect(createDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/Sia\/Agents\/release-partner-[a-f0-9]{8}$/),
    );
    expect(agent).toMatchObject({
      provider: 'codex',
      hue: 0,
      harnessPreference: { mode: 'automatic' },
    });
    expect(agent.threadIds).toHaveLength(1);
    expect(created.snapshot.activeThreadId).toBe(agent.threadIds[0]);
    expect(created.snapshot.threads.find(({ id }) => id === agent.threadIds[0])).toMatchObject({
      workspace: agent.workspace,
      harnessId: 'codex_app_server',
      resolvedExecutionTarget: {
        provider: 'codex',
        model: 'gpt-5.6-sol',
        harnessId: 'codex_app_server',
        harnessModelId: 'gpt-5.6-sol',
        credentialSource: 'provider_subscription',
        resolutionSource: 'legacy_default',
      },
    });
    await controller.shutdown();
  });

  it('persists room controls, duplicates a clean room, and marks threads unread', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Release room',
      instructions: 'Review releases.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: created.agentId });

    await controller.invoke('agents.setPinned', { agentId: created.agentId, pinned: true });
    await controller.invoke('agents.setNotifications', {
      agentId: created.agentId,
      enabled: false,
    });
    await controller.invoke('threads.setUnread', { threadId: thread.threadId, unread: true });
    const duplicated = await controller.invoke('agents.duplicate', {
      agentId: created.agentId,
    });
    const snapshot = controller.snapshot();

    expect(snapshot.agents.find(({ id }) => id === created.agentId)).toMatchObject({
      pinned: true,
      notificationsEnabled: false,
    });
    expect(snapshot.threads.find(({ id }) => id === thread.threadId)?.unread).toBe(true);
    expect(snapshot.agents.find(({ id }) => id === duplicated.agentId)).toMatchObject({
      name: 'Release room copy',
      pinned: false,
      threadIds: [],
    });
    await controller.shutdown();
  });

  it('pins agent configuration into a thread revision', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: 'Be concise.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: created.agentId });
    await controller.invoke('settings.openDirectory', undefined);
    await controller.invoke('agents.save', {
      id: created.agentId,
      name: 'Personal',
      instructions: 'New instructions.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });

    const pinned = thread.snapshot.threads.find(({ id }) => id === thread.threadId);
    const afterEdit = controller.snapshot().threads.find(({ id }) => id === thread.threadId);
    expect(pinned).toMatchObject({ provider: 'codex', model: 'gpt-5.6-sol' });
    expect(afterEdit).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    await controller.shutdown();
  });

  it('persists an optional read-aloud voice with the agent', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Narrator',
      instructions: 'Be concise.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
      voiceId: 'voice-milo',
    });

    expect(created.snapshot.agents.find(({ id }) => id === created.agentId)).toMatchObject({
      voiceId: 'voice-milo',
    });
    await controller.shutdown();
  });

  it('renames and deletes an idle thread with its local transcript', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });

    const renamed = await controller.invoke('threads.rename', {
      threadId,
      title: 'Release review',
    });
    expect(renamed.threads.find(({ id }) => id === threadId)?.title).toBe('Release review');

    const deleted = await controller.invoke('threads.delete', { threadId });
    expect(deleted.threads.some(({ id }) => id === threadId)).toBe(false);
    expect(deleted.timeline.some((item) => item.threadId === threadId)).toBe(false);
    expect(deleted.agents[0]?.threadIds).not.toContain(threadId);
    expect(deleted.activeThreadId).toBeUndefined();
    expect(deleted.activeAgentId).toBe(agent.agentId);
    await controller.shutdown();
  });

  it('reopens an untouched conversation instead of saving another empty one', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Drafts',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const first = await controller.invoke('threads.create', { agentId: agent.agentId });
    const again = await controller.invoke('threads.create', { agentId: agent.agentId });
    expect(again.threadId).toBe(first.threadId);
    expect(again.snapshot.activeThreadId).toBe(first.threadId);
    const countFor = (snapshot: typeof first.snapshot) =>
      snapshot.threads.filter((thread) => thread.agentId === agent.agentId).length;
    expect(countFor(again.snapshot)).toBe(countFor(first.snapshot));

    await controller.invoke('threads.send', { threadId: first.threadId, text: 'Hello' });
    const next = await controller.invoke('threads.create', { agentId: agent.agentId });
    expect(next.threadId).not.toBe(first.threadId);

    await controller.invoke('threads.archive', { threadId: next.threadId });
    const afterArchive = await controller.invoke('threads.create', { agentId: agent.agentId });
    expect(afterArchive.threadId).not.toBe(next.threadId);
    const titled = await controller.invoke('threads.create', {
      agentId: agent.agentId,
      title: 'Named task',
    });
    expect(titled.threadId).not.toBe(afterArchive.threadId);
    await controller.shutdown();
  });

  it('persists a local thread draft and clears it only after a send is accepted', async () => {
    const { controller, repository } = await createHarness();
    const agent = await controller.invoke('agents.save', {
      name: 'Writer',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });

    let pushes = 0;
    controller.subscribe(() => {
      pushes += 1;
    });
    const drafted = await controller.invoke('threads.draft', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    // Typing pauses save drafts often: no snapshot comes back and no push goes out.
    expect(drafted).toEqual({ saved: true });
    expect(pushes).toBe(0);
    expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.draft).toBe(
      'Keep this thought across a restart.',
    );
    await vi.waitFor(() =>
      expect(
        repository
          .get<{ threads: Array<{ id: string; draft?: string }> }>('desktop', 'state')
          ?.threads.find(({ id }) => id === threadId)?.draft,
      ).toBe('Keep this thought across a restart.'),
    );

    const sent = await controller.invoke('threads.send', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    expect(sent.snapshot.threads.find(({ id }) => id === threadId)?.draft).toBeUndefined();
    await controller.shutdown();
  });

  it('requires an active turn to stop before its thread can be deleted', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId, text: 'Keep working' });

    await expect(controller.invoke('threads.delete', { threadId })).rejects.toThrow(
      'Stop the active turn',
    );
    await controller.invoke('threads.cancel', { threadId });
    await controller.shutdown();
  });

  it('rejects a renderer-supplied workspace that the native picker did not grant', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('agents.save', {
        name: 'Untrusted',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/',
      }),
    ).rejects.toThrow('native folder picker');
    await controller.shutdown();
  });

  it('rejects non-ready providers and unpinned models when saving', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('agents.save', {
        name: 'Unpinned model',
        instructions: '',
        provider: 'codex',
        model: 'arbitrary-model',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow(/Codex (?:model must be|does not currently offer)/);
    await expect(
      controller.invoke('agents.save', {
        name: 'Unavailable',
        instructions: '',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow('not available for new conversations');
    await controller.shutdown();

    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const runtime = {
      runTurn: vi.fn(),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const identity = {
      initialize: async () => ({ state: identityState, email: 'person@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut: async () => {
        identityState = 'signed_out';
        return { state: identityState } as const;
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    // The cloud host is unreachable here; fail fast instead of waiting on DNS for a .test host.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    try {
      const { controller: cloudController } = await createHarness({
        fakeServices: false,
        runtime,
        cloud: new CloudClient('https://api.example.test', { read: async () => 'token' }),
        identity,
      });
      await expect(
        cloudController.invoke('agents.save', {
          name: 'Cloud assistant',
          instructions: '',
          provider: 'meta',
          model: 'super_nova_ext',
          workspace: '/tmp/sia-workspace',
        }),
      ).rejects.toThrow(/Included models is not ready \(unavailable\)/);
      expect(runtime.runTurn).not.toHaveBeenCalled();
      await cloudController.shutdown();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses to fork a busy thread so its live approval and follow-ups stay with it', async () => {
    let runtimeThreadId = '';
    const release = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: randomUUID(),
          sequence: 1,
          type: 'approval' as const,
          payload: { phase: 'requested', requestId: 'r1', title: 'Run', description: 'ls' },
        } as never;
        await release.promise;
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'List files' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'waiting',
      ),
    );
    await controller.invoke('threads.send', { threadId, text: 'Then summarize' });
    await expect(
      controller.invoke('threads.fork', { threadId, isolated: false }),
    ).rejects.toThrow('Stop the active task before you fork this thread.');
    expect(controller.snapshot().threads).toHaveLength(1);
    release.resolve();
    await controller.shutdown();
  });

  it('releases the provider session when a thread is deleted', async () => {
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
      releaseSession: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Personal',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      await controller.invoke('threads.send', { threadId, text: 'Hello' });
      await vi.waitFor(() =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'idle',
        ),
      );
      await controller.invoke('threads.delete', { threadId });
      await vi.waitFor(() => expect(runtime.releaseSession).toHaveBeenCalledWith(threadId));
    } finally {
      await controller.shutdown();
    }
  });
});

it('pins conversations, keeps copies unpinned, and reads older saved threads as unpinned', async () => {
  const { controller, repository } = await createHarness();
  const created = await controller.invoke('agents.save', {
    name: 'Pinned room',
    instructions: 'Keep things tidy.',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-workspace',
  });
  const first = await controller.invoke('threads.create', { agentId: created.agentId });
  const second = await controller.invoke('threads.create', { agentId: created.agentId });
  const before = controller.snapshot().threads.find(({ id }) => id === first.threadId)!;
  expect(before.pinned).toBe(false);

  await controller.invoke('threads.setPinned', { threadId: first.threadId, pinned: true });
  const pinned = controller.snapshot().threads.find(({ id }) => id === first.threadId)!;
  expect(pinned.pinned).toBe(true);
  // Pinning is not activity: it does not move the conversation in recency order.
  expect(pinned.updatedAt).toBe(before.updatedAt);

  const copy = await controller.invoke('threads.fork', {
    threadId: first.threadId,
    isolated: false,
  });
  expect(copy.snapshot.threads.find(({ id }) => id === copy.threadId)?.pinned).toBe(false);

  const reopened = await createHarness({ repository });
  expect(
    reopened.controller.snapshot().threads.find(({ id }) => id === first.threadId)?.pinned,
  ).toBe(true);
  await reopened.controller.invoke('threads.setPinned', {
    threadId: first.threadId,
    pinned: false,
  });
  expect(
    reopened.controller.snapshot().threads.find(({ id }) => id === first.threadId)?.pinned,
  ).toBe(false);

  const stored = repository.get<{ threads: { id: string; pinned?: boolean }[] }>(
    'desktop',
    'state',
  )!;
  for (const thread of stored.threads) delete thread.pinned;
  repository.put('desktop', 'state', stored);
  const legacy = await createHarness({ repository });
  expect(
    legacy.controller.snapshot().threads.find(({ id }) => id === second.threadId)?.pinned,
  ).toBe(false);
  await legacy.controller.shutdown();
});
