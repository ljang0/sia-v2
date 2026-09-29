import { describe, expect, it } from 'vitest';
import {
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
    expect(describeScheduleDraft('once', '', 1, wednesdayMorning)).toBe(
      'Runs once, as soon as this conversation is free.',
    );
    expect(describeScheduleDraft('daily', '', 10, wednesdayMorning)).toBe(
      'Runs every day, starting one day from now, 10 times in all.',
    );
    expect(describeScheduleDraft('weekly', '2026-10-01T09:00', 1, wednesdayMorning)).toMatch(
      /^Runs every week, starting tomorrow at .+, 1 time in all\.$/,
    );
  });
});
