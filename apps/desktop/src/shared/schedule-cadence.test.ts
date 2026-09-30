import { describe, expect, it } from 'vitest';
import {
  alignScheduleStart,
  defaultFirstScheduleRun,
  firstScheduleRunAt,
  nextScheduleRun,
  normalizeScheduleDays,
} from './schedule-cadence';

/** Local time, so the assertions hold in any time zone. */
const at = (year: number, month: number, day: number, hour = 8, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

// 2030-08-23 is a Friday.
const friday = at(2030, 8, 23);

describe('schedule cadence', () => {
  it('runs weekday schedules Monday to Friday at the same local time', () => {
    const rule = { cadence: 'weekdays' as const };
    expect(nextScheduleRun(rule, friday, friday)).toEqual(at(2030, 8, 26));
    expect(nextScheduleRun(rule, at(2030, 8, 26), at(2030, 8, 26))).toEqual(at(2030, 8, 27));
    expect(alignScheduleStart(rule, at(2030, 8, 24, 9, 30))).toEqual(at(2030, 8, 26, 9, 30));
  });

  it('runs weekly schedules only on the chosen days', () => {
    const rule = { cadence: 'weekly' as const, days: [1, 4] };
    expect(nextScheduleRun(rule, at(2030, 8, 26), at(2030, 8, 26))).toEqual(at(2030, 8, 29));
    expect(nextScheduleRun(rule, at(2030, 8, 29), at(2030, 8, 29))).toEqual(at(2030, 9, 2));
    expect(alignScheduleStart(rule, friday)).toEqual(at(2030, 8, 26));
  });

  it('keeps a weekly schedule without chosen days on its own weekday', () => {
    expect(nextScheduleRun({ cadence: 'weekly' }, friday, friday)).toEqual(at(2030, 8, 30));
  });

  it('keeps the local time of day across daylight-saving changes', () => {
    const next = nextScheduleRun({ cadence: 'daily' }, at(2030, 3, 9, 8), at(2030, 3, 9, 8));
    expect(next?.getHours()).toBe(8);
    expect(next?.getDate()).toBe(10);
  });

  it('skips runs missed while the Mac was asleep instead of replaying them', () => {
    const now = at(2030, 9, 20, 12);
    expect(nextScheduleRun({ cadence: 'daily' }, at(2030, 1, 1), now)).toEqual(at(2030, 9, 21));
    const hourly = nextScheduleRun(
      { cadence: 'hourly', everyHours: 3 },
      at(2030, 9, 20, 8),
      now,
    );
    expect(hourly).toEqual(at(2030, 9, 20, 14));
  });

  it('does not repeat one-time schedules', () => {
    expect(nextScheduleRun({ cadence: 'once' }, friday, friday)).toBeUndefined();
  });

  it('finds the first run at a chosen time of day', () => {
    expect(
      firstScheduleRunAt({ cadence: 'weekdays' }, { hour: 8, minute: 0 }, at(2030, 8, 23, 9)),
    ).toEqual(at(2030, 8, 26));
    expect(
      firstScheduleRunAt({ cadence: 'daily' }, { hour: 8, minute: 0 }, at(2030, 8, 23, 7)),
    ).toEqual(friday);
    expect(
      firstScheduleRunAt(
        { cadence: 'weekly', days: [3] },
        { hour: 16, minute: 30 },
        at(2030, 8, 23, 7),
      ),
    ).toEqual(at(2030, 8, 28, 16, 30));
  });

  it('starts recurring schedules one interval out when no time is given', () => {
    expect(defaultFirstScheduleRun({ cadence: 'hourly', everyHours: 4 }, friday)).toEqual(
      at(2030, 8, 23, 12),
    );
    expect(defaultFirstScheduleRun({ cadence: 'weekdays' }, friday)).toEqual(at(2030, 8, 26));
  });

  it('cleans chosen days', () => {
    expect(normalizeScheduleDays([5, 1, 5, 9, -1, 2.5])).toEqual([1, 5]);
  });
});
