import { expect, it, vi } from 'vitest';
import { WindowOperations } from './window-operations.js';

it('cancels a waiting operation promptly without allowing its successor to overtake active work', async () => {
  const queue = new WindowOperations();
  const release = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const first = queue.run('window', undefined, async () => {
    started.resolve();
    await release.promise;
    return 'first';
  });
  await started.promise;
  const abort = new AbortController();
  const cancelled = vi.fn(async () => 'cancelled');
  const second = expect(queue.run('window', abort.signal, cancelled)).rejects.toThrow('Stop');
  const last = vi.fn(async () => 'last');
  const third = queue.run('window', undefined, last);
  abort.abort(new Error('Stop'));
  await second;
  expect(cancelled).not.toHaveBeenCalled();
  expect(last).not.toHaveBeenCalled();
  release.resolve();
  expect(await first).toBe('first');
  expect(await third).toBe('last');
});

it('allows independent windows to proceed and releases a failed operation', async () => {
  const queue = new WindowOperations();
  const release = Promise.withResolvers<void>();
  const first = queue.run('one', undefined, () => release.promise);
  expect(await queue.run('two', undefined, async () => 'other window')).toBe('other window');
  const failed = expect(
    queue.run('one', undefined, async () => {
      throw new Error('Failed read');
    }),
  ).rejects.toThrow('Failed read');
  const after = queue.run('one', undefined, async () => 'after failure');
  release.resolve();
  await first;
  await failed;
  expect(await after).toBe('after failure');
});
