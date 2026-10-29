import { expect, it } from 'vitest';
import { taskClock } from './task-clock.js';

it('anchors a week request to the local date across UTC midnight and daylight saving', () => {
  const late = taskClock(new Date('2026-10-24T01:30:00Z'), 'America/New_York');
  expect(late).toContain('Friday, October 23, 2026');
  expect(late).toContain('America/New_York');
  expect(late).toContain('2026-10-24T01:30:00.000Z');
  const dst = taskClock(new Date('2026-11-01T06:30:00Z'), 'America/New_York');
  expect(dst).toContain('Sunday, November 1, 2026');
  expect(dst).toContain('EST');
});
