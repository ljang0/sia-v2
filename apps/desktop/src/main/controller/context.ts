import type { TaskSnapshot } from '../latest-task-turn.js';
import type { PhoneRemoteApi } from '../../shared/phone-remote.js';
import type { ScottySettingsApi } from '../../shared/scotty.js';
import { threadPreviews, type ThreadPreviewMemo } from '../../shared/thread-previews.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isAbsolute } from 'node:path';

import type { ActionInvocationObserver, ActionResultObserver } from '@sia/action-gateway';

import type {
  AgentView,
  BridgeMethod,
  BridgeRequestMap,
  BridgeResultMap,
  DesktopPushEvent,
  DesktopSnapshot,
  ProviderView,
  ThreadView,
  TimelineItemView,
  VoiceView,
} from '../../shared/bridge.js';
import { probeProviders, providerPlan } from '../provider-probe.js';
import type { RuntimeCoordinator } from '../runtime-coordinator.js';
import { settleBeforeShutdown } from './async-utils.js';
import {
  EMPTY_CONNECTIONS,
  GOOGLE_WORKSPACE_ACTION,
  isConnectorActionTool,
} from './connection-ids.js';
import {
  INITIAL_STATE,
  type PersistedState,
  recoverPersistedState,
} from './persisted-state.js';
import { SAFE_RESEARCH_ACTIONS } from './research-records.js';
import type { BrowserCapabilitySink, ControllerOptions } from './types.js';
import { type ControllerDeps, resolveControllerDeps } from './deps.js';
import { normalizeWorkspace } from './workspace-paths.js';
import type { ResearchOutbox } from './research-outbox.js';
import type { ResearchCapture } from './research-capture.js';
import type { ConnectorConnections } from './connections.js';
import type { CloudAccount } from './account.js';
import type { ProviderAccess } from './providers.js';
import type { Schedules } from './schedules.js';
import type { Attachments } from './attachments.js';
import type { WorkspaceTools } from './workspace.js';
import type { BrowserSession } from './browser.js';
import type { ComputerAccess } from './computer-access.js';
import type { VoiceControls } from './voice.js';
import type { AssistantFeatures } from './assistant.js';
import type { Agents } from './agents.js';
import type { Threads } from './threads.js';
import type { Approvals } from './approvals.js';
import type { Turns } from './turns.js';
import type { TurnRunner } from './turn-runner.js';
import type { RuntimeEventApplier } from './runtime-events.js';
import type { MacSession } from './mac-session.js';
import type { AppSettings } from './settings.js';
import type { AppSupport } from './support.js';

const SIGN_IN_BRIDGE_METHODS: ReadonlySet<BridgeMethod> = new Set([
  'bootstrap',
  'auth.start',
  'auth.complete',
  'auth.signOut',
]);

type BridgeHandler<M extends BridgeMethod> = (
  input: BridgeRequestMap[M],
) => BridgeResultMap[M] | Promise<BridgeResultMap[M]>;
type BridgeHandlers = { [M in BridgeMethod]?: BridgeHandler<M> };

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
  | 'support';

/**
 * Everything the desktop controller knows and does. DesktopController is the public facade;
 * this context holds the shared state and wires the domain collaborators.
 */
export class ControllerContext {
  readonly deps: ControllerDeps;
  // Domain collaborators, created by DesktopController right after this context.
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
  readonly listeners = new Set<(event: DesktopPushEvent) => void>();
  readonly rendererCall = new AsyncLocalStorage<true>();
  readonly previewMemo: ThreadPreviewMemo = new WeakMap();
  readonly workspaceGrants = new Set<string>();
  streamCommitTimer: NodeJS.Timeout | undefined;
  streamPersistTimer: NodeJS.Timeout | undefined;
  runtime: RuntimeCoordinator | undefined;
  browserCapabilitySink: BrowserCapabilitySink | undefined;
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

  actionInvocationObserver(): ActionInvocationObserver {
    return (invocation) => {
      if (GOOGLE_WORKSPACE_ACTION.test(invocation.name)) {
        this.researchCapture.excludeResearchTurn(invocation.context.turnId);
        this.deps.trajectory?.excludeTurn(
          invocation.context.threadId,
          invocation.context.turnId,
        );
        return;
      }
      if (SAFE_RESEARCH_ACTIONS.has(invocation.name)) {
        this.researchCapture.markSafeResearchAction(invocation.context.turnId, invocation.name);
      } else {
        this.researchCapture.taintResearchTurn(invocation.context.turnId);
      }
    };
  }

