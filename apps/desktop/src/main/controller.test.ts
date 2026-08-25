import { describe, expect, it, vi } from 'vitest';
import { ActionGateway, getActionToolDescriptor } from '@sia/action-gateway';

import { CloudClient } from './cloud-client.js';
import { DesktopController } from './controller.js';
import {
  PlaintextTestCipher,
  type RecordRepository,
  SqliteRecordRepository,
} from './persistence.js';

const computer = {
  permissions: async () => ({
    status: 'ready' as const,
    accessibility: true,
    screenRecording: true,
  }),
  requestPermissions: async () => ({
    status: 'ready' as const,
    accessibility: true,
    screenRecording: true,
  }),
  call: async () => ({}),
  shutdown: async () => undefined,
};

interface ResearchBatchView {
  batchId: string;
  syncEligible?: boolean;
  consent: { version: string; acceptedAt: string; purpose: string };
  events: Array<{
    id: string;
    occurredAt: string;
    classification: string;
    taints: string[];
    kind: string;
    payload: Record<string, unknown>;
    sourceEventIds: string[];
  }>;
}

async function createHarness(
  options: {
    fakeServices?: boolean;
    runtime?: unknown;
    cloud?: CloudClient;
    identity?: ConstructorParameters<typeof DesktopController>[0]['identity'];
    computer?: ConstructorParameters<typeof DesktopController>[0]['computer'];
    runCommand?: (file: string, args: readonly string[]) => Promise<string>;
    openExternal?: (url: string) => Promise<void>;
    openMessages?: () => Promise<void>;
    repository?: RecordRepository;
    capabilitySetup?: ConstructorParameters<typeof DesktopController>[0]['capabilitySetup'];
    trajectory?: ConstructorParameters<typeof DesktopController>[0]['trajectory'];
  } = {},
): Promise<{
  controller: DesktopController;
  repository: RecordRepository;
}> {
  const repository =
    options.repository ?? new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  const controller = new DesktopController({
    repository,
    cloud: options.cloud ?? new CloudClient(undefined, { read: async () => undefined }),
    computer: options.computer ?? computer,
    identity: options.identity ?? {
      initialize: async () => ({ state: 'unconfigured' as const }),
      status: () => ({ state: 'unconfigured' as const }),
      startEmailSignIn: async () => ({ state: 'unconfigured' as const }),
      completeEmailSignIn: async () => ({ state: 'unconfigured' as const }),
      signOut: async () => ({ state: 'unconfigured' as const }),
    },
    fakeServices: options.fakeServices ?? true,
    openExternal: options.openExternal ?? (async () => undefined),
    openMessages: options.openMessages ?? (async () => undefined),
    chooseDirectory: async () => '/tmp/sia-workspace',
    exportJson: async () => '/tmp/export.json',
    ...(options.capabilitySetup ? { capabilitySetup: options.capabilitySetup } : {}),
    ...(options.runCommand ? { runCommand: options.runCommand } : {}),
    ...(options.trajectory ? { trajectory: options.trajectory } : {}),
  });
  await controller.initialize();
  await controller.invoke('settings.openDirectory', undefined);
  if (options.runtime) controller.attachRuntime(options.runtime as never);
  return { controller, repository };
}

async function createController(): Promise<DesktopController> {
  return (await createHarness()).controller;
}

