import {
  type RatingReason as ProtocolRatingReason,
  type TaskOutcome,
  type TaskRatingRecord,
  taskRatingRecordSchema,
} from '@sia/protocol/ratings';
import type {
  DesktopSnapshot,
  RatingReason,
  SubmitRatingInput,
  TurnRatingView,
} from '../../shared/bridge.js';
import { reasonsFor } from '../../shared/bridge.js';
import type { ControllerContext } from './context.js';
import { legacyResolvedExecutionTarget } from './execution-routes.js';
import type { QueuedTurn } from './types.js';

// The renderer-safe reason list must stay identical to the cloud contract.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const reasonsMatch: Same<RatingReason, ProtocolRatingReason> = true;
void reasonsMatch;

/** The facts of one finished task, captured by the main process when the turn ends. */
export interface FinishedTaskRecord {
  threadId: string;
  turnId: string;
  route: TaskRatingRecord['route'];
  task: TaskRatingRecord['task'];
}

interface StoredRating {
  record: TaskRatingRecord;
  /** The signed-in identity the rating belongs to; it syncs only under that identity. */
  identity?: string;
  synced: boolean;
}

const TASKS = 'rating_tasks';
const RATINGS = 'ratings';
/** Oldest finished-task facts are dropped past this; their ratings stay until synced. */
const MAX_TASK_RECORDS = 1_000;
const COMPUTER_TOOL = /(^|[^a-z])computer_/;
const BROWSER_TOOL = /(^|[^a-z])browser_/;

type RatingsContext = Pick<
  ControllerContext,
  'account' | 'commit' | 'deps' | 'providers' | 'resultSnapshot' | 'state'
>;

/**
 * Pick and rate (docs/arena-ratings.md): records each finished task's route, stores the
 * person's rating in the encrypted repository, and syncs it to Sia cloud with retry. No prompt,
 * reply, file, or screen content is stored with a rating or sent.
 */
export class TaskRatings {
  inFlightSync: Promise<void> | undefined;
  retryTimer: NodeJS.Timeout | undefined;
  retryDelayMs = 15_000;

  #tasks: Map<string, FinishedTaskRecord> | undefined;
  #ratings: Map<string, StoredRating> | undefined;

  constructor(private readonly ctx: RatingsContext) {}

