import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowLeft, CalendarDots, CaretDown, Code, Flag, GitDiff } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BackgroundTerminal,
  RendererApi,
  RendererSnapshot,
  TerminalResult,
  ThreadDetail,
  WorkspaceDiff,
  WorkspaceSnapshot,
} from '../../types';
import styles from '../../ui.module.css';
import { ChangesReview, type ChangedFile } from './ChangesReview';
import { GoalControls } from './WorkControls';
import { ScheduleControls } from './WorkControls';
import { TerminalDrawer, type TerminalRunState } from './TerminalDrawer';

type Tool = 'goal' | 'changes' | 'terminal' | 'schedules';

interface ThreadWorkspaceToolsProps {
  thread: ThreadDetail;
  snapshot: RendererSnapshot;
  api: RendererApi;
  run(action: () => Promise<unknown>): Promise<void>;
  /** Like run, but rejects after reporting so a form can keep what the person typed. */
  attempt?(action: () => Promise<unknown>): Promise<void>;
}

export function ThreadWorkspaceTools({
  thread,
  snapshot,
  api,
  run,
  attempt = run,
}: ThreadWorkspaceToolsProps) {
  const [tool, setTool] = useState<Tool>();
  const [changes, setChanges] = useState<WorkspaceDiff>();
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<string>();
  const [busyPath, setBusyPath] = useState<string>();
  const [reviewing, setReviewing] = useState(false);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState<string>();
  const [terminalRun, setTerminalRun] = useState<TerminalRunState>({ status: 'idle' });
  const [backgroundTerminals, setBackgroundTerminals] = useState<BackgroundTerminal[]>([]);
  const [backgroundStarting, setBackgroundStarting] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const toolsTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTool(undefined);
    setChanges(undefined);
    setChangesError(undefined);
    setTerminalRun({ status: 'idle' });
    setBackgroundTerminals([]);
    setBackgroundStarting(false);
    setReviewing(false);
    setSnapshots([]);
    setSnapshotBusy(undefined);
  }, [thread.id]);

  useEffect(() => {
    if (tool && tool !== 'terminal') panel.current?.focus();
  }, [tool]);

  useEffect(() => {
    if (tool !== 'terminal') return;
    let disposed = false;
    const refresh = async () => {
      try {
        const sessions = await api.listBackgroundTerminals(thread.id);
        if (!disposed) setBackgroundTerminals(sessions);
      } catch {
        if (!disposed) setBackgroundTerminals([]);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [api, thread.id, tool]);

  const closePanel = () => {
    const target = toolsTrigger.current;
    setTool(undefined);
    requestAnimationFrame(() => target?.focus());
  };

  const openChanges = async () => {
    setTool('changes');
    setChangesLoading(true);
    setChangesError(undefined);
    try {
      const [nextChanges, nextSnapshots] = await Promise.all([
        api.readChanges(thread.id),
        api.listWorkspaceSnapshots(thread.id),
      ]);
      setChanges(nextChanges);
      setSnapshots(nextSnapshots);
    } catch (cause) {
      // Without this, an unreadable folder looked like "no uncommitted changes".
      setChanges(undefined);
      setChangesError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Sia could not read the changes in this folder.',
      );
    } finally {
      setChangesLoading(false);
    }
  };

  const changedFiles = useMemo(() => mapChangedFiles(changes), [changes]);
  const schedules = snapshot.schedules.filter((schedule) => schedule.threadId === thread.id);
  const schedulesAvailable = snapshot.cloudAuth.features?.schedules !== false;

  return (
    <>
      <nav className={styles.threadToolNav} aria-label="Thread tools">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button ref={toolsTrigger} type="button">
              Tools <CaretDown size={12} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={styles.threadMenuContent}
              side="top"
              align="end"
              sideOffset={6}
              onCloseAutoFocus={(event) => {
                if (!tool) return;
                event.preventDefault();
                if (tool !== 'terminal') panel.current?.focus();
              }}
            >
              <DropdownMenu.Item
                className={styles.threadMenuItem}
                onSelect={() => setTool('goal')}
              >
                <Flag size={14} aria-hidden="true" /> Goal
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={styles.threadMenuItem}
                onSelect={() => void openChanges()}
                data-testid="changes-panel-toggle"
              >
                <GitDiff size={14} aria-hidden="true" /> Changes
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={styles.threadMenuItem}
                onSelect={() => setTool('terminal')}
                data-testid="terminal-open"
              >
                <Code size={14} aria-hidden="true" /> Command
              </DropdownMenu.Item>
              {schedulesAvailable ? (
                <DropdownMenu.Item
                  className={styles.threadMenuItem}
                  onSelect={() => setTool('schedules')}
                >
                  <CalendarDots size={14} aria-hidden="true" /> Schedules
                </DropdownMenu.Item>
              ) : null}
              {thread.worktree?.kind === 'linked' ? (
                <DropdownMenu.Item
                  className={styles.threadMenuItem}
                  onSelect={() => void run(() => api.handoffThread(thread.id, 'primary'))}
                  data-testid="worktree-handoff-primary"
                >
                  <ArrowLeft size={14} aria-hidden="true" /> Continue in primary workspace
                </DropdownMenu.Item>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </nav>

      {tool && tool !== 'terminal' ? (
        <aside
          ref={panel}
          className={styles.threadToolPanel}
          aria-label="Thread tool"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closePanel();
          }}
        >
          <button
            type="button"
            className={styles.threadToolClose}
            onClick={closePanel}
            aria-label="Close thread tool"
          >
            Close
          </button>
          {tool === 'goal' ? (
            <GoalControls
              goal={thread.goal}
              onSetGoal={(text) => run(() => api.setGoal(thread.id, text))}
              onPauseGoal={() => run(() => api.pauseGoal(thread.id))}
              onResumeGoal={() => run(() => api.resumeGoal(thread.id))}
              onClearGoal={() => run(() => api.clearGoal(thread.id))}
            />
          ) : tool === 'schedules' ? (
            <ScheduleControls
              schedules={schedules.map((schedule) => ({
                ...schedule,
                label: schedule.prompt,
                enabled: schedule.enabled !== false,
              }))}
              onCreate={(draft) =>
                attempt(() =>
                  api.createSchedule(
                    thread.id,
                    draft.prompt,
                    draft.cadence,
                    new Date(draft.runAt).toISOString(),
                    draft.maxRuns,
                  ),
                )
              }
              onSetEnabled={(scheduleId, enabled) =>
                run(() => api.setScheduleEnabled(scheduleId, enabled))
              }
              onDelete={(scheduleId) => run(() => api.deleteSchedule(scheduleId))}
              onRunNow={(scheduleId) => run(() => api.runScheduleNow(scheduleId))}
            />
          ) : changesLoading ? (
            <p className={styles.localEmpty} role="status">
              Reading workspace changes…
            </p>
          ) : changesError ? (
            <p className={styles.localEmpty} role="alert" data-testid="changes-error">
              {changesError}
            </p>
          ) : (
            <ChangesReview
              workspace={thread.workspace}
              files={changedFiles}
              busyPath={busyPath}
              reviewing={reviewing}
              snapshots={snapshots}
              snapshotBusy={snapshotBusy}
              onCreateSnapshot={async () => {
                setSnapshotBusy('create');
                try {
                  await run(async () =>
                    setSnapshots(await api.createWorkspaceSnapshot(thread.id)),
                  );
                } finally {
                  setSnapshotBusy(undefined);
                }
              }}
              onRestoreSnapshot={async (snapshotId) => {
                setSnapshotBusy(snapshotId);
                try {
                  await run(async () => {
                    const result = await api.restoreWorkspaceSnapshot(thread.id, snapshotId);
                    setChanges(result.diff);
                    setSnapshots(result.snapshots);
                  });
                } finally {
                  setSnapshotBusy(undefined);
                }
              }}
              onDeleteSnapshot={async (snapshotId) => {
                setSnapshotBusy(snapshotId);
                try {
                  await run(async () =>
                    setSnapshots(await api.deleteWorkspaceSnapshot(thread.id, snapshotId)),
                  );
                } finally {
                  setSnapshotBusy(undefined);
                }
              }}
              {...(thread.provider === 'codex'
                ? {
                    onReview: async () => {
                      setReviewing(true);
                      try {
                        await api.startReview(thread.id, { type: 'uncommitted_changes' });
                        closePanel();
                      } finally {
                        setReviewing(false);
                      }
                    },
                  }
                : {})}
              onStage={async (path) => {
                setBusyPath(path);
                try {
                  setChanges(await api.stageChanges(thread.id, [path]));
                } finally {
                  setBusyPath(undefined);
                }
              }}
              onRestore={async (path) => {
                setBusyPath(path);
                try {
                  setChanges(await api.restoreChanges(thread.id, [path]));
                } finally {
                  setBusyPath(undefined);
                }
              }}
            />
          )}
        </aside>
      ) : null}

      <TerminalDrawer
        open={tool === 'terminal'}
        workspace={thread.workspace}
        run={terminalRun}
        background={backgroundTerminals}
        backgroundStarting={backgroundStarting}
        returnFocusRef={toolsTrigger}
        onOpenChange={(open) => !open && setTool(undefined)}
        onRun={async ({ command }) => {
          setTerminalRun({ status: 'running', command });
          try {
            const result = await api.runTerminal(thread.id, command);
            setTerminalRun(mapTerminalResult(result));
          } catch {
            setTerminalRun({ status: 'failed', command, output: 'The command could not run.' });
          }
        }}
        onStartBackground={async ({ command }) => {
          setBackgroundStarting(true);
          try {
            const session = await api.startBackgroundTerminal(thread.id, command);
            setBackgroundTerminals((current) => upsertTerminal(current, session));
          } finally {
            setBackgroundStarting(false);
          }
        }}
        onStopBackground={async (id) => {
          const session = await api.stopBackgroundTerminal(thread.id, id);
          setBackgroundTerminals((current) => upsertTerminal(current, session));
        }}
        onWriteBackground={async (id, input) => {
          const session = await api.writeBackgroundTerminal(thread.id, id, input);
          setBackgroundTerminals((current) => upsertTerminal(current, session));
        }}
      />
    </>
  );
}

function upsertTerminal(
  current: readonly BackgroundTerminal[],
  session: BackgroundTerminal,
): BackgroundTerminal[] {
  return [session, ...current.filter((candidate) => candidate.id !== session.id)];
}

function mapChangedFiles(diff?: WorkspaceDiff): ChangedFile[] {
  if (!diff) return [];
  return diff.files.map((file) => {
    const patch = filePatch(diff.unifiedDiff, file.path);
    return {
      path: file.path,
      status:
        file.status === 'renamed' || file.status === 'conflicted' ? 'modified' : file.status,
      additions: countPatchLines(patch, '+'),
      deletions: countPatchLines(patch, '-'),
      staged: file.staged,
      patch,
    };
  });
}

export function filePatch(unifiedDiff: string, path: string): string {
  const blocks = unifiedDiff
    .split(/(?=^diff --git )/m)
    .filter((block) => block.split('\n', 1)[0]?.endsWith(` b/${path}`));
  // Staged and unstaged edits to one file are separate blocks; show both.
  return blocks.length ? blocks.join('') : `No textual diff is available for ${path}.`;
}

/** Counts changed lines inside hunks only, so content such as `---` or `++i` is not skipped. */
export function countPatchLines(patch: string, prefix: '+' | '-') {
  let inHunk = false;
  let count = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    else if (inHunk && line.startsWith(prefix)) count += 1;
  }
  return count;
}

function mapTerminalResult(result: TerminalResult): TerminalRunState {
  return {
    status: result.exitCode === 0 && !result.timedOut ? 'succeeded' : 'failed',
    command: result.command,
    output: result.output,
    exitCode: result.exitCode ?? undefined,
  };
}
