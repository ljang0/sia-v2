/** The encrypted desktop state record: its shape, first-run value and relaunch recovery. */

import { randomUUID } from 'node:crypto';
import {
  type AgentView,
  type ApprovalView,
  type BrowserView,
  type CaptureView,
  type CloudFeatureFlags,
  type ConnectionView,
  type DesktopSnapshot,
  type ProviderId,
  SCHEDULE_RUN_HISTORY_LIMIT,
  type ScheduleView,
  type ThreadView,
  type TimelineItemView,
} from '../../shared/bridge.js';
import {
  isTextSize,
  isTheme,
  type TextSize,
  type ThemePreference,
} from '../../shared/display.js';
import { EMPTY_CONNECTIONS, isGoogleConnection } from './connection-ids.js';
import { legacyResolvedExecutionTarget } from './execution-routes.js';
import { LEGACY_RECURRING_RUN_LIMIT, scheduleRuleFields } from './schedule-rules.js';

export interface PersistedState {
  agents: AgentView[];
  threads: ThreadView[];
  timeline: TimelineItemView[];
  approvals: ApprovalView[];
  connections: ConnectionView[];
  capture: CaptureView;
  browser: BrowserView;
  /** Consent and pending batches are valid only for this normalized cloud identity. */
  researchIdentity?: string;
  /** Opaque connector grants remain locked to the identity that created them. */
  connectionOwners: Partial<Record<ConnectionView['id'], string>>;
  activeAgentId?: string;
  activeThreadId?: string;
  schedules: ScheduleView[];
  /**
   * Set once recurring schedules saved with the old ten-run default have been made unlimited,
   * so a limit of ten chosen afterwards is kept.
   */
  unlimitedRecurringSchedules?: true;
  cloudFeatures: CloudFeatureFlags;
  preferences: {
    completionSound: boolean;
    openAtLogin?: boolean;
    appearance?: 'calm' | 'expressive';
    theme?: ThemePreference;
    textSize?: TextSize;
    /** Workspace Command tool (arbitrary shell in the agent folder). Off unless set to true. */
    developerTools?: boolean;
    onboarding?: NonNullable<DesktopSnapshot['preferences']['onboarding']>;
    /** All eligible actions run without in-app approval only when explicitly set to 'auto'. */
    computerAccessMode?: 'mac' | 'connected';
    macBackgroundControl?: boolean;
    macBackgroundFallback?: 'pause' | 'foreground';
    computerTrust?: 'auto' | 'ask';
    /** Eligible local trajectory log; Google Workspace connector turns are excluded. */
    trajectoryLog?: boolean;
  };
  usageByTurn: Record<
    string,
    {
      threadId: string;
      provider: ProviderId;
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      updatedAt: string;
    }
  >;
}

export const INITIAL_STATE: PersistedState = {
  agents: [],
  threads: [],
  timeline: [],
  approvals: [],
  connections: EMPTY_CONNECTIONS,
  capture: { status: 'not_consented', pendingCount: 0 },
  browser: { status: 'detached', grantedOrigins: [] },
  connectionOwners: {},
  schedules: [],
  unlimitedRecurringSchedules: true,
  cloudFeatures: {
    researchUploads: true,
    researchArchive: false,
    connectors: true,
    schedules: true,
  },
  preferences: { completionSound: false, computerAccessMode: 'mac', computerTrust: 'auto' },
  usageByTurn: {},
};

/** How long a settled approval with no transcript row stays after it expired. */
export const SETTLED_APPROVAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Approvals a transcript row refers to are part of that thread's history and stay. The rest,
 * such as computer-use requests, are shown only beside their turn; drop them a week after
 * they expired so state does not grow with every answered request.
 */
export function pruneSettledApprovals(
  approvals: readonly ApprovalView[],
  timeline: readonly TimelineItemView[],
  now: number,
): ApprovalView[] {
  const referenced = new Set(
    timeline.flatMap((item) =>
      item.kind === 'approval' && item.approvalId ? [item.approvalId] : [],
    ),
  );
  return approvals.filter((approval) => {
    if (approval.status === 'pending' || referenced.has(approval.id)) return true;
    const expiresAt = approval.expiresAt ? Date.parse(approval.expiresAt) : Number.NaN;
    return !Number.isFinite(expiresAt) || now - expiresAt < SETTLED_APPROVAL_RETENTION_MS;
  });
}

