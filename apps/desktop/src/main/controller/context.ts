import { AsyncLocalStorage } from 'node:async_hooks';
import { isAbsolute } from 'node:path';
import type {
  AgentView,
  DesktopPushEvent,
  DesktopSnapshot,
  ThreadView,
  TimelineItemView,
} from '../../shared/bridge.js';
import type { PhoneRemoteApi } from '../../shared/phone-remote.js';
import type { ScottySettingsApi } from '../../shared/scotty.js';
import { probeProviders } from '../provider-probe.js';
import type { RuntimeCoordinator } from '../runtime-coordinator.js';
import type { CloudAccount } from './account.js';
import type { ActionHost } from './action-host.js';
import type { Agents } from './agents.js';
import type { Approvals } from './approvals.js';
import type { AssistantFeatures } from './assistant.js';
import { settleBeforeShutdown } from './async-utils.js';
import type { Attachments } from './attachments.js';
import type { BridgeRouter } from './bridge-router.js';
import type { BrowserSession } from './browser.js';
import type { ComputerAccess } from './computer-access.js';
import type { ConnectorConnections } from './connections.js';
import { type ControllerDeps, resolveControllerDeps } from './deps.js';
import type { MacSession } from './mac-session.js';
import {
  INITIAL_STATE,
  type PersistedState,
  recoverPersistedState,
} from './persisted-state.js';
import type { ProviderAccess } from './providers.js';
import type { ResearchCapture } from './research-capture.js';
import type { ResearchOutbox } from './research-outbox.js';
import type { RuntimeEventApplier } from './runtime-events.js';
import type { Schedules } from './schedules.js';
import type { AppSettings } from './settings.js';
import type { Snapshots } from './snapshots.js';
import type { AppSupport } from './support.js';
import type { Threads } from './threads.js';
import type { TurnRunner } from './turn-runner.js';
import type { Turns } from './turns.js';
import type { BrowserCapabilitySink, ControllerOptions } from './types.js';
import type { VoiceControls } from './voice.js';
import { normalizeWorkspace } from './workspace-paths.js';
import type { WorkspaceTools } from './workspace.js';

/** The domain collaborators a context is wired with. */
export type ControllerServices = Pick<ControllerContext, ServiceName>;
type ServiceName =
  | 'researchOutbox'
  | 'researchCapture'
  | 'connections'
  | 'account'
  | 'providers'
  | 'schedules'
  | 'attachments'
  | 'workspace'
  | 'browser'
  | 'computerAccess'
  | 'speech'
  | 'assistant'
  | 'agents'
  | 'threads'
  | 'approvals'
  | 'turns'
  | 'runner'
  | 'runtimeEvents'
  | 'mac'
  | 'settings'
  | 'support'
  | 'actions'
  | 'snapshots'
  | 'router';

/**
 * Everything the desktop controller knows and does. DesktopController is the public facade;
 * this context holds the shared state and wires the domain collaborators.
 */
export class ControllerContext {
  readonly deps: ControllerDeps;
  // Domain collaborators, created by DesktopController through the wire callback.
  declare readonly researchOutbox: ResearchOutbox;
  declare readonly researchCapture: ResearchCapture;
  declare readonly connections: ConnectorConnections;
  declare readonly account: CloudAccount;
  declare readonly providers: ProviderAccess;
  declare readonly schedules: Schedules;
  declare readonly attachments: Attachments;
  declare readonly workspace: WorkspaceTools;
  declare readonly browser: BrowserSession;
  declare readonly computerAccess: ComputerAccess;
  declare readonly speech: VoiceControls;
  declare readonly assistant: AssistantFeatures;
  declare readonly agents: Agents;
  declare readonly threads: Threads;
  declare readonly approvals: Approvals;
  declare readonly turns: Turns;
  declare readonly runner: TurnRunner;
  declare readonly runtimeEvents: RuntimeEventApplier;
  declare readonly mac: MacSession;
  declare readonly settings: AppSettings;
  declare readonly support: AppSupport;
  declare readonly actions: ActionHost;
  declare readonly snapshots: Snapshots;
  declare readonly router: BridgeRouter;