  /** Decrypted once, then kept in memory: snapshots read these on every push. */
  private tasks(): Map<string, FinishedTaskRecord> {
    this.#tasks ??= new Map(
      this.ctx.deps.repository
        .list<FinishedTaskRecord>(TASKS)
        .map((record) => [record.turnId, record]),
    );
    return this.#tasks;
  }

  private ratings(): Map<string, StoredRating> {
    this.#ratings ??= new Map(
      this.ctx.deps.repository
        .list<StoredRating>(RATINGS)
        .map((stored) => [stored.record.turnId, stored]),
    );
    return this.#ratings;
  }

  private putRating(stored: StoredRating): void {
    this.ctx.deps.repository.put<StoredRating>(RATINGS, stored.record.turnId, stored);
    this.ratings().set(stored.record.turnId, stored);
  }

  /** Called once when a turn ends, whatever ended it. */
  recordFinishedTask(
    turn: QueuedTurn,
    outcome: TaskOutcome,
    startedAt: number,
    nativeComputerUse: boolean,
  ): void {
    if (turn.source === 'review') return;
    const thread = this.ctx.state.threads.find(({ id }) => id === turn.threadId);
    if (!thread) return;
    const target = thread.resolvedExecutionTarget ?? legacyResolvedExecutionTarget(thread);
    const tools = this.ctx.state.timeline
      .filter(
        (item) =>
          item.threadId === turn.threadId &&
          item.turnId === turn.id &&
          item.kind === 'activity' &&
          // Model tool calls carry a call id; Sia's own status rows ("Starting Codex") do not.
          item.toolCallId !== undefined,
      )
      .map((item) => (item.toolName ?? '').replace(/[.-]/g, '_').toLowerCase());
    const finishedAt = Date.now();
    const record: FinishedTaskRecord = {
      threadId: turn.threadId,
      turnId: turn.id,
      route: {
        provider: target.provider,
        lab: this.ctx.providers.labFor(target.provider, target.model),
        model: target.model,
        harnessId: target.harnessId,
      },
      task: {
        outcome,
        durationMs: Math.max(0, Math.min(finishedAt - startedAt, 7 * 24 * 60 * 60 * 1000)),
        stepCount: tools.length,
        usedComputer: nativeComputerUse || tools.some((name) => COMPUTER_TOOL.test(name)),
        usedBrowser: tools.some((name) => BROWSER_TOOL.test(name)),
        finishedAt: new Date(finishedAt).toISOString(),
      },
    };
    try {
      const tasks = this.tasks();
      this.ctx.deps.repository.put(TASKS, turn.id, record);
      tasks.set(turn.id, record);
      if (tasks.size > MAX_TASK_RECORDS) {
        const records = [...tasks.values()].sort((a, b) =>
          a.task.finishedAt.localeCompare(b.task.finishedAt),
        );
        for (const stale of records.slice(0, tasks.size - MAX_TASK_RECORDS)) {
          this.ctx.deps.repository.remove(TASKS, stale.turnId);
          tasks.delete(stale.turnId);
        }
      }
    } catch {
      /* Rating bookkeeping must never fail a finished task. */
    }
  }

  submit(input: SubmitRatingInput): DesktopSnapshot {
    const task = this.tasks().get(input.turnId);
    if (!task || task.threadId !== input.threadId)
      throw new Error('Only a finished task in this conversation can be rated.');
    if (!this.ctx.state.threads.some(({ id }) => id === input.threadId))
      throw new Error('Thread not found.');
    const reasons = [...new Set(input.reasons ?? [])];
    const allowed = reasonsFor(input.rating);
    if (reasons.some((reason) => !allowed.includes(reason)))
      throw new Error('Choose reasons that match your rating.');
    const comment = input.comment?.trim();
    const record = taskRatingRecordSchema.parse({
      schemaVersion: 1,
      threadId: task.threadId,
      turnId: task.turnId,
      rating: input.rating,
      reasons,
      ...(comment ? { comment } : {}),
      route: task.route,
      task: task.task,
      appVersion: this.ctx.deps.appVersion,
      createdAt: new Date().toISOString(),
    });
    const identity = this.ctx.account.currentIdentityKey();
    // Rating again replaces the earlier rating, here and in the cloud.
    this.putRating({ record, ...(identity ? { identity } : {}), synced: false });
    this.ctx.commit();
    this.scheduleSync();
    return this.ctx.resultSnapshot();
  }

  /** Rateable tasks and current ratings for the given thread, or for every thread. */
  view(threadId?: string): Record<string, TurnRatingView> {
    const views: Record<string, TurnRatingView> = {};
    try {
      for (const task of this.tasks().values())
        if (!threadId || task.threadId === threadId) views[task.turnId] = {};
      for (const { record } of this.ratings().values()) {
        if (threadId && record.threadId !== threadId) continue;
        views[record.turnId] = {
          rating: record.rating,
          ...(record.reasons.length ? { reasons: [...record.reasons] } : {}),
          ...(record.comment ? { commented: true as const } : {}),
        };
      }
    } catch {
      /* An unreadable record must not break the snapshot. */
    }
    return views;
  }

  /** Ratings waiting for the cloud that the current identity may send. */
  private pending(): StoredRating[] {
    const identity = this.ctx.account.currentIdentityKey();
    return [...this.ratings().values()].filter(
      (stored) => !stored.synced && (!stored.identity || stored.identity === identity),
    );
  }

  scheduleSync(): void {
    if (
      this.inFlightSync ||
      this.ctx.deps.fakeServices ||
      !this.ctx.deps.cloud.configured ||
      this.ctx.deps.identity.status().state !== 'signed_in' ||
      this.pending().length === 0
    )
      return;
    this.inFlightSync = this.sync().finally(() => {
      this.inFlightSync = undefined;
    });
  }

  private async sync(): Promise<void> {
    try {
      for (const stored of this.pending()) {
        await this.ctx.deps.cloud.submitTaskRating(stored.record);
        const current = this.ratings().get(stored.record.turnId);
        // A newer rating made during the upload stays pending and goes next.
        if (current?.record.createdAt === stored.record.createdAt)
          this.putRating({ ...current, synced: true });
      }
      this.retryDelayMs = 15_000;
      if (this.pending().length > 0) this.scheduleRetry(0);
    } catch {
      this.scheduleRetry(this.retryDelayMs);
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, 5 * 60_000);
    }
  }

  private scheduleRetry(delay: number): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.scheduleSync();
    }, delay);
    this.retryTimer.unref();
  }

  /** After local data is cleared (account deletion): drop the in-memory copies too. */
  forget(): void {
    this.dispose();
    this.#tasks = undefined;
    this.#ratings = undefined;
  }

  dispose(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }
}