  actionResultObserver(): ActionResultObserver {
    return (notice) => {
      const thread = this.state.threads.find((entry) => entry.id === notice.context.threadId);
      if (
        thread &&
        !this.assistant.library.isReview(thread.id) &&
        !this.releaseAccessLocked() &&
        !/^(memory_|assistant_)/.test(notice.name)
      ) {
        // Operational journal deliberately excludes arguments, message bodies, URLs and screenshots.
        this.assistant.library.record({
          agentId: thread.agentId,
          threadId: thread.id,
          turnId: notice.context.turnId,
          kind: 'action',
          title: notice.name,
          text: notice.result.outcome,
        });
      }
      this.recordActionResult(notice);
      if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) return;
      this.researchCapture.stageRawResearchEvent({
        threadId: notice.context.threadId,
        turnId: notice.context.turnId,
        eventType: 'sia.action_result',
        data: {
          name: notice.name,
          arguments: notice.arguments ?? {},
          result: notice.result,
        },
      });
      this.researchCapture.stageResearchActionResult(notice);
    };
  }

  actionToolAvailable(name: string): boolean {
    if (this.releaseAccessLocked()) return false;
    if (isConnectorActionTool(name)) {
      return (
        this.deps.fakeServices ||
        (this.deps.cloud.configured &&
          this.deps.identity.status().state === 'signed_in' &&
          this.state.cloudFeatures.connectors)
      );
    }
    if (name.startsWith('schedule_')) return this.schedules.schedulesAvailable();
    return true;
  }

  scotty: ScottySettingsApi | undefined;
  attachScotty(handler: ScottySettingsApi): void {
    this.scotty = handler;
  }

  phoneRemote: PhoneRemoteApi | undefined;
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

  recordActionResult(notice: Parameters<ActionResultObserver>[0]): void {
    if (!this.deps.trajectory) return;
    if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) {
      return;
    }
    const images = (notice.result.images ?? []).map((image) => ({
      mimeType: image.mimeType,
      dataBase64: image.dataBase64,
    }));
    this.deps.trajectory.record(
      {
        type: 'action_result',
        threadId: notice.context.threadId,
        turnId: notice.context.turnId,
        name: notice.name,
        arguments: notice.arguments ?? {},
        outcome: notice.result.outcome,
        summary: notice.result.summary,
        ...(notice.result.reason ? { reason: notice.result.reason } : {}),
        ...(notice.result.data !== undefined ? { data: notice.result.data } : {}),
      },
      images,
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
    this.providers.views = providers;
    await this.computerAccess.refreshCapabilityStatuses().catch(() => undefined);
    if (this.deps.fakeServices) {
      const codexIndex = this.providers.views.findIndex(({ id }) => id === 'codex');
      const fakeCodex: ProviderView = {
        id: 'codex',
        label: 'Codex',
        ...(providerPlan('codex') ? { plan: providerPlan('codex')! } : {}),
        status: 'ready',
        model: 'gpt-5.6-sol',
        version: '0.147.0',
        account: 'Deterministic test runtime',
        detail: 'Deterministic local development runtime.',
        billing: 'No provider account is used in fake-services mode.',
        models: [
          {
            id: 'gpt-5.6-sol',
            label: 'GPT-5.6 Sol',
            description: 'Deterministic test model.',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoningEffort: 'high',
          },
          {
            id: 'gpt-5.6-terra',
            label: 'GPT-5.6 Terra',
            description: 'Deterministic alternate test model.',
            reasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
        ],
      };
      if (codexIndex >= 0) this.providers.views[codexIndex] = fakeCodex;
      else this.providers.views.push(fakeCodex);
    }
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

  /** The complete state, including every thread's history, for in-process callers and tests. */
  snapshot(): DesktopSnapshot {
    return this.buildSnapshot(false);
  }

  /**
   * What the renderer draws: the active thread's history, one preview per thread and the active
   * thread's approvals. Pushing every thread's history on each streamed token made the app slow
   * down as history grew.
   */
  rendererSnapshot(): DesktopSnapshot {
    return this.buildSnapshot(true);
  }

  /** Task metadata and each thread's latest turn, without cloning every thread's history. */
  taskSnapshot(): TaskSnapshot {
    if (this.releaseAccessLocked())
      return {
        revision: this.revision,
        agents: [],
        threads: [],
        timeline: [],
        approvals: [],
        preferences: { completionSound: false, ...this.settings.displayPreferences() },
      };
    const lastRequest = new Map<string, TimelineItemView>();
    for (const item of this.state.timeline)
      if (item.kind === 'user') lastRequest.set(item.threadId, item);
    return {
      revision: this.revision,
      agents: structuredClone(this.state.agents),
      threads: structuredClone(this.state.threads),
      timeline: structuredClone(
        this.state.timeline.filter((item) => {
          const request = lastRequest.get(item.threadId);
          return request !== undefined && item.sequence >= request.sequence;
        }),
      ),
      approvals: structuredClone(this.state.approvals),
      preferences: structuredClone(this.state.preferences),
      screenControl: this.mac.screenControl(),
      ...(this.state.activeAgentId ? { activeAgentId: this.state.activeAgentId } : {}),
    };
  }

  /** Runs a renderer bridge call so that any snapshot it returns is the renderer's scoped view. */
  invokeForRenderer<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    return this.rendererCall.run(true, () => this.invoke(method, input));
  }

  resultSnapshot(): DesktopSnapshot {
    return this.buildSnapshot(this.rendererCall.getStore() === true);
  }

  buildSnapshot(scoped: boolean): DesktopSnapshot {
    const identity = this.deps.identity.status();
    const cloud: DesktopSnapshot['cloud'] = {
      status:
        this.deps.cloud.configured &&
        identity.state === 'signed_in' &&
        !this.account.signOutInProgress
          ? 'online'
          : 'offline',
      auth: this.deps.cloud.configured
        ? this.account.signOutInProgress || identity.state === 'unconfigured'
          ? 'signed_out'
          : identity.state
        : 'unconfigured',
      ...(identity.email ? { account: identity.email } : {}),
      ...(identity.admin ? { admin: true } : {}),
      ...(this.account.cloudParticipant ? { participant: true } : {}),
      ...(identity.adminMfa ? { adminMfa: true } : {}),
      features: structuredClone(this.state.cloudFeatures),
    };
    if (this.releaseAccessLocked()) {
      return {
        revision: this.revision,
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
        preferences: { completionSound: false, ...this.settings.displayPreferences() },
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
      revision: this.revision,
      agents: structuredClone(this.state.agents),
      threads: structuredClone(this.state.threads),
      ...(scoped
        ? {
            timeline: structuredClone(
              this.state.timeline.filter(
                ({ threadId }) => threadId === this.state.activeThreadId,
              ),
            ),
            previews: structuredClone(
              Object.fromEntries(threadPreviews(this.state.timeline, this.previewMemo)),
            ),
            approvals: structuredClone(
              this.state.approvals.filter(
                ({ threadId }) => threadId === this.state.activeThreadId,
              ),
            ),
          }
        : {
            timeline: structuredClone(this.state.timeline),
            approvals: structuredClone(this.state.approvals),
          }),
      providers: this.providers.views.map((provider) => ({
        ...structuredClone(provider),
        ...(this.providers.usageLimits.has(provider.id)
          ? { limits: { ...this.providers.usageLimits.get(provider.id)! } }
          : {}),
        ...(provider.id === 'codex' && this.providers.codexSetup
          ? { setup: { ...this.providers.codexSetup } }
          : {}),
      })),
      connections: structuredClone(this.state.connections),
      capture: structuredClone(this.state.capture),
      computer: {
        ...structuredClone(this.computerAccess.state),
        ...(this.computerAccess.automationPermissions
          ? { automation: this.computerAccess.automationPermissions }
          : {}),
        ...(this.computerAccess.messagesAccess
          ? { messagesAccess: this.computerAccess.messagesAccess }
          : {}),
        ...(this.computerAccess.chromeConnection
          ? { chromeConnection: this.computerAccess.chromeConnection }
          : {}),
        accessMode: this.computerAccess.accessMode(),
        backgroundControl: this.computerAccess.backgroundControl(),
        backgroundFallback: this.computerAccess.backgroundFallback(),
        trust: this.computerAccess.trust(),
        trajectoryLog: this.computerAccess.trajectoryLogEnabled(),
        ...(this.deps.trajectory
          ? { trajectoryDirectory: this.deps.trajectory.rootDirectory }
          : {}),
      },
      browser: structuredClone(this.state.browser),
      voice: {
        ...structuredClone(
          this.deps.voice?.view() ??
            ({ status: 'disconnected', voices: [] } satisfies VoiceView),
        ),
        ...(this.speech.pushToTalk ? { pushToTalk: this.speech.pushToTalk.view() } : {}),
      },
      preferences: structuredClone(this.state.preferences),
      providerUsage: this.providers.providerUsage(),
      updates: structuredClone(this.support.updates),
      schedules: structuredClone(this.state.schedules),
      ...(this.state.activeAgentId ? { activeAgentId: this.state.activeAgentId } : {}),
      ...(this.state.activeThreadId ? { activeThreadId: this.state.activeThreadId } : {}),
      cloud,
      ...(this.deps.startupNotice
        ? { startupNotice: structuredClone(this.deps.startupNotice) }
        : {}),
    };
  }

  subscribe(listener: (event: DesktopPushEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async invoke<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    if (
      method !== 'bootstrap' &&
      method !== 'voice.capture.release' &&
      method !== 'providers.cancelLogin'
    )
      this.providers.requireCodexSetupIdle();
    if (this.account.accountDeletionInProgress && method !== 'bootstrap') {
      throw new Error('Sia account deletion is in progress. Wait for it to finish.');
    }
    if (this.account.signOutInProgress && method !== 'bootstrap') {
      throw new Error('Sia sign-out is in progress. Wait for it to finish.');
    }
    if (this.releaseAccessLocked() && !SIGN_IN_BRIDGE_METHODS.has(method)) {
      throw new Error('Sign in to Sia to continue.');
    }
    const handler = this.bridgeHandlers[method] as BridgeHandler<M> | undefined;
    if (!handler) throw new Error(`Unknown desktop method: ${String(method)}`);
    return await handler(input);
  }

  /** One canonical route per renderer bridge method. */
  readonly bridgeHandlers: BridgeHandlers = {
    bootstrap: () => this.resultSnapshot(),
    'scotty.configure': (input) => this.configureScotty(input),
    'phone.remote': (input) => this.phoneRemoteCommand(input),
    'agents.save': (input) => this.agents.saveAgent(input),
    'assistant.library': (input) => this.assistant.assistantLibraryCommand(input),
    'agents.delete': ({ agentId }) => this.agents.deleteAgent(agentId),
    'agents.setPinned': (input) => this.agents.setAgentPinned(input),
    'agents.setNotifications': (input) => this.agents.setAgentNotifications(input),
    'agents.duplicate': ({ agentId }) => this.agents.duplicateAgent(agentId),
    'threads.create': (input) => this.threads.openNewThread(input),
    'threads.select': ({ threadId }) => this.threads.selectThread(threadId),
    'threads.rename': (input) => this.threads.renameThread(input),
    'threads.draft': (input) => this.threads.setThreadDraft(input),
    'threads.config': (input) => this.threads.configureThread(input),
    'threads.archive': ({ threadId }) => this.threads.archiveThread(threadId),
    'threads.unarchive': ({ threadId }) => this.threads.unarchiveThread(threadId),
    'threads.setUnread': (input) => this.threads.setThreadUnread(input),
    'threads.setPinned': (input) => this.threads.setThreadPinned(input),
    'threads.fork': (input) => this.threads.forkThread(input),
    'threads.handoff': (input) => this.threads.handoffThread(input),
    'worktrees.cleanup': (input) => this.threads.cleanupWorktree(input),
    'threads.search': ({ query }) => this.threads.searchThreads(query),
    'threads.goal.set': (input) => this.threads.setGoal(input),
    'threads.goal.pause': ({ threadId }) => this.threads.pauseGoal(threadId),
    'threads.goal.resume': ({ threadId }) => this.threads.resumeGoal(threadId),
    'threads.goal.clear': ({ threadId }) => this.threads.clearGoal(threadId),
    'threads.delete': ({ threadId }) => this.threads.deleteThread(threadId),
    'threads.send': (input) => this.turns.sendTurn(input),
    'threads.retry': ({ threadId }) => this.turns.retryTurn(threadId),
    'threads.redo': (input) => this.turns.redoLastTurn(input),
    'threads.unqueue': ({ threadId, messageId }) =>
      this.turns.unqueueMessage(threadId, messageId),
    'threads.cancel': ({ threadId }) => this.turns.cancelTurn(threadId),
    'threads.steer': ({ threadId, messageId }) =>
      this.turns.steerQueuedMessage(threadId, messageId),
    'attachments.pick': ({ threadId }) => this.attachments.pickAttachments(threadId),
    'attachments.drop': ({ threadId, paths }) =>
      this.attachments.grantAttachments(threadId, paths),
    'attachments.paste': (input) => this.attachments.pasteAttachment(input),
    'attachments.preview': (input) => this.attachments.previewAttachment(input),
    'attachments.open': (input) => this.attachments.openAttachment(input),
    'attachments.reveal': (input) => this.attachments.revealAttachment(input),
    'changes.read': ({ threadId }) => this.workspace.readChanges(threadId),
    'changes.stage': (input) => this.workspace.stageChanges(input),
    'changes.restore': (input) => this.workspace.restoreChanges(input),
    'changes.snapshots.list': ({ threadId }) => this.workspace.listWorkspaceSnapshots(threadId),
    'changes.snapshots.create': ({ threadId }) =>
      this.workspace.createWorkspaceSnapshot(threadId),
    'changes.snapshots.restore': (input) => this.workspace.restoreWorkspaceSnapshot(input),
    'changes.snapshots.delete': (input) => this.workspace.deleteWorkspaceSnapshot(input),
    'changes.turn.read': (input) => this.workspace.readTurnChanges(input),
    'changes.turn.apply': (input) => this.workspace.applyTurnChanges(input),
    'terminal.run': (input) => this.workspace.runTerminal(input),
    'terminal.start': (input) => this.workspace.startBackgroundTerminal(input),
    'terminal.list': ({ threadId }) => this.workspace.listBackgroundTerminals(threadId),
    'terminal.write': (input) => this.workspace.writeBackgroundTerminal(input),
    'terminal.stop': (input) => this.workspace.stopBackgroundTerminal(input),
    'reviews.start': (input) => this.workspace.startReview(input),
    'schedules.create': (input) => this.schedules.createSchedule(input),
    'schedules.update': (input) => this.schedules.updateSchedule(input),
    'schedules.setEnabled': (input) => this.schedules.setScheduleEnabled(input),
    'schedules.delete': ({ scheduleId }) => this.schedules.deleteSchedule(scheduleId),
    'schedules.runNow': ({ scheduleId }) => this.schedules.runScheduleNow(scheduleId),
    'approvals.resolve': (input) => this.approvals.resolveApproval(input),
    'providers.probe': ({ providerId }) => this.providers.probeProviders(providerId),
    'providers.login': ({ providerId }) => this.providers.providerLogin(providerId),
    'providers.cancelLogin': () => this.providers.cancelProviderLogin(),
    'settings.openDirectory': async () => ({
      path: await this.workspace.grantChosenDirectory(),
    }),
    'settings.setOnboarding': (input) => this.settings.setOnboarding(input),
    'settings.restartForOnboarding': () => this.settings.restartForOnboarding(),
    'computer.setupMessages': () => this.computerAccess.setupMessages(),
    'settings.setAppearance': ({ appearance }) => this.settings.setAppearance(appearance),
    'settings.setTheme': ({ theme }) => this.settings.setTheme(theme),
    'settings.setTextSize': ({ textSize }) => this.settings.setTextSize(textSize),
    'settings.setCompletionSound': ({ enabled }) => this.settings.setCompletionSound(enabled),
    'settings.setOpenAtLogin': ({ enabled }) => this.settings.setOpenAtLogin(enabled),
    'settings.setDeveloperTools': ({ enabled }) => this.settings.setDeveloperTools(enabled),
    'feedback.compose': (input) => this.support.composeFeedbackMessage(input),
    'updates.check': () => this.support.checkForUpdates(),
    'updates.openDownload': () => this.support.openUpdateDownload(),
    'computer.permissions': () => this.computerAccess.refreshComputer(false),
    'computer.requestPermissions': (input) =>
      this.computerAccess.refreshComputer(true, input?.permission),
    'computer.requestAutomation': ({ app }) => this.computerAccess.requestAutomation(app),
    'computer.openMessages': () => this.computerAccess.openMessagesApp(),
    'computer.setAccessMode': (input) => this.computerAccess.setAccessMode(input),
    'computer.setTrust': ({ trust }) => this.computerAccess.setComputerTrust(trust),
    'computer.setTrajectoryLog': ({ enabled }) => this.computerAccess.setTrajectoryLog(enabled),
    'computer.revealTrajectories': () => this.computerAccess.revealTrajectories(),
    'browser.connectAndContinue': (input) => this.browser.connectBrowserAndContinue(input),
    'browser.attach': (input) => this.browser.attachBrowser(input),
    'browser.open': ({ url }) => this.browser.openBrowserUrl(url),
    'browser.detach': () => this.browser.detachBrowser(),
    'voice.pushToTalk.configure': (input) => this.speech.configurePushToTalk(input),
    'voice.pushToTalk.cancel': () => this.speech.cancelPushToTalk(),
    'voice.capture.acquire': () => this.speech.acquireRendererCapture(),
    'voice.capture.release': ({ leaseId }) => this.speech.releaseRendererCapture(leaseId),
    'voice.configure': () => this.speech.configureVoice(),
    'voice.refresh': () => this.speech.refreshVoice(),
    'voice.select': ({ voiceId }) => this.speech.selectVoice(voiceId),
    'voice.disconnect': () => this.speech.disconnectVoice(),
    'voice.transcribe': (input) => this.speech.transcribe(input),
    'voice.realtime.start': () => this.speech.startRealtime(),
    'voice.realtime.append': (input) => this.speech.appendRealtime(input),
    'voice.realtime.stop': (input) => this.speech.stopRealtime(input),
    'voice.speak': (input) => this.speech.speak(input),
    'connections.startGoogle': () => this.connections.startGoogleConnections(),
    'connections.startSelected': ({ apps }) => this.connections.startSelectedConnections(apps),
    'connections.upgradeGoogle': () => this.connections.upgradeGoogleConnections(),
    'connections.start': ({ connectionId }) =>
      this.connections.startAppConnection(connectionId),
    'connections.setEnabled': (input) => this.connections.setConnectionEnabled(input),
    'connections.disconnect': (input) => this.connections.disconnectConnection(input),
    'auth.start': ({ email }) => this.account.startSignIn(email),
    'auth.complete': ({ code }) => this.account.completeSignIn(code),
    'auth.mfaBegin': () => this.account.beginMfaEnrollment(),
    'auth.mfaComplete': ({ code }) => this.account.completeMfaEnrollment(code),
    'auth.signOut': () => this.account.signOut(),
    'auth.deleteAccount': ({ confirmation }) => this.account.deleteCloudAccount(confirmation),
    'research.setCapture': (input) => this.researchOutbox.setCapture(input),
    'research.export': () => this.researchOutbox.exportResearch(),
    'research.delete': ({ confirmation }) => this.researchOutbox.deleteResearch(confirmation),
    'research.admin.invites': () => this.deps.cloud.listAdminInvites(),
    'research.admin.invite': ({ email }) => this.deps.cloud.createAdminInvite(email),
    'research.admin.participants': () => this.deps.cloud.listAdminResearchParticipants(),
    'research.admin.batches': ({ subject }) =>
      this.deps.cloud.listAdminResearchBatches(subject),
    'research.admin.readBatch': ({ subject, batchId }) =>
      this.deps.cloud.readAdminResearchBatch(subject, batchId),
  };

  async configureScotty(
    input: BridgeRequestMap['scotty.configure'],
  ): Promise<BridgeResultMap['scotty.configure']> {
    if (!this.scotty) throw new Error('Scotty is unavailable in this build.');
    return await this.scotty(input);
  }

  async phoneRemoteCommand(
    input: BridgeRequestMap['phone.remote'],
  ): Promise<BridgeResultMap['phone.remote']> {
    if (!this.phoneRemote) throw new Error('Phone remote is unavailable in this build.');
    return await this.phoneRemote(input);
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
    const event: DesktopPushEvent = { type: 'snapshot', snapshot: this.rendererSnapshot() };
    for (const listener of this.listeners) listener(event);
  }
}
