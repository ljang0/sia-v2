import { CaretDown, CircleNotch, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ActivityEvent } from '../types';
import styles from '../ui.module.css';

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
        <span>
          {duration ? `Worked for ${duration}` : 'Worked on this'}
          {` · ${events.length} steps`}
        </span>
        {problems ? (
          <span className={styles.workGroupProblem}>
            <WarningCircle size={14} aria-hidden="true" />
            {problems === 1 ? '1 step had a problem' : `${problems} steps had problems`}
          </span>
        ) : null}
        <CaretDown
          size={13}
          className={open ? styles.caretExpanded : styles.caret}
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
}

/** The live line under a running turn: what Sia is doing now and for how long. */
export function WorkingStatus({ since, step, writing }: WorkingStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  // The running step already shows as its own row above, so this line stays short.
  const label = step ? 'Working' : writing ? 'Writing the reply' : 'Thinking';
  const duration = since ? elapsed(since, new Date(now).toISOString()) : '';
  return (
    <div className={styles.workingStatus} role="status" data-testid="turn-running">
      <CircleNotch size={15} className={styles.workingSpinner} aria-hidden="true" />
      <span>{label}</span>
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
