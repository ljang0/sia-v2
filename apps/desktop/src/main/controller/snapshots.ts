import type { DesktopSnapshot, TimelineItemView, VoiceView } from '../../shared/bridge.js';
import { type ThreadPreviewMemo, threadPreviews } from '../../shared/thread-previews.js';
import type { TaskSnapshot } from './latest-task-turn.js';
import { EMPTY_CONNECTIONS } from './connection-ids.js';
import type { ControllerContext } from './context.js';

/** The parts of the controller context Snapshots uses. */
type SnapshotsContext = Pick<
  ControllerContext,
  | 'account'
  | 'computerAccess'
  | 'deps'
  | 'mac'
  | 'providers'
  | 'releaseAccessLocked'
  | 'revision'
  | 'settings'
  | 'speech'
  | 'state'
  | 'support'
>;

/**
 * Builds the desktop snapshots: the complete state for in-process callers, the scoped view the
 * renderer draws, and task metadata for the launcher and phone remote.
 */
export class Snapshots {
  private readonly previewMemo: ThreadPreviewMemo = new WeakMap();

  constructor(private readonly ctx: SnapshotsContext) {}

  /** The complete state, including every thread's history, for in-process callers and tests. */
  full(): DesktopSnapshot {
    return this.build(false);
  }

  /**
   * What the renderer draws: the active thread's history, one preview per thread and the active
   * thread's approvals. Pushing every thread's history on each streamed token made the app slow
   * down as history grew.
   */
  renderer(): DesktopSnapshot {
    return this.build(true);
  }

  /** Task metadata and each thread's latest turn, without cloning every thread's history. */
  tasks(): TaskSnapshot {
    if (this.ctx.releaseAccessLocked())
      return {
        revision: this.ctx.revision,
        agents: [],
        threads: [],
        timeline: [],
        approvals: [],
        preferences: { completionSound: false, ...this.ctx.settings.displayPreferences() },
      };
    const lastRequest = new Map<string, TimelineItemView>();
    for (const item of this.ctx.state.timeline)
      if (item.kind === 'user') lastRequest.set(item.threadId, item);
    return {
      revision: this.ctx.revision,
      agents: structuredClone(this.ctx.state.agents),
      threads: structuredClone(this.ctx.state.threads),
      timeline: structuredClone(
        this.ctx.state.timeline.filter((item) => {
          const request = lastRequest.get(item.threadId);
          return request !== undefined && item.sequence >= request.sequence;
        }),
      ),
      approvals: structuredClone(this.ctx.state.approvals),
      preferences: structuredClone(this.ctx.state.preferences),
      screenControl: this.ctx.mac.screenControl(),
      ...(this.ctx.state.activeAgentId ? { activeAgentId: this.ctx.state.activeAgentId } : {}),
    };
  }

