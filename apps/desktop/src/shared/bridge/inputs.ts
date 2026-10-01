import type { HarnessId, ProviderId } from './providers.js';
import type { ScheduleView } from './schedules.js';

// Inputs to bridge requests that create or change agents, threads, schedules, and approvals.

export interface SaveAgentInput {
  /** Atomically attach first-run setup to the new starter agent. */
  startOnboarding?: boolean;
  id?: string;
  name: string;
  instructions: string;
  provider?: ProviderId;
  model: string;
  /** Omit to create a private workspace under ~/Sia/Agents. */
  workspace?: string;
  harnessPreference?: { mode: 'automatic' } | { mode: 'explicit'; harnessId: HarnessId };
  voiceId?: string;
  hue?: number;
  pinned?: boolean;
  notificationsEnabled?: boolean;
}

export interface CreateThreadInput {
  agentId: string;
  title?: string;
}

export interface SendTurnInput {
  threadId: string;
  text: string;
  attachmentIds?: string[];
  /**
   * Set only by the Wi-Fi phone remote in the main process (never accepted over IPC). Its
   * link is plain HTTP on the local network, so these turns always confirm actions on the Mac.
   */
  fromPhone?: true;
}

export interface UpdateThreadConfigInput {
  threadId: string;
  model: string;
  reasoningEffort?: string;
}

export interface CreateScheduleInput {
  threadId: string;
  prompt: string;
  cadence: ScheduleView['cadence'];
  days?: number[];
  everyHours?: number;
  nextRunAt: string;
  maxRuns?: number;
}

/** An edit from the schedule list; each field that is present replaces the saved one. */
export interface UpdateScheduleInput {
  scheduleId: string;
  prompt?: string;
  cadence?: ScheduleView['cadence'];
  days?: number[];
  everyHours?: number;
  nextRunAt?: string;
  /** null removes the limit, so a recurring schedule repeats until paused or deleted. */
  maxRuns?: number | null;
  enabled?: boolean;
}

export interface StartReviewInput {
  threadId: string;
  target:
    | { type: 'uncommitted_changes' }
    | { type: 'base_branch'; branch: string }
    | { type: 'custom'; instructions: string };
}

export interface ResolveApprovalInput {
  approvalId: string;
  /** approve_task also allows equivalent requests until the task ends. */
  decision: 'approve' | 'approve_task' | 'deny';
}
