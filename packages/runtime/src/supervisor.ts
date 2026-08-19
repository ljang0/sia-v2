import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';

const SAFE_ENVIRONMENT_NAME =
  /^(?:PATH|HOME|CODEX_HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LC_[A-Z0-9_]+|TERM|COLORTERM|NO_COLOR|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/;

export function sanitizedEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  overrides: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && SAFE_ENVIRONMENT_NAME.test(key)) output[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!SAFE_ENVIRONMENT_NAME.test(key))
      throw new Error(`Environment variable ${key} is not permitted`);
    output[key] = value;
  }
  return output;
}

export interface SpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export class SupervisedProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly exited: Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>;
  #stopping?: Promise<void>;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child;
    this.exited = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
  }

  async stop(graceMs = 1_500): Promise<void> {
    if (this.#stopping) return await this.#stopping;
    this.#stopping = (async () => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) return;
      this.child.kill('SIGTERM');
      const timer = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null)
          this.child.kill('SIGKILL');
      }, graceMs);
      timer.unref();
      await this.exited.catch(() => undefined);
      clearTimeout(timer);
    })();
    return await this.#stopping;
  }
}

export class ProcessSupervisor {
  readonly #children = new Set<SupervisedProcess>();

  spawn(spec: SpawnSpec): SupervisedProcess {
    if (!spec.command || spec.command.includes('\0')) throw new Error('Invalid executable');
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: sanitizedEnvironment(process.env, spec.env),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const supervised = new SupervisedProcess(child);
    this.#children.add(supervised);
    // Register both outcomes explicitly. `finally()` returns a second promise that
    // repeats the rejection from a failed spawn, which becomes unhandled even when
    // the caller correctly observes `supervised.exited`.
    void supervised.exited.then(
      () => this.#children.delete(supervised),
      () => this.#children.delete(supervised),
    );
    return supervised;
  }

  get size(): number {
    return this.#children.size;
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#children].map(async (child) => await child.stop()));
  }
}

export async function waitForProcessSpawn(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.pid !== undefined) return;
  await Promise.race([
    once(child, 'spawn'),
    once(child, 'error').then(([error]) => Promise.reject(error)),
  ]);
}