  readonly listeners = new Set<(event: DesktopPushEvent) => void>();
  readonly rendererCall = new AsyncLocalStorage<true>();
  readonly workspaceGrants = new Set<string>();
  streamCommitTimer: NodeJS.Timeout | undefined;
  streamPersistTimer: NodeJS.Timeout | undefined;
  runtime: RuntimeCoordinator | undefined;
  browserCapabilitySink: BrowserCapabilitySink | undefined;
  scotty: ScottySettingsApi | undefined;
  phoneRemote: PhoneRemoteApi | undefined;
  state: PersistedState = structuredClone(INITIAL_STATE);
  revision = 0;
  shuttingDown = false;

  constructor(
    options: ControllerOptions,
    wire: (ctx: ControllerContext) => ControllerServices,
  ) {
    this.deps = resolveControllerDeps(options);
    Object.assign(this, wire(this));
  }

  attachRuntime(runtime: RuntimeCoordinator): void {
    if (this.runtime) throw new Error('The provider runtime is already attached.');
    this.runtime = runtime;
  }

  attachBrowserCapabilitySink(sink: BrowserCapabilitySink): void {
    if (this.browserCapabilitySink)
      throw new Error('The browser action backend is already attached.');
    this.browserCapabilitySink = sink;
  }

  attachScotty(handler: ScottySettingsApi): void {
    this.scotty = handler;
  }

  attachPhoneRemote(handler: PhoneRemoteApi): void {
    this.phoneRemote = handler;
  }

  remoteAccessAllowed(): boolean {
    return (
      !this.shuttingDown &&
      !this.providers.codexSetupPending &&
      !this.account.accountDeletionInProgress &&
      !this.account.signOutInProgress &&
      !this.releaseAccessLocked()
    );
  }

  async initialize(): Promise<void> {
    const stored = this.deps.repository.get<PersistedState>('desktop', 'state');
    this.state = stored ? recoverPersistedState(stored) : structuredClone(INITIAL_STATE);
    this.researchOutbox.pruneExpiredBatches();
    for (const workspace of [
      ...this.state.agents.map((agent) => agent.workspace),
      ...this.state.threads.map((thread) => thread.workspace),
    ]) {
      if (isAbsolute(workspace)) this.workspaceGrants.add(normalizeWorkspace(workspace));
    }
    const [providers, computer] = await Promise.all([
      // Fake-services mode must not inspect or depend on host CLI installs or
      // authentication. An empty PATH produces deterministic placeholder views;
      // Codex is replaced with the explicit fake runtime below.
      this.deps.fakeServices
        ? probeProviders(undefined, { PATH: '' })
        : this.deps.providerProbe(),
      this.deps.computer.permissions(),
      this.deps.identity.initialize(),
    ]);
    this.providers.setInitialViews(providers);
    await this.computerAccess.refreshCapabilityStatuses().catch(() => undefined);
    await this.providers.refreshProviderModels();
    await this.account.reconcileIdentityBoundState();
    await this.account.refreshCloudSession();
    await this.providers.refreshMetaProviderState();
    if (this.deps.identity.status().state === 'signed_in') {
      await this.deps.voice?.refresh().catch(() => undefined);
    }
    this.computerAccess.state = computer;
    this.researchOutbox.refreshPendingCount();
    this.persist();
    this.researchOutbox.scheduleSync();
    this.schedules.timer = setInterval(() => void this.schedules.runDueSchedules(), 30_000);
    this.schedules.timer.unref();
    this.assistant.startIdleReviews();
    void this.schedules.runDueSchedules();
  }

  resultSnapshot(): DesktopSnapshot {
    return this.snapshots.build(this.rendererCall.getStore() === true);
  }

