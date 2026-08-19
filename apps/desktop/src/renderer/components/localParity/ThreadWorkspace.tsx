import { ArrowLeft, CalendarDots, Code, Flag, GitDiff } from '@phosphor-icons/react';
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
}

export function ThreadWorkspaceTools({
  thread,
  snapshot,
  api,
  run,
}: ThreadWorkspaceToolsProps) {
  const [tool, setTool] = useState<Tool>();
  const [changes, setChanges] = useState<WorkspaceDiff>();
  const [changesLoading, setChangesLoading] = useState(false);
  const [busyPath, setBusyPath] = useState<string>();
  const [reviewing, setReviewing] = useState(false);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [snapshotBusy, setSnapshotBusy] = useState<string>();
  const [terminalRun, setTerminalRun] = useState<TerminalRunState>({ status: 'idle' });
  const [backgroundTerminals, setBackgroundTerminals] = useState<BackgroundTerminal[]>([]);
  const [backgroundStarting, setBackgroundStarting] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLButtonElement>(null);
  const terminalTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTool(undefined);
    setChanges(undefined);
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

  const openPanel = (next: Exclude<Tool, 'terminal'>, trigger: HTMLButtonElement) => {
    returnFocus.current = trigger;
    setTool(next);
  };

  const closePanel = () => {
    const target = returnFocus.current;
    setTool(undefined);
    requestAnimationFrame(() => target?.focus());
  };

  const openChanges = async (trigger: HTMLButtonElement) => {
    openPanel('changes', trigger);
    setChangesLoading(true);
    try {
      const [nextChanges, nextSnapshots] = await Promise.all([
        api.readChanges(thread.id),
        api.listWorkspaceSnapshots(thread.id),
      ]);
      setChanges(nextChanges);
      setSnapshots(nextSnapshots);
    } finally {
      setChangesLoading(false);
    }
  };

  const changedFiles = useMemo(() => mapChangedFiles(changes), [changes]);
  const schedules = snapshot.schedules.filter((schedule) => schedule.threadId === thread.id);

  return (
    <>
      <nav className={styles.threadToolNav} aria-label="Thread tools">
        <button
          type="button"
          aria-label="Goal"
          title="Goal"
          aria-pressed={tool === 'goal'}
          onClick={(event) => openPanel('goal', event.currentTarget)}
        >
          <Flag size={14} aria-hidden="true" />
          <span>Goal</span>
        </button>
        <button
          type="button"
          aria-label="Changes"
          title="Changes"
          aria-pressed={tool === 'changes'}
          onClick={(event) => void openChanges(event.currentTarget)}
          data-testid="changes-panel-toggle"
        >
          <GitDiff size={14} aria-hidden="true" />
          <span>Changes</span>
        </button>
        <button
          ref={terminalTrigger}
          type="button"
          aria-label="Command"
          title="Command"
          onClick={() => setTool('terminal')}
          data-testid="terminal-open"
        >
          <Code size={14} aria-hidden="true" />
          <span>Command</span>
        </button>
        <button
          type="button"
          aria-label="Schedules"
          title="Schedules"
          aria-pressed={tool === 'schedules'}
          onClick={(event) => openPanel('schedules', event.currentTarget)}
        >
          <CalendarDots size={14} aria-hidden="true" />
          <span>Schedules</span>
        </button>
        {thread.worktree?.kind === 'linked' ? (
          <button
            type="button"
            aria-label="Continue in primary workspace"
            title="Continue in primary workspace"
            onClick={() => void run(() => api.handoffThread(thread.id, 'primary'))}
            data-testid="worktree-handoff-primary"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Main</span>
          </button>
        ) : null}
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
              }))}
              onCreate={(draft) =>
                run(() =>
                  api.createSchedule(
                    thread.id,
                    draft.prompt,
                    draft.cadence,
                    new Date(draft.runAt).toISOString(),
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
        returnFocusRef={terminalTrigger}
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

function filePatch(unifiedDiff: string, path: string): string {
  const blocks = unifiedDiff.split(/(?=^diff --git )/m).filter(Boolean);
  return (
    blocks.find((block) => block.split('\n', 1)[0]?.includes(` a/${path} b/${path}`)) ??
    (blocks.length === 1 ? blocks[0]! : `No textual diff is available for ${path}.`)
  );
}

function countPatchLines(patch: string, prefix: '+' | '-') {
  return patch
    .split('\n')
    .filter((line) => line.startsWith(prefix) && !line.startsWith(prefix.repeat(3))).length;
}

function mapTerminalResult(result: TerminalResult): TerminalRunState {
  return {
    status: result.exitCode === 0 && !result.timedOut ? 'succeeded' : 'failed',
    command: result.command,
    output: result.output,
    exitCode: result.exitCode ?? undefined,
  };
}