describe('DesktopController', () => {
  it('opens Apple Messages through a dedicated host capability', async () => {
    const openMessages = vi.fn().mockResolvedValue(undefined);
    const { controller } = await createHarness({ openMessages });

    await controller.invoke('computer.openMessages', undefined);

    expect(openMessages).toHaveBeenCalledOnce();
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

  it('persists the local completion-sound preference', async () => {
    const { controller, repository } = await createHarness();

    const updated = await controller.invoke('settings.setCompletionSound', { enabled: true });
    expect(updated.preferences.completionSound).toBe(true);
    expect(
      repository.get<{ preferences: { completionSound: boolean } }>('desktop', 'state')
        ?.preferences.completionSound,
    ).toBe(true);
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

    const drafted = await controller.invoke('threads.draft', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    expect(drafted.threads.find(({ id }) => id === threadId)?.draft).toBe(
      'Keep this thought across a restart.',
    );
    expect(
      repository
        .get<{ threads: Array<{ id: string; draft?: string }> }>('desktop', 'state')
        ?.threads.find(({ id }) => id === threadId)?.draft,
    ).toBe('Keep this thought across a restart.');

    const sent = await controller.invoke('threads.send', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    expect(sent.snapshot.threads.find(({ id }) => id === threadId)?.draft).toBeUndefined();
    await controller.shutdown();
  });

  it('persists agent-authored schedules and keeps them scoped to their thread', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const first = await controller.invoke('threads.create', { agentId: agent.agentId });
    const second = await controller.invoke('threads.create', { agentId: agent.agentId });

    const created = controller.createScheduleFromAction(first.threadId, {
      task: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T12:00:00+09:00',
    });
    expect(created).toMatchObject({
      threadId: first.threadId,
      prompt: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      nextRunAt: '2030-08-21T03:00:00.000Z',
      enabled: true,
    });
    expect(controller.listSchedulesForAction(first.threadId)).toHaveLength(1);
    expect(controller.listSchedulesForAction(second.threadId)).toEqual([]);

    const paused = controller.updateScheduleFromAction(first.threadId, {
      scheduleId: created.id,
      enabled: false,
    });
    expect(paused.enabled).toBe(false);
    expect(() =>
      controller.updateScheduleFromAction(second.threadId, {
        scheduleId: created.id,
        enabled: true,
      }),
    ).toThrow('not found in this thread');
    expect(() => controller.deleteScheduleFromAction(second.threadId, created.id)).toThrow(
      'not found in this thread',
    );

    controller.deleteScheduleFromAction(first.threadId, created.id);
    expect(controller.listSchedulesForAction(first.threadId)).toEqual([]);
    await controller.shutdown();
  });

  it('recovers a claimed schedule without dispatching its persisted turn twice', async () => {
    const initial = await createHarness();
    const agent = await initial.controller.invoke('agents.save', {
      name: 'Crash-safe scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await initial.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    const schedule = initial.controller.createScheduleFromAction(threadId, {
      task: 'Check the web once.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T03:00:00.000Z',
      maxRuns: 2,
    });
    const persisted = structuredClone(
      initial.repository.get<{
        schedules: Array<{
          id: string;
          activeRun?: { id: string; dueAt: string; claimedAt: string };
        }>;
        timeline: Array<Record<string, unknown>>;
      }>('desktop', 'state')!,
    );
    await initial.controller.shutdown();

    const claimId = 'schedule-run-after-dispatch';
    const storedSchedule = persisted.schedules.find(({ id }) => id === schedule.id)!;
    storedSchedule.activeRun = {
      id: claimId,
      dueAt: '2026-08-21T00:00:00.000Z',
      claimedAt: '2026-08-21T00:00:01.000Z',
    };
    persisted.timeline.push({
      id: 'persisted-scheduled-prompt',
      threadId,
      turnId: 'persisted-scheduled-turn',
      sequence: 1,
      kind: 'user',
      text: 'Check the web once.',
      status: 'complete',
      timestamp: '2026-08-21T00:00:02.000Z',
      scheduleRunId: claimId,
    });
    const recoveredRepository = new SqliteRecordRepository(
      ':memory:',
      new PlaintextTestCipher(),
    );
    recoveredRepository.put('desktop', 'state', persisted);
    const recovered = await createHarness({ repository: recoveredRepository });
    await vi.waitFor(() => {
      expect(recovered.controller.snapshot().schedules?.[0]?.activeRun).toBeUndefined();
    });

    const snapshot = recovered.controller.snapshot();
    expect(
      snapshot.timeline.filter(({ scheduleRunId }) => scheduleRunId === claimId),
    ).toHaveLength(1);
    expect(snapshot.schedules?.[0]).toMatchObject({
      runCount: 1,
      maxRuns: 2,
      lastRun: { id: claimId, outcome: 'started' },
    });
    await recovered.controller.shutdown();
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
    ).rejects.toThrow(/Gemini is not ready \(needs_install\)/);
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
    ).rejects.toThrow(/Meta is not ready \(unavailable\)/);
    expect(runtime.runTurn).not.toHaveBeenCalled();
    await cloudController.shutdown();
  });

  it('streams deterministic local state and keeps completed work after a turn', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await controller.invoke('threads.send', { threadId, text: 'Inspect this project' });
    await new Promise((resolve) => setTimeout(resolve, 220));

    const snapshot = controller.snapshot();
    expect(snapshot.threads.find(({ id }) => id === threadId)?.status).toBe('idle');
    expect(snapshot.timeline.filter((event) => event.threadId === threadId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'user', text: 'Inspect this project' }),
        expect.objectContaining({ kind: 'assistant' }),
      ]),
    );
    await controller.shutdown();
  });

  it('coalesces rapid streaming deltas before encrypting and publishing full snapshots', async () => {
    const repository = new CountingRepository();
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        for (let index = 0; index < 30; index += 1) {
          yield {
            id: crypto.randomUUID(),
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex' as const,
            sequence: index,
            timestamp: new Date().toISOString(),
            type: 'message' as const,
            payload: {
              messageId: 'streamed-answer',
              role: 'assistant' as const,
              parts: [{ kind: 'text' as const, text: 'x' }],
              delta: true,
            },
          };
          await new Promise((resolve) => setTimeout(resolve, 4));
        }
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 31,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      repository,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Streaming helper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    const writesBeforeTurn = repository.desktopStateWrites;
    let pushes = 0;
    controller.subscribe(() => {
      pushes += 1;
    });

    await controller.invoke('threads.send', { threadId, text: 'Stream the answer' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(repository.desktopStateWrites - writesBeforeTurn).toBeLessThan(10);
    expect(pushes).toBeLessThan(10);
    expect(
      controller.snapshot().timeline.find(({ detail }) => detail === 'streamed-answer')?.text,
    ).toHaveLength(30);
    await controller.shutdown();
  });

  it('waits for aborted turn cleanup before closing persistence on shutdown', async () => {
    const repository = new CountingRepository();
    let runtimeThreadId = '';
    let cleanupFinished = false;
    const runtime = {
      async *runTurn(input: { turnId: string }, signal?: AbortSignal) {
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'message' as const,
          payload: {
            messageId: 'partial',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'partial' }],
            delta: true,
          },
        };
        await new Promise<void>((resolve) => {
          const finish = () =>
            setTimeout(() => {
              cleanupFinished = true;
              resolve();
            }, 20);
          if (signal?.aborted) finish();
          else signal?.addEventListener('abort', finish, { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      repository,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Shutdown helper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Wait for shutdown' });

    await controller.shutdown();

    expect(cleanupFinished).toBe(true);
    expect(repository.writesAfterClose).toBe(0);
  });

  it('requires explicit research consent state and deletes the local research scope', async () => {
    const controller = await createController();
    expect(controller.snapshot().capture.status).toBe('not_consented');

    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture.status).toBe('recording');

    await controller.invoke('research.delete', { confirmation: 'DELETE' });
    expect(controller.snapshot().capture.status).toBe('not_consented');
    await controller.shutdown();
  });

  it('records a reviewed consent decline without enabling research capture', async () => {
    const { controller, repository } = await createHarness();

    await controller.invoke('research.setCapture', {
      enabled: false,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    expect(repository.list('research')).toEqual([]);
    expect(
      repository.get<{
        capture: { status: string; pendingCount: number; promptReviewedVersion?: string };
      }>('desktop', 'state')?.capture,
    ).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    await controller.shutdown();
  });

  it('clears identity-bound local research before signing out', async () => {
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const identity = {
      initialize: async () => ({
        state: identityState,
        ...(identityState === 'signed_in' ? { email: 'person@example.com' } : {}),
      }),
      status: () => ({
        state: identityState,
        ...(identityState === 'signed_in' ? { email: 'person@example.com' } : {}),
      }),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut: async () => {
        identityState = 'signed_out';
        return { state: identityState } as const;
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller, repository } = await createHarness({ identity });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId: thread.threadId, text: 'Hello' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    await controller.invoke('auth.signOut', undefined);

    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    expect(repository.list('research')).toEqual([]);
    expect(repository.list('research_sync')).toEqual([]);
    await controller.shutdown();
  });

  it('does not discard an unsynced research outbox during sign-out', async () => {
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
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
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      uploadResearchBatch: vi.fn(async () => {
        throw new Error('offline');
      }),
    } as unknown as CloudClient;
    const { controller, repository } = await createHarness({ cloud, identity });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Research participant',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId: thread.threadId, text: 'Retain me' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    await expect(controller.invoke('auth.signOut', undefined)).rejects.toThrow(
      'waiting for AWS',
    );
    expect(identityState).toBe('signed_in');
    expect(repository.list('research')).not.toHaveLength(0);
    await controller.shutdown();
  });

  it('revokes process-local browser and interrupted turn state on relaunch', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const now = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [
        {
          id: 'agent-1',
          name: 'Persistent helper',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
          threadIds: ['thread-1'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      threads: [
        {
          id: 'thread-1',
          agentId: 'agent-1',
          title: 'Interrupted work',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
          agentRevision: 'revision-1',
          instructionsSnapshot: '',
          agentNameSnapshot: 'Persistent helper',
          status: 'waiting',
          createdAt: now,
          updatedAt: now,
        },
      ],
      timeline: [],
      approvals: [],
      connections: [
        {
          id: 'gmail',
          label: 'Gmail',
          status: 'connecting',
          connectionId: 'opaque-gmail-grant',
        },
        { id: 'drive', label: 'Google Drive', status: 'disconnected' },
        { id: 'slack', label: 'Slack', status: 'disconnected' },
      ],
      capture: { status: 'not_consented', pendingCount: 0 },
      browser: {
        status: 'attached',
        browser: 'Google Chrome',
        grantedOrigins: ['https://mail.example.test'],
      },
      connectionOwners: { gmail: 'person@example.com' },
    });

    const { controller } = await createHarness({ repository });
    const snapshot = controller.snapshot();
    expect(snapshot.browser).toEqual({ status: 'detached', grantedOrigins: [] });
    expect(snapshot.threads[0]).toMatchObject({ id: 'thread-1', status: 'idle' });
    expect(snapshot.connections[0]).toMatchObject({
      id: 'gmail',
      status: 'error',
      connectionId: 'opaque-gmail-grant',
      detail: expect.stringContaining('interrupted'),
    });
    await controller.shutdown();
  });

  it('retains local research until cloud deletion is confirmed and preserves it on failure', async () => {
    const deletion = Promise.withResolvers<{
      id: string;
      scope: 'research';
      state: string;
    }>();
    const deleteResearchData = vi
      .fn()
      .mockRejectedValueOnce(new Error('cloud worker failed'))
      .mockImplementationOnce(() => deletion.promise);
    const cloud = {
      configured: true,
      deleteResearchData,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      completeEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      signOut: async () => ({ state: 'signed_out' as const }),
    };
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    repository.put('research', 'batch-1', {
      batchId: 'batch-1',
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: new Date().toISOString(),
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });

    await expect(
      controller.invoke('research.delete', { confirmation: 'DELETE' }),
    ).rejects.toThrow('Local research batches remain');
    expect(repository.list('research')).toHaveLength(1);
    expect(controller.snapshot().capture.status).toBe('recording');

    const pending = controller.invoke('research.delete', { confirmation: 'DELETE' });
    await vi.waitFor(() => expect(deleteResearchData).toHaveBeenCalledTimes(2));
    expect(repository.list('research')).toHaveLength(1);
    expect(controller.snapshot().capture.status).toBe('deleting');
    deletion.resolve({ id: 'deletion-1', scope: 'research', state: 'completed' });

    await expect(pending).resolves.toMatchObject({
      capture: { status: 'not_consented', pendingCount: 0 },
    });
    expect(repository.list('research')).toHaveLength(0);
    await controller.shutdown();
  });

  it('retries a failed turn without appending the user message again', async () => {
    let runtimeThreadId = '';
    let attempts = 0;
    const runtime = {
      async *runTurn(input: { turnId: string; text: string }) {
        attempts += 1;
        if (attempts === 1) throw new Error('provider startup failed');
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
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
    await controller.invoke('threads.send', { threadId, text: 'Retry this once' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'failed',
      ),
    );

    await controller.invoke('threads.retry', { threadId });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(
      controller
        .snapshot()
        .timeline.filter(({ threadId: id, kind }) => id === threadId && kind === 'user'),
    ).toHaveLength(1);
    expect(attempts).toBe(2);
    await controller.shutdown();
  });

  it('clears local Sia state only after the exact cloud account job completes', async () => {
    const deletion = Promise.withResolvers<{
      id: string;
      scope: 'account';
      state: 'completed';
    }>();
    const cloud = {
      configured: true,
      deleteAccountData: vi.fn(() => deletion.promise),
    } as unknown as CloudClient;
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const signOut = vi.fn(async () => {
      identityState = 'signed_out';
      return { state: identityState } as const;
    });
    const identity = {
      initialize: async () => ({ state: identityState, email: 'person@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut,
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const resetSessions = vi.fn(async () => undefined);
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      runtime: {
        runTurn: vi.fn(),
        cancel: vi.fn(async () => undefined),
        respondToRequest: vi.fn(async () => undefined),
        resetSessions,
        dispose: vi.fn(async () => undefined),
      },
    });
    repository.put('sentinel', 'keep-until-confirmed', { value: true });

    const pending = controller.invoke('auth.deleteAccount', {
      confirmation: 'DELETE ACCOUNT',
    });
    await vi.waitFor(() => expect(cloud.deleteAccountData).toHaveBeenCalledOnce());
    expect(repository.get('sentinel', 'keep-until-confirmed')).toEqual({ value: true });
    expect(controller.snapshot().cloud.auth).toBe('signed_in');

    deletion.resolve({
      id: 'account-deletion-1',
      scope: 'account',
      state: 'completed',
    });
    await expect(pending).resolves.toMatchObject({
      agents: [],
      threads: [],
      connections: expect.arrayContaining([
        expect.objectContaining({ id: 'gmail', status: 'disconnected' }),
      ]),
      cloud: { auth: 'signed_out' },
    });
    expect(repository.get('sentinel', 'keep-until-confirmed')).toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
    expect(resetSessions).toHaveBeenCalledOnce();
    await controller.shutdown();
  });

  it('keeps local Sia state and sign-in when cloud account deletion fails', async () => {
    const cloud = {
      configured: true,
      deleteAccountData: vi.fn(async () => {
        throw new Error('cloud worker failed');
      }),
    } as unknown as CloudClient;
    const signOut = vi.fn(async () => ({ state: 'signed_out' as const }));
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut,
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    repository.put('sentinel', 'must-survive', { value: true });

    await expect(
      controller.invoke('auth.deleteAccount', { confirmation: 'DELETE ACCOUNT' }),
    ).rejects.toThrow('cloud worker failed');

    expect(repository.get('sentinel', 'must-survive')).toEqual({ value: true });
    expect(controller.snapshot().cloud.auth).toBe('signed_in');
    expect(signOut).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('routes an MFA-protected admin through password then authenticator completion', async () => {
    let identityState: 'password_required' | 'mfa_required' | 'signed_in' = 'password_required';
    const completePasswordSignIn = vi.fn(async (password: string) => {
      expect(password).toBe('admin password with spaces');
      identityState = 'mfa_required';
      return { state: identityState, email: 'admin@example.com' } as const;
    });
    const completeMfaSignIn = vi.fn(async (code: string) => {
      expect(code).toBe('123456');
      identityState = 'signed_in';
      return {
        state: identityState,
        email: 'admin@example.com',
        admin: true,
        adminMfa: true,
      } as const;
    });
    const identity = {
      initialize: async () => ({ state: identityState, email: 'admin@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? {
              state: identityState,
              email: 'admin@example.com',
              admin: true,
              adminMfa: true,
            }
          : { state: identityState, email: 'admin@example.com' },
      startEmailSignIn: async () => ({ state: identityState, email: 'admin@example.com' }),
      completeEmailSignIn: vi.fn(async () => ({
        state: identityState,
        email: 'admin@example.com',
      })),
      completePasswordSignIn,
      completeMfaSignIn,
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      identity,
      cloud: new CloudClient('https://api.example.test', { read: async () => undefined }),
    });

    await controller.invoke('auth.complete', { code: 'admin password with spaces' });
    expect(completePasswordSignIn).toHaveBeenCalledOnce();
    expect(identity.completeEmailSignIn).not.toHaveBeenCalled();
    expect(controller.snapshot().cloud.auth).toBe('mfa_required');

    await controller.invoke('auth.complete', { code: '123456' });
    expect(completeMfaSignIn).toHaveBeenCalledOnce();
    expect(controller.snapshot().cloud).toMatchObject({
      auth: 'signed_in',
      admin: true,
      adminMfa: true,
    });
    await controller.shutdown();
  });

  it('refuses account deletion without a configured signed-in cloud identity', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('auth.deleteAccount', { confirmation: 'DELETE ACCOUNT' }),
    ).rejects.toThrow('not configured');
    await controller.shutdown();
  });

  it('refuses research capture until explicit consent is supplied', async () => {
    const controller = await createController();
    await expect(controller.invoke('research.setCapture', { enabled: true })).rejects.toThrow(
      'Review and accept',
    );
    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    await controller.shutdown();
  });

  it('requires signed-in research-release users to sign out before pausing capture', async () => {
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      completeEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud: new CloudClient('https://api.example.test', { read: async () => 'test-token' }),
      identity,
    });
    const created = await controller.invoke('agents.save', {
      name: 'Research participant',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await expect(
      controller.invoke('threads.send', { threadId, text: 'This must not bypass consent.' }),
    ).rejects.toThrow('current raw research consent');
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });

    await expect(controller.invoke('research.setCapture', { enabled: false })).rejects.toThrow(
      'required while signed in',
    );
    expect(controller.snapshot().capture.status).toBe('recording');
    await controller.shutdown();
  });

  it('persists a completed local text turn without making it cloud-sync eligible', async () => {
    const { controller, repository } = await createHarness();
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await controller.invoke('threads.send', { threadId, text: 'Keep this clean turn' });
    await new Promise((resolve) => setTimeout(resolve, 220));

    const batches = repository.list<ResearchBatchView>('research');
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: expect.any(String),
      syncEligible: false,
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: expect.any(String),
        purpose: 'research_evaluation_debugging',
      },
      events: [
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'user', text: 'Keep this clean turn', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'assistant', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
      ],
    });
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });
    await controller.shutdown();
  });

  it('keeps legacy local captures private when cloud is added later', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const now = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
      connections: [
        { id: 'gmail', label: 'Gmail', status: 'disconnected' },
        { id: 'drive', label: 'Google Drive', status: 'disconnected' },
        { id: 'slack', label: 'Slack', status: 'disconnected' },
      ],
      capture: {
        status: 'recording',
        pendingCount: 1,
        consentVersion: 'alpha-research-v2',
        consentAcceptedAt: now,
        promptReviewedVersion: 'alpha-research-v2',
      },
      browser: { status: 'detached', grantedOrigins: [] },
      connectionOwners: {},
      schedules: [],
      preferences: { completionSound: false },
    });
    repository.put('research', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: now,
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });
    repository.put('research_sync', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      synced: false,
    });

    let identityState: 'signed_out' | 'signed_in' = 'signed_out';
    const uploadResearchBatch = vi.fn();
    const cloud = { configured: true, uploadResearchBatch } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: identityState }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => {
        identityState = 'signed_in';
        return { state: identityState, email: 'person@example.com' } as const;
      },
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      repository,
    });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });

    await controller.invoke('auth.complete', { code: '12345678' });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(uploadResearchBatch).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('discards a spoofed Sia-tool event that has no matching gateway invocation', async () => {
    let runtimeThreadId = '';
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
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'Before the tool' }],
            delta: true,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'tool' as const,
          payload: {
            callId: 'call-1',
            name: 'computer_list',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 3,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Use a tool' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
      'idle',
    );
    expect(repository.list('research')).toHaveLength(0);
    await controller.shutdown();
  });

  it('captures bounded provider-native trajectory metadata without arguments or output', async () => {
    let runtimeThreadId = '';
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
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'native-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printenv SECRET_VALUE' },
            result: 'never collect provider output',
            presentation: {
              kind: 'command' as const,
              command: 'printenv SECRET_VALUE',
              output: 'never collect provider output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'The check completed.' }],
            delta: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 3,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Run the safe check' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const serialized = JSON.stringify(repository.list<ResearchBatchView>('research'));
    expect(serialized).toContain('"kind":"trajectory.step"');
    expect(serialized).toContain('"name":"shell_command"');
    expect(serialized).toContain('"presentation":"command"');
    expect(serialized).not.toContain('printenv');
    expect(serialized).not.toContain('never collect provider output');
    await controller.shutdown();
  });

  it('captures organized raw provider events under the v3 research consent', async () => {
    let runtimeThreadId = '';
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
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'raw-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printf raw-fixture' },
            result: 'raw command output',
            presentation: {
              kind: 'command' as const,
              command: 'printf raw-fixture',
              output: 'raw command output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Raw research',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Capture this exact turn' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    const batches = repository.list<ResearchBatchView & { format?: string; scope?: unknown }>(
      'research',
    );
    const serialized = JSON.stringify(batches);
    expect(batches.every(({ format }) => format === 'raw_v1')).toBe(true);
    expect(serialized).toContain('provider.tool');
    expect(serialized).toContain('Capture this exact turn');
    expect(serialized).toContain('printf raw-fixture');
    expect(serialized).toContain('raw command output');
    expect(serialized).toContain(threadId);
    await controller.shutdown();
  });

  it('excludes an entire Google Workspace action turn from research capture', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const record = vi.fn();
    const excludeTurn = vi.fn();
    const trajectory = {
      rootDirectory: '/tmp/sia-trajectories',
      record,
      excludeTurn,
    } as unknown as NonNullable<
      ConstructorParameters<typeof DesktopController>[0]['trajectory']
    >;
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
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'before-google-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will search the test inbox.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'mail_search',
          arguments: { account_id: 'gmail', query: 'private fixture' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
      trajectory,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Found a private fixture',
          data: { message: 'private Google Workspace result' },
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Google policy fixture',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Search my test inbox' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(repository.list('research')).toHaveLength(0);
    expect(excludeTurn).toHaveBeenCalledWith(threadId, expect.any(String));
    expect(
      record.mock.calls
        .map(([event]) => event)
        .some((event) => event.type === 'action_result' && event.name === 'mail_search'),
    ).toBe(false);
    await controller.shutdown();
  });

  it('captures one bounded screenshot only from an explicitly safe computer snapshot', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const image = Buffer.from('bounded screenshot fixture').toString('base64');
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        await gateway.invoke({
          name: 'computer_snapshot',
          arguments: { app_id: 'app-1', window_id: 'window-1' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'snapshot-1',
            name: 'computer_snapshot',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Captured safe fixture',
          images: [{ mimeType: 'image/png', dataBase64: image }],
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Inspect the safe fixture' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const events = repository.list<ResearchBatchView>('research')[0]?.events ?? [];
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trajectory.step',
          payload: expect.objectContaining({
            source: 'sia_action',
            type: 'action_result',
            name: 'computer_snapshot',
            outcome: 'verified',
          }),
        }),
        expect.objectContaining({
          kind: 'trajectory.screenshot',
          payload: {
            source: 'sia_action',
            tool: 'computer_snapshot',
            mimeType: 'image/png',
            dataBase64: image,
          },
        }),
      ]),
    );
    await controller.shutdown();
  });

  it('taints research at the action gateway even when provider tool telemetry is absent', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
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
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-before-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will inspect the browser.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'browser_tabs',
          arguments: {},
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({ outcome: 'verified', summary: 'Browser tabs listed' }),
      },
      onInvocation: controller.actionInvocationObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'List my browser tabs' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(repository.list('research')).toHaveLength(0);
    expect(
      controller
        .snapshot()
        .timeline.some((event) => event.turnId && event.toolName === 'browser_tabs'),
    ).toBe(false);
    await controller.shutdown();
  });

  it('prioritizes the Chrome process that owns the remote-debugging port when attaching', async () => {
    const listWindows = new Map<number, unknown>();
    const attachedPids: number[] = [];
    const computer = {
      permissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      requestPermissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      call: async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              { pid: 111, name: 'Google Chrome', bundle_id: 'com.google.Chrome', active: true },
              {
                pid: 222,
                name: 'Google Chrome',
                bundle_id: 'com.google.Chrome',
                active: false,
              },
            ],
          };
        }
        if (tool === 'list_windows') {
          const pid = Number(args.pid);
          return {
            windows: [
              {
                window_id: pid + 1,
                pid,
                title: `w${pid}`,
                is_on_screen: true,
                minimized: false,
                bounds: { width: 800, height: 600 },
                z_index: 1,
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attachedPids.push(Number(args.pid));
          // Only the port owner (222) accepts the cdp_port route.
          if (Number(args.pid) !== 222)
            throw new Error('CUA refused: browser_route_unavailable');
          return { targets: [{ target_id: 't', tab_id: 'tab', url: 'https://example.test/' }] };
        }
        if (tool === 'get_browser_state') {
          return { target_id: 't', tab_id: 'tab', url: 'https://example.test/' };
        }
        return {};
      },
      shutdown: async () => undefined,
    };
    const { controller } = await createHarness({
      computer: computer as never,
      runCommand: async () => 'p222\nf5\n',
    });
    // Auto-attach (trusted default) tries the port owner first and needs no window pick.
    await controller.ensureBrowserAttachedForActions();
    expect(controller.snapshot().browser.status).toBe('attached');
    expect(attachedPids[0]).toBe(222);
    await controller.shutdown();
  });

  it('unlocks every grantable capability with one call and opens the user-only panes', async () => {
    const openFullDiskAccess = vi.fn(async () => undefined);
    const enableChromeDebug = vi.fn(async () => 'enabled');
    const prewarmMessagesAutomation = vi.fn(async () => undefined);
    let messagesReady = false;
    const { controller } = await createHarness({
      capabilitySetup: {
        messagesStatus: () => (messagesReady ? 'ready' : 'needs_full_disk_access'),
        chromeDebugStatus: async () => 'enabled',
        enableChromeDebug,
        openFullDiskAccess,
        prewarmMessagesAutomation,
      },
    });
    const snapshot = await controller.invoke('computer.unlock', undefined);
    expect(enableChromeDebug).toHaveBeenCalledOnce();
    expect(prewarmMessagesAutomation).toHaveBeenCalledOnce();
    expect(openFullDiskAccess).toHaveBeenCalledOnce();
    expect(snapshot.computer.chromeConnection).toBe('enabled');
    expect(snapshot.computer.messagesAccess).toBe('needs_full_disk_access');
    messagesReady = true;
    const again = await controller.invoke('computer.unlock', undefined);
    expect(openFullDiskAccess).toHaveBeenCalledOnce();
    expect(again.computer.messagesAccess).toBe('ready');
    await controller.shutdown();
  });

  it('answers driver-level computer authorization automatically in trusted mode', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    expect(controller.snapshot().computer.trust).toBe('auto');
    await expect(
      controller.authorizeComputer(
        {
          adapterId: 'desktop_input',
          riskClass: 'r2',
          permissionMode: 'standard',
          publicSession: started.turnId,
          requestDigest: 'digest-auto',
          humanSummary: 'Control the selected Notes window',
          resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
          expiresUnixMs: BigInt(Date.now() + 30_000),
        },
        { kind: 'turn', threadId, turnId: started.turnId },
      ),
    ).resolves.toBe('allow');
    expect(controller.snapshot().approvals).toHaveLength(0);
    await controller.shutdown();
  });

  it('shows content-bounded, correctly classified computer approvals', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    const decision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'digest-1',
        humanSummary: 'Control the selected Notes window',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval).toMatchObject({
      kind: 'native_tool',
      title: 'Allow computer access',
      target: 'Notes, Draft',
      reversible: false,
    });
    expect(approval.title).not.toContain('Chrome');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve',
    });
    await expect(decision).resolves.toBe('allow');
    await controller.shutdown();
  });

  it('shows exact connector recipients and content in the approval preview', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Send the email',
    });
    const body = `${'x'.repeat(17_000)} exact-tail`;
    const pending = controller.approvalBroker().requestApproval({
      id: 'approval-call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('mail_send')!,
      arguments: {
        account_id: 'gmail',
        to: ['person@example.com'],
        subject: 'Quarterly status',
        body,
      },
      targetDigest: 'target-digest',
      reason: 'This sends an email.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe('email recipients: person@example.com');
    expect(approval.account).toBe('demo@google.test');
    expect(approval.dataLeaving).toContain('To: person@example.com');
    expect(approval.dataLeaving).toContain('Subject: Quarterly status');
    expect(approval.dataLeaving).toContain(`Body:\n${body}`);
    expect(approval.dataLeaving).not.toContain('omitted');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('authorizes connector changes without an approval card in autonomous mode', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'slack' });
    const connectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'slack')?.connectionId;
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Post the update',
    });

    await expect(
      controller.approvalBroker().requestApproval({
        id: 'automatic-slack-call',
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('slack_post')!,
        arguments: { account_id: 'slack', channel_id: 'C1', text: 'Ready.' },
        targetDigest: 'automatic-slack-digest',
        reason: 'This posts a Slack message.',
      }),
    ).resolves.toEqual({ approved: true });
    expect(controller.snapshot().approvals).toHaveLength(0);
    expect(controller.connectionIdForAction('slack', 'slack', 'automatic-slack-call')).toBe(
      connectionId,
    );
    await controller.shutdown();
  });

  it('connects every work app from one guided request in fake-services mode', async () => {
    const controller = await createController();

    const result = await controller.invoke('connections.startAll', undefined);

    expect(result.opened).toBe(false);
    expect(result.snapshot.connections).toEqual([
      expect.objectContaining({ id: 'gmail', status: 'connected' }),
      expect.objectContaining({ id: 'drive', status: 'connected' }),
      expect.objectContaining({ id: 'docs', status: 'connected' }),
      expect.objectContaining({ id: 'sheets', status: 'connected' }),
      expect.objectContaining({ id: 'slides', status: 'connected' }),
      expect.objectContaining({ id: 'slack', status: 'connected' }),
    ]);
    await controller.shutdown();
  });

  it('replaces an expired saved grant in one reconnect action', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'docs' });
    const original = controller
      .snapshot()
      .connections.find(({ id }) => id === 'docs')?.connectionId;
    expect(original).toBeTruthy();

    controller.markConnectionReconnectRequired('docs', original!);
    expect(controller.snapshot().connections.find(({ id }) => id === 'docs')).toMatchObject({
      status: 'error',
      connectionId: original,
      detail: 'This app connection expired. Reconnect Google Workspace, then retry the action.',
    });

    const result = await controller.invoke('connections.start', { connectionId: 'docs' });
    expect(result.snapshot.connections.find(({ id }) => id === 'docs')).toMatchObject({
      status: 'connected',
    });
    expect(result.snapshot.connections.find(({ id }) => id === 'docs')?.connectionId).not.toBe(
      original,
    );
    await controller.shutdown();
  });

  it('connects Google Workspace as one guided group without implicitly granting Slack', async () => {
    const controller = await createController();

    const result = await controller.invoke('connections.startGoogle', undefined);

    expect(result.opened).toBe(false);
    expect(
      result.snapshot.connections
        .filter(({ id }) => id !== 'slack')
        .every(({ status }) => status === 'connected'),
    ).toBe(true);
    expect(result.snapshot.connections.find(({ id }) => id === 'slack')).toMatchObject({
      status: 'disconnected',
    });
    await controller.shutdown();
  });

  it('keeps a read-only Google grant active until the editor upgrade succeeds', async () => {
    let editorStarted = false;
    const startConnection = vi.fn(
      async (_connectionId: string, access?: 'read_only' | 'read_write') => {
        editorStarted = access === 'read_write';
        return {
          redirectUrl: `https://connect.example.test/${editorStarted ? 'editor' : 'reader'}`,
          connectionId: editorStarted ? 'grant-editor' : 'grant-reader',
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        };
      },
    );
    const connectionStatus = vi.fn(async () => ({
      connections: [
        {
          id: 'grant-reader',
          app: 'google_workspace' as const,
          status: 'connected' as const,
          accountLabel: 'person@example.com',
          access: 'read_only' as const,
        },
        ...(editorStarted
          ? [
              {
                id: 'grant-editor',
                app: 'google_workspace' as const,
                status: 'connected' as const,
                accountLabel: 'person@example.com',
                access: 'read_write' as const,
              },
            ]
          : []),
      ],
    }));
    const disconnect = vi.fn(async () => undefined);
    const retireSupersededGoogleConnection = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus,
      disconnect,
      retireSupersededGoogleConnection,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.startGoogle', undefined);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        controller
          .snapshot()
          .connections.filter(({ id }) => id !== 'slack')
          .every(
            ({ status, connectionId, googleAccess }) =>
              status === 'connected' &&
              connectionId === 'grant-reader' &&
              googleAccess === 'read_only',
          ),
      ).toBe(true);

      const upgrading = await controller.invoke('connections.upgradeGoogle', undefined);
      expect(upgrading.opened).toBe(true);
      expect(startConnection).toHaveBeenLastCalledWith('gmail', 'read_write');
      expect(
        upgrading.snapshot.connections
          .filter(({ id }) => id !== 'slack')
          .every(
            ({ connectionId, googleAccess, upgradeConnectionId }) =>
              connectionId === 'grant-reader' &&
              googleAccess === 'read_only' &&
              upgradeConnectionId === 'grant-editor',
          ),
      ).toBe(true);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        controller
          .snapshot()
          .connections.filter(({ id }) => id !== 'slack')
          .every(
            ({ connectionId, googleAccess, upgradeConnectionId }) =>
              connectionId === 'grant-editor' &&
              googleAccess === 'read_write' &&
              upgradeConnectionId === undefined,
          ),
      ).toBe(true);
      expect(openExternal).toHaveBeenNthCalledWith(1, 'https://connect.example.test/reader');
      expect(openExternal).toHaveBeenNthCalledWith(2, 'https://connect.example.test/editor');
      expect(retireSupersededGoogleConnection).toHaveBeenCalledWith(
        'grant-reader',
        'grant-editor',
      );
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('treats any selected Google app as the unified Workspace grant', async () => {
    const controller = await createController();

    const result = await controller.invoke('connections.startSelected', {
      connectionIds: ['slack', 'docs', 'gmail'],
    });

    expect(result.opened).toBe(false);
    expect(
      result.snapshot.connections.map(({ id, status, enabled }) => ({
        id,
        status,
        enabled: enabled !== false,
      })),
    ).toEqual([
      { id: 'gmail', status: 'connected', enabled: true },
      { id: 'drive', status: 'connected', enabled: false },
      { id: 'docs', status: 'connected', enabled: true },
      { id: 'sheets', status: 'connected', enabled: false },
      { id: 'slides', status: 'connected', enabled: false },
      { id: 'slack', status: 'connected', enabled: true },
    ]);
    await controller.shutdown();
  });

  it('enforces Google service switches in the connector action router', async () => {
    const controller = await createController();
    await controller.invoke('connections.startSelected', { connectionIds: ['docs'] });

    expect(controller.connectionIdForAction('gmail', 'gmail')).toBeUndefined();
    expect(controller.connectionIdForAction('docs', 'docs')).toEqual(expect.any(String));

    await controller.invoke('connections.setEnabled', {
      connectionId: 'gmail',
      enabled: true,
    });
    expect(controller.connectionIdForAction('gmail', 'gmail')).toEqual(expect.any(String));

    await controller.invoke('connections.setEnabled', {
      connectionId: 'docs',
      enabled: false,
    });
    expect(controller.connectionIdForAction('docs', 'docs')).toBeUndefined();
    await controller.shutdown();
  });

  it('reuses an already connected unified Google Workspace grant', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const before = controller.snapshot().connections;
    const gmailGrant = before.find(({ id }) => id === 'gmail')?.connectionId;

    const result = await controller.invoke('connections.startGoogle', undefined);

    expect(result.snapshot.connections.find(({ id }) => id === 'gmail')).toMatchObject({
      status: 'connected',
      connectionId: gmailGrant,
    });
    expect(result.snapshot.connections.find(({ id }) => id === 'drive')).toMatchObject({
      status: 'connected',
      connectionId: gmailGrant,
    });
    expect(
      result.snapshot.connections
        .filter(({ id }) => id !== 'slack')
        .every(({ status }) => status === 'connected'),
    ).toBe(true);
    expect(result.snapshot.connections.find(({ id }) => id === 'slack')).toMatchObject({
      status: 'disconnected',
    });
    await controller.shutdown();
  });

  it('records connector setup locally and in the raw AWS research stream', async () => {
    const uploadResearchBatch = vi.fn(async () => undefined);
    const startConnection = vi.fn(async () => ({
      redirectUrl: 'https://connect.example.test/docs',
      connectionId: 'grant-docs',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus: async () => ({
        connections: [
          {
            id: 'grant-docs',
            app: 'google_docs' as const,
            status: 'connected' as const,
            accountLabel: 'research-fixture@example.test',
          },
        ],
      }),
      disconnect: async () => undefined,
      uploadResearchBatch,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      completeEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const record = vi.fn();
    const trajectory = {
      rootDirectory: '/tmp/sia-trajectories',
      record,
    } as unknown as NonNullable<
      ConstructorParameters<typeof DesktopController>[0]['trajectory']
    >;
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      trajectory,
    });

    await expect(
      controller.invoke('connections.start', { connectionId: 'docs' }),
    ).rejects.toThrow('Raw research recording must be active');
    expect(startConnection).not.toHaveBeenCalled();

    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();
    try {
      await controller.invoke('connections.start', { connectionId: 'docs' });
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(controller.snapshot().connections.find(({ id }) => id === 'docs')).toMatchObject({
        status: 'connected',
        account: 'research-fixture@example.test',
      });
      const serialized = JSON.stringify(repository.list('research'));
      expect(serialized).toContain('connector.setup.started');
      expect(serialized).toContain('connector.authorization.opened');
      expect(serialized).toContain('connector.connected');
      expect(serialized).not.toContain('https://connect.example.test/docs');
      expect(uploadResearchBatch).toHaveBeenCalled();
      expect(record.mock.calls.map(([event]) => event.type)).toEqual(
        expect.arrayContaining([
          'connector.setup.started',
          'connector.authorization.opened',
          'connector.connected',
        ]),
      );
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('keeps polling until the provider-supplied authorization expiry', async () => {
    let startedAt = 0;
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection: async () => {
        startedAt = Date.now();
        return {
          redirectUrl: 'https://connect.example.test/gmail',
          connectionId: 'slow-gmail-grant',
          expiresAt: new Date(startedAt + 10 * 60_000).toISOString(),
        };
      },
      connectionStatus: async () => ({
        connections: [
          {
            id: 'slow-gmail-grant',
            app: 'gmail' as const,
            status:
              Date.now() - startedAt >= 124_000
                ? ('connected' as const)
                : ('link_pending' as const),
            accountLabel: 'slow-consent@example.test',
          },
        ],
      }),
      disconnect: async () => undefined,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.start', { connectionId: 'gmail' });
      await vi.advanceTimersByTimeAsync(122_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toMatchObject({
        status: 'connecting',
        connectionId: 'slow-gmail-grant',
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toMatchObject({
        status: 'connected',
        connectionId: 'slow-gmail-grant',
        account: 'slow-consent@example.test',
      });
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('opens each provider only after the previous grant is verified', async () => {
    type TestConnectionId = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';
    const connectionOrder: TestConnectionId[] = ['gmail', 'slack'];
    const startConnection = vi.fn(async (connectionId: TestConnectionId) => ({
      redirectUrl: `https://connect.example.test/${connectionId}`,
      connectionId: `grant-${connectionId}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    const connectionStatus = vi.fn(async (connectionId: TestConnectionId) => ({
      connections: [
        {
          id: `grant-${connectionId}`,
          app: {
            gmail: 'gmail',
            drive: 'google_drive',
            docs: 'google_docs',
            sheets: 'google_sheets',
            slides: 'google_slides',
            slack: 'slack',
          }[connectionId],
          status: 'connected' as const,
          accountLabel: `${connectionId}@example.test`,
        },
      ],
    }));
    const disconnect = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus,
      disconnect,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      const result = await controller.invoke('connections.startAll', undefined);
      expect(result.opened).toBe(true);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenLastCalledWith('https://connect.example.test/gmail');

      for (let index = 1; index < connectionOrder.length; index += 1) {
        await vi.advanceTimersByTimeAsync(2_000);
        expect(openExternal).toHaveBeenCalledTimes(index + 1);
        expect(openExternal).toHaveBeenLastCalledWith(
          `https://connect.example.test/${connectionOrder[index]}`,
        );
      }
      await vi.advanceTimersByTimeAsync(2_000);
      expect(startConnection.mock.calls.map(([id]) => id)).toEqual(connectionOrder);
      expect(connectionStatus.mock.calls.map(([id]) => id)).toEqual(connectionOrder);
      expect(
        controller.snapshot().connections.every(({ status }) => status === 'connected'),
      ).toBe(true);

      for (const connectionId of connectionOrder) {
        await controller.invoke('connections.disconnect', { connectionId });
      }
      const delayedStatus = Promise.withResolvers<{
        connections: Array<{
          id: string;
          app: 'gmail';
          status: 'connected';
          accountLabel: string;
        }>;
      }>();
      connectionStatus.mockImplementationOnce(async () => await delayedStatus.promise);
      await controller.invoke('connections.startAll', undefined);
      expect(openExternal).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(connectionStatus).toHaveBeenCalledTimes(3);

      await controller.invoke('connections.disconnect', { connectionId: 'gmail' });
      delayedStatus.resolve({
        connections: [
          {
            id: 'grant-gmail',
            app: 'gmail',
            status: 'connected',
            accountLabel: 'gmail@example.test',
          },
        ],
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(openExternal).toHaveBeenCalledTimes(3);
      expect(controller.snapshot().connections).toEqual([
        expect.objectContaining({ id: 'gmail', status: 'disconnected' }),
        expect.objectContaining({ id: 'drive', status: 'disconnected' }),
        expect.objectContaining({ id: 'docs', status: 'disconnected' }),
        expect.objectContaining({ id: 'sheets', status: 'disconnected' }),
        expect.objectContaining({ id: 'slides', status: 'disconnected' }),
        expect.objectContaining({ id: 'slack', status: 'disconnected' }),
      ]);
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('keeps polling through a transient connection-status outage', async () => {
    const connectionStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary network failure'))
      .mockResolvedValue({
        connections: [
          {
            id: 'grant-slack',
            app: 'slack' as const,
            status: 'connected' as const,
            accountLabel: 'fixture-workspace',
          },
        ],
      });
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection: async () => ({
        redirectUrl: 'https://connect.example.test/slack',
        connectionId: 'grant-slack',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
      connectionStatus,
      disconnect: async () => undefined,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal: async () => undefined,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.start', { connectionId: 'slack' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'slack')).toMatchObject({
        status: 'connecting',
        connectionId: 'grant-slack',
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'slack')).toMatchObject({
        status: 'connected',
        connectionId: 'grant-slack',
        account: 'fixture-workspace',
      });
      expect(connectionStatus).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('pins connector approvals to the exact connection and consumes them once', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const originalConnectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'gmail')?.connectionId;
    expect(originalConnectionId).toEqual(expect.any(String));
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Send email' });
    const requestApproval = (id: string) =>
      controller.approvalBroker().requestApproval({
        id,
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('mail_send')!,
        arguments: {
          account_id: 'gmail',
          to: ['person@example.com'],
          subject: 'Status',
          body: 'Ready.',
        },
        targetDigest: `digest-${id}`,
        reason: 'This sends an email.',
      });

    const first = requestApproval('connector-call-1');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(first).resolves.toEqual({ approved: true });
    expect(controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1')).toBe(
      originalConnectionId,
    );
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1'),
    ).toBeUndefined();

    const stale = requestApproval('connector-call-2');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(stale).resolves.toEqual({ approved: true });
    await controller.invoke('connections.disconnect', { connectionId: 'gmail' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    expect(
      controller.snapshot().connections.find(({ id }) => id === 'gmail')?.connectionId,
    ).not.toBe(originalConnectionId);
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-2'),
    ).toBeUndefined();
    await controller.shutdown();
  });

  it('does not let a stale disconnect revoke a replacement connector grant', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const originalConnectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'gmail')?.connectionId;
    expect(originalConnectionId).toEqual(expect.any(String));

    await controller.invoke('connections.disconnect', {
      connectionId: 'gmail',
      expectedConnectionId: originalConnectionId!,
    });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const replacement = controller.snapshot().connections.find(({ id }) => id === 'gmail');
    expect(replacement?.connectionId).not.toBe(originalConnectionId);

    await expect(
      controller.invoke('connections.disconnect', {
        connectionId: 'gmail',
        expectedConnectionId: originalConnectionId!,
      }),
    ).rejects.toThrow('changed since this screen was shown');
    expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toEqual(
      replacement,
    );
    await controller.shutdown();
  });

  it('uses host-resolved element labels for browser and computer approvals', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const trustedApprovalTarget = vi.fn(
      () =>
        'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    controller.attachBrowserCapabilitySink({
      acceptBrowserState: () => undefined,
      resetBrowserCapabilities: () => undefined,
      trustedApprovalTarget,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Compose' });
    const pending = controller.approvalBroker().requestApproval({
      id: 'call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('browser_action')!,
      arguments: {
        tab_id: 'tab-1',
        snapshot_id: 'snapshot-1',
        action: 'click',
        element_ref: 'model-ref',
        origin: 'https://mail.example.test',
      },
      targetDigest: 'digest',
      reason: 'This changes the page.',
    });

    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe(
      'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    expect(trustedApprovalTarget).toHaveBeenCalledWith(
      'browser_action',
      expect.objectContaining({ element_ref: 'model-ref' }),
    );
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('revokes provider and computer approvals before a cancelled turn can release', async () => {
    let runtimeThreadId = '';
    let receivedLease:
      { holds(resource: { kind: 'workspace_writer'; id: string }): boolean } | undefined;
    const runtime = {
      async *runTurn(
        input: {
          turnId: string;
          lease?: { holds(resource: { kind: 'workspace_writer'; id: string }): boolean };
        },
        signal?: AbortSignal,
      ) {
        receivedLease = input.lease;
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'approval' as const,
          payload: {
            requestId: 'provider-request-1',
            phase: 'requested' as const,
            title: 'Run a command',
            description: 'Run the pending provider command',
            choices: [
              { id: 'allow_once', label: 'Allow once', kind: 'allow_once' as const },
              { id: 'deny', label: 'Deny', kind: 'deny' as const },
            ],
          },
        };
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    const started = await controller.invoke('threads.send', { threadId, text: 'Do the task' });
    await vi.waitFor(() => {
      expect(controller.snapshot().approvals.some(({ status }) => status === 'pending')).toBe(
        true,
      );
    });
    expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
      true,
    );
    const computerDecision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'computer-request-1',
        humanSummary: 'Click in Notes',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approvalIds = controller
      .snapshot()
      .approvals.filter(({ status }) => status === 'pending')
      .map(({ id }) => id);

    await controller.invoke('threads.cancel', { threadId });

    await expect(computerDecision).resolves.toBe('cancel');
    expect(runtime.cancel).toHaveBeenCalledWith(threadId, started.turnId);
    expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
      false,
    );
    expect(runtime.respondToRequest).toHaveBeenCalledWith(threadId, {
      requestId: 'provider-request-1',
      choiceId: 'deny',
    });
    expect(
      controller.snapshot().approvals.filter(({ id }) => approvalIds.includes(id)),
    ).toEqual(
      expect.arrayContaining(
        approvalIds.map((id) => expect.objectContaining({ id, status: 'expired' })),
      ),
    );
    for (const approvalId of approvalIds) {
      await expect(
        controller.invoke('approvals.resolve', { approvalId, decision: 'approve' }),
      ).rejects.toThrow('expired');
    }
    await controller.shutdown();
  });

  it('uses deterministic fake Codex readiness and status-aware provider help', async () => {
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({ openExternal });
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')).toMatchObject({
      status: 'ready',
      version: '0.147.0',
      account: 'Deterministic test runtime',
    });
    await controller.invoke('providers.login', { providerId: 'codex' });
    expect(openExternal).toHaveBeenCalledWith('https://learn.chatgpt.com/docs/codex/auth');
    await expect(controller.invoke('providers.login', { providerId: 'meta' })).rejects.toThrow(
      'configured Sia cloud',
    );
    await expect(controller.invoke('providers.login', { providerId: 'grok' })).rejects.toThrow(
      'external alpha',
    );
    await controller.shutdown();
  });

  it('grants only top-level attached tab origins, never nested link URLs', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome' }] };
        }
        if (tool === 'list_windows') return { windows: [{ pid: 42, window_id: 7 }] };
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [
              {
                tab_id: 'tab-1',
                url: 'https://mail.example.test/inbox',
                elements: [
                  { role: 'link', url: 'https://evil.example.test/capture' },
                  { role: 'iframe', origin: 'https://embedded.example.test' },
                ],
              },
            ],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.example.test'],
    });
    await controller.shutdown();
  });

  it('attaches the Chrome application instead of a helper process', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              {
                pid: 41,
                name: 'Google Chrome Helper (Renderer)',
                bundle_id: 'com.google.Chrome.helper',
              },
              { pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' },
            ],
          };
        }
        if (tool === 'list_windows') {
          expect(args).toEqual({ pid: 42 });
          return { windows: [{ pid: 42, window_id: 7 }] };
        }
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://example.test'],
    });
    await controller.shutdown();
  });

  it('does not target Chrome remote-debugging consent dialogs', async () => {
    const attemptedWindowIds: number[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              { pid: 42, window_id: 7, title: 'Allow remote debugging?' },
              { pid: 42, window_id: 8, title: 'Fixture page' },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attemptedWindowIds.push(Number(args.window_id));
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});

    expect(attemptedWindowIds).toEqual([8]);
    await controller.shutdown();
  });

  it('explains Chrome-owned remote-debugging consent refusals', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_wrong_target_refused');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/chrome:\/\/inspect.*Allow remote debugging/i),
    });
    await controller.shutdown();
  });

  it('explains the one-time Chrome permission when reconnect waits for consent', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_reconnect_exhausted');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/Click Allow.*one-time Chrome security step/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_reconnect_exhausted');
    await controller.shutdown();
  });

  it('explains ambiguous duplicate Chrome windows without exposing driver codes', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Duplicate page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_binding_ambiguous');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/unique page.*close the duplicate.*retry/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_binding_ambiguous');
    await controller.shutdown();
  });

  it('offers an explicit picker for multiple Chrome windows and attaches the selection', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 8,
                title: 'Fixture one',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
              {
                pid: 42,
                window_id: 9,
                title: 'Fixture two',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          expect(args).toMatchObject({
            pid: 42,
            window_id: 9,
            session: expect.stringMatching(/^sia-browser-/),
          });
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture-two.example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller, repository } = await createHarness({ computer: browserComputer });

    const choiceSnapshot = await controller.invoke('browser.attach', {});

    expect(choiceSnapshot.browser).toMatchObject({
      status: 'detached',
      detail: expect.stringMatching(/Choose the signed-in Chrome window/i),
      availableWindows: [
        { id: 8, label: 'Chrome window 1', detail: 'Fixture one' },
        { id: 9, label: 'Chrome window 2', detail: 'Fixture two' },
      ],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
    expect(
      repository.get<{ browser: { availableWindows?: unknown } }>('desktop', 'state')?.browser
        .availableWindows,
    ).toBeUndefined();

    const attachedSnapshot = await controller.invoke('browser.attach', { windowId: 9 });

    expect(attachedSnapshot.browser).toMatchObject({
      status: 'attached',
      profileLabel: 'Chrome window 2',
      grantedOrigins: ['https://fixture-two.example.test'],
    });
    expect(attachedSnapshot.browser.availableWindows).toBeUndefined();
    await controller.shutdown();
  });

  it('opens a user-entered site in an attached signed-in profile and grants its origin', async () => {
    let currentUrl = 'chrome://newtab/';
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Signed-in profile',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare' || tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: currentUrl }],
          };
        }
        if (tool === 'browser_navigate') {
          expect(args).toMatchObject({
            session: expect.stringMatching(/^sia-browser-/),
            target_id: 'target-2',
            tab_id: 'tab-2',
            url: 'https://mail.google.com/',
          });
          currentUrl = String(args.url);
          return { effect: 'confirmed' };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const attached = await controller.invoke('browser.attach', {});
    expect(attached.browser).toMatchObject({ status: 'attached', grantedOrigins: [] });

    const opened = await controller.invoke('browser.open', { url: 'mail.google.com' });
    expect(opened.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.google.com'],
    });
    await controller.shutdown();
  });

  it('mints a fresh browser session after detach so reattach does not require restart', async () => {
    const preparedSessions: string[] = [];
    const endedSessions: string[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Local fixture',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          preparedSessions.push(String(args.session));
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'end_session') {
          endedSessions.push(String(args.session));
          return { ended: true };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});
    await controller.invoke('browser.detach', undefined);
    const reattached = await controller.invoke('browser.attach', {});

    expect(reattached.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://fixture.example.test'],
    });
    expect(preparedSessions).toHaveLength(2);
    expect(preparedSessions[0]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).not.toBe(preparedSessions[0]);
    expect(endedSessions).toEqual([preparedSessions[0]]);
    await controller.shutdown();
  });

  it('rejects a stale Chrome window choice and returns the current choices', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [{ pid: 42, window_id: 8, title: 'Current fixture' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', { windowId: 999 });

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/changed or closed/i),
      availableWindows: [{ id: 8, label: 'Chrome window 1', detail: 'Current fixture' }],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
    await controller.shutdown();
  });

  it('keeps Meta fail-closed without an authenticated relay capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud: new CloudClient('https://api.example.test', {
        read: async () => undefined,
      }),
      identity,
    });
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'needs_login',
    });
    await controller.invoke('auth.complete', { code: '123456' });
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'unavailable',
    });
    await controller.invoke('auth.signOut', undefined);
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'needs_login',
    });
    await controller.shutdown();
  });

  it('marks Meta ready only after an authenticated live capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/v1/session')) {
        return Response.json({
          admin: false,
          features: {
            researchUploads: true,
            researchArchive: false,
            connectors: true,
            schedules: true,
          },
        });
      }
      if (url.endsWith('/v1/meta/capabilities')) {
        return Response.json({
          available: true,
          models: ['super_nova_ext'],
          streaming: true,
          tools: true,
        });
      }
      throw new Error(`Unexpected cloud request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { controller } = await createHarness({
        fakeServices: false,
        cloud: new CloudClient('https://api.example.test', {
          read: async () => 'test-id-token',
        }),
        identity,
      });

      await controller.invoke('auth.complete', { code: '123456' });

      expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
        status: 'ready',
        model: 'super_nova_ext',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/v1/meta/capabilities'),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer test-id-token' }),
        }),
      );
      await controller.shutdown();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

class CountingRepository implements RecordRepository {
  readonly #inner = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  desktopStateWrites = 0;
  writesAfterClose = 0;
  #closed = false;

  get<T>(scope: string, id: string): T | undefined {
    return this.#inner.get<T>(scope, id);
  }

  list<T>(scope: string): T[] {
    return this.#inner.list<T>(scope);
  }

  put<T>(scope: string, id: string, value: T): void {
    if (this.#closed) {
      this.writesAfterClose += 1;
      throw new Error('write after close');
    }
    if (scope === 'desktop' && id === 'state') this.desktopStateWrites += 1;
    this.#inner.put(scope, id, value);
  }

  remove(scope: string, id: string): void {
    this.#inner.remove(scope, id);
  }

  clearAll(): void {
    this.#inner.clearAll();
  }

  close(): void {
    this.#closed = true;
    this.#inner.close();
  }
}
