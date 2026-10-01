import { randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { sanitizedEnvironment } from '@sia/runtime';

import type { WorkspaceSnapshotView } from '../../shared/bridge.js';
import { runCapturedProcess, type CapturedProcessResult } from './captured-process.js';
import {
  assertContainedPath,
  hasCode,
  positiveInteger,
  requireAbsolutePath,
  resolveDirectory,
  WorkspaceOperationError,
} from './operation-guards.js';

const DEFAULT_GIT_TIMEOUT_MS = 15_000;
const DEFAULT_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_PATH_COUNT = 256;
const MAX_PATH_ARGUMENT_BYTES = 128 * 1024;
const MAX_SNAPSHOTS = 30;
const SNAPSHOT_REF_ROOT = 'refs/sia/snapshots';

export interface GitFileStatus {
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

export interface WorkspaceGitStatus {
  readonly workspace: string;
  readonly repositoryRoot: string;
  readonly branch?: string;
  readonly detached: boolean;
  readonly files: readonly GitFileStatus[];
}

export interface WorkspaceDiff {
  readonly repositoryRoot: string;
  readonly staged: boolean;
  readonly text: string;
  readonly truncated: boolean;
}

export interface DetachedWorktree {
  readonly repositoryRoot: string;
  readonly path: string;
  readonly commit: string;
}

export interface GitOperationOptions {
  readonly signal?: AbortSignal;
}

export interface GitDiffOptions extends GitOperationOptions {
  readonly staged?: boolean;
  readonly paths?: readonly string[];
  readonly contextLines?: number;
}

export interface CreateWorktreeOptions extends GitOperationOptions {
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

export interface WorkspaceGitServiceOptions {
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
      // Keep non-ASCII paths readable in diff headers so the UI can match them to status.
      '-c',
      'core.quotePath=false',
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

interface ResolvedRepository {
  readonly workspace: string;
  readonly repositoryRoot: string;
}

export function parsePorcelainStatus(output: string): GitFileStatus[] {
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

export function validateRepositoryPaths(
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

export function validateRevision(value: string): string {
  if (!value || value.length > 512 || value.includes('\0') || value.includes('\n')) {
    throw new WorkspaceOperationError('invalid_revision', 'The Git revision is invalid.');
  }
  return value;
}

export function validateWorktreePrefix(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(value)) {
    throw new WorkspaceOperationError(
      'invalid_path',
      'The worktree directory label is invalid.',
    );
  }
  return value;
}

export function validSnapshotId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function requireSnapshotId(value: string): string {
  if (!validSnapshotId(value)) {
    throw new WorkspaceOperationError('invalid_revision', 'The snapshot id is invalid.');
  }
  return value;
}
