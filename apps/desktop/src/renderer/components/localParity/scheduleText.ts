/** Plain-language wording and time helpers for schedules. */

import {
  everyHoursOf,
  normalizeScheduleDays,
  scheduleRunDays,
  type ScheduleCadence,
  type ScheduleRule,
} from '../../../shared/schedule-cadence';

export type { ScheduleCadence } from '../../../shared/schedule-cadence';

/** The Repeat choices, in the order the form offers them. */
export const CADENCE_OPTIONS: readonly { value: ScheduleCadence; label: string }[] = [
  { value: 'once', label: 'Just once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'On certain days' },
  { value: 'hourly', label: 'Every few hours' },
];

/** The next local time at `hour`:00, optionally on a given weekday (0 = Sunday). */
export function nextAt(now: Date, hour: number, weekday?: number): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (weekday !== undefined) next.setDate(next.getDate() + ((weekday - next.getDay() + 7) % 7));
  if (next <= now) next.setDate(next.getDate() + (weekday === undefined ? 1 : 7));
  return next;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** A value for a datetime-local input, in local time. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** A value for a time input ("08:30"), in local time. */
export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function clockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
}

/** "today", "tomorrow", or "Fri, Oct 3". */
export function friendlyScheduleDay(value: string | Date, now = new Date()): string {
  const date = new Date(value);
  const startOfDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** "today at 9:00 AM", "tomorrow at 9:00 AM", or "Fri, Oct 3 at 4:00 PM". */
export function friendlyScheduleTime(value: string | Date, now = new Date()): string {
  return `${friendlyScheduleDay(value, now)} at ${clockTime(new Date(value))}`;
}

/** Weekday names in the reader's language; 0 = Sunday. 2030-09-01 is a Sunday. */
export function weekdayName(day: number, width: 'long' | 'short' | 'narrow' = 'long'): string {
  return new Intl.DateTimeFormat(undefined, { weekday: width }).format(
    new Date(2030, 8, 1 + day),
  );
}

function listOf(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

/** "Every day", "Weekdays", "Mondays and Thursdays", "Every 3 hours". */
function cadencePhrase(rule: ScheduleRule, anchor: Date): string {
  if (rule.cadence === 'once') return 'Once';
  if (rule.cadence === 'hourly') {
    const hours = everyHoursOf(rule);
    return hours === 1 ? 'Every hour' : `Every ${hours} hours`;
  }
  if (rule.cadence === 'daily') return 'Every day';
  const days = scheduleRunDays(rule, anchor) ?? [];
  if (days.length === 7) return 'Every day';
  if (days.length === 5 && days.every((day) => day >= 1 && day <= 5)) return 'Weekdays';
  if (days.length === 2 && days[0] === 0 && days[1] === 6) return 'Weekends';
  if (days.length > 3) return listOf(days.map((day) => weekdayName(day, 'short')));
  return listOf(days.map((day) => `${weekdayName(day)}s`));
}

/** One plain line for a saved schedule: "Weekdays at 8:00 AM", "Every 3 hours", "Once". */
export function describeCadence(schedule: ScheduleRule & { nextRunAt: string }): string {
  const anchor = new Date(schedule.nextRunAt);
  const phrase = cadencePhrase(schedule, anchor);
  if (schedule.cadence === 'once' || schedule.cadence === 'hourly') return phrase;
  return `${phrase} at ${clockTime(anchor)}`;
}

export interface ScheduleDraftSummary extends ScheduleRule {
  /** A local datetime or ISO string; empty means "as soon as possible" for a one-time run. */
  runAt: string;
  maxRuns?: number | undefined;
}

/** One plain sentence that says what the form will create. */
export function describeScheduleDraft(draft: ScheduleDraftSummary, now = new Date()): string {
  const { runAt, maxRuns } = draft;
  const start = runAt && !Number.isNaN(new Date(runAt).getTime()) ? new Date(runAt) : undefined;
  if (draft.cadence === 'once')
    return start
      ? `Runs once, ${friendlyScheduleTime(start, now)}.`
      : 'Runs once, as soon as this conversation is free.';
  const limit = maxRuns
    ? `, ${maxRuns.toLocaleString()} ${maxRuns === 1 ? 'time' : 'times'} in all`
    : '';
  const rule = { ...draft, days: normalizeScheduleDays(draft.days) };
  if (draft.cadence === 'hourly') {
    const hours = everyHoursOf(draft);
    const from = start
      ? `starting ${friendlyScheduleTime(start, now)}`
      : `starting ${hours === 1 ? 'one hour' : `${hours} hours`} from now`;
    return `Runs ${cadencePhrase(rule, now).toLowerCase()}, ${from}${limit}.`;
  }
  if (!start) return `Runs ${cadencePhrase(rule, now).toLowerCase()}${limit}.`;
  const phrase = cadencePhrase(rule, start);
  // Day names stay capitalized; "Every day" and "Weekdays" read as part of the sentence.
  const lead = /^(Every|Weekdays|Weekends)/.test(phrase)
    ? phrase.toLowerCase()
    : `on ${phrase}`;
  return `Runs ${lead} at ${clockTime(start)}, starting ${friendlyScheduleDay(start, now)}${limit}.`;
}
