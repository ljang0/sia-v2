import type { ScheduleCadence } from '../schedule-cadence.js';

// Scheduled prompts and their run history.

export const SCHEDULE_RUN_HISTORY_LIMIT = 8;

export interface ScheduleRunView {
  id: string;
  startedAt: string;
  finishedAt?: string;
  outcome: 'started' | 'completed' | 'failed' | 'cancelled';
}

export interface ScheduleView {
  id: string;
  threadId: string;
  prompt: string;
  cadence: ScheduleCadence;
  /** Weekly only: 0 = Sunday … 6 = Saturday. */
  days?: number[];
  /** Hourly only: hours between runs; missing means every hour. */
  everyHours?: number;
  nextRunAt: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  runCount?: number;
  maxRuns?: number;
  activeRun?: {
    id: string;
    dueAt: string;
    claimedAt: string;
  };
  lastRun?: ScheduleRunView;
  /** Newest first; bounded by SCHEDULE_RUN_HISTORY_LIMIT in the local controller. */
  runHistory?: ScheduleRunView[];
}
