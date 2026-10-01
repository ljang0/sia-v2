import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopSnapshot } from '../../shared/bridge.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import { ScottyTasks } from '../scotty-state.js';
import type { DesktopController } from './desktop-controller.js';
import { CountingRepository, createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
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

  it('finishes getting ready when provider work starts without finishing that work', async () => {
    let begin!: () => void;
    let finish!: () => void;
    const prepared = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        await prepared;
        const base = {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
          sequence: 1,
        };
        yield {
          ...base,
          type: 'tool' as const,
          payload: {
            callId: 'browser-check',
            name: 'computer_snapshot',
            phase: 'started' as const,
            native: false,
          },
        };
        await completed;
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
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Progress helper',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      await controller.invoke('threads.send', { threadId, text: 'Check the example page' });
      const startup = () =>
        controller
          .snapshot()
          .timeline.findLast(
            (item) => item.threadId === threadId && item.toolName === 'runtime.start',
          );
      expect(startup()?.status).toBe('running');
      begin();
      await vi.waitFor(() =>
        expect(
          controller
            .snapshot()
            .timeline.find(
              (item) => item.threadId === threadId && item.toolCallId === 'browser-check',
            )?.status,
        ).toBe('running'),
      );
      expect(startup()?.status).toBe('complete');
      expect(
        controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
      ).toBe('running');
      finish();
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
        ).toBe('idle'),
      );
    } finally {
      begin();
      finish();
      await controller.shutdown();
    }
  });

  it('streams promptly with bounded encrypted checkpoints and a durable final answer', async () => {
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
          await new Promise((resolve) => setTimeout(resolve, 20));
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
    // The stream deliberately waits 600ms before completion. Allow scheduler delays
    // on a busy Mac; the bounds below still enforce responsive, batched persistence.
    await vi.waitFor(
      () =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'idle',
        ),
      { timeout: 3000 },
    );

    expect(repository.desktopStateWrites - writesBeforeTurn).toBeLessThan(10);
    expect(pushes).toBeLessThan(25);
    expect(pushes).toBeGreaterThan(repository.desktopStateWrites - writesBeforeTurn + 4);
    expect(
      repository
        .get<{ timeline: Array<{ detail?: string; text?: string }> }>('desktop', 'state')
        ?.timeline.find(({ detail }) => detail === 'streamed-answer')?.text,
    ).toHaveLength(30);
    expect(
      controller.snapshot().timeline.find(({ detail }) => detail === 'streamed-answer')?.text,
    ).toHaveLength(30);
    await controller.shutdown();
  });

  it('pushes only the active thread history to the renderer and previews the rest', async () => {
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        const base = {
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'message' as const,
          payload: {
            messageId: `reply-${input.turnId}`,
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: `Reply for turn ${input.turnId}` }],
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
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
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'History helper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const threadIds: string[] = [];
    for (const text of ['Plan the trip', 'Draft the budget']) {
      const { threadId } = await controller.invoke('threads.create', { agentId });
      await controller.invoke('threads.send', { threadId, text });
      await vi.waitFor(() =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'idle',
        ),
      );
      threadIds.push(threadId);
    }
    const [first, second] = threadIds as [string, string];
    await controller.invoke('threads.send', { threadId: first, text: 'Add a hotel' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === first)?.status).toBe('idle'),
    );
    const pushed: DesktopSnapshot[] = [];
    controller.subscribe((event) => {
      if (event.type === 'snapshot') pushed.push(event.snapshot);
    });

    const returned = await controller.invokeForRenderer('threads.select', { threadId: first });

    expect(pushed.length).toBeGreaterThan(0);
    for (const snapshot of [...pushed, returned]) {
      expect(snapshot.activeThreadId).toBe(first);
      expect(snapshot.timeline.length).toBeGreaterThan(0);
      expect(snapshot.timeline.every(({ threadId }) => threadId === first)).toBe(true);
      expect(snapshot.previews?.[second]).toEqual({
        label: 'Latest reply',
        text: expect.stringContaining('Reply for turn'),
      });
      expect(snapshot.previews?.[first]?.label).toBe('Latest reply');
    }
    // In-process callers and ordinary invokes still see every thread.
    const full = await controller.invoke('threads.select', { threadId: first });
    expect(new Set(full.timeline.map(({ threadId }) => threadId))).toEqual(new Set(threadIds));
    expect(full.previews).toBeUndefined();
    // Scotty and the launcher read only each thread's latest turn and see the same tasks.
    const narrow = controller.taskSnapshot();
    expect(narrow.timeline.length).toBeLessThan(full.timeline.length);
    expect(narrow.timeline.some(({ text }) => text === 'Plan the trip')).toBe(false);
    const tasks = new ScottyTasks();
    const settings = { enabled: true, size: 'medium', motion: true } as const;
    expect(tasks.view(narrow, settings, true)).toEqual(tasks.view(full, settings, true));
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

    await vi.waitFor(() =>
      expect(controller.snapshot().timeline.some((item) => item.text === 'partial')).toBe(true),
    );
    await controller.shutdown();

    expect(cleanupFinished).toBe(true);
    expect(repository.closedTimelineText).toContain('partial');
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(repository.writesAfterClose).toBe(0);
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

  it('retries a failed turn without appending the user message again', async () => {
    let runtimeThreadId = '';
    let attempts = 0;
    const requests: string[] = [];
    const runtime = {
      async *runTurn(input: { turnId: string; text: string }) {
        requests.push(input.text);
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
    expect(requests[1]).toContain('Continue task');
    expect(requests[1]).toContain('provider startup failed');
    expect(requests[1]).toContain('verify any uncertain write');
    expect(requests[1]).toContain('Retry this once');
    await controller.shutdown();
  });

  it('resends attachments when continuing a turn that failed with a model error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-retry-attachment-'));
    const path = join(directory, 'budget.csv');
    await writeFile(path, 'month,total\n', 'utf8');
    const inputs: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        inputs.push(input);
        const base = {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
        };
        if (inputs.length === 1)
          yield {
            ...base,
            type: 'error' as const,
            payload: { code: 'model_error', message: 'The model failed', recoverable: true },
          };
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: {
            status: inputs.length === 1 ? ('failed' as const) : ('completed' as const),
          },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      chooseFiles: async () => [path],
    });
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
      await controller.invoke('computer.setAccessMode', { mode: 'connected' });
      const picked = await controller.invoke('attachments.pick', { threadId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Check this budget',
        attachmentIds: picked.attachments.map(({ id }) => id),
      });
      const status = () =>
        controller.snapshot().threads.find(({ id }) => id === threadId)?.status;
      await vi.waitFor(() => expect(status()).toBe('failed'));
      await controller.invoke('threads.retry', { threadId });
      await vi.waitFor(() => expect(status()).toBe('idle'));
      expect(inputs).toHaveLength(2);
      expect(inputs[1]!.attachments).toEqual([{ kind: 'file', path, name: 'budget.csv' }]);
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('lets a queued follow-up carry files attached while the thread works', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-followup-attachment-'));
    const path = join(directory, 'notes.txt');
    await writeFile(path, 'notes', 'utf8');
    const inputs: RuntimeTurnInput[] = [];
    const release = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        inputs.push(input);
        if (inputs.length === 1) await release.promise;
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
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      chooseFiles: async () => [path],
    });
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
      await controller.invoke('computer.setAccessMode', { mode: 'connected' });
      await controller.invoke('threads.send', { threadId, text: 'Start' });
      await vi.waitFor(() => expect(inputs).toHaveLength(1));
      const picked = await controller.invoke('attachments.pick', { threadId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Use these notes next',
        attachmentIds: picked.attachments.map(({ id }) => id),
      });
      release.resolve();
      await vi.waitFor(() => expect(inputs).toHaveLength(2));
      expect(inputs[1]!.attachments).toEqual([{ kind: 'file', path, name: 'notes.txt' }]);
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('restores partial progress for Continue task after an app restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-recovery-'));
    const path = join(root, 'state.sqlite');
    const requests: string[] = [];
    let attempts = 0;
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        requests.push(input.text);
        const base = {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
        };
        if (++attempts === 1) {
          yield {
            ...base,
            type: 'message' as const,
            payload: {
              messageId: randomUUID(),
              role: 'assistant' as const,
              parts: [
                {
                  kind: 'text' as const,
                  text: 'Created report.txt; the calendar step remains unverified.',
                },
              ],
              delta: false,
            },
          };
          throw new Error('Connection interrupted after the file step');
        }
        yield {
          ...base,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
    };
    let controller: DesktopController | undefined;
    try {
      ({ controller } = await createHarness({
        fakeServices: false,
        runtime,
        repository: new SqliteRecordRepository(path, new PlaintextTestCipher()),
      }));
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Recovery test',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Write a report and inspect the calendar.',
      });
      await vi.waitFor(() =>
        expect(controller!.snapshot().threads.find((t) => t.id === threadId)?.status).toBe(
          'failed',
        ),
      );
      await controller.shutdown();
      ({ controller } = await createHarness({
        fakeServices: false,
        runtime,
        repository: new SqliteRecordRepository(path, new PlaintextTestCipher()),
      }));
      expect(attempts).toBe(1); // Opening Sia must never execute interrupted work automatically.
      await controller.invoke('threads.retry', { threadId });
      await vi.waitFor(() =>
        expect(controller!.snapshot().threads.find((t) => t.id === threadId)?.status).toBe(
          'idle',
        ),
      );
      expect(requests[1]).toContain('Created report.txt');
      expect(requests[1]).toContain('calendar step remains unverified');
      expect(requests[1]).toContain('Connection interrupted after the file step');
      expect(requests[1]).toContain('verify any uncertain write before repeating it');
      expect(
        controller
          .snapshot()
          .timeline.filter((t) => t.threadId === threadId && t.kind === 'user'),
      ).toHaveLength(1);
    } finally {
      await controller?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps raw reasoning text out of the reasoning summary', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        let sequence = 0;
        for (const [text, part] of [
          ['**Reading the inbox**', 'summary'],
          ['private chain of thought', 'text'],
          ['\n\nLooking for dates.', 'summary'],
        ] as const) {
          yield {
            ...base,
            id: crypto.randomUUID(),
            sequence: (sequence += 1),
            type: 'reasoning' as const,
            payload: { reasoningId: 'rs_1', text, delta: true, part },
          };
        }
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: sequence + 1,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
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
    await controller.invoke('threads.send', { threadId, text: 'Check mail' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );
    const reasoning = controller
      .snapshot()
      .timeline.filter((item) => item.threadId === threadId && item.kind === 'reasoning');
    expect(reasoning.map((item) => item.text)).toEqual([
      '**Reading the inbox**\n\nLooking for dates.',
    ]);
    await controller.shutdown();
  });

  it('answers a provider question through Scotty and resumes the same runtime turn', async () => {
    let runtimeThreadId = '';
    const answered = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: { turnId: string }, signal?: AbortSignal) {
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
          type: 'question' as const,
          payload: {
            requestId: 'calendar-question',
            phase: 'requested' as const,
            prompt: 'Which calendar should I use?',
          },
        };
        if (signal?.aborted) return;
        signal?.addEventListener('abort', () => answered.resolve(), { once: true });
        await answered.promise;
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      respondToRequest: vi.fn(async () => {
        answered.resolve();
      }),
      cancel: vi.fn(async () => {
        answered.resolve();
      }),
      dispose: vi.fn(async () => {
        answered.resolve();
      }),
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
      const created = await controller.invoke('threads.create', { agentId: agent.agentId });
      runtimeThreadId = created.threadId;
      const started = await controller.invoke('threads.send', {
        threadId: created.threadId,
        text: 'Help with my calendar',
      });
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === created.threadId)
            ?.status,
        ).toBe('waiting'),
      );
      const tasks = new ScottyTasks();
      const settings = { enabled: true, size: 'medium' as const, motion: true };
      const question = tasks
        .view(controller.snapshot(), settings, true)
        .tasks.find((task) => task.id === created.threadId)!;
      expect(question.question).toBe('Which calendar should I use?');
      await tasks.act(
        { kind: 'reply', token: question.token, text: 'My work calendar' },
        controller,
        settings,
        vi.fn(),
      );
      expect(runtime.respondToRequest).toHaveBeenCalledExactlyOnceWith(created.threadId, {
        requestId: 'calendar-question',
        text: 'My work calendar',
      });
      expect(
        controller.snapshot().timeline.findLast((item) => item.kind === 'user')?.turnId,
      ).toBe(started.turnId);
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === created.threadId)
            ?.status,
        ).toBe('idle'),
      );
    } finally {
      answered.resolve();
      await controller.shutdown();
    }
  });
});

it('does not start queued work when an active turn releases its lease during shutdown', async () => {
  const records = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  const close = vi.spyOn(records, 'close').mockImplementation(() => undefined);
  const { controller } = await createHarness({ repository: records });
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Queued skills',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const first = await controller.invoke('threads.create', { agentId });
    await controller.invoke('threads.send', { threadId: first.threadId, text: 'First task' });
    const second = await controller.invoke('threads.create', { agentId });
    await controller.invoke('threads.send', { threadId: second.threadId, text: 'Queued task' });
    expect(
      controller.snapshot().threads.find((entry) => entry.id === second.threadId)?.status,
    ).toBe('queued');
    await controller.shutdown();
    expect(
      controller
        .snapshot()
        .timeline.some(
          (entry) => entry.threadId === second.threadId && entry.toolName === 'runtime.start',
        ),
    ).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    close.mockRestore();
    records.close();
  }
});
