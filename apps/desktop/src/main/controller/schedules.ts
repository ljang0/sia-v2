import { randomUUID } from 'node:crypto';
import type {
  BridgeRequestMap,
  BridgeResultMap,
  DesktopSnapshot,
  ScheduleView,
} from '../../shared/bridge.js';
import {
  alignScheduleStart,
  defaultFirstScheduleRun,
  nextScheduleRun,
} from '../../shared/schedule-cadence.js';
import type { ControllerContext } from './context.js';
import {
  defaultScheduleRunLimit,
  scheduleRuleFields,
  upsertScheduleRun,
  validScheduleRunLimit,
  validScheduleTime,
} from './schedule-rules.js';
import type { QueuedTurn } from './types.js';

/** Creates, updates and runs scheduled tasks, from the app and from the schedule action tools. */
export class Schedules {
  timer: NodeJS.Timeout | undefined;
  runInFlight = false;

  constructor(private readonly ctx: ControllerContext) {}

  createScheduleFromAction(
    threadId: string,
    input: {
      task: string;
      cadence: ScheduleView['cadence'];
      days?: number[];
      everyHours?: number;
      firstRunAt?: string;
      maxRuns?: number;
    },
  ): ScheduleView {
    const firstRunAt =
      input.firstRunAt ??
      defaultFirstScheduleRun(
        { cadence: input.cadence, days: input.days, everyHours: input.everyHours },
        new Date(),
      ).toISOString();
    const schedule = this.insertSchedule({
      threadId,
      prompt: input.task,
      cadence: input.cadence,
      ...(input.days === undefined ? {} : { days: input.days }),
      ...(input.everyHours === undefined ? {} : { everyHours: input.everyHours }),
      nextRunAt: firstRunAt,
      ...(input.maxRuns === undefined ? {} : { maxRuns: input.maxRuns }),
    });
    return structuredClone(schedule);
  }

  listSchedulesForAction(threadId: string): ScheduleView[] {
    this.ctx.requireThread(threadId);
    return structuredClone(
      this.ctx.state.schedules.filter((schedule) => schedule.threadId === threadId),
    );
  }

  updateScheduleFromAction(
    threadId: string,
    input: {
      scheduleId: string;
      task?: string;
      cadence?: ScheduleView['cadence'];
      days?: number[];
      everyHours?: number;
      nextRunAt?: string;
      enabled?: boolean;
      maxRuns?: number;
    },
  ): ScheduleView {
    const schedule = this.requireSchedule(input.scheduleId);
    if (schedule.threadId !== threadId)
      throw new Error('Scheduled task not found in this thread.');
    const { task, ...changes } = input;
    this.applyScheduleUpdate(schedule, {
      ...changes,
      ...(task === undefined ? {} : { prompt: task }),
    });
    return structuredClone(schedule);
  }

  deleteScheduleFromAction(threadId: string, scheduleId: string): void {
    const schedule = this.requireSchedule(scheduleId);
    if (schedule.threadId !== threadId)
      throw new Error('Scheduled task not found in this thread.');
    this.ctx.state.schedules = this.ctx.state.schedules.filter(({ id }) => id !== scheduleId);
    this.ctx.commit();
  }

  createSchedule(input: BridgeRequestMap['schedules.create']): DesktopSnapshot {
    this.insertSchedule(input);
    return this.ctx.resultSnapshot();
  }

  insertSchedule(input: BridgeRequestMap['schedules.create']): ScheduleView {
    if (!this.schedulesAvailable()) {
      throw new Error('Schedules are turned off for this pilot right now.');
    }
    const thread = this.ctx.requireThread(input.threadId);
    if (thread.archivedAt) throw new Error('Unarchive this thread before scheduling work.');
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error('A scheduled task cannot be empty.');
    const schedule: ScheduleView = {
      id: randomUUID(),
      threadId: thread.id,
      prompt,
      ...scheduleRuleFields(
        { cadence: input.cadence, days: input.days, everyHours: input.everyHours },
        new Date(validScheduleTime(input.nextRunAt)),
      ),
      nextRunAt: validScheduleTime(input.nextRunAt),
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };
    const maxRuns = input.maxRuns ?? defaultScheduleRunLimit(input.cadence);
    if (maxRuns !== undefined) schedule.maxRuns = validScheduleRunLimit(maxRuns);
    schedule.nextRunAt = alignScheduleStart(
      schedule,
      new Date(schedule.nextRunAt),
    ).toISOString();
    this.ctx.state.schedules.push(schedule);
    this.ctx.commit();
    void this.runDueSchedules();
    return schedule;
  }