  subscribe(listener: (event: DesktopPushEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.speech.pushToTalk?.dispose();
    // Quit must remain bounded even when an OS integration or provider subprocess
    // stops responding. The app has already stopped accepting work at this point.
    const shutdownDeadline = Date.now() + 8_000;
    if (this.researchOutbox.retryTimer) clearTimeout(this.researchOutbox.retryTimer);
    if (this.schedules.timer) clearInterval(this.schedules.timer);
    if (this.assistant.memoryTimer) clearInterval(this.assistant.memoryTimer);
    if (this.assistant.notchTimer) clearInterval(this.assistant.notchTimer);
    for (const controller of this.turns.running.values()) controller.abort();
    for (const pending of this.approvals.pending.values()) {
      clearTimeout(pending.timeout);
      pending.resolve('cancel');
    }
    this.approvals.pending.clear();
    this.approvals.taskGrants.clear();
    this.approvals.approvedConnectorBindings.clear();
    this.connections.setup?.controller.abort();
    this.browserCapabilitySink?.resetBrowserCapabilities();
    await settleBeforeShutdown(
      Promise.allSettled([...this.turns.tasks.values()]),
      shutdownDeadline,
    );
    await settleBeforeShutdown(this.connections.setup?.task, shutdownDeadline);
    await settleBeforeShutdown(this.researchOutbox.inFlightSync, shutdownDeadline);
    await settleBeforeShutdown(this.runtime?.dispose(), shutdownDeadline);
    this.deps.workspaceOperations?.dispose?.();
    this.deps.voice?.dispose?.();
    await settleBeforeShutdown(this.deps.computer.shutdown(), shutdownDeadline);
    this.cancelStreamCommit();
    this.persist();
    this.deps.repository.close();
  }

  appendTimeline(
    threadId: string,
    item: Omit<TimelineItemView, 'threadId' | 'sequence'>,
  ): void {
    const sequence =
      this.state.timeline.reduce(
        (highest, candidate) =>
          candidate.threadId === threadId ? Math.max(highest, candidate.sequence) : highest,
        0,
      ) + 1;
    if (item.turnId) {
      this.researchCapture.stageRawResearchEvent({
        threadId,
        turnId: item.turnId,
        eventType: `timeline.${item.kind}`,
        sequence,
        data: item,
        occurredAt: item.timestamp,
        sourceEventId: item.id,
      });
    }
    this.state.timeline.push({ ...item, threadId, sequence });
    this.deps.trajectory?.record({
      type: `timeline_${item.kind}`,
      threadId,
      turnId: item.turnId,
      item: structuredClone(item),
    });
  }

  requireAgent(id: string): AgentView {
    const agent = this.state.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new Error('Agent not found.');
    return agent;
  }

  requireSignedInReleaseAccount(): void {
    if (!this.releaseAccessLocked()) return;
    throw new Error('Sign in to Sia to continue.');
  }

  releaseAccessLocked(): boolean {
    return (
      this.deps.cloud.configured &&
      (this.account.signOutInProgress || this.deps.identity.status().state !== 'signed_in')
    );
  }

  requireThread(id: string): ThreadView {
    const thread = this.state.threads.find((candidate) => candidate.id === id);
    if (!thread) throw new Error('Thread not found.');
    return thread;
  }

  commit(deferStreamDelta = false): void {
    this.revision += 1;
    this.mac.syncKeepAwake();
    if (deferStreamDelta) {
      if (!this.streamCommitTimer) {
        this.streamCommitTimer = setTimeout(() => {
          this.streamCommitTimer = undefined;
          this.emit();
        }, 50);
        this.streamCommitTimer.unref();
      }
      // Keep the visible stream responsive without encrypting the entire history
      // at UI cadence. Completion, actions and shutdown still persist immediately.
      this.persistSoon();
      return;
    }
    this.cancelStreamCommit();
    this.persist();
    this.emit();
  }

  persistSoon(): void {
    if (this.streamPersistTimer) return;
    this.streamPersistTimer = setTimeout(() => {
      this.streamPersistTimer = undefined;
      this.persist();
    }, 500);
    this.streamPersistTimer.unref();
  }

  cancelStreamCommit(): void {
    if (this.streamCommitTimer) clearTimeout(this.streamCommitTimer);
    if (this.streamPersistTimer) clearTimeout(this.streamPersistTimer);
    this.streamCommitTimer = undefined;
    this.streamPersistTimer = undefined;
  }

  persist(): void {
    const browser = { ...this.state.browser };
    // Chrome window titles and native ids are process-local chooser data. Keep them out of
    // durable storage even though the rest of the application state is encrypted at rest.
    delete browser.availableWindows;
    this.deps.repository.put('desktop', 'state', { ...this.state, browser });
  }

  emit(): void {
    this.speech.pushToTalk?.syncAccess();
    this.speech.pushToTalk?.syncTasks();
    const event: DesktopPushEvent = { type: 'snapshot', snapshot: this.snapshots.renderer() };
    for (const listener of this.listeners) listener(event);
  }
}
