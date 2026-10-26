import { expect, it, vi } from 'vitest';
import { BrowserWindowService } from './browser-window.js';
import { WindowObservationError } from './window-observer.js';

const run = vi.fn();
const observer = { read: run, close: vi.fn() };

it('preserves only the signed reader’s recognized document classification', async () => {
  const service = new BrowserWindowService('/helper', observer);
  run.mockReset();
  const pdf = {
    status: 'ready',
    bundleID: 'com.apple.Safari',
    url: 'https://university.example/calendar.pdf',
    documentKind: 'native-pdf',
  };
  run.mockResolvedValueOnce(pdf);
  expect(await service.inspect(42, 91)).toEqual(pdf);
  run.mockResolvedValueOnce({ ...pdf, documentKind: 'unrecognized' });
  expect(await service.inspect(42, 91)).toEqual({
    status: 'unavailable',
    reason: 'invalid_response',
  });
});

it('reads only a live process ID for foreground checks and rejects malformed helper results', async () => {
  const service = new BrowserWindowService('/helper', observer);
  run.mockReset();
  run.mockResolvedValueOnce({ status: 'ready', pid: 1552 });
  expect(await service.foregroundPid()).toBe(1552);
  expect(run).toHaveBeenCalledExactlyOnceWith('foreground', 0, 0);
  for (const value of [
    { status: 'ready', pid: 0 },
    { status: 'ready', pid: 1.5 },
    { status: 'ready', pid: 2147483648 },
    { status: 'ready', pid: '1552' },
    { status: 'ready', pid: 1552, text: 'unexpected content' },
    { status: 'unavailable' },
  ]) {
    run.mockResolvedValueOnce(value);
    expect(await service.foregroundPid()).toBeUndefined();
  }
  run.mockRejectedValueOnce(new Error('private helper error'));
  expect(await service.foregroundPid()).toBeUndefined();
});

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
