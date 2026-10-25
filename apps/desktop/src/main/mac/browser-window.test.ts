import { expect, it, vi } from 'vitest';
import { BrowserWindowService } from './browser-window.js';

const run = vi.hoisted(() => vi.fn());
vi.mock('node:util', () => ({ promisify: () => run }));

it('distinguishes identity-helper failures without exposing app content or native errors', async () => {
  const service = new BrowserWindowService('/helper');
  for (const [failure, reason] of [
    [Object.assign(new Error('private stderr'), { killed: true }), 'helper_timeout'],
    [new Error('private native error'), 'helper_error'],
  ] as const) {
    run.mockRejectedValueOnce(failure);
    if (reason === 'helper_timeout') run.mockRejectedValueOnce(failure);
    expect(await service.inspect(42, 91)).toEqual({ status: 'unavailable', reason });
  }
  for (const stdout of ['private malformed output', '{"status":"ready","url":"private"}']) {
    run.mockResolvedValueOnce({ stdout });
    expect(await service.inspect(42, 91)).toEqual({
      status: 'unavailable',
      reason: 'invalid_response',
    });
  }
  run.mockResolvedValueOnce({ stdout: '{"status":"protected","reason":"page"}' });
  expect(await service.inspect(42, 91)).toEqual({ status: 'protected', reason: 'page' });
  expect(run).toHaveBeenLastCalledWith('/helper', ['--browser-window', '42', '91'], {
    timeout: 5000,
    maxBuffer: 16384,
    env: { PATH: '/usr/bin:/bin' },
  });
});

it('rechecks a transient incomplete read once with a fresh security scan', async () => {
  const service = new BrowserWindowService('/helper');
  run.mockReset();
  run.mockResolvedValueOnce({ stdout: '{"status":"unavailable","reason":"incomplete"}' });
  run.mockResolvedValueOnce({
    stdout: JSON.stringify({
      status: 'ready',
      url: 'https://autolab.example.edu/courses/current',
      bundleID: 'com.apple.Safari',
    }),
  });
  expect(await service.inspect(42, 91)).toMatchObject({
    status: 'ready',
    url: 'https://autolab.example.edu/courses/current',
  });
  expect(run).toHaveBeenCalledTimes(2);
  run.mockReset();
  run.mockResolvedValueOnce({ stdout: '{"status":"unavailable","reason":"incomplete"}' });
  run.mockResolvedValueOnce({ stdout: '{"status":"protected","reason":"page"}' });
  expect(await service.inspect(42, 91)).toEqual({ status: 'protected', reason: 'page' });
  expect(run).toHaveBeenCalledTimes(2);
});

it.each(['incomplete', 'ambiguous', 'helper_error', 'invalid_response'])(
  'bounds failed reads and never retries a permanent %s failure',
  async (reason) => {
    const service = new BrowserWindowService('/helper');
    run.mockReset();
    run.mockResolvedValue({ stdout: JSON.stringify({ status: 'unavailable', reason }) });
    expect(await service.inspect(42, 91)).toEqual({ status: 'unavailable', reason });
    expect(run).toHaveBeenCalledTimes(reason === 'incomplete' ? 2 : 1);
  },
);
