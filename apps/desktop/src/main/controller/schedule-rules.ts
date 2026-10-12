/** Validation and bookkeeping rules for scheduled tasks. */

import { SCHEDULE_RUN_HISTORY_LIMIT, type ScheduleView } from '../../shared/bridge.js';
import {
  everyHoursOf,
  normalizeScheduleDays,
  type ScheduleRule,
} from '../../shared/schedule-cadence.js';

export function validScheduleTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid schedule time.');
  return date.toISOString();
}

export function validScheduleRunLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error('Schedule run limit must be between 1 and 10,000.');
  }
  return value;
}

/** A one-time schedule runs once; recurring ones repeat until paused or deleted. */
export function defaultScheduleRunLimit(cadence: ScheduleView['cadence']): number | undefined {
  return cadence === 'once' ? 1 : undefined;
}

/** Recurring schedules used to stop after this many runs unless the person chose otherwise. */
export const LEGACY_RECURRING_RUN_LIMIT = 10;

/** Keeps only the details a cadence uses, so a saved schedule never carries stale ones. */
export function scheduleRuleFields(
  rule: ScheduleRule,
  firstRun: Date,
): Pick<ScheduleView, 'cadence' | 'days' | 'everyHours' | 'anchorAt'> {
  if (rule.cadence === 'monthly' || rule.cadence === 'yearly')
    return {
      cadence: rule.cadence,
      anchorAt: rule.anchorAt ? validScheduleTime(rule.anchorAt) : firstRun.toISOString(),
    };
  if (rule.cadence === 'weekly') {
    const days = normalizeScheduleDays(rule.days);
    return { cadence: 'weekly', days: days.length ? days : [firstRun.getDay()] };
  }
  if (rule.cadence === 'hourly' && rule.everyHours !== undefined) {
    return { cadence: 'hourly', everyHours: everyHoursOf(rule) };
  }
  return { cadence: rule.cadence };
}

export function upsertScheduleRun(
  schedule: ScheduleView,
  run: NonNullable<ScheduleView['lastRun']>,
): void {
  schedule.runHistory = [
    run,
    ...(schedule.runHistory ?? []).filter(({ id }) => id !== run.id),
  ].slice(0, SCHEDULE_RUN_HISTORY_LIMIT);
}
