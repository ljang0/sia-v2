import {
  CalendarDots,
  CaretDown,
  CheckCircle,
  Clock,
  Flag,
  Pause,
  Play,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ScheduleRun, ThreadGoal } from '../../types';
import styles from '../../ui.module.css';
import { useConfirmDialog } from '../ConfirmDialog';
import { StartupSettings } from '../settings/StartupSettings';

interface SelectOption {
  id: string;
  label: string;
  detail?: string | undefined;
}

interface ThreadModelControlsProps {
  workspace?: string;
  modelId: string;
  reasoningId: string;
  models: readonly SelectOption[];
  reasoningOptions: readonly SelectOption[];
  disabled?: boolean | undefined;
  onChangeModel(modelId: string): Promise<void> | void;
  onChangeReasoning(reasoningId: string, modelId: string): Promise<void> | void;
}

export function ThreadModelControls({
  workspace,
  modelId,
  reasoningId,
  models,
  reasoningOptions,
  disabled,
  onChangeModel,
  onChangeReasoning,
}: ThreadModelControlsProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  // The snapshot carrying a new model can arrive after the next reasoning change, so reasoning
  // changes send the model the person last picked rather than the one from the last render.
  const pickedModel = useRef(modelId);
  useEffect(() => {
    pickedModel.current = modelId;
  }, [modelId]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details ref={menu} className={styles.agentSettingsMenu}>
      <summary>
        Agent settings <CaretDown size={13} aria-hidden="true" />
      </summary>
      <section className={styles.threadControls} aria-label="Thread model settings">
        <label>
          <span>Model</span>
          <select
            aria-label="Model"
            data-testid="thread-model-select"
            value={modelId}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value;
              pickedModel.current = next;
              void Promise.resolve(onChangeModel(next)).catch(() => {
                pickedModel.current = modelId;
              });
            }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} title={model.detail}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.threadControlDivider} aria-hidden="true">
          ·
        </span>
        <label>
          <span>Reasoning</span>
          <select
            aria-label="Reasoning"
            data-testid="thread-reasoning-select"
            value={reasoningId}
            disabled={disabled}
            onChange={(event) =>
              void onChangeReasoning(event.target.value, pickedModel.current)
            }
          >
            {reasoningOptions.map((option) => (
              <option key={option.id} value={option.id} title={option.detail}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {workspace && (
          <details className={styles.workspaceDetails}>
            <summary>Workspace</summary>
            <p>{workspace}</p>
          </details>
        )}
      </section>
    </details>
  );
}

interface GoalControlsProps {
  goal?: ThreadGoal | undefined;
  busy?: boolean | undefined;
  onSetGoal(text: string): Promise<void> | void;
  onPauseGoal(): Promise<void> | void;
  onResumeGoal(): Promise<void> | void;
  onClearGoal(): Promise<void> | void;
}

export function GoalControls({
  goal,
  busy,
  onSetGoal,
  onPauseGoal,
  onResumeGoal,
  onClearGoal,
}: GoalControlsProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  if (goal) {
    return (
      <section className={styles.goalControl} aria-labelledby={`${inputId}-title`}>
        <div className={styles.localSurfaceHeader}>
          <div>
            <span className={styles.sectionLabel}>Thread goal</span>
            <h2 id={`${inputId}-title`}>{goal.text}</h2>
          </div>
          <span className={styles.goalStatus} data-status={goal.status}>
            {goal.status === 'running' ? (
              <CheckCircle size={15} aria-hidden="true" />
            ) : (
              <Pause size={15} aria-hidden="true" />
            )}
            {goal.status === 'running' ? 'Active' : 'Paused'}
          </span>
        </div>
        <div className={styles.localActionRow}>
          {goal.status === 'running' ? (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() => void onPauseGoal()}
            >
              <Pause size={14} aria-hidden="true" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() => void onResumeGoal()}
            >
              <Play size={14} aria-hidden="true" />
              Resume
            </button>
          )}
          <button
            type="button"
            className={styles.textButtonDanger}
            disabled={busy}
            onClick={() => void onClearGoal()}
          >
            Clear goal
          </button>
        </div>
      </section>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || busy) return;
    void Promise.resolve(onSetGoal(value)).then(() => setDraft(''));
  };

  return (
    <form className={styles.goalControl} onSubmit={submit} aria-labelledby={`${inputId}-title`}>
      <div className={styles.localSurfaceHeader}>
        <div>
          <span className={styles.sectionLabel}>Thread goal</span>
          <h2 id={`${inputId}-title`}>Keep a long task on course</h2>
        </div>
        <Flag size={18} aria-hidden="true" />
      </div>
      <label className={styles.localField} htmlFor={inputId}>
        <span>Goal</span>
        <input
          data-testid="goal-title-input"
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ship the release checklist"
          disabled={busy}
        />
      </label>
      <button
        className={styles.primaryButton}
        type="submit"
        disabled={busy || !draft.trim()}
        data-testid="goal-save"
      >
        Set goal
      </button>
    </form>
  );
}

