import { CaretDown, CheckCircle, ListChecks, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ActivityEvent } from '../types';
import activityRow from './ActivityRow.module.css';
import { AgentForm } from './AgentForm';
import styles from './WorkGroup.module.css';

interface WorkGroupProps {
  events: readonly ActivityEvent[];
  /** A group containing work that is still running. Earlier steps fold as it progresses. */
  live: boolean;
  startedAt?: string | undefined;
  endedAt?: string | undefined;
  open: boolean;
  onToggle(): void;
  /** `position` is the step's place in this group; groups hold consecutive timeline events. */
  renderStep(event: ActivityEvent, position: number): ReactNode;
}

/** Folds a finished run of tool steps into one "Worked for 1m 12s · 8 steps" line. */
export function WorkGroup({
  events,
  live,
  startedAt,
  endedAt,
  open,
  onToggle,
  renderStep,
}: WorkGroupProps) {
  // A run watched while it worked settles into its summary once; a reopened thread stays still.
  const [previousLive, setPreviousLive] = useState(live);
  const [settling, setSettling] = useState(false);
  if (previousLive !== live) {
    setPreviousLive(live);
    setSettling(previousLive && !live);
  }
  const current = events.findLastIndex((event) => ['running', 'queued'].includes(event.status));
  if (live && events.length < 2) {
    return <div className={styles.workGroupSteps}>{events.map(renderStep)}</div>;
  }
  const problems = events.filter((event) => event.status === 'error').length;
  const duration = elapsed(
    startedAt ?? events[0]!.timestamp,
    endedAt ?? events.at(-1)!.timestamp,
  );
  return (
    <div
      className={styles.workGroup}
      data-open={open ? 'true' : undefined}
      data-settling={settling ? 'true' : undefined}
    >
      <button
        type="button"
        className={styles.workGroupSummary}
        onClick={onToggle}
        aria-expanded={open}
      >
        {problems ? (
          <WarningCircle size={16} className={styles.workGroupProblemIcon} aria-hidden="true" />
        ) : live ? (
          <ListChecks size={16} aria-hidden="true" />
        ) : (
          <CheckCircle size={16} className={styles.workGroupDoneIcon} aria-hidden="true" />
        )}
        <span>
          {live ? 'Activity' : duration ? `Worked for ${duration}` : 'Worked on this'}
          {` · ${events.length} ${events.length === 1 ? 'step' : 'steps'}`}
        </span>
        {problems ? (
          <span className={styles.workGroupProblem}>
            {problems === 1 ? '1 step had a problem' : `${problems} steps had problems`}
          </span>
        ) : null}
        <CaretDown
          size={16}
          className={open ? activityRow.caretExpanded : activityRow.caret}
          aria-hidden="true"
        />
      </button>
      {open ? <div className={styles.workGroupSteps}>{events.map(renderStep)}</div> : null}
      {live && !open && current >= 0 ? (
        <div className={styles.workGroupSteps}>{renderStep(events[current]!, current)}</div>
      ) : null}
    </div>
  );
}

interface WorkingStatusProps {
  since?: string | undefined;
  step?: ActivityEvent | undefined;
  writing: boolean;
  /** Headline of the latest reasoning summary; replaces the plain "Thinking". */
  thinking?: string | undefined;
  /** The running turn's plan, when it has one: "Step 2 of 5". */
  plan?: PlanProgress | undefined;
  /** Steps this turn has finished; shown when there is no plan to count against. */
  finished?: number | undefined;
  /** The working agent's identity, so its own form breathes beside the line. */
  agentHue?: number | undefined;
}

export interface PlanProgress {
  current: number;
  total: number;
}

/** Where a plan stands: the step in progress, else the next one not yet done. */
export function planProgress(
  steps: ReadonlyArray<{ status: 'pending' | 'in_progress' | 'completed' }>,
): PlanProgress | undefined {
  if (!steps.length) return undefined;
  const active = steps.findIndex((step) => step.status === 'in_progress');
  const next = steps.findIndex((step) => step.status !== 'completed');
  const index = active >= 0 ? active : next;
  return index >= 0 ? { current: index + 1, total: steps.length } : undefined;
}

/** The one word for a running turn, shared by the live line and the conversation header. */
export function workingLabel(step: boolean, writing: boolean): string {
  return step ? 'Working' : writing ? 'Writing the reply' : 'Thinking';
}

/** The live line under a running turn: what Sia is doing now and for how long. */
export function WorkingStatus({
  since,
  step,
  writing,
  thinking,
  plan,
  finished = 0,
  agentHue,
}: WorkingStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  // The running step already shows as its own row above, so this line stays short.
  const label =
    step?.toolName === 'runtime.connection'
      ? 'Reconnecting to your AI'
      : step?.toolName === 'runtime.start'
        ? step.title
        : !step && !writing && thinking
          ? thinking
          : workingLabel(Boolean(step), writing);
  const duration = since ? elapsed(since, new Date(now).toISOString()) : '';
  // A running step has its own spinner in its row, and a reply being written has its caret, so
  // the presence only breathes then instead of sending rings beside them.
  const quiet = Boolean(step) || writing;
  return (
    <div
      className={styles.workingStatus}
      role="status"
      data-testid="turn-running"
      data-quiet={quiet || undefined}
    >
      <span className={styles.workingPresence} aria-hidden="true">
        <AgentForm
          identity={agentHue}
          state={quiet ? 'idle' : 'working'}
          size="small"
          className={styles.workingOrb}
        />
      </span>
      {/* Keyed by its words so a new phase fades in instead of snapping. */}
      <span key={label} className={styles.workingLabel}>
        {label}
      </span>
      {plan ? (
        <span key={`plan-${plan.current}`} className={styles.workingCount}>
          <span
            className={styles.planTrack}
            style={{ '--plan-progress': (plan.current - 1) / plan.total } as CSSProperties}
            aria-hidden="true"
          />
          <span
            className={styles.workingElapsed}
          >{`Step ${plan.current} of ${plan.total}`}</span>
        </span>
      ) : finished ? (
        <span
          key={`done-${finished}`}
          className={`${styles.workingCount} ${styles.workingElapsed}`}
        >
          {finished === 1 ? '1 step done' : `${finished} steps done`}
        </span>
      ) : null}
      {duration ? (
        <span className={styles.workingElapsed} aria-hidden="true">
          {duration}
        </span>
      ) : null}
    </div>
  );
}

export function elapsed(from: string, to: string): string {
  const milliseconds = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
