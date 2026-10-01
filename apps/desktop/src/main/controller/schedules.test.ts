import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';
import { CountingRepository, createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
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

    const created = controller.createScheduleFromAction(first.threadId, {
      task: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T12:00:00+09:00',
    });
    const second = await controller.invoke('threads.create', { agentId: agent.agentId });
    expect(second.threadId).not.toBe(first.threadId);
    expect(created).toMatchObject({
      threadId: first.threadId,
      prompt: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      nextRunAt: '2030-08-21T03:00:00.000Z',
      enabled: true,
    });
    // A recurring schedule repeats until paused or deleted.
    expect(created.maxRuns).toBeUndefined();
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

  it('keeps the eight most recent outcomes for repeated schedule runs', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
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
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Schedule history',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = thread.threadId;
    const schedule = controller.createScheduleFromAction(thread.threadId, {
      task: 'Record this check.',
      cadence: 'daily',
      firstRunAt: '2030-08-21T03:00:00.000Z',
    });

    for (let runCount = 1; runCount <= 10; runCount += 1) {
      await controller.invoke('schedules.runNow', { scheduleId: schedule.id });
      await vi.waitFor(() => {
        expect(controller.snapshot().schedules?.[0]).toMatchObject({
          runCount,
          lastRun: { outcome: 'completed', finishedAt: expect.any(String) },
        });
      });
    }

    const persistedSchedule = repository
      .get<{ schedules: Array<{ runHistory?: Array<{ id: string; outcome: string }> }> }>(
        'desktop',
        'state',
      )
      ?.schedules.at(0);
    expect(persistedSchedule?.runHistory).toHaveLength(8);
    expect(persistedSchedule?.runHistory?.every(({ outcome }) => outcome === 'completed')).toBe(
      true,
    );
    expect(new Set(persistedSchedule?.runHistory?.map(({ id }) => id)).size).toBe(8);
    expect(persistedSchedule?.runHistory?.[0]?.id).toBe(
      controller.snapshot().schedules?.[0]?.lastRun?.id,
    );
    await controller.shutdown();
  });

  it('edits a schedule from the list and keeps weekday runs at the chosen local time', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Weekday scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    // 2030-08-24 is a Saturday: a weekday schedule moves to Monday, keeping 8:00 AM local.
    const saturday = new Date(2030, 7, 24, 8, 0);
    const created = await controller.invoke('schedules.create', {
      threadId,
      prompt: 'Summarize my inbox',
      cadence: 'weekdays',
      nextRunAt: saturday.toISOString(),
    });
    const schedule = created.schedules?.[0];
    expect(schedule).toMatchObject({
      cadence: 'weekdays',
      nextRunAt: new Date(2030, 7, 26, 8, 0).toISOString(),
    });
    expect(schedule?.maxRuns).toBeUndefined();

    const edited = await controller.invoke('schedules.update', {
      scheduleId: schedule!.id,
      prompt: 'Summarize my inbox and calendar',
      cadence: 'weekly',
      days: [4, 2, 4],
      nextRunAt: new Date(2030, 7, 26, 16, 30).toISOString(),
      maxRuns: 20,
    });
    expect(edited.schedules?.[0]).toMatchObject({
      prompt: 'Summarize my inbox and calendar',
      cadence: 'weekly',
      days: [2, 4],
      nextRunAt: new Date(2030, 7, 27, 16, 30).toISOString(),
      maxRuns: 20,
      enabled: true,
    });
    const unlimited = await controller.invoke('schedules.update', {
      scheduleId: schedule!.id,
      maxRuns: null,
    });
    expect(unlimited.schedules?.[0]?.maxRuns).toBeUndefined();

    const hourly = await controller.invoke('schedules.update', {
      scheduleId: schedule!.id,
      cadence: 'hourly',
      everyHours: 3,
    });
    expect(hourly.schedules?.[0]).toMatchObject({ cadence: 'hourly', everyHours: 3 });
    expect(hourly.schedules?.[0]?.days).toBeUndefined();

    const weekdays = await controller.invoke('schedules.update', {
      scheduleId: schedule!.id,
      cadence: 'weekdays',
    });
    const upcoming = weekdays.schedules![0]!.nextRunAt;
    expect([1, 2, 3, 4, 5]).toContain(new Date(upcoming).getDay());
    await controller.invoke('schedules.runNow', { scheduleId: schedule!.id });
    // Run now is an extra run; the next scheduled one stays put.
    expect(controller.snapshot().schedules?.[0]).toMatchObject({
      nextRunAt: upcoming,
      runCount: 1,
      enabled: true,
    });
    await expect(
      controller.invoke('schedules.update', { scheduleId: schedule!.id, prompt: '   ' }),
    ).rejects.toThrow('cannot be empty');
    await controller.shutdown();
  });

  it('makes recurring schedules saved with the old ten-run default unlimited, once', async () => {
    const initial = await createHarness();
    const agent = await initial.controller.invoke('agents.save', {
      name: 'Legacy limits',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await initial.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    const firstRunAt = new Date(2030, 7, 23, 16, 0).toISOString();
    for (const [task, cadence, maxRuns] of [
      ['Old default', 'daily', 10],
      ['Chosen limit', 'daily', 5],
      ['One time', 'once', 1],
      ['Ran out', 'weekly', 10],
    ] as const)
      initial.controller.createScheduleFromAction(threadId, {
        task,
        cadence,
        firstRunAt,
        maxRuns,
      });
    const persisted = structuredClone(
      initial.repository.get<{
        schedules: Array<Record<string, unknown>>;
        unlimitedRecurringSchedules?: true;
      }>('desktop', 'state')!,
    );
    await initial.controller.shutdown();
    expect(persisted.unlimitedRecurringSchedules).toBe(true);
    delete persisted.unlimitedRecurringSchedules;
    Object.assign(persisted.schedules[3]!, { runCount: 10, enabled: false });
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('desktop', 'state', persisted);

    const recovered = await createHarness({ repository });
    const limits = () =>
      recovered.controller
        .snapshot()
        .schedules?.map(({ prompt, maxRuns, enabled }) => ({ prompt, maxRuns, enabled }));
    expect(limits()).toEqual([
      { prompt: 'Old default', maxRuns: undefined, enabled: true },
      { prompt: 'Chosen limit', maxRuns: 5, enabled: true },
      { prompt: 'One time', maxRuns: 1, enabled: true },
      // A schedule that already ran out stays paused until the person resumes it.
      { prompt: 'Ran out', maxRuns: undefined, enabled: false },
    ]);
    // A ten chosen after the migration is kept across the next restart.
    const chosen = recovered.controller.snapshot().schedules![1]!;
    await recovered.controller.invoke('schedules.update', {
      scheduleId: chosen.id,
      maxRuns: 10,
    });
    const saved = structuredClone(recovered.repository.get('desktop', 'state')!);
    await recovered.controller.shutdown();
    const again = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    again.put('desktop', 'state', saved);
    const restarted = await createHarness({ repository: again });
    expect(restarted.controller.snapshot().schedules?.[1]?.maxRuns).toBe(10);
    await restarted.controller.shutdown();
  });

  it('keeps weekly schedules saved before chosen days on their original weekday', async () => {
    const initial = await createHarness();
    const agent = await initial.controller.invoke('agents.save', {
      name: 'Legacy scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await initial.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    initial.controller.createScheduleFromAction(threadId, {
      task: 'Recap my week.',
      cadence: 'weekly',
      firstRunAt: new Date(2030, 7, 23, 16, 0).toISOString(),
    });
    const persisted = structuredClone(
      initial.repository.get<{ schedules: Array<Record<string, unknown>> }>(
        'desktop',
        'state',
      )!,
    );
    await initial.controller.shutdown();
    delete persisted.schedules[0]!.days;
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('desktop', 'state', persisted);

    const recovered = await createHarness({ repository });
    expect(recovered.controller.snapshot().schedules?.[0]).toMatchObject({
      cadence: 'weekly',
      days: [5],
      nextRunAt: new Date(2030, 7, 23, 16, 0).toISOString(),
    });
    await recovered.controller.shutdown();
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
      runHistory: [{ id: claimId, outcome: 'started' }],
    });
    await recovered.controller.shutdown();
  });

  it('does not rewrite state while a due schedule waits for its busy thread', async () => {
    const initial = await createHarness({ fakeServices: false });
    await initial.controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const agent = await initial.controller.invoke('agents.save', {
      name: 'Busy scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await initial.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    initial.controller.createScheduleFromAction(threadId, {
      task: 'Check the web.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T03:00:00.000Z',
    });
    const persisted = structuredClone(
      initial.repository.get<{ schedules: Array<{ id: string; nextRunAt: string }> }>(
        'desktop',
        'state',
      )!,
    );
    await initial.controller.shutdown();
    // Several runs are overdue on one thread: once one holds the thread, the rest must wait.
    const first = persisted.schedules[0]!;
    first.nextRunAt = '2026-01-01T00:00:00.000Z';
    for (let copy = 0; copy < 3; copy += 1)
      persisted.schedules.push({ ...structuredClone(first), id: randomUUID() });
    const repository = new CountingRepository();
    repository.put('desktop', 'state', persisted);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = {
      // eslint-disable-next-line require-yield -- a turn that blocks without emitting events.
      async *runTurn() {
        await held;
      },
      dispose: vi.fn(async () => release()),
      cancel: vi.fn(async () => release()),
      respondToRequest: vi.fn(async () => undefined),
    };
    vi.useFakeTimers({ toFake: ['setInterval'] });
    try {
      const { controller } = await createHarness({ fakeServices: false, runtime, repository });
      // The startup pass runs before the runtime attaches; the next pass starts a held turn.
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.waitFor(() =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'running',
        ),
      );
      const writes = repository.desktopStateWrites;
      await vi.advanceTimersByTimeAsync(90_000);
      expect(repository.desktopStateWrites).toBe(writes);
      release();
      await controller.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });
});
