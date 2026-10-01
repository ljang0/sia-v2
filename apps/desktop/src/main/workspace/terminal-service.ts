import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';

import { sanitizedEnvironment } from '@sia/runtime';

import type { BackgroundTerminalView } from '../../shared/bridge.js';
import { killProcess, runCapturedProcess } from './captured-process.js';
import {
  positiveInteger,
  resolveDirectory,
  WorkspaceOperationError,
} from './operation-guards.js';

const DEFAULT_TERMINAL_TIMEOUT_MS = 30_000;
const DEFAULT_TERMINAL_OUTPUT_BYTES = 256 * 1024;
const MAX_TERMINAL_COMMAND_BYTES = 64 * 1024;

interface TerminalCommandResult {
  readonly workspace: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly outputLimitExceeded: boolean;
  readonly durationMs: number;
}

interface DirectUserTerminalExecutionOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** A process-local, single-use command capability already bound to one workspace. */
interface DirectUserTerminalCommand {
  readonly workspace: string;
  execute(
    command: string,
    options?: DirectUserTerminalExecutionOptions,
  ): Promise<TerminalCommandResult>;
}

interface DirectUserTerminalServiceOptions {
  readonly shellExecutable?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly maxTimeoutMs?: number;
  readonly maxOutputBytes?: number;
}

/**
 * Direct-user-only terminal issuer. Keep this service out of ActionGateway and
 * model capability hosts; each issued scope can launch exactly one command.
 */
export class DirectUserTerminalService {
  readonly #shellExecutable: string;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #maxTimeoutMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: DirectUserTerminalServiceOptions = {}) {
    this.#shellExecutable = options.shellExecutable ?? '/bin/zsh';
    this.#environment = sanitizedEnvironment(options.environment ?? process.env);
    this.#maxTimeoutMs = positiveInteger(
      options.maxTimeoutMs ?? DEFAULT_TERMINAL_TIMEOUT_MS,
      'Terminal timeout',
    );
    this.#maxOutputBytes = positiveInteger(
      options.maxOutputBytes ?? DEFAULT_TERMINAL_OUTPUT_BYTES,
      'Terminal output limit',
    );
  }

  async scope(workspace: string): Promise<DirectUserTerminalCommand> {
    const resolvedWorkspace = await resolveDirectory(workspace, 'invalid_workspace');
    let consumed = false;
    const shellExecutable = this.#shellExecutable;
    const environment = this.#environment;
    const maxTimeoutMs = this.#maxTimeoutMs;
    const maxOutputBytes = this.#maxOutputBytes;
    return {
      workspace: resolvedWorkspace,
      execute: async (
        command: string,
        options: DirectUserTerminalExecutionOptions = {},
      ): Promise<TerminalCommandResult> => {
        if (consumed) {
          throw new WorkspaceOperationError(
            'command_failed',
            'This terminal command capability has already been used.',
          );
        }
        consumed = true;
        validateTerminalCommand(command);
        const timeoutMs = options.timeoutMs ?? maxTimeoutMs;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > maxTimeoutMs) {
          throw new WorkspaceOperationError(
            'command_failed',
            `Terminal timeout must be between 1 and ${maxTimeoutMs} ms.`,
          );
        }
        const startedAt = Date.now();
        const result = await runCapturedProcess(
          shellExecutable,
          [
            '-lc',
            'builtin cd -- "$1" || exit; eval "$2"',
            'sia-direct-user-terminal',
            resolvedWorkspace,
            command,
          ],
          {
            cwd: resolvedWorkspace,
            environment,
            timeoutMs,
            maxOutputBytes,
            signal: options.signal,
            killOnOutputLimit: true,
            detachedProcessGroup: process.platform !== 'win32',
          },
        );
        return {
          workspace: resolvedWorkspace,
          exitCode: result.exitCode,
          signal: result.signal,
          stdout: result.stdout,
          stderr: result.stderr,
          timedOut: result.timedOut,
          aborted: result.aborted,
          outputLimitExceeded: result.outputLimitExceeded,
          durationMs: Date.now() - startedAt,
        };
      },
    };
  }
}

interface BackgroundTerminalState {
  readonly child: ChildProcess;
  readonly view: BackgroundTerminalView;
  output: Buffer;
  stopRequested: boolean;
}

/** User-owned long-running processes. This service is intentionally absent from model tools. */
export class DirectUserBackgroundTerminalService {
  readonly #shellExecutable: string;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #maxOutputBytes: number;
  readonly #sessions = new Map<string, BackgroundTerminalState>();

