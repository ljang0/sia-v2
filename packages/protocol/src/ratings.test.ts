import { describe, expect, it } from 'vitest';
import { taskRatingRecordSchema } from './ratings.js';

const valid = {
  schemaVersion: 1,
  threadId: 'thread-1',
  turnId: 'turn-1',
  rating: 'bad',
  reasons: ['got_stuck', 'too_slow'],
  route: {
    provider: 'meta',
    lab: { id: 'meta', name: 'Meta' },
    model: 'llama-5',
    harnessId: 'codex_app_server',
  },
  task: {
    outcome: 'failed',
    durationMs: 42_000,
    stepCount: 7,
    usedComputer: true,
    usedBrowser: false,
    finishedAt: '2026-10-20T10:00:00.000Z',
  },
  appVersion: '0.1.0-alpha.28',
  createdAt: '2026-10-20T10:01:00.000Z',
};

describe('task rating record', () => {
  it('accepts a route-only rating', () => {
    expect(taskRatingRecordSchema.parse(valid)).toEqual(valid);
  });

  it('rejects content fields anywhere in the record', () => {
    for (const extra of [
      { prompt: 'secret' },
      { reply: 'secret' },
      { screenshot: 'data:image/png;base64,AA' },
    ]) {
      expect(taskRatingRecordSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
      expect(
        taskRatingRecordSchema.safeParse({ ...valid, task: { ...valid.task, ...extra } })
          .success,
      ).toBe(false);
      expect(
        taskRatingRecordSchema.safeParse({ ...valid, route: { ...valid.route, ...extra } })
          .success,
      ).toBe(false);
    }
  });

  it('keeps reasons on the side of the rating and comments short', () => {
    expect(taskRatingRecordSchema.safeParse({ ...valid, reasons: ['fast'] }).success).toBe(
      false,
    );
    expect(
      taskRatingRecordSchema.safeParse({ ...valid, reasons: ['got_stuck', 'got_stuck'] })
        .success,
    ).toBe(false);
    expect(
      taskRatingRecordSchema.safeParse({ ...valid, comment: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(
      taskRatingRecordSchema.safeParse({ ...valid, comment: 'Too many popups' }).success,
    ).toBe(true);
  });

  it('rejects model ids that would break a storage key', () => {
    expect(
      taskRatingRecordSchema.safeParse({ ...valid, route: { ...valid.route, model: 'a#b' } })
        .success,
    ).toBe(false);
  });
});
