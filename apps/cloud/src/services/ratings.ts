import { createHash } from 'node:crypto';
import {
  RATING_REASONS,
  TASK_OUTCOMES,
  type TaskRatingRecord,
  taskRatingRecordSchema,
} from '@sia/protocol/ratings';
import type { AuthContext } from '../contracts.js';
import { CloudError } from '../domain.js';
import type { RatingAggregateKey, StoredTaskRating } from '../ports.js';
import type { ServiceDependencies } from '../services.js';
import { requireBaseUser } from './access.js';
import { hostedLabs } from './meta.js';

/** Ratings and their daily counters back a sponsor's yearly report. */
export const RATING_RETENTION_SECONDS = 400 * 24 * 60 * 60;
/** Generous for a person rating their own tasks; stops a scripted flood. */
export const RATING_HOURLY_LIMIT = 120;
const REPORT_MAX_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pick and rate (docs/arena-ratings.md): accepts ratings and reports their daily roll-ups. */
export class RatingsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async submit(user: AuthContext, body: unknown): Promise<{ status: 'recorded' }> {
    requireBaseUser(user);
    const parsed = taskRatingRecordSchema.safeParse(body);
    if (!parsed.success)
      throw new CloudError(400, 'invalid_rating', 'The rating is not in the expected shape');
    const record = parsed.data;
    const now = this.deps.clock.now();
    const finished = Date.parse(record.task.finishedAt);
    if (
      finished > now.getTime() + 24 * 60 * 60 * 1000 ||
      finished < now.getTime() - 400 * DAY_MS
    )
      throw new CloudError(400, 'invalid_rating', 'The rated task time is out of range');
    const lab = await this.#verifiedLab(record);
    const hour = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
    if (
      !(await this.deps.ratings.consumeRatingLimit(
        user.subject,
        hour,
        Math.floor(hour / 1000) + 2 * 3600,
        RATING_HOURLY_LIMIT,
      ))
    )
      throw new CloudError(
        429,
        'rating_rate_limited',
        'Too many ratings. Try again later',
        true,
      );

    const { threadId: _thread, turnId, ...content } = record;
    const day = record.task.finishedAt.slice(0, 10);
    const rating: StoredTaskRating = {
      id: createHash('sha256')
        .update('sia-task-rating\0')
        .update(user.subject)
        .update('\0')
        .update(turnId)
        .digest('base64url')
        .slice(0, 32),
      labId: lab.id,
      day,
      model: record.route.model,
      harnessId: record.route.harnessId,
      record: { ...content, route: { ...content.route, lab } },
      receivedAt: now.toISOString(),
    };
    const expiresAt = Math.floor(now.getTime() / 1000) + RATING_RETENTION_SECONDS;
    await this.deps.ratings.writeRating(user.subject, rating, expiresAt);
    return { status: 'recorded' };
  }

  /**
   * Daily per-model, per-engine counts for one lab. Admin only. Returns counters, never a rating,
   * a comment, or anything that identifies a person.
   */
  async report(user: AuthContext, query: { lab?: string; from?: string; to?: string }) {
    await this.#requireAdmin(user);
    const labId = query.lab ?? '';
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(labId))
      throw new CloudError(400, 'invalid_lab', 'Choose a lab');
    const to = query.to ?? this.deps.clock.now().toISOString().slice(0, 10);
    const from = query.from ?? to;
    if (!DAY.test(from) || !DAY.test(to) || from > to)
      throw new CloudError(400, 'invalid_period', 'Choose a valid period');
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS > REPORT_MAX_DAYS)
      throw new CloudError(400, 'invalid_period', 'Choose a shorter period');
    const rows = await this.deps.ratings.listRatingAggregates(labId, from, to);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'ratings.report',
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
      opaqueResourceIds: [labId],
    });
    return {
      schemaVersion: 1 as const,
      lab: labId,
      from,
      to,
      rows: rows
        .sort(
          (a, b) =>
            a.day.localeCompare(b.day) ||
            a.model.localeCompare(b.model) ||
            a.harnessId.localeCompare(b.harnessId),
        )
        .map((row) => reportRow(row.day, row, row.counters)),
    };
  }

  /**
   * The lab a rating is filed under must be real: a configured hosted lab (whose name the cloud
   * supplies), the provider itself, or a signed lab harness's own id.
   */
  async #verifiedLab(record: TaskRatingRecord): Promise<{ id: string; name: string }> {
    const { lab, provider, harnessId } = record.route;
    const hosted = this.deps.config.features.hostedModels
      ? hostedLabs(await this.deps.secrets.meta())
      : [];
    const known = hosted.find(({ id }) => id === lab.id);
    if (known && provider === 'meta') return known;
    if (!known && (lab.id === provider || (provider === 'lab' && lab.id === harnessId)))
      return { id: lab.id, name: lab.name };
    throw new CloudError(400, 'unknown_lab', 'The rating names an unknown lab');
  }

  async #requireAdmin(user: AuthContext): Promise<void> {
    if (
      user.groups.includes('Admins') &&
      user.email &&
      (await this.deps.identity.hasMfa(user.email))
    )
      return;
    await this.deps.audit.write({
      userId: user.subject,
      action: 'ratings.report',
      outcome: 'denied',
      occurredAt: this.deps.clock.now().toISOString(),
      errorCode: user.groups.includes('Admins') ? 'admin_mfa_required' : 'admin_required',
    });
    throw new CloudError(
      403,
      'admin_required',
      'Admin access with an authenticator is required',
    );
  }
}

function reportRow(
  day: string,
  key: Omit<RatingAggregateKey, 'day'>,
  counters: Record<string, number>,
) {
  const count = (name: string) => Math.max(0, counters[name] ?? 0);
  const ratings = count('ratings');
  return {
    day,
    lab: { id: key.labId, name: key.labName },
    provider: key.provider,
    model: key.model,
    harnessId: key.harnessId,
    ratings,
    good: count('good'),
    bad: count('bad'),
    reasons: Object.fromEntries(
      RATING_REASONS.map((reason) => [reason, count(`reason_${reason}`)]),
    ),
    outcomes: Object.fromEntries(
      TASK_OUTCOMES.map((outcome) => [outcome, count(`outcome_${outcome}`)]),
    ),
    comments: count('comments'),
    usedComputer: count('usedComputer'),
    usedBrowser: count('usedBrowser'),
    averageDurationMs: ratings ? Math.round(count('durationMsTotal') / ratings) : 0,
    averageSteps: ratings ? Math.round((count('stepsTotal') / ratings) * 10) / 10 : 0,
  };
}