interface ThreadSchedule {
  id: string;
  label: string;
  prompt: string;
  cadence: 'once' | 'hourly' | 'daily' | 'weekly';
  nextRunAt: string;
  enabled: boolean;
  runCount?: number | undefined;
  maxRuns?: number | undefined;
  lastRun?: ScheduleRun | undefined;
  runHistory?: readonly ScheduleRun[] | undefined;
}

interface ScheduleDraft {
  prompt: string;
  cadence: ThreadSchedule['cadence'];
  runAt: string;
  maxRuns?: number;
}

interface ScheduleControlsProps {
  schedules: readonly ThreadSchedule[];
  busy?: boolean | undefined;
  onCreate(draft: ScheduleDraft): Promise<void> | void;
  onSetEnabled(scheduleId: string, enabled: boolean): Promise<void> | void;
  onRunNow?: ((scheduleId: string) => Promise<void> | void) | undefined;
  onDelete(scheduleId: string): Promise<void> | void;
  /** Open Sia at login, offered here because schedules only run while Sia is open. */
  openAtLogin?: boolean | undefined;
  onSetOpenAtLogin?: ((enabled: boolean) => Promise<void>) | undefined;
}

export function ScheduleControls({
  schedules,
  busy,
  openAtLogin = false,
  onSetOpenAtLogin,
  onCreate,
  onSetEnabled,
  onRunNow,
  onDelete,
}: ScheduleControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [cadence, setCadence] = useState<ScheduleDraft['cadence']>('once');
  const [runAt, setRunAt] = useState('');
  const [maxRuns, setMaxRuns] = useState('1');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string>();
  const [confirm, confirmDialog] = useConfirmDialog();
  const titleId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    void Promise.resolve(
      onCreate({
        prompt: prompt.trim(),
        cadence,
        runAt: runAt || inferredFirstRun(cadence),
        ...(maxRuns ? { maxRuns: Number(maxRuns) } : {}),
      }),
    ).then(
      () => {
        setPrompt('');
        setCadence('once');
        setRunAt('');
        setMaxRuns('1');
        setExpanded(false);
      },
      // The failure is already reported; keep the draft so the person can try again.
      () => undefined,
    );
  };

  return (
    <section className={styles.scheduleControl} aria-labelledby={titleId}>
      {confirmDialog}
      <div className={styles.localSurfaceHeader}>
        <div>
          <span className={styles.sectionLabel}>Runs while Sia is open</span>
          <h2 id={titleId}>Schedules</h2>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          data-testid="schedule-create"
        >
          {expanded ? (
            <X size={14} aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
          {expanded ? 'Cancel' : 'New schedule'}
        </button>
      </div>
      {onSetOpenAtLogin ? (
        <StartupSettings
          compact
          openAtLogin={openAtLogin}
          onSetOpenAtLogin={onSetOpenAtLogin}
        />
      ) : null}

      {expanded ? (
        <form className={styles.scheduleForm} onSubmit={submit}>
          <label className={styles.localField}>
            <span>Task</span>
            <input
              autoFocus
              data-testid="schedule-prompt-input"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Summarize new project updates"
              disabled={busy}
            />
          </label>
          <div className={styles.scheduleFields}>
            <label className={styles.localField}>
              <span>Repeat</span>
              <select
                data-testid="schedule-cadence-select"
                value={cadence}
                onChange={(event) => {
                  const next = event.target.value as ScheduleDraft['cadence'];
                  setCadence(next);
                  setMaxRuns(next === 'once' ? '1' : '10');
                }}
                disabled={busy}
              >
                <option value="once">Once</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className={styles.localField}>
              <span>Stops after</span>
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                inputMode="numeric"
                value={maxRuns}
                onChange={(event) => setMaxRuns(event.target.value)}
                disabled={busy}
              />
            </label>
            <label className={styles.localField}>
              <span>
                First run <small aria-hidden="true">optional</small>
              </span>
              <input
                data-testid="schedule-first-run-input"
                aria-label="First run"
                type="datetime-local"
                value={runAt}
                onChange={(event) => setRunAt(event.target.value)}
                disabled={busy}
              />
              <small className={styles.scheduleTimingHint}>
                {cadence === 'once'
                  ? 'Defaults to as soon as this thread is idle.'
                  : `Defaults to one ${cadence === 'hourly' ? 'hour' : cadence === 'daily' ? 'day' : 'week'} from now.`}
              </small>
            </label>
          </div>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || !prompt.trim()}
            data-testid="schedule-save"
          >
            Create schedule
          </button>
        </form>
      ) : null}

      <div className={styles.scheduleList}>
        {schedules.length ? (
          schedules.map((schedule) => {
            const runs = scheduleRuns(schedule);
            const historyExpanded = expandedHistoryId === schedule.id;
            return (
              <article className={styles.scheduleRow} key={schedule.id}>
                <CalendarDots className={styles.scheduleRowIcon} size={17} aria-hidden="true" />
                <div className={styles.scheduleSummary}>
                  <strong>{schedule.label}</strong>
                  <div className={styles.scheduleMeta}>
                    <span data-testid="schedule-next-run">
                      <Clock size={12} aria-hidden="true" />
                      {scheduleNextLabel(schedule)}
                    </span>
                    <span>
                      {(schedule.runCount ?? 0).toLocaleString()} run
                      {schedule.runCount === 1 ? '' : 's'}
                      {schedule.maxRuns ? ` of ${schedule.maxRuns.toLocaleString()}` : ''}
                    </span>
                  </div>
                  <div className={styles.scheduleOutcomeSummary}>
                    {schedule.lastRun ? (
                      <span
                        className={styles.scheduleOutcome}
                        data-outcome={schedule.lastRun.outcome}
                      >
                        Last {scheduleOutcomeLabel(schedule.lastRun.outcome)} ·{' '}
                        <time dateTime={scheduleRunTimestamp(schedule.lastRun)}>
                          {formatScheduleTime(scheduleRunTimestamp(schedule.lastRun))}
                        </time>
                      </span>
                    ) : (
                      <span>Not run yet</span>
                    )}
                    {runs.length ? (
                      <button
                        type="button"
                        className={styles.scheduleHistoryToggle}
                        aria-expanded={historyExpanded}
                        aria-label={`${historyExpanded ? 'Hide' : 'Show'} run history for ${schedule.label}`}
                        onClick={() =>
                          setExpandedHistoryId(historyExpanded ? undefined : schedule.id)
                        }
                      >
                        {runs.length} recent
                        <CaretDown size={12} weight="bold" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className={styles.scheduleActions}>
                  {/* Resuming a finished schedule would run it again at once, past its limit. */}
                  {schedule.enabled || !scheduleFinished(schedule) ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={() => void onSetEnabled(schedule.id, !schedule.enabled)}
                    >
                      {schedule.enabled ? 'Pause' : 'Resume'}
                    </button>
                  ) : null}
                  {onRunNow ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={busy}
                      onClick={() => void onRunNow(schedule.id)}
                    >
                      Run now
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={styles.iconButtonSmall}
                  disabled={busy}
                  onClick={() =>
                    confirm({
                      title: 'Delete this schedule?',
                      description: `“${schedule.label}” won’t run again. This can’t be undone.`,
                      confirmLabel: 'Delete',
                      onConfirm: () => onDelete(schedule.id),
                    })
                  }
                  aria-label={`Delete ${schedule.label}`}
                >
                  <Trash size={14} aria-hidden="true" />
                </button>
                {historyExpanded ? (
                  <ol
                    className={styles.scheduleHistory}
                    aria-label={`Run history for ${schedule.label}`}
                  >
                    {runs.map((run) => (
                      <li key={run.id}>
                        <span className={styles.scheduleOutcome} data-outcome={run.outcome}>
                          {scheduleOutcomeLabel(run.outcome)}
                        </span>
                        <time dateTime={scheduleRunTimestamp(run)}>
                          {formatScheduleTime(scheduleRunTimestamp(run))}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className={styles.localEmpty}>No scheduled work for this thread.</p>
        )}
      </div>
    </section>
  );
}

function formatScheduleTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function scheduleRuns(schedule: ThreadSchedule): readonly ScheduleRun[] {
  if (schedule.runHistory?.length) return schedule.runHistory;
  return schedule.lastRun ? [schedule.lastRun] : [];
}

function scheduleFinished(schedule: ThreadSchedule): boolean {
  const runs = schedule.runCount ?? 0;
  return (
    (schedule.cadence === 'once' && runs > 0) ||
    (schedule.maxRuns !== undefined && runs >= schedule.maxRuns)
  );
}

function scheduleNextLabel(schedule: ThreadSchedule): string {
  if (schedule.enabled) return `Next ${formatScheduleTime(schedule.nextRunAt)}`;
  if (schedule.cadence === 'once' && (schedule.runCount ?? 0) > 0) return 'Finished';
  if (scheduleFinished(schedule)) return 'Run limit reached';
  return 'Paused';
}

function scheduleOutcomeLabel(outcome: ScheduleRun['outcome']): string {
  if (outcome === 'started') return 'Running';
  return `${outcome[0]?.toUpperCase()}${outcome.slice(1)}`;
}

function scheduleRunTimestamp(run: ScheduleRun): string {
  return run.finishedAt ?? run.startedAt;
}

function inferredFirstRun(cadence: ScheduleDraft['cadence']) {
  const intervals: Record<ScheduleDraft['cadence'], number> = {
    once: 0,
    hourly: 60 * 60_000,
    daily: 24 * 60 * 60_000,
    weekly: 7 * 24 * 60 * 60_000,
  };
  return new Date(Date.now() + intervals[cadence]).toISOString();
}
