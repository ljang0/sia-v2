import { CaretDown, CheckCircle, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ActivityEvent } from '../types';
import activityRow from './ActivityRow.module.css';
import styles from './WorkGroup.module.css';

interface WorkGroupProps {
  events: readonly ActivityEvent[];
  /** Steps of the turn that is still running stay open so progress is visible. */
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
  if (live || events.length < 2) {
    return <div className={styles.workGroupSteps}>{events.map(renderStep)}</div>;
  }
  const problems = events.filter((event) => event.status === 'error').length;
  const duration = elapsed(
    startedAt ?? events[0]!.timestamp,
    endedAt ?? events.at(-1)!.timestamp,
  );
  return (
    <div className={styles.workGroup} data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className={styles.workGroupSummary}
        onClick={onToggle}
        aria-expanded={open}
      >
        {problems ? (
          <WarningCircle size={15} className={styles.workGroupProblemIcon} aria-hidden="true" />
        ) : (
          <CheckCircle size={15} className={styles.workGroupDoneIcon} aria-hidden="true" />
        )}
        <span>
          {duration ? `Worked for ${duration}` : 'Worked on this'}
          {` · ${events.length} steps`}
        </span>
        {problems ? (
          <span className={styles.workGroupProblem}>
            {problems === 1 ? '1 step had a problem' : `${problems} steps had problems`}
          </span>
        ) : null}
        <CaretDown
          size={13}
          className={open ? activityRow.caretExpanded : activityRow.caret}
          aria-hidden="true"
        />
      </button>
      {open ? <div className={styles.workGroupSteps}>{events.map(renderStep)}</div> : null}
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
export function WorkingStatus({ since, step, writing, thinking, plan }: WorkingStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  // The running step already shows as its own row above, so this line stays short.
  const label = !step && !writing && thinking ? thinking : workingLabel(Boolean(step), writing);
  const duration = since ? elapsed(since, new Date(now).toISOString()) : '';
  return (
    <div className={styles.workingStatus} role="status" data-testid="turn-running">
      <CircleNotch size={15} className={styles.workingSpinner} aria-hidden="true" />
      {/* Keyed by its words so a new phase fades in instead of snapping. */}
      <span key={label} className={styles.workingLabel}>
        {label}
      </span>
      {plan ? (
        <span className={styles.workingElapsed}>{`Step ${plan.current} of ${plan.total}`}</span>
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
