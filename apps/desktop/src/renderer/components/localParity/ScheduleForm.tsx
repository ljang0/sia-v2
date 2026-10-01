import { Repeat } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import {
  defaultFirstScheduleRun,
  firstScheduleRunAt,
  MAX_EVERY_HOURS,
  normalizeScheduleDays,
} from '../../../shared/schedule-cadence';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import styles from './Schedules.module.css';
import {
  CADENCE_OPTIONS,
  describeScheduleDraft,
  toLocalInput,
  toTimeInput,
  weekdayName,
  type ScheduleCadence,
} from './scheduleText';

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

export interface FormValues {
  prompt: string;
  cadence: ScheduleCadence;
  /** Once: when. Every few hours: starting. Empty means "as soon as it can" / one interval. */
  when: string;
  /** Day-based cadences: time of day, "HH:MM". */
  time: string;
  days: number[];
  everyHours: string;
  /** Empty means no limit: a recurring schedule repeats until paused or deleted. */
  maxRuns: string;
}

export function blankValues(now = new Date()): FormValues {
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

export function valuesFromDraft(draft: ScheduleDraft): FormValues {
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
    maxRuns:
      draft.cadence === 'once' ? '1' : draft.maxRuns === undefined ? '' : String(draft.maxRuns),
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

export function ScheduleForm({
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
      <label className={dialogs.localField}>
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
        <label className={dialogs.localField}>
          <span>Repeat</span>
          <select
            data-testid="schedule-cadence-select"
            value={cadence}
            onChange={(event) => {
              const next = event.target.value as ScheduleCadence;
              const wasRepeating = cadence !== 'once';
              set({
                cadence: next,
                ...(next === 'once' ? { maxRuns: '1' } : wasRepeating ? {} : { maxRuns: '' }),
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
          <label className={dialogs.localField}>
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
          <label className={dialogs.localField}>
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
          <label className={dialogs.localField}>
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
          <label className={dialogs.localField}>
            <span>
              {runsLabel} <small aria-hidden="true">optional</small>
            </span>
            <span className={styles.scheduleRunsInput}>
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                inputMode="numeric"
                placeholder="No limit"
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
              className={buttons.secondaryButton}
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            className={buttons.primaryButton}
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
