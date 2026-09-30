import { describe, expect, it } from 'vitest';
import {
  describeCadence,
  describeScheduleDraft,
  friendlyScheduleTime,
  nextAt,
  toLocalInput,
} from './scheduleText';

// Local times throughout, so the assertions hold in any time zone.
const wednesdayMorning = new Date(2026, 8, 30, 7, 15);

describe('schedule wording', () => {
  it('finds the next matching local time', () => {
    expect(toLocalInput(nextAt(wednesdayMorning, 8))).toBe('2026-09-30T08:00');
    expect(toLocalInput(nextAt(wednesdayMorning, 6))).toBe('2026-10-01T06:00');
    // Friday at 4 PM, and a week later once that moment has passed.
    expect(toLocalInput(nextAt(wednesdayMorning, 16, 5))).toBe('2026-10-02T16:00');
    expect(toLocalInput(nextAt(new Date(2026, 9, 2, 17), 16, 5))).toBe('2026-10-09T16:00');
  });

  it('names today and tomorrow instead of dates', () => {
    expect(friendlyScheduleTime(new Date(2026, 8, 30, 9), wednesdayMorning)).toMatch(
      /^today at /,
    );
    expect(friendlyScheduleTime(new Date(2026, 9, 1, 9), wednesdayMorning)).toMatch(
      /^tomorrow at /,
    );
    expect(friendlyScheduleTime(new Date(2026, 9, 3, 9), wednesdayMorning)).not.toMatch(
      /today|tomorrow/,
    );
  });

  it('says what a draft will do in one sentence', () => {
    expect(
      describeScheduleDraft({ cadence: 'once', runAt: '', maxRuns: 1 }, wednesdayMorning),
    ).toBe('Runs once, as soon as this conversation is free.');
    expect(
      describeScheduleDraft(
        { cadence: 'hourly', runAt: '', everyHours: 3, maxRuns: 10 },
        wednesdayMorning,
      ),
    ).toBe('Runs every 3 hours, starting 3 hours from now, 10 times in all.');
    expect(
      describeScheduleDraft(
        { cadence: 'weekdays', runAt: '2026-10-01T08:00', maxRuns: 10 },
        wednesdayMorning,
      ),
    ).toMatch(/^Runs weekdays at 8:00.AM, starting tomorrow, 10 times in all\.$/);
    expect(
      describeScheduleDraft(
        { cadence: 'weekly', days: [4, 1], runAt: '2026-10-01T16:30', maxRuns: 1 },
        wednesdayMorning,
      ),
    ).toMatch(/^Runs on Mondays and Thursdays at 4:30.PM, starting tomorrow, 1 time in all\.$/);
  });

  it('names a saved cadence plainly', () => {
    const nextRunAt = new Date(2026, 9, 1, 8).toISOString();
    expect(describeCadence({ cadence: 'weekdays', nextRunAt })).toMatch(
      /^Weekdays at 8:00.AM$/,
    );
    expect(describeCadence({ cadence: 'daily', nextRunAt })).toMatch(/^Every day at 8:00.AM$/);
    expect(describeCadence({ cadence: 'weekly', days: [5], nextRunAt })).toMatch(
      /^Fridays at 8:00.AM$/,
    );
    expect(describeCadence({ cadence: 'weekly', days: [1, 3, 5, 6], nextRunAt })).toMatch(
      /^Mon, Wed, Fri, and Sat at 8:00.AM$/,
    );
    // A weekly schedule saved before chosen days runs on its next run's weekday (Thursday).
    expect(describeCadence({ cadence: 'weekly', nextRunAt })).toMatch(/^Thursdays at/);
    expect(describeCadence({ cadence: 'hourly', nextRunAt })).toBe('Every hour');
    expect(describeCadence({ cadence: 'hourly', everyHours: 4, nextRunAt })).toBe(
      'Every 4 hours',
    );
    expect(describeCadence({ cadence: 'once', nextRunAt })).toBe('Once');
  });
});
