import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

import { runCapturedProcess } from './captured-process.js';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('captured process termination', () => {
  it.each(['abort', 'timeout', 'output limit'] as const)(
    'preserves %s as the first cause when close is delayed',
    async (cause) => {
      vi.useFakeTimers();
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        exitCode: null,
        signalCode: null,
        kill: vi.fn(() => true),
      });
      spawn.mockReturnValue(child);
      const controller = new AbortController();
      const result = runCapturedProcess('unused-test-process', [], {
        cwd: '/unused-test-workspace',
        environment: {},
        timeoutMs: 100,
        maxOutputBytes: 4,
        killOnOutputLimit: true,
        signal: controller.signal,
      });
      if (cause === 'abort') controller.abort();
      if (cause === 'output limit') child.stdout.emit('data', Buffer.from('oversize'));
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      // Deliberately leave the pipes open until both competing signals occurred.
      child.emit('close', null, 'SIGKILL');
      expect(await result).toMatchObject({
        aborted: cause === 'abort',
        timedOut: cause === 'timeout',
        outputLimitExceeded: cause === 'output limit',
        signal: 'SIGKILL',
      });
      expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
    },
  );
});
