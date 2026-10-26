import { expect, it, vi } from 'vitest';
import { BrowserWindowService } from './browser-window.js';
import { WindowObservationError } from './window-observer.js';

const run = vi.fn();
const observer = { read: run, close: vi.fn() };

it('routes tab-only inspection to its fixed operation without reading the current webpage', async () => {
  const service = new BrowserWindowService('/helper', observer);
  run.mockReset();
  run.mockResolvedValueOnce({
    status: 'navigation',
    surface: 'safari-tabs',
    bundleID: 'com.apple.Safari',
  });
  expect(await service.inspect(42, 91, true)).toMatchObject({
    status: 'navigation',
    surface: 'safari-tabs',
  });
  expect(run).toHaveBeenCalledExactlyOnceWith('tabs', 42, 91);
});

it('distinguishes identity-helper failures without exposing app content or native errors', async () => {
  const service = new BrowserWindowService('/helper', observer);
  for (const [failure, reason] of [
    [new WindowObservationError('helper_timeout'), 'helper_timeout'],
    [new Error('private native error'), 'helper_error'],
  ] as const) {
    run.mockRejectedValueOnce(failure);
    if (reason === 'helper_timeout') run.mockRejectedValueOnce(failure);
    expect(await service.inspect(42, 91)).toEqual({ status: 'unavailable', reason });
  }
  for (const stdout of ['private malformed output', '{"status":"ready","url":"private"}']) {
    run.mockResolvedValueOnce(stdout);
    expect(await service.inspect(42, 91)).toEqual({
      status: 'unavailable',
      reason: 'invalid_response',
    });
  }
  run.mockResolvedValueOnce({ status: 'protected', reason: 'page' });
  expect(await service.inspect(42, 91)).toEqual({ status: 'protected', reason: 'page' });
  expect(run).toHaveBeenLastCalledWith('browser', 42, 91);
});

it('rechecks a transient incomplete read once with a fresh security scan', async () => {
  const service = new BrowserWindowService('/helper', observer);
  run.mockReset();
  run.mockResolvedValueOnce({ status: 'unavailable', reason: 'incomplete' });
  run.mockResolvedValueOnce({
    status: 'ready',
    url: 'https://autolab.example.edu/courses/current',
    bundleID: 'com.apple.Safari',
  });
  expect(await service.inspect(42, 91)).toMatchObject({
    status: 'ready',
    url: 'https://autolab.example.edu/courses/current',
  });
  expect(run).toHaveBeenCalledTimes(2);
  run.mockReset();
  run.mockResolvedValueOnce({ status: 'unavailable', reason: 'incomplete' });
  run.mockResolvedValueOnce({ status: 'protected', reason: 'page' });
  expect(await service.inspect(42, 91)).toEqual({ status: 'protected', reason: 'page' });
  expect(run).toHaveBeenCalledTimes(2);
});

it.each(['incomplete', 'ambiguous', 'helper_error', 'invalid_response'])(
  'bounds failed reads and never retries a permanent %s failure',
  async (reason) => {
    const service = new BrowserWindowService('/helper', observer);
    run.mockReset();
    run.mockResolvedValue({ status: 'unavailable', reason });
    expect(await service.inspect(42, 91)).toEqual({ status: 'unavailable', reason });
    expect(run).toHaveBeenCalledTimes(reason === 'incomplete' ? 2 : 1);
  },
);
