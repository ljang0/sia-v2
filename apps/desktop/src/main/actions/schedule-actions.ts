import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { SCHEDULE_DAY_NAMES, type ScheduleCadence } from '../../shared/schedule-cadence.js';
import { refused } from './action-results.js';
import type { ScheduleActionHost } from './types.js';

/** Agent-authored schedules, persisted through the controller-owned schedule host. */
export class ScheduleActions {
  constructor(private readonly schedules: ScheduleActionHost | undefined) {}

  run(request: ValidatedActionInvocation): ActionExecutionResult {
    const schedules = this.schedules;
    if (!schedules) return refused('Scheduled work is unavailable in this build.');
    if (request.name !== 'schedule_list' && !request.approvalId) {
      return refused('This schedule change is missing its exact action authorization.');
    }
    const args = request.arguments;
    switch (request.name) {
      case 'schedule_create': {
        const cadence = args.cadence as ScheduleCadence;
        const schedule = schedules.create(request.context.threadId, {
          task: String(args.task),
          cadence,
          ...scheduleRuleArguments(args),
          ...(typeof args.first_run_at === 'string' ? { firstRunAt: args.first_run_at } : {}),
          ...(typeof args.max_runs === 'number' ? { maxRuns: args.max_runs } : {}),
        });
        return {
          outcome: 'verified',
          summary: `Created the ${cadence} schedule.`,
          data: { schedule },
          verification: { evidence: 'Persisted in Sia desktop schedule state.' },
        };
      }
      case 'schedule_list': {
        const scheduleList = schedules.list(request.context.threadId);
        return {
          outcome: 'verified',
          summary: 'Listed scheduled work for this thread.',
          data: { schedules: scheduleList },
          verification: { evidence: 'Read from Sia desktop schedule state.' },
        };
      }
      case 'schedule_update': {
        const schedule = schedules.update(request.context.threadId, {
          scheduleId: String(args.schedule_id),
          ...(typeof args.task === 'string' ? { task: args.task } : {}),
          ...(typeof args.cadence === 'string'
            ? { cadence: args.cadence as ScheduleCadence }
            : {}),
          ...scheduleRuleArguments(args),
          ...(typeof args.next_run_at === 'string' ? { nextRunAt: args.next_run_at } : {}),
          ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
          ...(typeof args.max_runs === 'number' ? { maxRuns: args.max_runs } : {}),
        });
        return {
          outcome: 'verified',
          summary: 'Updated the schedule.',
          data: { schedule },
          verification: { evidence: 'Persisted in Sia desktop schedule state.' },
        };
      }
      case 'schedule_delete': {
        const scheduleId = String(args.schedule_id);
        schedules.delete(request.context.threadId, scheduleId);
        return {
          outcome: 'verified',
          summary: 'Deleted the schedule.',
          data: { schedule_id: scheduleId },
          verification: { evidence: 'Removed from Sia desktop schedule state.' },
        };
      }
      default:
        return refused('Unsupported schedule action.');
    }
  }
}

/** Maps the tool's day names and every_hours onto the controller's schedule fields. */
function scheduleRuleArguments(args: Readonly<Record<string, unknown>>): {
  days?: number[];
  everyHours?: number;
} {
  const days = Array.isArray(args.days)
    ? args.days
        .map((day) => SCHEDULE_DAY_NAMES.indexOf(day as (typeof SCHEDULE_DAY_NAMES)[number]))
        .filter((day) => day >= 0)
    : undefined;
  return {
    ...(days?.length ? { days } : {}),
    ...(typeof args.every_hours === 'number' ? { everyHours: args.every_hours } : {}),
  };
}
