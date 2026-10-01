/** Runs one child process with bounded output, a timeout and abort, without a shell. */

import { spawn, type ChildProcess } from 'node:child_process';

export interface CapturedProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly outputLimitExceeded: boolean;
}

export interface CaptureOptions {
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal | undefined;
  readonly killOnOutputLimit: boolean;
  readonly detachedProcessGroup?: boolean;
}

export async function runCapturedProcess(
  executable: string,
  args: readonly string[],
  options: CaptureOptions,
): Promise<CapturedProcessResult> {
  if (options.signal?.aborted) {
    return emptyProcessResult({ aborted: true });
  }
  return await new Promise<CapturedProcessResult>((resolvePromise, rejectPromise) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.environment,
      shell: false,
      windowsHide: true,
      detached: options.detachedProcessGroup ?? false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let timedOut = false;
    let aborted = false;
    let outputLimitExceeded = false;
    let settled = false;

    const stop = (): void => killProcess(child, options.detachedProcessGroup ?? false);
    const capture = (destination: Buffer[], value: Buffer | string): void => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const available = Math.max(0, options.maxOutputBytes - capturedBytes);
      if (available > 0) {
        const saved = chunk.subarray(0, available);
        destination.push(saved);
        capturedBytes += saved.length;
      }
      if (chunk.length > available && !outputLimitExceeded) {
        outputLimitExceeded = true;
        if (options.killOnOutputLimit) stop();
      }
    };
    child.stdout.on('data', (chunk: Buffer) => capture(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => capture(stderr, chunk));

    const abort = (): void => {
      aborted = true;
      stop();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    timer.unref();

    const cleanup = (): void => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    };
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(error);
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        aborted,
        outputLimitExceeded,
      });
    });
  });
}

export function emptyProcessResult(flags: {
  readonly aborted?: boolean;
  readonly timedOut?: boolean;
}): CapturedProcessResult {
  return {
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: Boolean(flags.timedOut),
    aborted: Boolean(flags.aborted),
    outputLimitExceeded: false,
  };
}

export function killProcess(child: ChildProcess, processGroup: boolean): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (processGroup && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Fall back to the direct child if its process group has already disappeared.
    }
  }
  child.kill('SIGKILL');
}
