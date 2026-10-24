import { afterEach, expect, it, vi } from 'vitest';
import { AsyncQueue } from '../async-queue.js';
import { EventFactory } from '../events.js';
import type { ActiveTurn } from './codex-turn-events.js';
import { watchMacTurn } from './codex-watchdog.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  vi.useRealTimers();
});
function fixture() {
  vi.useFakeTimers();
  const active: ActiveTurn = {
    session: { id: 's', threadId: 't', nativeId: 'native', provider: 'codex' },
    input: { turnId: 'turn', text: 'Quiet work' },
    queue: new AsyncQueue(),
    events: new EventFactory('codex', 't', 'turn'),
    nativeItems: new Map(),
    nativeWorkPending: new Set(),
    commentaryPreviews: new Map(),
    taskGrants: new Set(),
    dynamicToolNames: new Set(),
    mac: true,
    nativeApproval: 'auto',
    lastActivity: Date.now(),
  };
  const request = vi.fn(async () => ({ thread: { status: { type: 'active' } } }));
  const cancel = vi.fn(async () => undefined);
  const fail = vi.fn();
  const current = vi.fn(() => true);
  cleanups.push(watchMacTurn({ active, peer: { request }, cancel, fail, current }));
  return { active, request, cancel, fail, current };
}
it('keeps a quiet native command alive and restores idle checks after completion', async () => {
  const h = fixture();
  h.active.nativeWorkPending.add('command');
  await vi.advanceTimersByTimeAsync(240_000);
  expect(h.cancel).not.toHaveBeenCalled();
  expect(h.request).not.toHaveBeenCalled();
  h.active.nativeWorkPending.clear();
  await vi.advanceTimersByTimeAsync(180_000);
  expect(h.request).toHaveBeenCalledWith(
    'thread/read',
    { threadId: 'native', includeTurns: false },
    expect.objectContaining({ timeoutMs: 10_000 }),
  );
  expect(h.cancel).not.toHaveBeenCalled();
});
it('cancels an inactive turn once with the exact reason', async () => {
  const h = fixture();
  h.request.mockResolvedValue({ thread: { status: { type: 'idle' } } });
  await vi.advanceTimersByTimeAsync(240_000);
  expect(h.cancel).toHaveBeenCalledTimes(1);
  expect(h.active.watchdogCode).toBe('mac_turn_inactive');
  expect(h.fail).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.stringContaining('no longer reports it as active'),
    }),
  );
});
it('records a failed health check without retrying the user action', async () => {
  const h = fixture();
  h.request.mockRejectedValue(new Error('Lost pipe'));
  await vi.advanceTimersByTimeAsync(240_000);
  expect(h.cancel).toHaveBeenCalledTimes(1);
  expect(h.active.watchdogCode).toBe('mac_turn_unreachable');
});
it('keeps the one-hour bound even when native work is pending', async () => {
  const h = fixture();
  h.active.nativeWorkPending.add('command');
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(h.cancel).toHaveBeenCalledTimes(1);
  expect(h.active.watchdogCode).toBe('mac_turn_timeout');
});
it('waits for a person without treating their question as a hang', async () => {
  const h = fixture();
  h.active.userInputPending = true;
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(h.request).not.toHaveBeenCalled();
  expect(h.cancel).not.toHaveBeenCalled();
  h.active.userInputPending = false;
  await vi.advanceTimersByTimeAsync(185_000);
  expect(h.request).toHaveBeenCalledOnce();
  expect(h.cancel).not.toHaveBeenCalled();
});
it.each(['cancellation', 'fresh activity'] as const)(
  'discards a late health response after %s',
  async (reason) => {
    const h = fixture();
    const response = Promise.withResolvers<{ thread: { status: { type: string } } }>();
    h.request.mockReturnValue(response.promise);
    await vi.advanceTimersByTimeAsync(180_000);
    if (reason === 'cancellation') h.current.mockReturnValue(false);
    else h.active.lastActivity = Date.now();
    response.resolve({ thread: { status: { type: 'idle' } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.cancel).not.toHaveBeenCalled();
  },
);
