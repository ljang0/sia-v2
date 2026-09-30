import {
  ArrowSquareOut,
  CalendarDots,
  CaretDown,
  Clock,
  Lightbulb,
  PencilSimple,
  Plus,
  Repeat,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import {
  defaultFirstScheduleRun,
  firstScheduleRunAt,
  MAX_EVERY_HOURS,
  normalizeScheduleDays,
} from '../../../shared/schedule-cadence';
import type { ScheduleChanges, ScheduleRun } from '../../types';
import styles from '../../ui.module.css';
import { useConfirmDialog } from '../ConfirmDialog';
import { StartupSettings } from '../settings/StartupSettings';
import {
  CADENCE_OPTIONS,
  describeCadence,
  describeScheduleDraft,
  friendlyScheduleTime,
  nextAt,
  toLocalInput,
  toTimeInput,
  weekdayName,
  type ScheduleCadence,
} from './scheduleText';

export interface ScheduleItem {
  id: string;
  label: string;
  prompt: string;
  cadence: ScheduleCadence;
  days?: readonly number[] | undefined;
  everyHours?: number | undefined;
  nextRunAt: string;
  enabled: boolean;
  runCount?: number | undefined;
  maxRuns?: number | undefined;
  lastRun?: ScheduleRun | undefined;
  runHistory?: readonly ScheduleRun[] | undefined;
}

export interface ScheduleDraft {
  prompt: string;
  cadence: ScheduleCadence;
  /** A local datetime ("2030-01-01T09:00") or ISO string. */
  runAt: string;
  days?: number[];
  everyHours?: number;
  maxRuns?: number;
}

const isDayBased = (cadence: ScheduleCadence) =>
  cadence === 'daily' || cadence === 'weekdays' || cadence === 'weekly';

interface FormValues {
  prompt: string;
  cadence: ScheduleCadence;
  /** Once: when. Every few hours: starting. Empty means "as soon as it can" / one interval. */
  when: string;
  /** Day-based cadences: time of day, "HH:MM". */
  time: string;
  days: number[];
  everyHours: string;
  maxRuns: string;
}

function blankValues(now = new Date()): FormValues {
  return {
    prompt: '',
    cadence: 'once',
    when: '',
    time: '09:00',
    days: [now.getDay()],
    everyHours: '1',
    maxRuns: '1',
  };
}

function valuesFromDraft(draft: ScheduleDraft): FormValues {
  const start = new Date(draft.runAt);
  const valid = !Number.isNaN(start.getTime());
  return {
    ...blankValues(),
    prompt: draft.prompt,
    cadence: draft.cadence,
    when: valid && !isDayBased(draft.cadence) ? toLocalInput(start) : '',
    time: valid ? toTimeInput(start) : '09:00',
    days: draft.days?.length
      ? [...draft.days]
      : valid
        ? [start.getDay()]
        : [new Date().getDay()],
    everyHours: String(draft.everyHours ?? 1),
    maxRuns: String(draft.maxRuns ?? (draft.cadence === 'once' ? 1 : 10)),
  };
}

/** What the form saves. Day-based cadences turn a time of day into their next run. */
function draftFromValues(values: FormValues, now = new Date()): ScheduleDraft {
  const everyHours = Math.min(
    Math.max(Math.round(Number(values.everyHours) || 1), 1),
    MAX_EVERY_HOURS,
  );
  const days = normalizeScheduleDays(values.days);
  const rule = {
    cadence: values.cadence,
    ...(values.cadence === 'weekly' ? { days } : {}),
    ...(values.cadence === 'hourly' ? { everyHours } : {}),
  };
  let runAt = values.when;
  if (isDayBased(values.cadence)) {
    const [hour = 9, minute = 0] = values.time.split(':').map(Number);
    runAt = toLocalInput(firstScheduleRunAt(rule, { hour, minute }, now));
  } else if (!runAt) {
    runAt = defaultFirstScheduleRun(rule, now).toISOString();
  }
  return {
    prompt: values.prompt.trim(),
    ...rule,
    runAt,
    ...(values.maxRuns ? { maxRuns: Number(values.maxRuns) } : {}),
  };
}

interface ScheduleFormProps {
  initial: FormValues;
  submitLabel: string;
  busy?: boolean | undefined;
  /** An edit counts only the runs still to come. */
  runsLabel?: string | undefined;
  onSubmit(draft: ScheduleDraft): Promise<void> | void;
  onCancel?: (() => void) | undefined;
  onSaved?: (() => void) | undefined;
}

function ScheduleForm({
  initial,
  submitLabel,
  busy,
  runsLabel = 'Stop after',
  onSubmit,
  onCancel,
  onSaved,
}: ScheduleFormProps) {
  const [values, setValues] = useState(initial);
  const summaryId = useId();
  const set = (patch: Partial<FormValues>) =>
    setValues((current) => ({ ...current, ...patch }));
  const { cadence } = values;
  const needsDays = cadence === 'weekly' && values.days.length === 0;
  const draft = draftFromValues(values);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!values.prompt.trim() || busy || needsDays) return;
    void Promise.resolve(onSubmit(draftFromValues(values))).then(
      () => onSaved?.(),
      // The failure is already reported; keep the draft so the person can try again.
      () => undefined,
    );
  };

  return (
    <form className={styles.scheduleForm} onSubmit={submit}>
      <label className={styles.localField}>
        <span>Task</span>
        <input
          autoFocus
          data-testid="schedule-prompt-input"
          value={values.prompt}
          onChange={(event) => set({ prompt: event.target.value })}
          placeholder="Summarize my inbox"
          aria-describedby={summaryId}
          disabled={busy}
        />
      </label>
      <div
        className={styles.scheduleFields}
        data-once={cadence === 'once'}
        data-hourly={cadence === 'hourly'}
      >
        <label className={styles.localField}>
          <span>Repeat</span>
          <select
            data-testid="schedule-cadence-select"
            value={cadence}
            onChange={(event) => {
              const next = event.target.value as ScheduleCadence;
              const wasRepeating = cadence !== 'once';
              set({
                cadence: next,
                ...(next === 'once' ? { maxRuns: '1' } : wasRepeating ? {} : { maxRuns: '10' }),
              });
            }}
            disabled={busy}
          >
            {CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {cadence === 'hourly' ? (
          <label className={styles.localField}>
            <span>Every</span>
            <span className={styles.scheduleRunsInput}>
              <input
                type="number"
                min="1"
                max={MAX_EVERY_HOURS}
                step="1"
                inputMode="numeric"
                aria-label="Hours between runs"
                data-testid="schedule-every-hours-input"
                value={values.everyHours}
                onChange={(event) => set({ everyHours: event.target.value })}
                disabled={busy}
              />
              <span aria-hidden="true">{values.everyHours === '1' ? 'hour' : 'hours'}</span>
            </span>
          </label>
        ) : null}
        {isDayBased(cadence) ? (
          <label className={styles.localField}>
            <span>At</span>
            <input
              data-testid="schedule-time-input"
              aria-label="Time of day"
              type="time"
              required
              value={values.time}
              onChange={(event) => set({ time: event.target.value })}
              disabled={busy}
            />
          </label>
        ) : (
          <label className={styles.localField}>
            <span>
              {cadence === 'once' ? 'When' : 'Starting'}{' '}
              <small aria-hidden="true">optional</small>
            </span>
            <input
              data-testid="schedule-first-run-input"
              aria-label={cadence === 'once' ? 'When' : 'Starting'}
              type="datetime-local"
              value={values.when}
              onChange={(event) => set({ when: event.target.value })}
              disabled={busy}
            />
          </label>
        )}
        {cadence === 'once' ? null : (
          <label className={styles.localField}>
            <span>{runsLabel}</span>
            <span className={styles.scheduleRunsInput}>
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                inputMode="numeric"
                aria-label={
                  runsLabel === 'Stop after' ? 'Stop after how many runs' : 'How many more runs'
                }
                value={values.maxRuns}
                onChange={(event) => set({ maxRuns: event.target.value })}
                disabled={busy}
              />
              <span aria-hidden="true">runs</span>
            </span>
          </label>
        )}
      </div>
      {cadence === 'weekly' ? (
        <fieldset className={styles.scheduleDays} disabled={busy}>
          <legend>On</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const chosen = values.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={chosen}
                aria-label={weekdayName(day)}
                title={weekdayName(day)}
                onClick={() =>
                  set({
                    days: chosen
                      ? values.days.filter((value) => value !== day)
                      : [...values.days, day],
                  })
                }
              >
                {weekdayName(day, 'short')}
              </button>
            );
          })}
        </fieldset>
      ) : null}
      <div className={styles.scheduleFormFooter}>
        <p className={styles.scheduleSummaryLine} id={summaryId} aria-live="polite">
          <Repeat size={14} aria-hidden="true" />
          {needsDays
            ? 'Choose at least one day.'
            : describeScheduleDraft({
                ...draft,
                runAt: cadence === 'once' || cadence === 'hourly' ? values.when : draft.runAt,
              })}
        </p>
        <div className={styles.scheduleFormActions}>
          {onCancel ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || !values.prompt.trim() || needsDays}
            data-testid="schedule-save"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

