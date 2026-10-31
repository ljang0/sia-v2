import { expect, it, vi } from 'vitest';
import { LocalLeaseCoordinator } from './leases.js';

it('allows independent background turns and gives a waiting foreground turn priority', async () => {
  const coordinator = new LocalLeaseCoordinator();
  const start = (id: string) => coordinator.startTurn({ turnId: id, threadId: id });
  const [a, b, foreground, next] = await Promise.all(
    ['a', 'b', 'foreground', 'next'].map(start),
  );
  await a!.acquire({ kind: 'background_gui', id: 'a' });
  await b!.acquire({ kind: 'background_gui', id: 'b' });
  await a!.acquire({ kind: 'app_window', id: '42:1' });
  await b!.acquire({ kind: 'app_window', id: '43:2' });
  const focused = foreground!.acquire({ kind: 'global_focus', id: 'foreground' });
  const later = next!.acquire({ kind: 'background_gui', id: 'next' });
  expect(coordinator.snapshotQueue()).toHaveLength(2);
  a!.release();
  expect(coordinator.snapshotQueue()).toHaveLength(2);
  b!.release();
  await focused;
  expect(coordinator.snapshotQueue()).toHaveLength(1);
  foreground!.release();
  await later;
  next!.release();
  expect(coordinator.activeTurnCount).toBe(0);
});

it('unblocks background work when a waiting foreground takeover is cancelled', async () => {
  const coordinator = new LocalLeaseCoordinator();
  const a = await coordinator.startTurn({ turnId: 'a', threadId: 'a' });
  const foreground = await coordinator.startTurn({ turnId: 'f', threadId: 'f' });
  const b = await coordinator.startTurn({ turnId: 'b', threadId: 'b' });
  await a.acquire({ kind: 'background_gui', id: 'a' });
  const abort = new AbortController();
  const focused = foreground.acquire({ kind: 'global_focus', id: 'foreground' }, abort.signal);
  const rejected = expect(focused).rejects.toThrow('Cancelled takeover');
  const next = b.acquire({ kind: 'background_gui', id: 'b' });
  abort.abort(new Error('Cancelled takeover'));
  await rejected;
  await next;
  expect(a.holds({ kind: 'background_gui', id: 'a' })).toBe(true);
  a.release();
  b.release();
  foreground.release();
});

it('rejects conflicting second-window acquisition instead of deadlocking two tasks', async () => {
  const coordinator = new LocalLeaseCoordinator();
  const a = await coordinator.startTurn({ turnId: 'a', threadId: 'a' });
  const b = await coordinator.startTurn({ turnId: 'b', threadId: 'b' });
  await a.acquire({ kind: 'app_window', id: '42:1' });
  await b.acquire({ kind: 'app_window', id: '43:2' });
  await expect(a.acquire({ kind: 'app_window', id: '43:2' })).rejects.toThrow('Another task');
  await expect(b.acquire({ kind: 'app_window', id: '42:1' })).rejects.toThrow('Another task');
  expect(coordinator.snapshotQueue()).toHaveLength(0);
  a.release();
  await b.acquire({ kind: 'app_window', id: '42:1' });
  b.release();
});

it('disposes turn-owned capabilities exactly once, including already-ended turns', async () => {
  const coordinator = new LocalLeaseCoordinator();
  const turn = await coordinator.startTurn({ turnId: 'a', threadId: 'a' });
  const dispose = vi.fn();
  turn.onRelease(dispose);
  turn.release();
  turn.release();
  expect(turn.released).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
  const late = vi.fn();
  turn.onRelease(late);
  expect(late).toHaveBeenCalledOnce();
});
