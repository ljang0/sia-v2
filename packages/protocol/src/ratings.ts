import { z } from 'zod';
import { harnessIdSchema, isoDateSchema, providerIdSchema } from './index.js';

/**
 * Pick and rate (docs/arena-ratings.md): one rating per finished task. The record carries the
 * exact route and a few counters captured by the desktop main process. It has no field for a
 * prompt, a reply, a file, or the screen; `.strict()` rejects any extra field, so content cannot
 * ride along. The only free text is the optional comment the person typed and confirmed.
 */
export const TASK_RATINGS = ['good', 'bad'] as const;
export type TaskRatingValue = (typeof TASK_RATINGS)[number];

export const GOOD_RATING_REASONS = ['did_it_right', 'fast', 'careful'] as const;
export const BAD_RATING_REASONS = [
  'wrong_result',
  'got_stuck',
  'too_slow',
  'unsafe_or_asked_too_much',
  'did_not_finish',
] as const;
export const RATING_REASONS = [...GOOD_RATING_REASONS, ...BAD_RATING_REASONS] as const;
export type RatingReason = (typeof RATING_REASONS)[number];

export const TASK_OUTCOMES = ['completed', 'failed', 'cancelled'] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

export const RATING_COMMENT_MAX_CHARS = 500;

/** Model ids become part of a storage key, so `#` and whitespace are not allowed. */
export const ratingModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:/@+-]+$/);
export const ratingLabSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_-]*$/),
    name: z.string().trim().min(1).max(120),
  })
  .strict();
const ratingIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const taskRatingRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    threadId: ratingIdSchema,
    turnId: ratingIdSchema,
    rating: z.enum(TASK_RATINGS),
    reasons: z.array(z.enum(RATING_REASONS)).max(RATING_REASONS.length),
    comment: z.string().trim().min(1).max(RATING_COMMENT_MAX_CHARS).optional(),
    route: z
      .object({
        provider: providerIdSchema,
        lab: ratingLabSchema,
        model: ratingModelIdSchema,
        harnessId: harnessIdSchema,
      })
      .strict(),
    task: z
      .object({
        outcome: z.enum(TASK_OUTCOMES),
        durationMs: z
          .number()
          .int()
          .min(0)
          .max(7 * 24 * 60 * 60 * 1000),
        stepCount: z.number().int().min(0).max(100_000),
        usedComputer: z.boolean(),
        usedBrowser: z.boolean(),
        finishedAt: isoDateSchema,
      })
      .strict(),
    appVersion: z.string().trim().min(1).max(64),
    createdAt: isoDateSchema,
  })
  .strict()
  .superRefine((record, context) => {
    const allowed: readonly string[] =
      record.rating === 'good' ? GOOD_RATING_REASONS : BAD_RATING_REASONS;
    if (new Set(record.reasons).size !== record.reasons.length)
      context.addIssue({ code: 'custom', path: ['reasons'], message: 'Duplicate reason.' });
    for (const reason of record.reasons)
      if (!allowed.includes(reason))
        context.addIssue({
          code: 'custom',
          path: ['reasons'],
          message: `Reason ${reason} does not match a ${record.rating} rating.`,
        });
  });
export type TaskRatingRecord = z.infer<typeof taskRatingRecordSchema>;