/**
 * Restores saved state after a relaunch: fills fields added since it was written, expires
 * process-local grants and approvals, and marks work that was running as interrupted.
 */
export function recoverPersistedState(state: PersistedState): PersistedState {
  const recovered = structuredClone(state);
  recovered.connectionOwners = recovered.connectionOwners ?? {};
  recovered.schedules = (recovered.schedules ?? []).map((schedule) => {
    const runHistory = (schedule.runHistory ?? (schedule.lastRun ? [schedule.lastRun] : []))
      .filter((run, index, history) => history.findIndex(({ id }) => id === run.id) === index)
      .slice(0, SCHEDULE_RUN_HISTORY_LIMIT);
    // Weekly schedules saved before chosen days existed keep running on their next run's day.
    const { days: _days, everyHours: _everyHours, ...rest } = schedule;
    return {
      ...rest,
      ...scheduleRuleFields(schedule, new Date(schedule.nextRunAt)),
      runCount: schedule.runCount ?? 0,
      ...(runHistory.length > 0 ? { runHistory } : {}),
    };
  });
  if (!recovered.unlimitedRecurringSchedules) {
    // Saved state cannot tell the old form's prefilled ten from a chosen ten, so every recurring
    // schedule at exactly ten becomes unlimited. One that already ran out stays paused.
    for (const schedule of recovered.schedules)
      if (schedule.cadence !== 'once' && schedule.maxRuns === LEGACY_RECURRING_RUN_LIMIT)
        delete schedule.maxRuns;
    recovered.unlimitedRecurringSchedules = true;
  }
  recovered.cloudFeatures =
    recovered.cloudFeatures ?? structuredClone(INITIAL_STATE.cloudFeatures);
  recovered.preferences = recovered.preferences ?? { completionSound: false };
  if (recovered.preferences.theme !== undefined && !isTheme(recovered.preferences.theme))
    delete recovered.preferences.theme;
  if (
    recovered.preferences.textSize !== undefined &&
    !isTextSize(recovered.preferences.textSize)
  )
    delete recovered.preferences.textSize;
  if (recovered.preferences.onboarding?.restartPending) {
    recovered.preferences.onboarding = {
      ...recovered.preferences.onboarding,
      step: 'verify',
      restartPending: false,
      restarted: true,
    };
  }
  recovered.usageByTurn = recovered.usageByTurn ?? {};
  recovered.agents = recovered.agents.map((agent) => ({
    ...agent,
    harnessPreference: agent.harnessPreference ?? { mode: 'automatic' },
    pinned: agent.pinned ?? false,
    notificationsEnabled: agent.notificationsEnabled ?? true,
  }));
  // A CUA browser attachment is process-local. Never revive its UI grant without
  // preparing a fresh native session and rebuilding host-only tab capabilities.
  recovered.browser = { status: 'detached', grantedOrigins: [] };
  recovered.approvals = pruneSettledApprovals(
    recovered.approvals.map((approval) =>
      approval.status === 'pending' ? { ...approval, status: 'expired' } : approval,
    ),
    recovered.timeline,
    Date.now(),
  );
  // No turn survives a relaunch, so no activity row may keep spinning.
  for (const item of recovered.timeline)
    if (item.status === 'running') item.status = 'complete';
  const recoveredConnections = new Map(
    recovered.connections.map((connection) => [connection.id, connection]),
  );
  // Calendar and Tasks joined the one Google Workspace grant later. Give saved Workspace grants
  // their rows so the unified grant is not mistaken for older per-app grants; the cloud reports
  // per tool whether the grant includes each scope.
  const workspaceGrant = recovered.connections.find(
    (connection) =>
      isGoogleConnection(connection.id) && connection.connectionId?.startsWith('gw_'),
  );
  const workspaceOwner = workspaceGrant
    ? recovered.connectionOwners?.[workspaceGrant.id]
    : undefined;
  recovered.connections = EMPTY_CONNECTIONS.map((fallback) => {
    let connection = recoveredConnections.get(fallback.id) ?? fallback;
    if (
      !recoveredConnections.has(fallback.id) &&
      workspaceGrant &&
      isGoogleConnection(fallback.id)
    ) {
      connection = {
        ...fallback,
        status: workspaceGrant.status,
        connectionId: workspaceGrant.connectionId!,
        ...(workspaceGrant.account ? { account: workspaceGrant.account } : {}),
        ...(workspaceGrant.googleAccess ? { googleAccess: workspaceGrant.googleAccess } : {}),
        ...(workspaceGrant.detail ? { detail: workspaceGrant.detail } : {}),
      };
      if (workspaceOwner && recovered.connectionOwners) {
        recovered.connectionOwners[fallback.id] = workspaceOwner;
      }
    }
    return connection.status === 'connecting'
      ? {
          ...connection,
          status: 'error',
          detail: 'Connection setup was interrupted. Verify or disconnect this saved grant.',
        }
      : connection;
  });
  // Queued follow-ups live in memory. After a relaunch, return unsent text to the composer
  // instead of starting it unattended or showing it as a message that was sent.
  const unsentFollowUps = new Map<string, string[]>();
  recovered.timeline = recovered.timeline.filter((item) => {
    if (item.kind !== 'user' || item.status !== 'pending') return true;
    const texts = unsentFollowUps.get(item.threadId) ?? [];
    if (item.text?.trim()) texts.push(item.text.trim());
    unsentFollowUps.set(item.threadId, texts);
    return false;
  });
  recovered.threads = recovered.threads.map((thread) => {
    const unsent = unsentFollowUps.get(thread.id);
    if (!unsent?.length) return thread;
    return {
      ...thread,
      draft: [thread.draft?.trim(), ...unsent].filter(Boolean).join('\n\n'),
    };
  });
  recovered.threads = recovered.threads.map((thread) => {
    const agent = recovered.agents.find(({ id }) => id === thread.agentId);
    const resolvedExecutionTarget =
      thread.resolvedExecutionTarget ?? legacyResolvedExecutionTarget(thread);
    const restored: ThreadView = {
      ...thread,
      harnessId: resolvedExecutionTarget.harnessId,
      resolvedExecutionTarget,
      instructionsSnapshot: thread.instructionsSnapshot ?? agent?.instructions ?? '',
      agentNameSnapshot: thread.agentNameSnapshot ?? agent?.name ?? 'Agent',
      unread: thread.unread ?? false,
      pinned: thread.pinned ?? false,
      worktree:
        thread.worktree ?? ({ kind: 'primary', sourceWorkspace: thread.workspace } as const),
    };
    if (
      restored.status !== 'running' &&
      restored.status !== 'queued' &&
      restored.status !== 'waiting'
    )
      return restored;
    const lastUser = recovered.timeline.findLast(
      (item) => item.threadId === restored.id && item.kind === 'user' && Boolean(item.turnId),
    );
    if (!lastUser?.turnId) {
      const value: ThreadView = { ...restored, status: 'idle' };
      delete value.queueReason;
      return value;
    }
    const sequence = recovered.timeline
      .filter((item) => item.threadId === restored.id)
      .reduce((maximum, item) => Math.max(maximum, item.sequence), 0);
    recovered.timeline.push({
      id: randomUUID(),
      threadId: restored.id,
      turnId: lastUser.turnId,
      sequence: sequence + 1,
      kind: 'error',
      title: 'Task was interrupted',
      text: 'The task was interrupted when Sia closed. Completed work is preserved, and it is safe to retry.',
      status: 'failed',
      timestamp: new Date().toISOString(),
    });
    const value: ThreadView = {
      ...restored,
      status: 'failed',
      interruptedTurnId: lastUser.turnId,
      unread: true,
    };
    delete value.queueReason;
    return value;
  });
  if (
    recovered.activeThreadId &&
    recovered.threads.find(({ id }) => id === recovered.activeThreadId)?.archivedAt
  ) {
    delete recovered.activeThreadId;
  }
  return recovered;
}