  build(scoped: boolean): DesktopSnapshot {
    const identity = this.ctx.deps.identity.status();
    const cloud: DesktopSnapshot['cloud'] = {
      status:
        this.ctx.deps.cloud.configured &&
        identity.state === 'signed_in' &&
        !this.ctx.account.signOutInProgress
          ? 'online'
          : 'offline',
      auth: this.ctx.deps.cloud.configured
        ? this.ctx.account.signOutInProgress || identity.state === 'unconfigured'
          ? 'signed_out'
          : identity.state
        : 'unconfigured',
      ...(identity.email ? { account: identity.email } : {}),
      ...(identity.admin ? { admin: true } : {}),
      ...(this.ctx.account.cloudParticipant ? { participant: true } : {}),
      ...(identity.adminMfa ? { adminMfa: true } : {}),
      features: structuredClone(this.ctx.state.cloudFeatures),
    };
    if (this.ctx.releaseAccessLocked()) {
      return {
        revision: this.ctx.revision,
        agents: [],
        threads: [],
        timeline: [],
        approvals: [],
        providers: [],
        connections: structuredClone(EMPTY_CONNECTIONS),
        capture: { status: 'not_consented', pendingCount: 0 },
        computer: {
          status: 'unavailable',
          accessibility: false,
          screenRecording: false,
          trust: 'auto',
          trajectoryLog: false,
          detail: 'Sign in to Sia to use computer access.',
        },
        browser: { status: 'detached', grantedOrigins: [] },
        voice: { status: 'disconnected', voices: [] },
        preferences: { completionSound: false, ...this.ctx.settings.displayPreferences() },
        providerUsage: [],
        schedules: [],
        cloud: {
          status: 'offline',
          auth: cloud.auth,
          ...(cloud.account ? { account: cloud.account } : {}),
        },
      };
    }
    return {
      revision: this.ctx.revision,
      agents: structuredClone(this.ctx.state.agents),
      threads: structuredClone(this.ctx.state.threads),
      ...(scoped
        ? {
            timeline: structuredClone(
              this.ctx.state.timeline.filter(
                ({ threadId }) => threadId === this.ctx.state.activeThreadId,
              ),
            ),
            previews: structuredClone(
              Object.fromEntries(threadPreviews(this.ctx.state.timeline, this.previewMemo)),
            ),
            approvals: structuredClone(
              this.ctx.state.approvals.filter(
                ({ threadId }) => threadId === this.ctx.state.activeThreadId,
              ),
            ),
          }
        : {
            timeline: structuredClone(this.ctx.state.timeline),
            approvals: structuredClone(this.ctx.state.approvals),
          }),
      providers: this.ctx.providers.views.map((provider) => ({
        ...structuredClone(provider),
        ...(this.ctx.providers.usageLimits.has(provider.id)
          ? { limits: { ...this.ctx.providers.usageLimits.get(provider.id)! } }
          : {}),
        ...(provider.id === 'codex' && this.ctx.providers.codexSetup
          ? { setup: { ...this.ctx.providers.codexSetup } }
          : {}),
      })),
      connections: structuredClone(this.ctx.state.connections),
      capture: structuredClone(this.ctx.state.capture),
      computer: {
        ...structuredClone(this.ctx.computerAccess.state),
        ...(this.ctx.computerAccess.automationPermissions
          ? { automation: this.ctx.computerAccess.automationPermissions }
          : {}),
        ...(this.ctx.computerAccess.messagesAccess
          ? { messagesAccess: this.ctx.computerAccess.messagesAccess }
          : {}),
        ...(this.ctx.computerAccess.chromeConnection
          ? { chromeConnection: this.ctx.computerAccess.chromeConnection }
          : {}),
        accessMode: this.ctx.computerAccess.accessMode(),
        backgroundControl: this.ctx.computerAccess.backgroundControl(),
        backgroundFallback: this.ctx.computerAccess.backgroundFallback(),
        trust: this.ctx.computerAccess.trust(),
        trajectoryLog: this.ctx.computerAccess.trajectoryLogEnabled(),
        ...(this.ctx.deps.trajectory
          ? { trajectoryDirectory: this.ctx.deps.trajectory.rootDirectory }
          : {}),
      },
      browser: structuredClone(this.ctx.state.browser),
      voice: {
        ...structuredClone(
          this.ctx.deps.voice?.view() ??
            ({ status: 'disconnected', voices: [] } satisfies VoiceView),
        ),
        ...(this.ctx.speech.pushToTalk
          ? { pushToTalk: this.ctx.speech.pushToTalk.view() }
          : {}),
      },
      preferences: structuredClone(this.ctx.state.preferences),
      providerUsage: this.ctx.providers.providerUsage(),
      updates: structuredClone(this.ctx.support.updates),
      schedules: structuredClone(this.ctx.state.schedules),
      ...(this.ctx.state.activeAgentId ? { activeAgentId: this.ctx.state.activeAgentId } : {}),
      ...(this.ctx.state.activeThreadId
        ? { activeThreadId: this.ctx.state.activeThreadId }
        : {}),
      cloud,
      ...(this.ctx.deps.startupNotice
        ? { startupNotice: structuredClone(this.ctx.deps.startupNotice) }
        : {}),
    };
  }
}
