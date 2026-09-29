/** Plain-language wording and time helpers for schedules. */

export type ScheduleCadence = 'once' | 'hourly' | 'daily' | 'weekly';

export const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  once: 'Once',
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every week',
};

/** The next local time at `hour`:00, optionally on a given weekday (0 = Sunday). */
export function nextAt(now: Date, hour: number, weekday?: number): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (weekday !== undefined) next.setDate(next.getDate() + ((weekday - next.getDay() + 7) % 7));
  if (next <= now) next.setDate(next.getDate() + (weekday === undefined ? 1 : 7));
  return next;
}

/** A value for a datetime-local input, in local time. */
export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** "today at 9:00 AM", "tomorrow at 9:00 AM", or "Fri, Oct 3 at 4:00 PM". */
export function friendlyScheduleTime(value: string | Date, now = new Date()): string {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
  return `${day} at ${time}`;
}

/** One plain sentence that says what the form will create. */
export function describeScheduleDraft(
  cadence: ScheduleCadence,
  runAt: string,
  maxRuns: number | undefined,
  now = new Date(),
): string {
  const start = runAt && !Number.isNaN(new Date(runAt).getTime()) ? new Date(runAt) : undefined;
  if (cadence === 'once')
    return start
      ? `Runs once, ${friendlyScheduleTime(start, now)}.`
      : 'Runs once, as soon as this conversation is free.';
  const unit = cadence === 'hourly' ? 'hour' : cadence === 'daily' ? 'day' : 'week';
  const from = start
    ? `starting ${friendlyScheduleTime(start, now)}`
    : `starting one ${unit} from now`;
  const limit = maxRuns
    ? `, ${maxRuns.toLocaleString()} ${maxRuns === 1 ? 'time' : 'times'} in all`
    : '';
  return `Runs every ${unit}, ${from}${limit}.`;
}
