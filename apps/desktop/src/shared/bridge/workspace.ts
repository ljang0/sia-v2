// A thread's workspace: file changes, snapshots, undoable reply changes, and terminals.

export interface WorkspaceChangeView {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
}

export interface WorkspaceDiffView {
  workspace: string;
  files: WorkspaceChangeView[];
  unifiedDiff: string;
  generatedAt: string;
}

export interface WorkspaceSnapshotView {
  id: string;
  createdAt: string;
}

/**
 * The files one reply changed, checked against the disk. `ready`: they still hold the reply's
 * changes, so they can go back. `undone`: they are back as before, so the changes can be redone.
 * `changed`: some were edited since, so neither is safe. `unavailable`: Sia has no complete
 * record to put them back.
 */
export interface TurnChangesView {
  state: 'ready' | 'undone' | 'changed' | 'unavailable';
  files: Array<{ path: string; change: 'added' | 'edited' | 'deleted' | 'renamed' }>;
  /** Files edited since, or ones Sia may not touch; they block undo and redo. */
  blocked: string[];
}

export interface TerminalResultView {
  command: string;
  cwd: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface BackgroundTerminalView {
  id: string;
  command: string;
  cwd: string;
  output: string;
  status: 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  startedAt: string;
  updatedAt: string;
  truncated: boolean;
}
