import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { lstat, mkdir, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { sanitizedEnvironment } from '@sia/runtime';

import type {
  BackgroundTerminalView,
  TerminalResultView,
  WorkspaceChangeView,
  WorkspaceDiffView,
  WorkspaceSnapshotView,
} from '../shared/bridge.js';

const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const DEFAULT_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_TERMINAL_TIMEOUT_MS = 30_000;
const DEFAULT_TERMINAL_OUTPUT_BYTES = 256 * 1024;
const MAX_PATH_COUNT = 256;
const MAX_PATH_ARGUMENT_BYTES = 128 * 1024;
const MAX_TERMINAL_COMMAND_BYTES = 64 * 1024;
const MAX_SNAPSHOTS = 30;
const SNAPSHOT_REF_ROOT = 'refs/sia/snapshots';

type WorkspaceOperationErrorCode =
  | 'invalid_workspace'
  | 'not_git_repository'
  | 'invalid_path'
  | 'path_not_tracked'
  | 'invalid_revision'
  | 'invalid_private_root'
  | 'command_failed'
  | 'timed_out'
  | 'aborted'
  | 'output_limit';

export class WorkspaceOperationError extends Error {
  readonly code: WorkspaceOperationErrorCode;

  constructor(code: WorkspaceOperationErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorkspaceOperationError';
    this.code = code;
  }
}

interface GitFileStatus {
  /** Repository-relative current path. */
  readonly path: string;
  /** Repository-relative previous path for a rename or copy. */
  readonly originalPath?: string;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
  readonly staged: boolean;
  readonly unstaged: boolean;
  readonly untracked: boolean;
  readonly conflicted: boolean;
}

interface WorkspaceGitStatus {
  readonly workspace: string;
  readonly repositoryRoot: string;
  readonly branch?: string;
  readonly detached: boolean;
  readonly files: readonly GitFileStatus[];
}

interface WorkspaceDiff {
  readonly repositoryRoot: string;
  readonly staged: boolean;
  readonly text: string;
  readonly truncated: boolean;
}

interface DetachedWorktree {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly commit: string;
}

interface GitOperationOptions {
  readonly signal?: AbortSignal;
}

interface GitDiffOptions extends GitOperationOptions {
  readonly staged?: boolean;
  readonly paths?: readonly string[];
  readonly contextLines?: number;
}

interface CreateWorktreeOptions extends GitOperationOptions {
  readonly revision?: string;
  readonly directoryNamePrefix?: string;
}

interface WorkspaceGitOperations {
  status(workspace: string, options?: GitOperationOptions): Promise<WorkspaceGitStatus>;
  diff(workspace: string, options?: GitDiffOptions): Promise<WorkspaceDiff>;
  stage(
    workspace: string,
    paths: readonly string[],
    options?: GitOperationOptions,
  ): Promise<WorkspaceGitStatus>;
  restoreTracked(
    workspace: string,
    paths: readonly string[],
    options?: GitOperationOptions,
  ): Promise<WorkspaceGitStatus>;
  createDetachedWorktree(
    workspace: string,
    options?: CreateWorktreeOptions,
  ): Promise<DetachedWorktree>;
  removeDetachedWorktree(workspace: string, options?: GitOperationOptions): Promise<void>;
  listSnapshots(
    workspace: string,
    options?: GitOperationOptions,
  ): Promise<WorkspaceSnapshotView[]>;
  createSnapshot(
    workspace: string,
    options?: GitOperationOptions,
  ): Promise<WorkspaceSnapshotView>;
  restoreSnapshot(
    workspace: string,
    snapshotId: string,
    options?: GitOperationOptions,
  ): Promise<void>;
  deleteSnapshot(
    workspace: string,
    snapshotId: string,
    options?: GitOperationOptions,
  ): Promise<void>;
}

interface WorkspaceGitServiceOptions {
  /** Dedicated application-owned directory; it must not be a symlink or group/world accessible. */
  readonly privateWorktreeRoot: string;
  readonly gitExecutable?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly commandTimeoutMs?: number;
  readonly maxOutputBytes?: number;
}

/** Git-only workspace operations. This service never invokes a shell. */
export class WorkspaceGitService implements WorkspaceGitOperations {
  readonly #privateWorktreeRoot: string;
  readonly #gitExecutable: string;
  readonly #environment: NodeJS.ProcessEnv;
  readonly #commandTimeoutMs: number;
  readonly #maxOutputBytes: number;

  constructor(options: WorkspaceGitServiceOptions) {
    this.#privateWorktreeRoot = requireAbsolutePath(
      options.privateWorktreeRoot,
      'Private worktree root',
      'invalid_private_root',
    );
    this.#gitExecutable = options.gitExecutable ?? '/usr/bin/git';
    this.#environment = sanitizedEnvironment(options.environment ?? process.env);
    this.#commandTimeoutMs = positiveInteger(
      options.commandTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
      'Git timeout',
    );
    this.#maxOutputBytes = positiveInteger(
      options.maxOutputBytes ?? DEFAULT_GIT_OUTPUT_BYTES,
      'Git output limit',
    );
  }

  async status(
    workspace: string,
    options: GitOperationOptions = {},
  ): Promise<WorkspaceGitStatus> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    return await this.#statusResolved(resolved, options.signal);
  }

  async diff(workspace: string, options: GitDiffOptions = {}): Promise<WorkspaceDiff> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const paths = validateRepositoryPaths(resolved.repositoryRoot, options.paths ?? [], true);
    const contextLines = options.contextLines ?? 3;
    if (!Number.isSafeInteger(contextLines) || contextLines < 0 || contextLines > 100) {
      throw new WorkspaceOperationError(
        'invalid_path',
        'Diff context must be an integer between 0 and 100.',
      );
    }
    const args = [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--no-color',
      `--unified=${contextLines}`,
      ...(options.staged ? ['--cached'] : []),
      ...(paths.length ? ['--', ...paths] : []),
    ];
    const result = await this.#git(resolved.repositoryRoot, args, {
      signal: options.signal,
      truncateOutput: true,
    });
    return {
      repositoryRoot: resolved.repositoryRoot,
      staged: Boolean(options.staged),
      text: result.stdout,
      truncated: result.outputLimitExceeded,
    };
  }

  async stage(
    workspace: string,
    paths: readonly string[],
    options: GitOperationOptions = {},
  ): Promise<WorkspaceGitStatus> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const validated = validateRepositoryPaths(resolved.repositoryRoot, paths);
    await this.#git(resolved.repositoryRoot, ['add', '--', ...validated], {
      signal: options.signal,
    });
    return await this.#statusResolved(resolved, options.signal);
  }

  async restoreTracked(
    workspace: string,
    paths: readonly string[],
    options: GitOperationOptions = {},
  ): Promise<WorkspaceGitStatus> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const validated = validateRepositoryPaths(resolved.repositoryRoot, paths);
    const tracked = await this.#git(
      resolved.repositoryRoot,
      ['ls-files', '--error-unmatch', '-z', '--', ...validated],
      { signal: options.signal, acceptedExitCodes: [0, 1] },
    );
    if (tracked.exitCode !== 0) {
      throw new WorkspaceOperationError(
        'path_not_tracked',
        'Only paths already tracked by Git can be restored.',
      );
    }
    await this.#git(
      resolved.repositoryRoot,
      ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...validated],
      { signal: options.signal },
    );
    return await this.#statusResolved(resolved, options.signal);
  }

  async createDetachedWorktree(
    workspace: string,
    options: CreateWorktreeOptions = {},
  ): Promise<DetachedWorktree> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const revision = validateRevision(options.revision ?? 'HEAD');
    const commitResult = await this.#git(
      resolved.repositoryRoot,
      ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`],
      { signal: options.signal, acceptedExitCodes: [0, 128] },
    );
    const commit = commitResult.stdout.trim();
    if (commitResult.exitCode !== 0 || !/^[0-9a-f]{40,64}$/i.test(commit)) {
      throw new WorkspaceOperationError(
        'invalid_revision',
        'The selected Git revision does not resolve to a commit.',
      );
    }

    const privateRoot = await this.#resolvePrivateRoot();
    const prefix = validateWorktreePrefix(options.directoryNamePrefix ?? 'worktree');
    const worktreePath = join(privateRoot, `${prefix}-${randomUUID()}`);
    try {
      await this.#git(
        resolved.repositoryRoot,
        ['-c', 'core.hooksPath=/dev/null', 'worktree', 'add', '--detach', worktreePath, commit],
        { signal: options.signal },
      );
    } catch (error) {
      await rm(worktreePath, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    const actualWorktree = await realpath(worktreePath);
    assertContainedPath(privateRoot, actualWorktree, 'invalid_private_root');
    return { repositoryRoot: resolved.repositoryRoot, path: actualWorktree, commit };
  }

  async removeDetachedWorktree(
    workspace: string,
    options: GitOperationOptions = {},
  ): Promise<void> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const status = await this.#statusResolved(resolved, options.signal);
    if (status.files.length) {
      throw new WorkspaceOperationError(
        'command_failed',
        'Commit, move, or restore this worktree’s changes before removing it.',
      );
    }
    await this.#git(resolved.repositoryRoot, ['worktree', 'remove', '--', resolved.workspace], {
      signal: options.signal,
    });
  }

  async listSnapshots(
    workspace: string,
    options: GitOperationOptions = {},
  ): Promise<WorkspaceSnapshotView[]> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const result = await this.#git(
      resolved.repositoryRoot,
      [
        'for-each-ref',
        '--sort=-creatordate',
        '--format=%(refname:strip=3)%09%(creatordate:iso-strict)',
        SNAPSHOT_REF_ROOT,
      ],
      { signal: options.signal },
    );
    return result.stdout
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        const [id, createdAt] = line.split('\t');
        return id && createdAt && validSnapshotId(id)
          ? [{ id, createdAt: new Date(createdAt).toISOString() }]
          : [];
      })
      .slice(0, MAX_SNAPSHOTS);
  }

  async createSnapshot(
    workspace: string,
    options: GitOperationOptions = {},
  ): Promise<WorkspaceSnapshotView> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const status = await this.#statusResolved(resolved, options.signal);
    if (status.files.some((file) => file.untracked)) {
      throw new WorkspaceOperationError(
        'command_failed',
        'Stage untracked files before creating a snapshot so every saved file is explicit.',
      );
    }
    if (!status.files.length) {
      throw new WorkspaceOperationError('command_failed', 'There are no changes to snapshot.');
    }
    const existing = await this.listSnapshots(resolved.repositoryRoot, options);
    if (existing.length >= MAX_SNAPSHOTS) {
      throw new WorkspaceOperationError(
        'command_failed',
        `Keep at most ${MAX_SNAPSHOTS} snapshots. Delete one before creating another.`,
      );
    }
    const created = await this.#git(
      resolved.repositoryRoot,
      ['stash', 'create', 'Sia workspace snapshot'],
      { signal: options.signal },
    );
    const commit = created.stdout.trim();
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
      throw new WorkspaceOperationError('command_failed', 'Git could not create the snapshot.');
    }
    const id = randomUUID();
    await this.#git(
      resolved.repositoryRoot,
      ['update-ref', `${SNAPSHOT_REF_ROOT}/${id}`, commit],
      { signal: options.signal },
    );
    const snapshots = await this.listSnapshots(resolved.repositoryRoot, options);
    const snapshot = snapshots.find((candidate) => candidate.id === id);
    if (!snapshot) {
      throw new WorkspaceOperationError('command_failed', 'Git could not verify the snapshot.');
    }
    return snapshot;
  }

  async restoreSnapshot(
    workspace: string,
    snapshotId: string,
    options: GitOperationOptions = {},
  ): Promise<void> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const id = requireSnapshotId(snapshotId);
    const status = await this.#statusResolved(resolved, options.signal);
    if (status.files.length) {
      throw new WorkspaceOperationError(
        'command_failed',
        'Restore a snapshot only into a clean workspace.',
      );
    }
    const reference = `${SNAPSHOT_REF_ROOT}/${id}`;
    const [base, head] = await Promise.all([
      this.#git(resolved.repositoryRoot, ['rev-parse', '--verify', `${reference}^1`], {
        signal: options.signal,
        acceptedExitCodes: [0, 128],
      }),
      this.#git(resolved.repositoryRoot, ['rev-parse', '--verify', 'HEAD'], {
        signal: options.signal,
      }),
    ]);
    if (base.exitCode !== 0 || base.stdout.trim() !== head.stdout.trim()) {
      throw new WorkspaceOperationError(
        'command_failed',
        'This snapshot was created from a different Git revision and cannot be restored safely.',
      );
    }
    await this.#git(resolved.repositoryRoot, ['stash', 'apply', '--index', reference], {
      signal: options.signal,
    });
  }

  async deleteSnapshot(
    workspace: string,
    snapshotId: string,
    options: GitOperationOptions = {},
  ): Promise<void> {
    const resolved = await this.#resolveRepository(workspace, options.signal);
    const reference = `${SNAPSHOT_REF_ROOT}/${requireSnapshotId(snapshotId)}`;
    const existing = await this.#git(
      resolved.repositoryRoot,
      ['rev-parse', '--verify', reference],
      { signal: options.signal, acceptedExitCodes: [0, 128] },
    );
    if (existing.exitCode !== 0) {
      throw new WorkspaceOperationError('command_failed', 'That snapshot no longer exists.');
    }
    await this.#git(resolved.repositoryRoot, ['update-ref', '-d', reference], {
      signal: options.signal,
    });
  }

  async #statusResolved(
    resolved: ResolvedRepository,
    signal?: AbortSignal,
  ): Promise<WorkspaceGitStatus> {
    const [statusResult, branchResult] = await Promise.all([
      this.#git(
        resolved.repositoryRoot,
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        { signal },
      ),
      this.#git(resolved.repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
        signal,
        acceptedExitCodes: [0, 1],
      }),
    ]);
    const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : undefined;
    return {
      workspace: resolved.workspace,
      repositoryRoot: resolved.repositoryRoot,
      ...(branch ? { branch } : {}),
      detached: !branch,
      files: parsePorcelainStatus(statusResult.stdout),
    };
  }

  async #resolveRepository(
    workspace: string,
    signal?: AbortSignal,
  ): Promise<ResolvedRepository> {
    const resolvedWorkspace = await resolveDirectory(workspace, 'invalid_workspace');
    let rootResult: CapturedProcessResult;
    try {
      rootResult = await this.#git(
        resolvedWorkspace,
        ['rev-parse', '--path-format=absolute', '--show-toplevel'],
        { signal, acceptedExitCodes: [0, 128] },
      );
    } catch (error) {
      if (error instanceof WorkspaceOperationError) throw error;
      throw new WorkspaceOperationError(
        'not_git_repository',
        'The selected workspace is not a Git repository.',
        { cause: error },
      );
    }
    if (rootResult.exitCode !== 0 || !rootResult.stdout.trim()) {
      throw new WorkspaceOperationError(
        'not_git_repository',
        'The selected workspace is not a Git repository.',
      );
    }
    const repositoryRoot = await resolveDirectory(
      rootResult.stdout.trim(),
      'not_git_repository',
    );
    assertContainedPath(repositoryRoot, resolvedWorkspace, 'invalid_workspace');
    return { workspace: resolvedWorkspace, repositoryRoot };
  }

  async #resolvePrivateRoot(): Promise<string> {
    const requested = this.#privateWorktreeRoot;
    try {
      await mkdir(requested, { mode: 0o700 });
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) {
        throw new WorkspaceOperationError(
          'invalid_private_root',
          'The private worktree directory could not be created.',
          { cause: error },
        );
      }
    }
    const info = await lstat(requested).catch((error: unknown) => {
      throw new WorkspaceOperationError(
        'invalid_private_root',
        'The private worktree directory could not be inspected.',
        { cause: error },
      );
    });
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new WorkspaceOperationError(
        'invalid_private_root',
        'The private worktree directory must be a private, non-symlink directory.',
      );
    }
    return await realpath(requested);
  }

  async #git(
    cwd: string,
    args: readonly string[],
    options: {
      readonly signal?: AbortSignal | undefined;
      readonly acceptedExitCodes?: readonly number[];
      readonly truncateOutput?: boolean;
    } = {},
  ): Promise<CapturedProcessResult> {
    const hardenedArgs = [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      ...args,
    ];
    const result = await runCapturedProcess(this.#gitExecutable, hardenedArgs, {
      cwd,
      environment: this.#environment,
      timeoutMs: this.#commandTimeoutMs,
      maxOutputBytes: this.#maxOutputBytes,
      signal: options.signal,
      killOnOutputLimit: !options.truncateOutput,
    });
    if (result.aborted) {
      throw new WorkspaceOperationError('aborted', 'The Git operation was cancelled.');
    }
    if (result.timedOut) {
      throw new WorkspaceOperationError('timed_out', 'The Git operation timed out.');
    }
    if (result.outputLimitExceeded && !options.truncateOutput) {
      throw new WorkspaceOperationError(
        'output_limit',
        'The Git operation produced too much output.',
      );
    }
    if (!(options.acceptedExitCodes ?? [0]).includes(result.exitCode ?? -1)) {
      throw new WorkspaceOperationError(
        'command_failed',
        result.stderr.trim() || 'Git could not complete the operation.',
      );
    }
    return result;
  }
}

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

interface WorkspaceOperations {
  readDiff(workspace: string): Promise<WorkspaceDiffView>;
  stage(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
  restore(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
  runTerminal(workspace: string, command: string): Promise<TerminalResultView>;
  startBackgroundTerminal(workspace: string, command: string): Promise<BackgroundTerminalView>;
  listBackgroundTerminals(workspace: string): Promise<BackgroundTerminalView[]>;
  writeBackgroundTerminal(
    workspace: string,
    id: string,
    input: string,
  ): Promise<BackgroundTerminalView>;
  stopBackgroundTerminal(workspace: string, id: string): Promise<BackgroundTerminalView>;
  createWorktree(
    sourceWorkspace: string,
    threadId: string,
  ): Promise<{ path: string; branch?: string }>;
  removeWorktree(workspace: string): Promise<void>;
  listSnapshots(workspace: string): Promise<WorkspaceSnapshotView[]>;
  createSnapshot(workspace: string): Promise<WorkspaceSnapshotView[]>;
  restoreSnapshot(workspace: string, snapshotId: string): Promise<WorkspaceDiffView>;
  deleteSnapshot(workspace: string, snapshotId: string): Promise<WorkspaceSnapshotView[]>;
}

interface WorkspaceOperationsServiceOptions extends WorkspaceGitServiceOptions {
  readonly shellExecutable?: string;
  readonly terminalTimeoutMs?: number;
  readonly terminalMaxOutputBytes?: number;
}

/** Controller-facing facade. Only controller IPC should retain this object. */
export class WorkspaceOperationsService implements WorkspaceOperations {
  readonly #git: WorkspaceGitService;
  readonly #terminal: DirectUserTerminalService;
  readonly #backgroundTerminal: DirectUserBackgroundTerminalService;

  constructor(options: WorkspaceOperationsServiceOptions) {
    this.#git = new WorkspaceGitService(options);
    this.#terminal = new DirectUserTerminalService({
      ...(options.shellExecutable ? { shellExecutable: options.shellExecutable } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.terminalTimeoutMs ? { maxTimeoutMs: options.terminalTimeoutMs } : {}),
      ...(options.terminalMaxOutputBytes
        ? { maxOutputBytes: options.terminalMaxOutputBytes }
        : {}),
    });
    this.#backgroundTerminal = new DirectUserBackgroundTerminalService({
      ...(options.shellExecutable ? { shellExecutable: options.shellExecutable } : {}),
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.terminalMaxOutputBytes
        ? { maxOutputBytes: options.terminalMaxOutputBytes }
        : {}),
    });
  }

  async readDiff(workspace: string): Promise<WorkspaceDiffView> {
    const [status, staged, unstaged] = await Promise.all([
      this.#git.status(workspace),
      this.#git.diff(workspace, { staged: true }),
      this.#git.diff(workspace),
    ]);
    return workspaceDiffView(status, staged, unstaged);
  }

  async stage(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView> {
    await this.#git.stage(workspace, paths);
    return await this.readDiff(workspace);
  }

  async restore(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView> {
    await this.#git.restoreTracked(workspace, paths);
    return await this.readDiff(workspace);
  }

  async runTerminal(workspace: string, command: string): Promise<TerminalResultView> {
    const scope = await this.#terminal.scope(workspace);
    const result = await scope.execute(command);
    const notices = [
      ...(result.outputLimitExceeded ? ['\n[Output stopped at the safety limit.]\n'] : []),
      ...(result.aborted ? ['\n[Command cancelled.]\n'] : []),
    ];
    return {
      command,
      cwd: result.workspace,
      output: `${result.stdout}${result.stderr}${notices.join('')}`,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
    };
  }

  async startBackgroundTerminal(
    workspace: string,
    command: string,
  ): Promise<BackgroundTerminalView> {
    return await this.#backgroundTerminal.start(workspace, command);
  }

  async listBackgroundTerminals(workspace: string): Promise<BackgroundTerminalView[]> {
    return await this.#backgroundTerminal.list(workspace);
  }

  async writeBackgroundTerminal(
    workspace: string,
    id: string,
    input: string,
  ): Promise<BackgroundTerminalView> {
    return await this.#backgroundTerminal.write(workspace, id, input);
  }

  async stopBackgroundTerminal(workspace: string, id: string): Promise<BackgroundTerminalView> {
    return await this.#backgroundTerminal.stop(workspace, id);
  }

  dispose(): void {
    this.#backgroundTerminal.dispose();
  }

  async createWorktree(
    sourceWorkspace: string,
    threadId: string,
  ): Promise<{ path: string; branch?: string }> {
    const prefix = validateWorktreePrefix(`thread-${threadId}`);
    const worktree = await this.#git.createDetachedWorktree(sourceWorkspace, {
      directoryNamePrefix: prefix,
    });
    return { path: worktree.path };
  }

  async removeWorktree(workspace: string): Promise<void> {
    await this.#git.removeDetachedWorktree(workspace);
  }

  async listSnapshots(workspace: string): Promise<WorkspaceSnapshotView[]> {
    return await this.#git.listSnapshots(workspace);
  }

  async createSnapshot(workspace: string): Promise<WorkspaceSnapshotView[]> {
    await this.#git.createSnapshot(workspace);
    return await this.#git.listSnapshots(workspace);
  }

  async restoreSnapshot(workspace: string, snapshotId: string): Promise<WorkspaceDiffView> {
    await this.#git.restoreSnapshot(workspace, snapshotId);
    return await this.readDiff(workspace);
  }

  async deleteSnapshot(
    workspace: string,
    snapshotId: string,
  ): Promise<WorkspaceSnapshotView[]> {
    await this.#git.deleteSnapshot(workspace, snapshotId);
    return await this.#git.listSnapshots(workspace);
  }
}

interface ResolvedRepository {
  readonly workspace: string;
  readonly repositoryRoot: string;
}

interface CapturedProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly outputLimitExceeded: boolean;
}

interface CaptureOptions {
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal | undefined;
  readonly killOnOutputLimit: boolean;
  readonly detachedProcessGroup?: boolean;
}

async function runCapturedProcess(
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

function emptyProcessResult(flags: {
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

function killProcess(child: ChildProcess, processGroup: boolean): void {
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

function parsePorcelainStatus(output: string): GitFileStatus[] {
  const records = output.split('\0');
  const files: GitFileStatus[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4 || record[2] !== ' ') {
      throw new WorkspaceOperationError(
        'command_failed',
        'Git returned an invalid status record.',
      );
    }
    const indexStatus = record[0]!;
    const worktreeStatus = record[1]!;
    const path = record.slice(3);
    const renamedOrCopied = indexStatus === 'R' || indexStatus === 'C';
    const originalPath = renamedOrCopied ? records[index + 1] : undefined;
    if (renamedOrCopied) {
      if (!originalPath) {
        throw new WorkspaceOperationError(
          'command_failed',
          'Git returned an incomplete rename record.',
        );
      }
      index += 1;
    }
    const untracked = indexStatus === '?' && worktreeStatus === '?';
    const conflicted =
      indexStatus === 'U' ||
      worktreeStatus === 'U' ||
      (indexStatus === 'A' && worktreeStatus === 'A') ||
      (indexStatus === 'D' && worktreeStatus === 'D');
    files.push({
      path,
      ...(originalPath ? { originalPath } : {}),
      indexStatus,
      worktreeStatus,
      staged: !untracked && indexStatus !== ' ',
      unstaged: untracked || worktreeStatus !== ' ',
      untracked,
      conflicted,
    });
  }
  return files;
}

function validateRepositoryPaths(
  repositoryRoot: string,
  paths: readonly string[],
  allowEmpty = false,
): string[] {
  if ((!allowEmpty && paths.length === 0) || paths.length > MAX_PATH_COUNT) {
    throw new WorkspaceOperationError(
      'invalid_path',
      `Select between 1 and ${MAX_PATH_COUNT} repository paths.`,
    );
  }
  const unique = [...new Set(paths)];
  let argumentBytes = 0;
  for (const path of unique) {
    argumentBytes += Buffer.byteLength(path);
    if (
      !path ||
      path.includes('\0') ||
      isAbsolute(path) ||
      path.split(sep).some((part) => !part || part === '.' || part === '..')
    ) {
      throw new WorkspaceOperationError('invalid_path', 'A repository path is invalid.');
    }
    const resolvedPath = resolve(repositoryRoot, path);
    assertContainedPath(repositoryRoot, resolvedPath, 'invalid_path');
    if (relative(repositoryRoot, resolvedPath) !== path) {
      throw new WorkspaceOperationError(
        'invalid_path',
        'Repository paths must use their canonical relative form.',
      );
    }
  }
  if (argumentBytes > MAX_PATH_ARGUMENT_BYTES) {
    throw new WorkspaceOperationError('invalid_path', 'The selected path list is too large.');
  }
  return unique;
}

function validateRevision(value: string): string {
  if (!value || value.length > 512 || value.includes('\0') || value.includes('\n')) {
    throw new WorkspaceOperationError('invalid_revision', 'The Git revision is invalid.');
  }
  return value;
}

function validateWorktreePrefix(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(value)) {
    throw new WorkspaceOperationError(
      'invalid_path',
      'The worktree directory label is invalid.',
    );
  }
  return value;
}

function validSnapshotId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function requireSnapshotId(value: string): string {
  if (!validSnapshotId(value)) {
    throw new WorkspaceOperationError('invalid_revision', 'The snapshot id is invalid.');
  }
  return value;
}

function validateTerminalCommand(command: string): void {
  if (
    !command.trim() ||
    command.includes('\0') ||
    Buffer.byteLength(command) > MAX_TERMINAL_COMMAND_BYTES
  ) {
    throw new WorkspaceOperationError('command_failed', 'The terminal command is invalid.');
  }
}

async function resolveDirectory(
  value: string,
  errorCode: 'invalid_workspace' | 'not_git_repository',
): Promise<string> {
  const requested = requireAbsolutePath(value, 'Workspace', errorCode);
  try {
    const resolved = await realpath(requested);
    const info = await stat(resolved);
    if (!info.isDirectory()) throw new Error('Not a directory');
    return resolved;
  } catch (error) {
    throw new WorkspaceOperationError(errorCode, 'The workspace directory is unavailable.', {
      cause: error,
    });
  }
}

function requireAbsolutePath(
  value: string,
  label: string,
  errorCode: 'invalid_workspace' | 'not_git_repository' | 'invalid_private_root',
): string {
  if (!value || value.includes('\0') || !isAbsolute(value)) {
    throw new WorkspaceOperationError(errorCode, `${label} must be an absolute path.`);
  }
  return resolve(value);
}

function assertContainedPath(
  root: string,
  candidate: string,
  errorCode: 'invalid_workspace' | 'invalid_path' | 'invalid_private_root',
): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new WorkspaceOperationError(errorCode, 'The path escapes its allowed root.');
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function workspaceDiffView(
  status: WorkspaceGitStatus,
  staged: WorkspaceDiff,
  unstaged: WorkspaceDiff,
): WorkspaceDiffView {
  const unifiedDiff = `${staged.text}${unstaged.text}`;
  const truncationNotice =
    staged.truncated || unstaged.truncated
      ? '\n[Unified diff stopped at the safety limit.]\n'
      : '';
  return {
    workspace: status.workspace,
    files: status.files.map(toWorkspaceChangeView),
    unifiedDiff: `${unifiedDiff}${truncationNotice}`,
    generatedAt: new Date().toISOString(),
  };
}

function toWorkspaceChangeView(file: GitFileStatus): WorkspaceChangeView {
  let status: WorkspaceChangeView['status'];
  if (file.conflicted) status = 'conflicted';
  else if (file.untracked) status = 'untracked';
  else if (file.indexStatus === 'R' || file.worktreeStatus === 'R') status = 'renamed';
  else if (file.indexStatus === 'D' || file.worktreeStatus === 'D') status = 'deleted';
  else if (file.indexStatus === 'A' || file.worktreeStatus === 'A') status = 'added';
  else status = 'modified';
  return { path: file.path, status, staged: file.staged };
}