interface ScheduleRowProps {
  schedule: ScheduleItem;
  busy?: boolean | undefined;
  /** Where it runs, e.g. "Research partner · Weekly update"; shown on the all-schedules page. */
  context?: string | undefined;
  /** Opens the schedule's conversation. */
  onOpen?: (() => void) | undefined;
  onSetEnabled(scheduleId: string, enabled: boolean): Promise<void> | void;
  onRunNow?: ((scheduleId: string) => Promise<void> | void) | undefined;
  onDelete(scheduleId: string): Promise<void> | void;
  onSave?: ((scheduleId: string, changes: ScheduleChanges) => Promise<void> | void) | undefined;
  confirm: ReturnType<typeof useConfirmDialog>[0];
}

export function ScheduleRow({
  schedule,
  busy,
  context,
  onOpen,
  onSetEnabled,
  onRunNow,
  onDelete,
  onSave,
  confirm,
}: ScheduleRowProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const runs = scheduleRuns(schedule);
  const finished = scheduleFinished(schedule);

  if (editing && onSave) {
    const runCount = schedule.runCount ?? 0;
    const remaining = (schedule.maxRuns ?? 0) - runCount;
    return (
      <article className={styles.scheduleRow} data-editing="true">
        <ScheduleForm
          initial={{
            ...valuesFromDraft({
              prompt: schedule.prompt,
              cadence: schedule.cadence,
              runAt: schedule.nextRunAt,
              ...(schedule.days ? { days: [...schedule.days] } : {}),
              ...(schedule.everyHours ? { everyHours: schedule.everyHours } : {}),
            }),
            // An edit counts the runs still to come, so a finished schedule can start again.
            maxRuns: String(remaining > 0 ? remaining : schedule.cadence === 'once' ? 1 : 10),
          }}
          submitLabel="Save changes"
          runsLabel="Runs left"
          busy={busy}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
          onSubmit={(draft) =>
            onSave(schedule.id, {
              prompt: draft.prompt,
              cadence: draft.cadence,
              ...(draft.days ? { days: draft.days } : {}),
              ...(draft.everyHours ? { everyHours: draft.everyHours } : {}),
              nextRunAt: new Date(draft.runAt).toISOString(),
              maxRuns: runCount + (draft.cadence === 'once' ? 1 : (draft.maxRuns ?? 10)),
              // A finished schedule that gets a new plan should run again; a paused one stays paused.
              ...(finished ? { enabled: true } : {}),
            })
          }
        />
      </article>
    );
  }

  return (
    <article className={styles.scheduleRow} data-testid="schedule-row">
      <CalendarDots className={styles.scheduleRowIcon} size={17} aria-hidden="true" />
      <div className={styles.scheduleSummary}>
        {onOpen ? (
          <button
            type="button"
            className={styles.scheduleOpen}
            onClick={onOpen}
            title="Open conversation"
          >
            <strong>{schedule.label}</strong>
            <ArrowSquareOut size={13} aria-hidden="true" />
          </button>
        ) : (
          <strong>{schedule.label}</strong>
        )}
        {context ? <span className={styles.scheduleContext}>{context}</span> : null}
        <div className={styles.scheduleMeta}>
          <span data-testid="schedule-cadence">
            <Repeat size={12} aria-hidden="true" />
            {describeCadence(schedule)}
          </span>
          <span data-testid="schedule-next-run">
            <Clock size={12} aria-hidden="true" />
            {scheduleNextLabel(schedule)}
          </span>
          {schedule.cadence === 'once' ? null : (
            <span>
              {(schedule.runCount ?? 0).toLocaleString()} run
              {schedule.runCount === 1 ? '' : 's'}
              {schedule.maxRuns ? ` of ${schedule.maxRuns.toLocaleString()}` : ''}
            </span>
          )}
        </div>
        <div className={styles.scheduleOutcomeSummary}>
          {schedule.lastRun ? (
            <span className={styles.scheduleOutcome} data-outcome={schedule.lastRun.outcome}>
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
              onClick={() => setHistoryExpanded((value) => !value)}
            >
              {runs.length} recent
              <CaretDown size={12} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <div className={styles.scheduleActions}>
        {/* Resuming a finished schedule would run it again at once, past its limit. */}
        {schedule.enabled || !finished ? (
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
      <div className={styles.scheduleRowTools}>
        {onSave ? (
          <button
            type="button"
            className={styles.iconButtonSmall}
            disabled={busy}
            onClick={() => setEditing(true)}
            aria-label={`Edit ${schedule.label}`}
            title="Edit"
          >
            <PencilSimple size={14} aria-hidden="true" />
          </button>
        ) : null}
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
          title="Delete"
        >
          <Trash size={14} aria-hidden="true" />
        </button>
      </div>
      {historyExpanded ? (
        <ol className={styles.scheduleHistory} aria-label={`Run history for ${schedule.label}`}>
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
}

interface ScheduleControlsProps {
  schedules: readonly ScheduleItem[];
  busy?: boolean | undefined;
  onCreate(draft: ScheduleDraft): Promise<void> | void;
  onSave?: ((scheduleId: string, changes: ScheduleChanges) => Promise<void> | void) | undefined;
  onSetEnabled(scheduleId: string, enabled: boolean): Promise<void> | void;
  onRunNow?: ((scheduleId: string) => Promise<void> | void) | undefined;
  onDelete(scheduleId: string): Promise<void> | void;
  /** Open Sia at login, offered here because schedules only run while Sia is open. */
  openAtLogin?: boolean | undefined;
  onSetOpenAtLogin?: ((enabled: boolean) => Promise<void>) | undefined;
}

/** A conversation's schedules, under Tools → Schedules. */
export function ScheduleControls({
  schedules,
  busy,
  openAtLogin = false,
  onSetOpenAtLogin,
  onCreate,
  onSave,
  onSetEnabled,
  onRunNow,
  onDelete,
}: ScheduleControlsProps) {
  const [expanded, setExpanded] = useState(false);
  // A new key remounts the form, so an idea or a fresh "New schedule" starts from its own values.
  const [form, setForm] = useState<{ key: number; values: FormValues }>({
    key: 0,
    values: blankValues(),
  });
  const [confirm, confirmDialog] = useConfirmDialog();
  const titleId = useId();

  const openForm = (values: FormValues) => {
    setForm((current) => ({ key: current.key + 1, values }));
    setExpanded(true);
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
          onClick={() => (expanded ? setExpanded(false) : openForm(blankValues()))}
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
        <ScheduleForm
          key={form.key}
          initial={form.values}
          submitLabel="Create schedule"
          busy={busy}
          onSubmit={onCreate}
          onSaved={() => setExpanded(false)}
        />
      ) : null}

      <div className={styles.scheduleList}>
        {schedules.length ? (
          schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              busy={busy}
              onSetEnabled={onSetEnabled}
              onRunNow={onRunNow}
              onDelete={onDelete}
              onSave={onSave}
              confirm={confirm}
            />
          ))
        ) : expanded ? null : (
          <div className={styles.scheduleEmpty}>
            <p>
              <strong>No schedules yet.</strong> Sia can do something here on its own — once
              later, or on repeat.
            </p>
            <div className={styles.scheduleIdeas} aria-label="Schedule ideas" role="group">
              {SCHEDULE_IDEAS.map((idea) => (
                <button
                  type="button"
                  key={idea.label}
                  disabled={busy}
                  onClick={() => openForm(valuesFromDraft(idea.draft(new Date())))}
                >
                  <Lightbulb size={14} aria-hidden="true" />
                  {idea.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface ScheduleIdea {
  label: string;
  draft(now: Date): ScheduleDraft;
}

/** Starting points for an empty schedule list; each fills the form for the person to adjust. */
const SCHEDULE_IDEAS: readonly ScheduleIdea[] = [
  {
    label: 'Every morning, summarize my inbox',
    draft: (now) => ({
      prompt: 'Summarize my inbox and tell me what needs a reply',
      cadence: 'daily',
      runAt: toLocalInput(nextAt(now, 8)),
      maxRuns: 30,
    }),
  },
  {
    label: 'Every Friday, recap my week',
    draft: (now) => ({
      prompt: 'Recap what I worked on this week and what is still open',
      cadence: 'weekly',
      runAt: toLocalInput(nextAt(now, 16, 5)),
      days: [5],
      maxRuns: 10,
    }),
  },
  {
    label: 'In an hour, check back on this',
    draft: (now) => ({
      prompt: 'Check back on this conversation and tell me what changed',
      cadence: 'once',
      runAt: toLocalInput(new Date(now.getTime() + 60 * 60_000)),
      maxRuns: 1,
    }),
  },
];

function formatScheduleTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function scheduleRuns(schedule: ScheduleItem): readonly ScheduleRun[] {
  if (schedule.runHistory?.length) return schedule.runHistory;
  return schedule.lastRun ? [schedule.lastRun] : [];
}

function scheduleFinished(schedule: ScheduleItem): boolean {
  const runs = schedule.runCount ?? 0;
  return (
    (schedule.cadence === 'once' && runs > 0) ||
    (schedule.maxRuns !== undefined && runs >= schedule.maxRuns)
  );
}

function scheduleNextLabel(schedule: ScheduleItem): string {
  if (schedule.enabled) return `Next run ${friendlyScheduleTime(schedule.nextRunAt)}`;
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
