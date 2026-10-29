import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { WindowObserver } from './window-observer.js';

function fixture() {
  const children: Array<ChildProcessWithoutNullStreams & { requests: { id: string }[] }> = [];
  const start = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
      requests: [] as { id: string }[],
    });
    child.stdin.on('data', (bytes) => child.requests.push(JSON.parse(String(bytes))));
    children.push(child as unknown as (typeof children)[number]);
    return child;
  });
  const observer = new WindowObserver('/signed/helper', {
    spawn: start as unknown as typeof spawn,
    timeoutMs: 8000,
  });
  const reply = (index: number, result: unknown) => {
    const child = children[index]!;
    child.stdout.emit('data', JSON.stringify({ id: child.requests.at(-1)!.id, result }) + '\n');
  };
  return { observer, start, children, reply };
}

afterEach(() => vi.useRealTimers());

it('uses a fixed content-free foreground request and rejects window arguments on it', async () => {
  const f = fixture();
  try {
    const pid = f.observer.read('foreground', 0, 0);
    await vi.waitFor(() => expect(f.children).toHaveLength(1));
    expect(f.children[0]!.requests[0]).toMatchObject({
      operation: 'foreground',
      pid: 0,
      window_id: 0,
    });
    f.reply(0, { status: 'ready', pid: 1552 });
    expect(await pid).toEqual({ status: 'ready', pid: 1552 });
    await expect(f.observer.read('foreground', 42, 91)).rejects.toMatchObject({
      reason: 'helper_error',
    });
    expect(f.children[0]!.requests).toHaveLength(1);
  } finally {
    f.observer.close();
  }
});

it('reuses one private helper and excludes queue waiting from each read budget', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const first = f.observer.read('browser', 42, 91);
    const next = f.observer.read('context', 42, 91);
    await vi.advanceTimersByTimeAsync(7999);
    expect(f.children[0]!.requests).toHaveLength(1);
    f.reply(0, { status: 'ready' });
    expect(await first).toEqual({ status: 'ready' });
    await vi.advanceTimersByTimeAsync(7999);
    expect(f.children[0]!.requests).toHaveLength(2);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.start).toHaveBeenCalledWith('/signed/helper', ['--window-observer'], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(f.children[0]!.kill).not.toHaveBeenCalled();
    f.reply(0, { status: 'protected' });
    expect(await next).toEqual({ status: 'protected' });
  } finally {
    f.observer.close();
  }
});

it('retires a timed-out helper and ignores its late reply before a fresh read', async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const first = expect(f.observer.read('browser', 42, 91)).rejects.toMatchObject({
      reason: 'helper_timeout',
    });
    await vi.advanceTimersByTimeAsync(8000);
    await first;
    const next = f.observer.read('browser', 42, 91);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.start).toHaveBeenCalledTimes(2);
    f.reply(0, { status: 'ready', private: 'stale content' });
    f.reply(1, { status: 'unavailable' });
    expect(await next).toEqual({ status: 'unavailable' });
    expect(f.children[0]!.kill).toHaveBeenCalledTimes(1);
  } finally {
    f.observer.close();
  }
});

it.each(['malformed', 'wrong-id', 'oversized', 'duplicate'])(
  'rejects %s output without exposing native content',
  async (variant) => {
    const f = fixture();
    try {
      const failure = expect(f.observer.read('browser', 42, 91)).rejects.toMatchObject({
        message: 'Window observation failed: invalid_response',
        reason: 'invalid_response',
      });
      await vi.waitFor(() => expect(f.children).toHaveLength(1));
      const id = f.children[0]!.requests[0]!.id;
      const valid = JSON.stringify({ id, result: { private: 'native content' } }) + '\n';
      const output =
        variant === 'malformed'
          ? 'private native error\n'
          : variant === 'wrong-id'
            ? JSON.stringify({ id: 'wrong', result: 'private content' }) + '\n'
            : variant === 'oversized'
              ? 'x'.repeat(128001)
              : valid + valid;
      f.children[0]!.stdout.emit('data', output);
      await failure;
      expect(f.children[0]!.kill).toHaveBeenCalledTimes(1);
    } finally {
      f.observer.close();
    }
  },
);

it('closes active and queued reads without starting another helper', async () => {
  const f = fixture();
  const first = expect(f.observer.read('browser', 42, 91)).rejects.toMatchObject({
    reason: 'helper_error',
  });
  const next = expect(f.observer.read('context', 42, 91)).rejects.toMatchObject({
    reason: 'helper_error',
  });
  await vi.waitFor(() => expect(f.children).toHaveLength(1));
  f.observer.close();
  await Promise.all([first, next]);
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.children[0]!.kill).toHaveBeenCalledTimes(1);
});
