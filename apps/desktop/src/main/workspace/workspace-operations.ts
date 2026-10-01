import type {
  BackgroundTerminalView,
  TerminalResultView,
  WorkspaceChangeView,
  WorkspaceDiffView,
  WorkspaceSnapshotView,
} from '../../shared/bridge.js';
import {
  validateWorktreePrefix,
  WorkspaceGitService,
  type GitFileStatus,
  type WorkspaceDiff,
  type WorkspaceGitServiceOptions,
  type WorkspaceGitStatus,
} from './git-service.js';
import {
  DirectUserBackgroundTerminalService,
  DirectUserTerminalService,
} from './terminal-service.js';

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

  hasRunningTerminals(): boolean {
    return this.#backgroundTerminal.busy;
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
