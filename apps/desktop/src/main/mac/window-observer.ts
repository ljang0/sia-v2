import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';

type Observation = 'browser' | 'context';
export class WindowObservationError extends Error {
  constructor(readonly reason: 'helper_error' | 'helper_timeout' | 'invalid_response') {
    super(`Window observation failed: ${reason}`);
  }
}

/** One signed, nonactivating helper; no input, files, credentials or model commands. */
export class WindowObserver {
  #child: ChildProcessWithoutNullStreams | undefined;
  #buffer = '';
  #closed = false;
  #tail: Promise<void> = Promise.resolve();
  #pending:
    | {
        id: string;
        resolve(value: unknown): void;
        reject(error: Error): void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;

  constructor(
    private readonly helperPath: string,
    private readonly options: {
      timeoutMs?: number;
      spawn?: typeof spawn;
    } = {},
  ) {}

  read(operation: Observation, pid: number, windowId: number): Promise<unknown> {
    const result = this.#tail.then(() => this.#read(operation, pid, windowId));
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #read(operation: Observation, pid: number, windowId: number): Promise<unknown> {
    if (
      this.#closed ||
      !['browser', 'context'].includes(operation) ||
      !Number.isInteger(pid) ||
      pid <= 0 ||
      pid > 2_147_483_647 ||
      !Number.isInteger(windowId) ||
      windowId <= 0 ||
      windowId > 4_294_967_295
    )
      return Promise.reject(new WindowObservationError('helper_error'));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      // Queue waiting is outside the execution budget. Only this fixed read is timed.
      const timer = setTimeout(
        () => this.#retire(new WindowObservationError('helper_timeout')),
        this.options.timeoutMs ?? 8000,
      );
      this.#pending = { id, resolve, reject, timer };
      try {
        const child = this.#ensureChild();
        child.stdin.write(JSON.stringify({ id, operation, pid, window_id: windowId }) + '\n');
      } catch {
        this.#retire(new WindowObservationError('helper_error'));
      }
    });
  }

  #ensureChild(): ChildProcessWithoutNullStreams {
    if (this.#child) return this.#child;
    const child = (this.options.spawn ?? spawn)(this.helperPath, ['--window-observer'], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.#child !== child) return;
      this.#buffer += chunk;
      const newline = this.#buffer.indexOf('\n');
      if (this.#buffer.length > 128000 || (newline >= 0 && newline !== this.#buffer.length - 1))
        return this.#retire(new WindowObservationError('invalid_response'));
      if (newline < 0) return;
      const line = this.#buffer.slice(0, newline);
      this.#buffer = '';
      try {
        const value: unknown = JSON.parse(line);
        const pending = this.#pending;
        if (
          !pending ||
          !value ||
          typeof value !== 'object' ||
          !('id' in value) ||
          value.id !== pending.id ||
          !('result' in value)
        )
          throw new Error();
        clearTimeout(pending.timer);
        this.#pending = undefined;
        pending.resolve(value.result);
      } catch {
        this.#retire(new WindowObservationError('invalid_response'));
      }
    });
    child.stderr.resume(); // Never retain or publish native stderr.
    const failed = () => {
      if (this.#child === child) this.#retire(new WindowObservationError('helper_error'));
    };
    child.on('error', failed);
    child.on('exit', failed);
    child.stdin.on('error', failed);
    return child;
  }

  #retire(error: WindowObservationError): void {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    const child = this.#child;
    this.#child = undefined;
    this.#buffer = '';
    child?.stdin.destroy();
    child?.stdout.destroy();
    child?.stderr.destroy();
    child?.kill();
  }

  close(): void {
    this.#closed = true;
    this.#retire(new WindowObservationError('helper_error'));
  }
}