  /** One edit path for the schedule list and the agent's schedule_update tool. */
  applyScheduleUpdate(
    schedule: ScheduleView,
    input: Omit<BridgeRequestMap['schedules.update'], 'scheduleId'>,
  ): void {
    if (!this.schedulesAvailable()) {
      throw new Error('Schedules are turned off for this pilot right now.');
    }
    const prompt = input.prompt === undefined ? undefined : input.prompt.trim();
    if (prompt === '') throw new Error('A scheduled task cannot be empty.');
    const nextRunAt =
      input.nextRunAt === undefined ? undefined : validScheduleTime(input.nextRunAt);
    const maxRuns =
      input.maxRuns === undefined || input.maxRuns === null
        ? input.maxRuns
        : validScheduleRunLimit(input.maxRuns);
    const ruleChanged =
      input.cadence !== undefined || input.days !== undefined || input.everyHours !== undefined;
    if (prompt !== undefined) schedule.prompt = prompt;
    if (nextRunAt !== undefined) schedule.nextRunAt = nextRunAt;
    if (ruleChanged) {
      const cadence = input.cadence ?? schedule.cadence;
      const rule = scheduleRuleFields(
        {
          cadence,
          // A new cadence starts from its own details rather than the old one's.
          days: input.days ?? (cadence === schedule.cadence ? schedule.days : undefined),
          everyHours:
            input.everyHours ??
            (cadence === schedule.cadence ? schedule.everyHours : undefined),
        },
        new Date(schedule.nextRunAt),
      );
      delete schedule.days;
      delete schedule.everyHours;
      Object.assign(schedule, rule);
    }
    if (ruleChanged || nextRunAt !== undefined) {
      schedule.nextRunAt = alignScheduleStart(
        schedule,
        new Date(schedule.nextRunAt),
      ).toISOString();
    }
    // null clears the limit: a recurring schedule then repeats until paused or deleted.
    if (maxRuns === null) delete schedule.maxRuns;
    else if (maxRuns !== undefined) schedule.maxRuns = maxRuns;
    if (input.enabled !== undefined) schedule.enabled = input.enabled;
    this.ctx.commit();
    if (schedule.enabled) void this.runDueSchedules();
  }

  updateSchedule(input: BridgeRequestMap['schedules.update']): DesktopSnapshot {
    this.applyScheduleUpdate(this.requireSchedule(input.scheduleId), input);
    return this.ctx.resultSnapshot();
  }

  setScheduleEnabled(input: BridgeRequestMap['schedules.setEnabled']): DesktopSnapshot {
    if (input.enabled && !this.schedulesAvailable()) {
      throw new Error('Schedules are turned off for this pilot right now.');
    }
    const schedule = this.requireSchedule(input.scheduleId);
    schedule.enabled = input.enabled;
    this.ctx.commit();
    if (input.enabled) void this.runDueSchedules();
    return this.ctx.resultSnapshot();
  }

