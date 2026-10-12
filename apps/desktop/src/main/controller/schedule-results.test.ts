import { expect, it, vi } from 'vitest';
import type { ThreadEventEnvelope } from '@sia/protocol';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import { parseMacResponse, presentMacResponse } from '../actions/mac-execution.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { createHarness } from './test-support.js';

it('keeps verified no-change checks quiet, but alerts for findings, failures, and manual replies', async () => {
  const notify = vi.fn();
  const inputs: RuntimeTurnInput[] = [];
  let result = {
    type: 'no_change',
    success: true,
    steps: [] as string[],
    response: 'Checked all fixture venues; nothing new.',
    output_file: null,
  };
  const runtime = {
    async *runTurn(input: RuntimeTurnInput) {
      inputs.push(input);
      const text = JSON.stringify(result);
      input.onMacResult?.(parseMacResponse(text)!);
      const base = {
        threadId: input.thread.id,
        turnId: input.turnId,
        provider: 'codex' as const,
        timestamp: new Date().toISOString(),
      };
      yield presentMacResponse({
        ...base,
        id: crypto.randomUUID(),
        sequence: 1,
        type: 'message',
        payload: { role: 'assistant', messageId: 'result', parts: [{ kind: 'text', text }] },
      } as ThreadEventEnvelope);
      yield {
        ...base,
        id: crypto.randomUUID(),
        sequence: 2,
        type: 'completion',
        payload: { status: 'completed' },
      } as ThreadEventEnvelope;
    },
    dispose: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const { controller } = await createHarness({ fakeServices: false, runtime, notify });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Monitor',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const schedule = controller.createScheduleFromAction(threadId, {
      task: 'Check every fixture venue for new shows.',
      cadence: 'daily',
      firstRunAt: '2030-08-21T03:00:00Z',
    });
    const run = async (count: number, outcome: string) => {
      await controller.invoke('schedules.runNow', { scheduleId: schedule.id });
      await vi.waitFor(() =>
        expect(controller.snapshot().schedules?.[0]).toMatchObject({
          runCount: count,
          lastRun: { outcome, finishedAt: expect.any(String) },
        }),
      );
    };
    await run(1, 'completed');
    expect(inputs[0]?.scheduled).toBe(true);
    expect(inputs[0]?.thread.instructions).toContain('complete source coverage');
    expect(notify).not.toHaveBeenCalled();
    expect(controller.snapshot().threads[0]?.unread).not.toBe(true);
    expect(controller.snapshot().timeline.some((item) => item.text === result.response)).toBe(
      true,
    );
    result = { ...result, type: 'answer', response: 'A new fixture show is available.' };
    await run(2, 'completed');
    expect(notify).toHaveBeenCalledTimes(1);
    result = {
      ...result,
      type: 'no_change',
      success: false,
      response: 'One venue could not be checked.',
    };
    await run(3, 'failed');
    expect(notify).toHaveBeenCalledTimes(2);
    result = { ...result, success: true, response: 'Nothing new in this manual check.' };
    await controller.invoke('threads.send', { threadId, text: 'Check now and tell me.' });
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(3));
    expect(inputs.at(-1)?.scheduled).toBe(false);
  } finally {
    await controller.shutdown();
  }
});

it('preserves the original month-end anchor through editing and a controller restart', async () => {
  const { controller, repository } = await createHarness();
  const { agentId } = await controller.invoke('agents.save', {
    name: 'Reports',
    instructions: '',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-workspace',
  });
  const { threadId } = await controller.invoke('threads.create', { agentId });
  const original = new Date(2030, 0, 31, 9).toISOString();
  controller.createScheduleFromAction(threadId, {
    task: 'Monthly report',
    cadence: 'monthly',
    firstRunAt: original,
  });
  const state = structuredClone(
    repository.get<{ schedules: Array<{ id: string; nextRunAt: string; anchorAt?: string }> }>(
      'desktop',
      'state',
    )!,
  );
  state.schedules[0]!.nextRunAt = new Date(2030, 1, 28, 9).toISOString();
  await controller.shutdown();
  const reopenedRepository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  reopenedRepository.put('desktop', 'state', state);
  const reopened = await createHarness({ repository: reopenedRepository });
  try {
    const schedule = reopened.controller.snapshot().schedules![0]!;
    expect(schedule.anchorAt).toBe(original);
    const edited = await reopened.controller.invoke('schedules.update', {
      scheduleId: schedule.id,
      prompt: 'Monthly spending report',
      cadence: 'monthly',
      nextRunAt: schedule.nextRunAt,
    });
    expect(edited.schedules?.[0]?.anchorAt).toBe(original);
    const moved = new Date(2030, 2, 15, 9).toISOString();
    const rescheduled = await reopened.controller.invoke('schedules.update', {
      scheduleId: schedule.id,
      nextRunAt: moved,
    });
    expect(rescheduled.schedules?.[0]?.anchorAt).toBe(moved);
  } finally {
    await reopened.controller.shutdown();
  }
});
