import { beforeEach, expect, it, vi } from 'vitest';

const blocker = vi.hoisted(() => {
  const started = new Set<number>();
  let next = 1;
  return {
    started,
    start: vi.fn(() => {
      started.add(next);
      return next++;
    }),
    stop: vi.fn((id: number) => void started.delete(id)),
    isStarted: vi.fn((id: number) => started.has(id)),
  };
});
vi.mock('electron', () => ({ powerSaveBlocker: blocker }));

const { KeepAwake } = await import('./keep-awake.js');

beforeEach(() => {
  vi.clearAllMocks();
  blocker.started.clear();
});

it('keeps the display awake from the first Mac task until the last one ends', () => {
  const keepAwake = new KeepAwake();
  keepAwake.hold('thread-a');
  keepAwake.hold('thread-b');
  keepAwake.hold('thread-a');
  expect(blocker.start).toHaveBeenCalledTimes(1);
  expect(blocker.start).toHaveBeenCalledWith('prevent-display-sleep');
  keepAwake.release('thread-a');
  expect(blocker.stop).not.toHaveBeenCalled();
  keepAwake.release('thread-b');
  expect(blocker.stop).toHaveBeenCalledTimes(1);
  expect(blocker.started.size).toBe(0);
  keepAwake.release('thread-b');
  expect(blocker.stop).toHaveBeenCalledTimes(1);
  keepAwake.hold('thread-c');
  expect(blocker.start).toHaveBeenCalledTimes(2);
  keepAwake.release('thread-c');
  expect(blocker.started.size).toBe(0);
});