  deleteSchedule(scheduleId: string): DesktopSnapshot {
    this.requireSchedule(scheduleId);
    this.ctx.state.schedules = this.ctx.state.schedules.filter(({ id }) => id !== scheduleId);
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  runScheduleNow(scheduleId: string): BridgeResultMap['schedules.runNow'] {
    if (!this.schedulesAvailable()) {
      throw new Error('Schedules are turned off for this pilot right now.');
    }
    const schedule = this.requireSchedule(scheduleId);
    return this.dispatchSchedule(schedule, new Date());
  }

  async runDueSchedules(): Promise<void> {
    if (
      this.ctx.providers.codexSetupPending ||
      this.runInFlight ||
      this.ctx.account.accountDeletionInProgress ||
      !this.schedulesAvailable()
    )
      return;
    this.runInFlight = true;
    try {
      const now = new Date();
      const due = this.ctx.state.schedules.filter(
        (schedule) =>
          Boolean(schedule.activeRun) ||
          (schedule.enabled && Date.parse(schedule.nextRunAt) <= now.getTime()),
      );
      // A due run that waits for a busy thread changes nothing. Saving the whole encrypted
      // state for it every 30 seconds grew costly as history grew.
      let changed = false;
      for (const schedule of due) {
        const thread = this.ctx.state.threads.find(({ id }) => id === schedule.threadId);
        if (!thread || thread.archivedAt) {
          schedule.enabled = false;
          changed = true;
          continue;
        }
        if (
          thread.status === 'running' ||
          thread.status === 'queued' ||
          thread.status === 'waiting'
        ) {
          continue;
        }
        changed = true;
        try {
          this.dispatchSchedule(schedule, now);
        } catch (error) {
          delete schedule.activeRun;
          schedule.enabled = false;
          this.ctx.appendTimeline(thread.id, {
            id: randomUUID(),
            kind: 'notice',
            title: 'Scheduled task paused',
            text:
              error instanceof Error ? error.message : 'The scheduled task could not start.',
            status: 'failed',
            timestamp: now.toISOString(),
          });
        }
      }
      if (changed) this.ctx.commit();
    } finally {
      this.runInFlight = false;
    }
  }

  advanceSchedule(schedule: ScheduleView, now: Date): void {
    const due = new Date(schedule.nextRunAt);
    // Run now leaves the next scheduled run where it was.
    if (schedule.cadence !== 'once' && due > now) return;
    const next = nextScheduleRun(schedule, due, now);
    if (!next) {
      schedule.enabled = false;
      return;
    }
    schedule.nextRunAt = next.toISOString();
  }

  dispatchSchedule(schedule: ScheduleView, now: Date): BridgeResultMap['schedules.runNow'] {
    const claim =
      schedule.activeRun ??
      ({
        id: randomUUID(),
        dueAt: schedule.nextRunAt,
        claimedAt: now.toISOString(),
      } satisfies NonNullable<ScheduleView['activeRun']>);
    if (!schedule.activeRun) {
      schedule.activeRun = claim;
      // The claim reaches disk before the user turn. Recovery can now distinguish a crash before
      // dispatch from a crash after dispatch by searching for this stable scheduleRunId.
      this.ctx.commit();
    }
    const dispatched = this.ctx.state.timeline.find(
      (item) => item.scheduleRunId === claim.id && item.kind === 'user' && item.turnId,
    );
    const result = dispatched?.turnId
      ? { turnId: dispatched.turnId, snapshot: this.ctx.resultSnapshot() }
      : this.ctx.sendTurn(
          { threadId: schedule.threadId, text: schedule.prompt },
          'schedule',
          undefined,
          claim.id,
        );
    const startedAt = dispatched?.timestamp ?? now.toISOString();
    schedule.lastRunAt = startedAt;
    schedule.lastRun = { id: claim.id, startedAt, outcome: 'started' };
    upsertScheduleRun(schedule, schedule.lastRun);
    schedule.runCount = (schedule.runCount ?? 0) + 1;
    this.advanceSchedule(schedule, now);
    if (schedule.maxRuns !== undefined && schedule.runCount >= schedule.maxRuns) {
      schedule.enabled = false;
    }
    delete schedule.activeRun;
    this.ctx.commit();
    return result;
  }

  markScheduleRunFinished(
    turn: QueuedTurn,
    outcome: 'completed' | 'failed' | 'cancelled',
  ): void {
    if (!turn.scheduleRunId) return;
    const schedule = this.ctx.state.schedules.find(
      ({ lastRun, runHistory }) =>
        lastRun?.id === turn.scheduleRunId ||
        runHistory?.some(({ id }) => id === turn.scheduleRunId),
    );
    if (!schedule) return;
    const startedRun =
      schedule.lastRun?.id === turn.scheduleRunId
        ? schedule.lastRun
        : schedule.runHistory?.find(({ id }) => id === turn.scheduleRunId);
    if (!startedRun) return;
    const finishedRun = {
      ...startedRun,
      outcome,
      finishedAt: new Date().toISOString(),
    };
    if (schedule.lastRun?.id === turn.scheduleRunId) schedule.lastRun = finishedRun;
    upsertScheduleRun(schedule, finishedRun);
  }

  schedulesAvailable(): boolean {
    if (this.ctx.releaseAccessLocked()) return false;
    return this.ctx.state.cloudFeatures?.schedules !== false;
  }

  requireSchedule(id: string): ScheduleView {
    const schedule = this.ctx.state.schedules.find((candidate) => candidate.id === id);
    if (!schedule) throw new Error('Scheduled task not found.');
    return schedule;
  }
}
