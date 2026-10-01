import { describe, expect, it } from 'vitest';
import type { ScheduleView, ThreadView } from '../../shared/bridge.js';
import { quitConfirmation, RendererRecovery } from './app-lifecycle.js';

const now = Date.parse('2026-09-29T12:00:00.000Z');

function thread(status: ThreadView['status'], archivedAt?: string): ThreadView {
  return { id: `t-${status}`, status, ...(archivedAt ? { archivedAt } : {}) } as ThreadView;
}

function schedule(minutesFromNow: number, enabled = true): ScheduleView {
  return {
    id: `s-${minutesFromNow}`,
    threadId: 't',
    prompt: 'Summarize my inbox',
    cadence: 'daily',
    nextRunAt: new Date(now + minutesFromNow * 60_000).toISOString(),
    enabled,
    createdAt: new Date(now).toISOString(),
  };
}

describe('quitConfirmation', () => {
  it('quits without asking when nothing is running or due', () => {
    expect(
      quitConfirmation(
        { threads: [thread('idle'), thread('failed')], schedules: [schedule(240)] },
        now,
      ),
    ).toBeUndefined();
    expect(quitConfirmation({ threads: [] }, now)).toBeUndefined();
  });

  it('asks while a task is running or waiting for the person', () => {
    expect(
      quitConfirmation({ threads: [thread('running')], schedules: [] }, now)?.message,
    ).toBe('Sia is still working on a task.');
    expect(
      quitConfirmation({ threads: [thread('running'), thread('waiting')], schedules: [] }, now)
        ?.message,
    ).toBe('Sia is still working on 2 tasks.');
    expect(
      quitConfirmation(
        { threads: [thread('running', '2026-09-01T00:00:00Z')], schedules: [] },
        now,
      ),
    ).toBeUndefined();
  });

  it('asks when an enabled schedule is due within half an hour', () => {
    const confirmation = quitConfirmation(
      {
        threads: [thread('idle')],
        schedules: [schedule(90), schedule(10), schedule(5, false)],
      },
      now,
    );
    expect(confirmation?.message).toBe('A scheduled task is due soon.');
    expect(confirmation?.detail).toContain('“Summarize my inbox” runs only while Sia is open');
  });
});

describe('RendererRecovery', () => {
  it('reloads a crashed window a few times, then stops', () => {
    const recovery = new RendererRecovery(2, 60_000);
    expect(recovery.shouldReload('crashed', now)).toBe(true);
    expect(recovery.shouldReload('oom', now + 1_000)).toBe(true);
    expect(recovery.shouldReload('crashed', now + 2_000)).toBe(false);
    // Crashes outside the window no longer count.
    expect(recovery.shouldReload('crashed', now + 120_000)).toBe(true);
    expect(recovery.shouldReload('clean-exit', now + 121_000)).toBe(false);
  });
});
