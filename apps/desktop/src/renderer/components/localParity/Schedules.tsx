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
import type { RendererApi, RendererSnapshot, ScheduleChanges, ScheduleRun } from '../../types';
import { threadDisplayTitle } from '../../threadTitle';
import layout from '../../styles/layout.module.css';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import surface from './localParity.module.css';
import ui from '../../ui.module.css';
import styles from './Schedules.module.css';
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
import { shortDateTime } from '../../format';

interface ScheduleItem {
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

interface ScheduleDraft {
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
  /** Empty means no limit: a recurring schedule repeats until paused or deleted. */
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

function ScheduleRow({
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
            // An edit counts the runs still to come; a finished one starts again with no limit.
            maxRuns:
              schedule.cadence === 'once'
                ? '1'
                : schedule.maxRuns !== undefined && remaining > 0
                  ? String(remaining)
                  : '',
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
              maxRuns:
                draft.cadence === 'once'
                  ? runCount + 1
                  : draft.maxRuns
                    ? runCount + draft.maxRuns
                    : null,
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
                {shortDateTime(scheduleRunTimestamp(schedule.lastRun))}
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
            className={buttons.secondaryButton}
            disabled={busy}
            onClick={() => void onSetEnabled(schedule.id, !schedule.enabled)}
          >
            {schedule.enabled ? 'Pause' : 'Resume'}
          </button>
        ) : null}
        {onRunNow ? (
          <button
            type="button"
            className={buttons.secondaryButton}
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
            className={buttons.iconButtonSmall}
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
          className={buttons.iconButtonSmall}
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
                {shortDateTime(scheduleRunTimestamp(run))}
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
    <section className={surface.scheduleControl} aria-labelledby={titleId}>
      {confirmDialog}
      <div className={surface.localSurfaceHeader}>
        <div>
          <span className={ui.sectionLabel}>Runs while Sia is open</span>
          <h2 id={titleId}>Schedules</h2>
        </div>
        <button
          type="button"
          className={buttons.secondaryButton}
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

      <div className={surface.scheduleList}>
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

interface ScheduledEntry extends ScheduleItem {
  threadId: string;
  /** "Agent · Conversation". */
  context: string;
}

interface ScheduledOverviewProps {
  schedules: readonly ScheduledEntry[];
  busy?: boolean | undefined;
  openAtLogin?: boolean | undefined;
  onSetOpenAtLogin?: ((enabled: boolean) => Promise<void>) | undefined;
  onOpenThread(threadId: string): void;
  onSave(scheduleId: string, changes: ScheduleChanges): Promise<void> | void;
  onSetEnabled(scheduleId: string, enabled: boolean): Promise<void> | void;
  onRunNow(scheduleId: string): Promise<void> | void;
  onDelete(scheduleId: string): Promise<void> | void;
}

/** Every schedule across agents and conversations, soonest first. */
export function ScheduledOverview({
  schedules,
  busy,
  openAtLogin = false,
  onSetOpenAtLogin,
  onOpenThread,
  onSave,
  onSetEnabled,
  onRunNow,
  onDelete,
}: ScheduledOverviewProps) {
  const [confirm, confirmDialog] = useConfirmDialog();
  const titleId = useId();
  const ordered = [...schedules].sort(
    (left, right) =>
      scheduleRank(left) - scheduleRank(right) || left.nextRunAt.localeCompare(right.nextRunAt),
  );
  const counts = [
    [schedules.filter((schedule) => scheduleRank(schedule) === 0).length, 'active'],
    [schedules.filter((schedule) => scheduleRank(schedule) === 1).length, 'paused'],
    [schedules.filter((schedule) => scheduleRank(schedule) === 2).length, 'finished'],
  ] as const;
  const summary = counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count.toLocaleString()} ${label}`)
    .join(' · ');

  return (
    <section className={surface.scheduledOverview} aria-labelledby={titleId}>
      {confirmDialog}
      <div className={surface.localSurfaceHeader}>
        <h2 id={titleId}>{summary || 'No schedules'}</h2>
      </div>
      {onSetOpenAtLogin ? (
        <StartupSettings
          compact
          openAtLogin={openAtLogin}
          onSetOpenAtLogin={onSetOpenAtLogin}
        />
      ) : null}
      <div className={surface.scheduleList}>
        {ordered.length ? (
          ordered.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              schedule={schedule}
              busy={busy}
              context={schedule.context}
              onOpen={() => onOpenThread(schedule.threadId)}
              onSetEnabled={onSetEnabled}
              onRunNow={onRunNow}
              onDelete={onDelete}
              onSave={onSave}
              confirm={confirm}
            />
          ))
        ) : (
          <div className={styles.scheduleEmpty}>
            <p>
              <strong>Nothing scheduled yet.</strong> Ask any agent to do something later or on
              repeat — “Every weekday at 8, summarize my inbox” — or open a conversation and
              choose Tools → Schedules.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

interface ScheduledPageProps {
  snapshot: RendererSnapshot;
  api: RendererApi;
  run(action: () => Promise<unknown>): Promise<void>;
  /** Like run, but rejects after reporting so an edit can keep what the person typed. */
  attempt(action: () => Promise<unknown>): Promise<void>;
  onOpenThread(threadId: string, archived: boolean): void;
  onClose(): void;
}

/** The Scheduled page: one place for every schedule, reached from the sidebar. */
export function ScheduledPage({
  snapshot,
  api,
  run,
  attempt,
  onOpenThread,
  onClose,
}: ScheduledPageProps) {
  const threads = new Map<string, { title: string; agentName: string; archived: boolean }>();
  for (const agent of snapshot.agents) {
    for (const thread of agent.threads)
      threads.set(thread.id, {
        title: threadDisplayTitle(thread.title),
        agentName: agent.name,
        archived: false,
      });
  }
  for (const thread of snapshot.archivedThreads) {
    threads.set(thread.id, {
      title: threadDisplayTitle(thread.title),
      agentName: snapshot.agents.find(({ id }) => id === thread.agentId)?.name ?? 'Agent',
      archived: true,
    });
  }
  const entries: ScheduledEntry[] = snapshot.schedules.map((schedule) => {
    const thread = threads.get(schedule.threadId);
    return {
      ...schedule,
      label: schedule.prompt,
      enabled: schedule.enabled !== false,
      context: thread
        ? `${thread.agentName} · ${thread.title}${thread.archived ? ' (archived)' : ''}`
        : 'Conversation removed',
    };
  });

  return (
    <main className={layout.activityPage} aria-labelledby="scheduled-page-title">
      <header className={layout.activityPageHeader}>
        <div>
          <h1 id="scheduled-page-title">Scheduled</h1>
          <p>Everything your agents will do on their own, in one place.</p>
        </div>
        <button
          type="button"
          className={buttons.iconButton}
          onClick={onClose}
          aria-label="Close scheduled"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.scheduledPageContent}>
        <ScheduledOverview
          schedules={entries}
          openAtLogin={snapshot.preferences.openAtLogin === true}
          onSetOpenAtLogin={(enabled) => api.setOpenAtLogin(enabled)}
          onOpenThread={(threadId) =>
            onOpenThread(threadId, threads.get(threadId)?.archived === true)
          }
          onSave={(scheduleId, changes) =>
            attempt(() => api.updateSchedule(scheduleId, changes))
          }
          onSetEnabled={(scheduleId, enabled) =>
            run(() => api.setScheduleEnabled(scheduleId, enabled))
          }
          onRunNow={(scheduleId) => run(() => api.runScheduleNow(scheduleId))}
          onDelete={(scheduleId) => run(() => api.deleteSchedule(scheduleId))}
        />
      </div>
    </main>
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
    }),
  },
  {
    label: 'Every Friday, recap my week',
    draft: (now) => ({
      prompt: 'Recap what I worked on this week and what is still open',
      cadence: 'weekly',
      runAt: toLocalInput(nextAt(now, 16, 5)),
      days: [5],
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

/** Active first, then paused, then finished. */
function scheduleRank(schedule: ScheduleItem): number {
  if (schedule.enabled) return 0;
  return scheduleFinished(schedule) ? 2 : 1;
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
