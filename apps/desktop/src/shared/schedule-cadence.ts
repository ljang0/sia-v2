/**
 * How often a schedule repeats, and when it runs next. Shared by the desktop controller (which
 * advances schedules) and the renderer (which previews them), so both agree on every run time.
 *
 * Day-based cadences keep the local time of day across daylight-saving changes: they step whole
 * calendar days in the Mac's time zone rather than adding 24 hours.
 */

export const SCHEDULE_CADENCES = ['once', 'hourly', 'daily', 'weekdays', 'weekly'] as const;
export type ScheduleCadence = (typeof SCHEDULE_CADENCES)[number];

/** 0 = Sunday … 6 = Saturday, as Date#getDay returns. */
export type ScheduleDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const SCHEDULE_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export const WEEKDAYS: readonly ScheduleDay[] = [1, 2, 3, 4, 5];
export const MAX_EVERY_HOURS = 24;

export interface ScheduleRule {
  cadence: ScheduleCadence;
  /** Weekly only: the days it runs. Missing means the weekday of its first run. */
  days?: readonly number[] | undefined;
  /** Hourly only: hours between runs. Missing means 1. */
  everyHours?: number | undefined;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** Unique, sorted, whole days from 0 to 6. */
export function normalizeScheduleDays(days: readonly number[] | undefined): ScheduleDay[] {
  return [...new Set(days ?? [])]
    .filter((day): day is ScheduleDay => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right);
}

export function everyHoursOf(rule: ScheduleRule): number {
  const hours = rule.everyHours ?? 1;
  return Number.isInteger(hours) && hours >= 1 && hours <= MAX_EVERY_HOURS ? hours : 1;
}

/** The days a day-based cadence runs on, or undefined for every day / not day-based. */
export function scheduleRunDays(
  rule: ScheduleRule,
  anchor: Date,
): readonly ScheduleDay[] | undefined {
  if (rule.cadence === 'weekdays') return WEEKDAYS;
  if (rule.cadence !== 'weekly') return undefined;
  const days = normalizeScheduleDays(rule.days);
  return days.length ? days : [anchor.getDay() as ScheduleDay];
}

function isDayBased(cadence: ScheduleCadence): boolean {
  return cadence === 'daily' || cadence === 'weekdays' || cadence === 'weekly';
}

function allowedOn(rule: ScheduleRule, anchor: Date, date: Date): boolean {
  const days = scheduleRunDays(rule, anchor);
  return !days || days.includes(date.getDay() as ScheduleDay);
}

/** Moves a day-based start forward to the first day it may run, keeping its time of day. */
export function alignScheduleStart(rule: ScheduleRule, start: Date): Date {
  const aligned = new Date(start);
  if (!isDayBased(rule.cadence)) return aligned;
  for (let step = 0; step < 7 && !allowedOn(rule, start, aligned); step += 1) {
    aligned.setDate(aligned.getDate() + 1);
  }
  return aligned;
}

/** The first run after `now` at a local time of day, for a day-based cadence. */
export function firstScheduleRunAt(
  rule: ScheduleRule,
  time: { hour: number; minute: number },
  now: Date,
): Date {
  const candidate = new Date(now);
  candidate.setHours(time.hour, time.minute, 0, 0);
  const anchor = rule.cadence === 'weekly' && !rule.days?.length ? now : candidate;
  for (
    let step = 0;
    step < 8 && (candidate <= now || !allowedOn(rule, anchor, candidate));
    step += 1
  ) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/** When a schedule first runs if nobody picked a time: one interval from now. */
export function defaultFirstScheduleRun(rule: ScheduleRule, now: Date): Date {
  if (rule.cadence === 'once') return new Date(now);
  if (rule.cadence === 'hourly') return new Date(now.getTime() + everyHoursOf(rule) * HOUR_MS);
  return alignScheduleStart(rule, new Date(now.getTime() + DAY_MS));
}

/**
 * The run after `previous` that is later than `now`, or undefined for a one-time schedule.
 * Missed runs while the Mac slept are skipped rather than replayed.
 */
export function nextScheduleRun(
  rule: ScheduleRule,
  previous: Date,
  now: Date,
): Date | undefined {
  if (rule.cadence === 'once') return undefined;
  if (rule.cadence === 'hourly') {
    const step = everyHoursOf(rule) * HOUR_MS;
    const behind = Math.max(0, now.getTime() - previous.getTime());
    return new Date(previous.getTime() + (Math.floor(behind / step) + 1) * step);
  }
  const next = new Date(previous);
  // A long-idle schedule starts the day before today instead of walking every missed day.
  if (now.getTime() - previous.getTime() > 8 * DAY_MS) {
    next.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  }
  for (let step = 0; step < 16; step += 1) {
    next.setDate(next.getDate() + 1);
    if (next > now && allowedOn(rule, previous, next)) return next;
  }
  return next;
}
