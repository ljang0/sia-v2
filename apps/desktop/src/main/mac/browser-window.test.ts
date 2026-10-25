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