  constructor(options: DirectUserTerminalServiceOptions = {}) {
    this.#shellExecutable = options.shellExecutable ?? '/bin/zsh';
    this.#environment = sanitizedEnvironment(options.environment ?? process.env);
    this.#maxOutputBytes = positiveInteger(
      options.maxOutputBytes ?? DEFAULT_TERMINAL_OUTPUT_BYTES,
      'Terminal output limit',
    );
  }

  get busy(): boolean {
    return [...this.#sessions.values()].some((session) => session.view.status === 'running');
  }

  async start(workspace: string, command: string): Promise<BackgroundTerminalView> {
    const cwd = await resolveDirectory(workspace, 'invalid_workspace');
    validateTerminalCommand(command);
    const id = randomUUID();
    const now = new Date().toISOString();
    const child = spawn(
      this.#shellExecutable,
      [
        '-lc',
        'builtin cd -- "$1" || exit; eval "$2"',
        'sia-direct-user-background-terminal',
        cwd,
        command,
      ],
      {
        cwd,
        env: this.#environment,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const state: BackgroundTerminalState = {
      child,
      output: Buffer.alloc(0),
      stopRequested: false,
      view: {
        id,
        command,
        cwd,
        output: '',
        status: 'running',
        exitCode: null,
        startedAt: now,
        updatedAt: now,
        truncated: false,
      },
    };
    this.#sessions.set(id, state);
    const capture = (value: Buffer | string) => this.#capture(state, value);
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    child.once('error', (error) => {
      this.#capture(state, `\n[Process failed: ${error.message}]\n`);
      state.view.status = 'failed';
      state.view.updatedAt = new Date().toISOString();
    });
    child.once('close', (exitCode) => {
      state.view.exitCode = exitCode;
      state.view.status = state.stopRequested
        ? 'stopped'
        : exitCode === 0
          ? 'exited'
          : 'failed';
      state.view.updatedAt = new Date().toISOString();
    });
    return structuredClone(state.view);
  }

  async list(workspace: string): Promise<BackgroundTerminalView[]> {
    const cwd = await resolveDirectory(workspace, 'invalid_workspace');
    return [...this.#sessions.values()]
      .filter((state) => state.view.cwd === cwd)
      .map((state) => structuredClone(state.view))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async write(workspace: string, id: string, input: string): Promise<BackgroundTerminalView> {
    const state = await this.#owned(workspace, id);
    if (state.view.status !== 'running' || !state.child.stdin?.writable) {
      throw new WorkspaceOperationError(
        'command_failed',
        'This background process is not running.',
      );
    }
    if (!input || Buffer.byteLength(input, 'utf8') > MAX_TERMINAL_COMMAND_BYTES) {
      throw new WorkspaceOperationError(
        'command_failed',
        'Terminal input is empty or too large.',
      );
    }
    await new Promise<void>((resolvePromise, rejectPromise) => {
      state.child.stdin!.write(input, (error) =>
        error ? rejectPromise(error) : resolvePromise(),
      );
    });
    return structuredClone(state.view);
  }

  async stop(workspace: string, id: string): Promise<BackgroundTerminalView> {
    const state = await this.#owned(workspace, id);
    if (state.view.status === 'running') {
      state.stopRequested = true;
      state.view.status = 'stopped';
      state.view.updatedAt = new Date().toISOString();
      killProcess(state.child, process.platform !== 'win32');
    }
    return structuredClone(state.view);
  }

  dispose(): void {
    for (const state of this.#sessions.values()) {
      if (state.view.status !== 'running') continue;
      state.stopRequested = true;
      killProcess(state.child, process.platform !== 'win32');
    }
    this.#sessions.clear();
  }

  #capture(state: BackgroundTerminalState, value: Buffer | string): void {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const combined = Buffer.concat([state.output, chunk]);
    state.view.truncated ||= combined.length > this.#maxOutputBytes;
    state.output =
      combined.length > this.#maxOutputBytes
        ? combined.subarray(combined.length - this.#maxOutputBytes)
        : combined;
    state.view.output = state.output.toString('utf8');
    state.view.updatedAt = new Date().toISOString();
  }

  async #owned(workspace: string, id: string): Promise<BackgroundTerminalState> {
    const cwd = await resolveDirectory(workspace, 'invalid_workspace');
    const state = this.#sessions.get(id);
    if (!state || state.view.cwd !== cwd) {
      throw new WorkspaceOperationError('command_failed', 'Background process not found.');
    }
    return state;
  }
}

export function validateTerminalCommand(command: string): void {
  if (
    !command.trim() ||
    command.includes('\0') ||
    Buffer.byteLength(command) > MAX_TERMINAL_COMMAND_BYTES
  ) {
    throw new WorkspaceOperationError('command_failed', 'The terminal command is invalid.');
  }
}
