import { taskRecoveryContext } from '../task-recovery.js';
import type { TaskSnapshot } from '../latest-task-turn.js';
import type { PhoneRemoteApi } from '../../shared/phone-remote.js';
import type { ScottySettingsApi } from '../../shared/scotty.js';
import { MEMORY_REVIEW_PROMPT, NATIVE_MEMORY_REVIEW_PROMPT } from '../memory-suggestions.js';
import { activityLabel } from '../../shared/activity-label.js';
import { conversationTitle, UNTITLED_THREAD_TITLE } from '../../shared/plain-text.js';
import { turnFinishedNotice } from '../notification-copy.js';
import { threadPreviews, type ThreadPreviewMemo } from '../../shared/thread-previews.js';
import { NotchVault } from '../notch/vault.js';
import { notchConsolidationInstructions } from '../notch/foreground.js';
import type { MacTaskResult } from '../mac-execution.js';
import { DESKTOP_EXECUTION_GUIDANCE } from '../assistant-library.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

import {
  LocalLeaseCoordinator,
  parseActionArguments,
  type TurnLease,
} from '@sia/action-gateway';
import type {
  ActionInvocationObserver,
  ActionResultObserver,
  ApprovalBroker,
  ApprovalRequest as GatewayApprovalRequest,
} from '@sia/action-gateway';
import type { ProviderAttachment, ThreadEventEnvelope } from '@sia/protocol';
import { legacyModelRoute, resolveExecutionTarget } from '@sia/runtime';

import type {
  ActivityPresentationView,
  AgentView,
  ApprovalView,
  BridgeMethod,
  BridgeRequestMap,
  BridgeResultMap,
  DesktopPushEvent,
  DesktopSnapshot,
  ProviderView,
  ThreadView,
  TimelineItemView,
  UpdateView,
  VoiceView,
} from '../../shared/bridge.js';
import { probeProviders, providerPlan } from '../provider-probe.js';
import type { RuntimeCoordinator } from '../runtime-coordinator.js';
import type { CuaAuthorizationContext } from '../cua-service.js';
import { RESEARCH_CONSENT_VERSION } from '../../shared/bridge.js';
import { verifyUpdateManifestResponse } from '../update-manifest.js';
import {
  isTextSize,
  isTheme,
  type TextSize,
  type ThemePreference,
} from '../../shared/display.js';
import {
  computerApprovalPresentation,
  safeResourceLabel,
  summarizeActionTarget,
  summarizeDataLeaving,
} from '../approval-copy.js';
import {
  humanizeToolName,
  mapRuntimePresentation,
  runtimeToolTitle,
} from '../runtime-activity.js';
import { gatewayTaskGrant } from './approval-grants.js';
import { abortableDelay, settleBeforeShutdown } from './async-utils.js';
import { backgroundControlUnavailable } from './computer-access.js';
import {
  connectorAppForTool,
  EMPTY_CONNECTIONS,
  GOOGLE_WORKSPACE_ACTION,
  isConnectorActionTool,
} from './connection-ids.js';
import { modelRouteKey, requireReleaseProvider } from './execution-routes.js';
import {
  INITIAL_STATE,
  type PersistedState,
  recoverPersistedState,
} from './persisted-state.js';
import { SAFE_RESEARCH_ACTIONS } from './research-records.js';
import { isStreamingDelta } from './runtime-events.js';
import { extractHttpUrls, safeUrlHost, searchExcerpt } from './thread-search.js';
import type {
  ApprovedConnectorBinding,
  BrowserCapabilitySink,
  ControllerOptions,
  PendingApproval,
  QueuedTurn,
} from './types.js';
import { type ControllerDeps, resolveControllerDeps } from './deps.js';
import { compareVersions, isCleanHttpsUrl } from './update-feed.js';
import { normalizeWorkspace, workspaceSlug, worktreeLabel } from './workspace-paths.js';
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
  | 'assistant';

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
  readonly listeners = new Set<(event: DesktopPushEvent) => void>();
  readonly rendererCall = new AsyncLocalStorage<true>();
  readonly previewMemo: ThreadPreviewMemo = new WeakMap();
  readonly runningTurns = new Map<string, AbortController>();
  /** Running Use my Mac turns by thread; they hold the keep-awake assertion. */
  readonly macTurns = new Map<string, QueuedTurn>();
  /** Mac turns currently keeping the display awake; a turn waiting on the person does not. */
  readonly awakeTurns = new Set<string>();
  /** Mac turns that started with On my screen: they show the on-screen indicator and hold ⌃Esc. */
  readonly foregroundTurns = new Set<string>();
  macUnavailable: 'locked' | 'asleep' | undefined;
  readonly phoneTurns = new Set<string>();
  readonly turnTasks = new Map<string, Promise<void>>();
  readonly workspaceLeases = new Map<string, string>();
  readonly pendingApprovals = new Map<string, PendingApproval>();
  /** "Allow for this task" grants by turn id; a grant ends with its turn. */
  readonly taskGrants = new Map<string, Set<string>>();
  readonly approvedConnectorBindings = new Map<string, ApprovedConnectorBinding>();
  readonly pendingQuestions = new Map<string, { requestId: string; turnId: string }>();
  readonly workspaceGrants = new Set<string>();
  readonly failedTurnAttachments = new Map<string, readonly ProviderAttachment[]>();
  readonly actionLeases = new LocalLeaseCoordinator(4);
  queuedTurns: QueuedTurn[] = [];
  /**
   * Threads whose Mac task paused on lock or sleep. Their queued follow-ups wait for the
   * person to press Continue task, send a message, or Stop, instead of skipping the pause.
   */
  readonly heldThreads = new Set<string>();
  streamCommitTimer: NodeJS.Timeout | undefined;
  streamPersistTimer: NodeJS.Timeout | undefined;
  runtime: RuntimeCoordinator | undefined;
  browserCapabilitySink: BrowserCapabilitySink | undefined;
  state: PersistedState = structuredClone(INITIAL_STATE);
  revision = 0;
  shuttingDown = false;
  updates: UpdateView;

  constructor(
    options: ControllerOptions,
    wire: (ctx: ControllerContext) => ControllerServices,
  ) {
    this.deps = resolveControllerDeps(options);
    this.updates = {
      status: this.deps.updateManifestUrl ? 'idle' : 'unconfigured',
      currentVersion: this.deps.appVersion,
      detail: this.deps.updateManifestUrl
        ? 'Ready to check the configured release feed.'
        : 'This build does not have a persistent signed update feed configured.',
    };
    Object.assign(this, wire(this));
  }

  /**
   * A locked or sleeping Mac blocks both Use my Mac routes. Running Mac tasks pause with a
   * Continue task banner; new ones wait in the queue until the Mac is available again.
   */
  setMacAvailability(state: 'available' | 'locked' | 'asleep'): void {
    const wasUnavailable = this.macUnavailable;
    this.macUnavailable = state === 'available' ? undefined : state;
    if (!this.macUnavailable) {
      if (wasUnavailable) {
        this.drainQueue();
        this.commit();
      }
      return;
    }
    const text =
      state === 'locked'
        ? 'Your Mac locked, so Sia paused this task. Unlock your Mac and press Continue task.'
        : 'Your Mac went to sleep, so Sia paused this task. Wake your Mac and press Continue task.';
    if (!this.macTurns.size) return;
    for (const threadId of [...this.macTurns.keys()]) this.pauseMacTurn(threadId, text);
    this.commit();
  }

  pauseMacTurn(threadId: string, text: string): void {
    const thread = this.requireThread(threadId);
    const running = this.runningTurns.get(threadId);
    const turn = this.macTurns.get(threadId);
    if (!running || !turn || running.signal.aborted) return;
    this.speech.pushToTalk?.cancelTask(threadId);
    running.abort();
    this.revokeApprovalsForTurn(threadId, turn.id);
    void this.runtime?.cancel(threadId, turn.id).catch(() => undefined);
    const question = this.pendingQuestions.get(threadId);
    this.pendingQuestions.delete(threadId);
    if (question)
      void this.runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    if (turn.attachments?.length) this.failedTurnAttachments.set(turn.id, turn.attachments);
    this.heldThreads.add(threadId);
    thread.status = 'failed';
    delete thread.queueReason;
    thread.interruptedTurnId = turn.id;
    this.appendTimeline(threadId, {
      id: randomUUID(),
      turnId: turn.id,
      kind: 'error',
      title: 'Task paused',
      text,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });
    thread.updatedAt = new Date().toISOString();
  }

  isMacTurn(threadId: string): boolean {
    return (
      this.computerAccess.accessMode() === 'mac' && !this.assistant.library.isReview(threadId)
    );
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

  approvalBroker(): ApprovalBroker {
    return {
      requestApproval: (request, signal) => this.authorizeGatewayAction(request, signal),
    };
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

  /**
   * Theme and text size. They hold nothing private, so they apply before sign-in too and main
   * mirrors them for the next launch's first frame.
   */
  displayPreferences(): { theme?: ThemePreference; textSize?: TextSize } {
    const { theme, textSize } = this.state.preferences;
    return { ...(theme ? { theme } : {}), ...(textSize ? { textSize } : {}) };
  }

  /** Settings → Developer tools (Command tool, worktree duplicates, View → Reload). */
  developerToolsEnabled(): boolean {
    return this.state.preferences.developerTools === true;
  }

  /**
   * Full bypass never extends to phone turns: the phone link is plain HTTP on the local network,
   * so anyone who observes it could otherwise run unattended actions on this Mac.
   */
  trustForTurn(turnId: string | undefined): 'auto' | 'ask' {
    return turnId && this.phoneTurns.has(turnId) ? 'ask' : this.computerAccess.trust();
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

  async composeFeedbackMessage(
    input: BridgeRequestMap['feedback.compose'],
  ): Promise<BridgeResultMap['feedback.compose']> {
    if (!this.deps.composeFeedback)
      throw new Error('Feedback handoff is unavailable in this build.');
    if (input.threadId) this.requireThread(input.threadId);
    const diagnostics = input.includeDiagnostics
      ? [
          '',
          '--- Sia diagnostics (no transcript or file contents) ---',
          `Version: ${this.deps.appVersion}`,
          ...(input.threadId ? [`Thread ID: ${input.threadId}`] : []),
          `Providers: ${this.providers.views.map(({ id, status }) => `${id}=${status}`).join(', ')}`,
        ].join('\n')
      : '';
    await this.deps.composeFeedback(
      'Sia internal feedback',
      `${input.message.trim()}${diagnostics}`,
    );
    return { opened: true };
  }

  async checkForUpdates(): Promise<UpdateView> {
    if (!this.deps.updateManifestUrl) return structuredClone(this.updates);
    if (!isCleanHttpsUrl(this.deps.updateManifestUrl)) {
      this.updates = {
        status: 'error',
        currentVersion: this.deps.appVersion,
        detail: 'The configured release feed must be a clean HTTPS URL.',
      };
      this.emit();
      return structuredClone(this.updates);
    }
    this.updates = {
      status: 'checking',
      currentVersion: this.deps.appVersion,
      detail: 'Checking the configured release feed…',
    };
    this.emit();
    try {
      if (!this.deps.updateManifestPublicKey) {
        throw new Error('The release feed does not have a pinned signing key.');
      }
      await this.deps.identity.refreshSession?.();
      const token = await this.deps.identity.read?.();
      if (!token) throw new Error('Sign in with an approved Sia account to check for updates.');
      const response = await fetch(this.deps.updateManifestUrl, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Release feed returned HTTP ${response.status}.`);
      const verified = verifyUpdateManifestResponse(
        await response.json(),
        this.deps.updateManifestPublicKey,
      );
      const latestVersion = verified.payload.version;
      const downloadUrl = verified.downloadUrl;
      const available = compareVersions(latestVersion, this.deps.appVersion) > 0;
      this.updates = {
        status: available ? 'available' : 'current',
        currentVersion: this.deps.appVersion,
        latestVersion,
        ...(available ? { downloadUrl } : {}),
        detail: available
          ? `Sia ${latestVersion} is ready to download.`
          : 'This build is up to date.',
      };
    } catch (error) {
      this.updates = {
        status: 'error',
        currentVersion: this.deps.appVersion,
        detail:
          error instanceof Error ? error.message : 'The release feed could not be checked.',
      };
    }
    this.emit();
    return structuredClone(this.updates);
  }

  async openUpdateDownload(): Promise<BridgeResultMap['updates.openDownload']> {
    if (this.updates.status !== 'available' || !this.updates.downloadUrl) {
      throw new Error('Check for updates before opening a download.');
    }
    await this.deps.openExternal(this.updates.downloadUrl);
    return { opened: true };
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

  /**
   * Use my Mac turns that are actively working (not paused or waiting on the person), and
   * whether each controls the screen or works in the background.
   */
  screenControl(): Record<string, 'foreground' | 'background'> {
    const result: Record<string, 'foreground' | 'background'> = {};
    if (this.releaseAccessLocked() || this.macUnavailable) return result;
    for (const threadId of this.macTurns.keys()) {
      const running = this.runningTurns.get(threadId);
      const thread = this.state.threads.find(({ id }) => id === threadId);
      if (!running || running.signal.aborted || thread?.status !== 'running') continue;
      result[threadId] = this.foregroundTurns.has(threadId) ? 'foreground' : 'background';
    }
    return result;
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
        preferences: { completionSound: false, ...this.displayPreferences() },
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
      screenControl: this.screenControl(),
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
        preferences: { completionSound: false, ...this.displayPreferences() },
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
      updates: structuredClone(this.updates),
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
    'agents.save': (input) => this.saveAgent(input),
    'assistant.library': (input) => this.assistant.assistantLibraryCommand(input),
    'agents.delete': ({ agentId }) => this.deleteAgent(agentId),
    'agents.setPinned': (input) => this.setAgentPinned(input),
    'agents.setNotifications': (input) => this.setAgentNotifications(input),
    'agents.duplicate': ({ agentId }) => this.duplicateAgent(agentId),
    'threads.create': (input) => this.openNewThread(input),
    'threads.select': ({ threadId }) => this.selectThread(threadId),
    'threads.rename': (input) => this.renameThread(input),
    'threads.draft': (input) => this.setThreadDraft(input),
    'threads.config': (input) => this.configureThread(input),
    'threads.archive': ({ threadId }) => this.archiveThread(threadId),
    'threads.unarchive': ({ threadId }) => this.unarchiveThread(threadId),
    'threads.setUnread': (input) => this.setThreadUnread(input),
    'threads.setPinned': (input) => this.setThreadPinned(input),
    'threads.fork': (input) => this.forkThread(input),
    'threads.handoff': (input) => this.handoffThread(input),
    'worktrees.cleanup': (input) => this.cleanupWorktree(input),
    'threads.search': ({ query }) => this.searchThreads(query),
    'threads.goal.set': (input) => this.setGoal(input),
    'threads.goal.pause': ({ threadId }) => this.pauseGoal(threadId),
    'threads.goal.resume': ({ threadId }) => this.resumeGoal(threadId),
    'threads.goal.clear': ({ threadId }) => this.clearGoal(threadId),
    'threads.delete': ({ threadId }) => this.deleteThread(threadId),
    'threads.send': (input) => this.sendTurn(input),
    'threads.retry': ({ threadId }) => this.retryTurn(threadId),
    'threads.redo': (input) => this.redoLastTurn(input),
    'threads.unqueue': ({ threadId, messageId }) => this.unqueueMessage(threadId, messageId),
    'threads.cancel': ({ threadId }) => this.cancelTurn(threadId),
    'threads.steer': ({ threadId, messageId }) => this.steerQueuedMessage(threadId, messageId),
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
    'approvals.resolve': (input) => this.resolveApproval(input),
    'providers.probe': ({ providerId }) => this.providers.probeProviders(providerId),
    'providers.login': ({ providerId }) => this.providers.providerLogin(providerId),
    'providers.cancelLogin': () => this.providers.cancelProviderLogin(),
    'settings.openDirectory': async () => ({
      path: await this.workspace.grantChosenDirectory(),
    }),
    'settings.setOnboarding': (input) => this.setOnboarding(input),
    'settings.restartForOnboarding': () => this.restartForOnboarding(),
    'computer.setupMessages': () => this.computerAccess.setupMessages(),
    'settings.setAppearance': ({ appearance }) => this.setAppearance(appearance),
    'settings.setTheme': ({ theme }) => this.setTheme(theme),
    'settings.setTextSize': ({ textSize }) => this.setTextSize(textSize),
    'settings.setCompletionSound': ({ enabled }) => this.setCompletionSound(enabled),
    'settings.setOpenAtLogin': ({ enabled }) => this.setOpenAtLoginPreference(enabled),
    'settings.setDeveloperTools': ({ enabled }) => this.setDeveloperTools(enabled),
    'feedback.compose': (input) => this.composeFeedbackMessage(input),
    'updates.check': () => this.checkForUpdates(),
    'updates.openDownload': () => this.openUpdateDownload(),
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

  setOnboarding({
    step,
    permissionSetup,
  }: BridgeRequestMap['settings.setOnboarding']): DesktopSnapshot {
    const previous = this.state.preferences.onboarding;
    const candidateId = step === 'welcome' ? this.state.activeAgentId : previous?.agentId;
    const agent = this.state.agents.find(({ id }) => id === candidateId);
    if (['voice', 'access', 'apps', 'restart', 'verify', 'practice'].includes(step) && !agent) {
      throw new Error('Create your agent before continuing setup.');
    }
    this.state.preferences.onboarding = {
      ...(step === 'welcome' ? {} : previous),
      ...(permissionSetup ? { permissionSetup } : {}),
      step,
      ...(agent ? { agentId: agent.id } : {}),
    };
    this.commit();
    return this.resultSnapshot();
  }

  restartForOnboarding(): DesktopSnapshot {
    const progress = this.state.preferences.onboarding;
    if (
      !progress ||
      !['restart', 'verify'].includes(progress.step) ||
      !this.state.agents.some(({ id }) => id === progress.agentId)
    )
      throw new Error('Finish connecting your apps before restarting setup.');
    if (!this.deps.restartApp) throw new Error('Restart is unavailable in this build.');
    if (
      this.connections.setup ||
      this.state.connections.some((app) => app.status === 'connecting')
    )
      throw new Error('Finish or cancel account approval before restarting.');
    if (this.runningTurns.size || this.speech.pushToTalk?.busy)
      throw new Error('Wait for the current task or recording to finish before restarting.');
    if (progress.restartPending) return this.resultSnapshot();
    this.state.preferences.onboarding = {
      ...progress,
      step: 'verify',
      restartPending: true,
      restarted: false,
    };
    this.commit();
    try {
      this.deps.restartApp();
    } catch (error) {
      this.state.preferences.onboarding = progress;
      this.commit();
      throw error;
    }
    return this.resultSnapshot();
  }

  setAppearance(
    appearance: BridgeRequestMap['settings.setAppearance']['appearance'],
  ): DesktopSnapshot {
    this.state.preferences.appearance = appearance;
    this.commit();
    return this.resultSnapshot();
  }

  setTheme(theme: BridgeRequestMap['settings.setTheme']['theme']): DesktopSnapshot {
    if (!isTheme(theme)) throw new Error('Choose System, Light, or Dark.');
    if (theme === 'system') delete this.state.preferences.theme;
    else this.state.preferences.theme = theme;
    this.commit();
    return this.resultSnapshot();
  }

  setTextSize(textSize: BridgeRequestMap['settings.setTextSize']['textSize']): DesktopSnapshot {
    if (!isTextSize(textSize)) throw new Error('Choose a text size from the list.');
    if (textSize === 'default') delete this.state.preferences.textSize;
    else this.state.preferences.textSize = textSize;
    this.commit();
    return this.resultSnapshot();
  }

  setCompletionSound(enabled: boolean): DesktopSnapshot {
    this.state.preferences.completionSound = enabled;
    this.commit();
    return this.resultSnapshot();
  }

  setOpenAtLoginPreference(enabled: boolean): DesktopSnapshot {
    if (!this.deps.setOpenAtLogin) throw new Error('Opening at login is unavailable here.');
    this.deps.setOpenAtLogin(enabled);
    this.state.preferences.openAtLogin = enabled;
    this.commit();
    return this.resultSnapshot();
  }

  setDeveloperTools(enabled: boolean): DesktopSnapshot {
    if (enabled) this.state.preferences.developerTools = true;
    else delete this.state.preferences.developerTools;
    this.commit();
    return this.resultSnapshot();
  }

  async authorizeComputer(
    request: {
      adapterId: string;
      riskClass: string;
      permissionMode: string;
      publicSession: string;
      requestDigest: string;
      humanSummary: string;
      resourceJson: string;
      expiresUnixMs: bigint;
    },
    context: CuaAuthorizationContext,
  ): Promise<'allow' | 'deny' | 'cancel'> {
    if (this.releaseAccessLocked()) return 'deny';
    if (context.kind === 'direct_user') return 'allow';
    const active = this.activeTurnId(context.threadId);
    if (active !== context.turnId) return 'cancel';
    const presentation = computerApprovalPresentation(request.adapterId, request.humanSummary);
    const resource = safeResourceLabel(request.resourceJson, presentation.kind);
    const taskGrant =
      ['native_tool', 'foreground_takeover'].includes(presentation.kind) &&
      !this.phoneTurns.has(context.turnId)
        ? [
            'computer',
            request.adapterId,
            request.riskClass,
            request.permissionMode,
            resource,
          ].join('\u0000')
        : undefined;
    if (
      this.trustForTurn(active) === 'auto' ||
      (taskGrant && this.hasTaskGrant(context.threadId, context.turnId, taskGrant))
    ) {
      // Trusted local mode: the driver's own risk prompt is answered for the person, but the
      // decision is written to the trajectory log so every action stays reviewable afterwards.
      this.deps.trajectory?.record({
        type: 'computer_authorization',
        threadId: context.threadId,
        turnId: context.turnId,
        decision: 'allow',
        automatic: true,
        adapterId: request.adapterId,
        riskClass: request.riskClass,
        summary: request.humanSummary,
      });
      this.researchCapture.stageRawResearchEvent({
        threadId: context.threadId,
        turnId: context.turnId,
        eventType: 'computer.authorization',
        data: {
          decision: 'allow',
          automatic: true,
          adapterId: request.adapterId,
          riskClass: request.riskClass,
          permissionMode: request.permissionMode,
          requestDigest: request.requestDigest,
          humanSummary: request.humanSummary,
          resourceJson: request.resourceJson,
          expiresUnixMs: request.expiresUnixMs.toString(),
        },
      });
      return 'allow';
    }
    const approvalId = randomUUID();
    const expiresAt = new Date(Number(request.expiresUnixMs)).toISOString();
    this.state.approvals.push({
      id: approvalId,
      threadId: context.threadId,
      callId: request.requestDigest,
      kind: presentation.kind,
      title: presentation.title,
      summary: `${request.humanSummary} (${request.riskClass}, ${request.permissionMode})`,
      target: resource,
      reversible: false,
      expiresAt,
      status: 'pending',
      ...(taskGrant ? { allowForTask: true } : {}),
    });
    this.researchCapture.stageRawResearchEvent({
      threadId: context.threadId,
      turnId: context.turnId,
      eventType: 'computer.authorization_request',
      data: {
        approvalId,
        adapterId: request.adapterId,
        riskClass: request.riskClass,
        permissionMode: request.permissionMode,
        requestDigest: request.requestDigest,
        humanSummary: request.humanSummary,
        resourceJson: request.resourceJson,
        expiresUnixMs: request.expiresUnixMs.toString(),
      },
    });
    this.waitForApproval(context.threadId);
    this.commit();
    this.notifyNeedsAttention(context.threadId, 'approval', presentation.title);

    return new Promise((resolve) => {
      // Wait for the person until the driver's own deadline; Sia adds no shorter limit.
      const remaining = Math.max(0, Number(request.expiresUnixMs) - Date.now());
      const timeout = setTimeout(
        () => {
          this.pendingApprovals.delete(approvalId);
          this.resumeAfterRequest(context.threadId);
          this.setApprovalStatus(approvalId, 'expired');
          this.stageApprovalDecision(approvalId, context, 'expired');
          resolve('cancel');
        },
        Math.min(remaining, 2_147_483_647),
      );
      this.pendingApprovals.set(approvalId, {
        resolve,
        timeout,
        kind: 'computer',
        threadId: context.threadId,
        turnId: context.turnId,
        ...(taskGrant ? { taskGrant } : {}),
      });
    });
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
    for (const controller of this.runningTurns.values()) controller.abort();
    for (const pending of this.pendingApprovals.values()) {
      clearTimeout(pending.timeout);
      pending.resolve('cancel');
    }
    this.pendingApprovals.clear();
    this.taskGrants.clear();
    this.approvedConnectorBindings.clear();
    this.connections.setup?.controller.abort();
    this.browserCapabilitySink?.resetBrowserCapabilities();
    await settleBeforeShutdown(
      Promise.allSettled([...this.turnTasks.values()]),
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

  async saveAgent(
    input: BridgeRequestMap['agents.save'],
  ): Promise<BridgeResultMap['agents.save']> {
    this.requireSignedInReleaseAccount();
    const starter = this.state.agents.find(
      ({ id }) => id === this.state.preferences.onboarding?.agentId,
    );
    if (input.startOnboarding) {
      if (input.id)
        throw new Error('Setup creates a new agent; existing agents are unchanged.');
      if (starter) return { agentId: starter.id, snapshot: this.resultSnapshot() };
      if (this.state.agents.length) throw new Error('Continue setup with your existing agent.');
    }
    const now = new Date().toISOString();
    const existing = input.id
      ? this.state.agents.find((candidate) => candidate.id === input.id)
      : undefined;
    const agentId = existing?.id ?? randomUUID();
    const model = input.model.trim();
    const provider =
      input.provider ?? existing?.provider ?? this.providers.providerForModel(model);
    // An agent already running on a retained compatibility provider keeps its route; nothing
    // new may choose one.
    if (provider !== existing?.provider) requireReleaseProvider(provider);
    this.providers.requireReadyProvider(provider, model);
    let workspace: string;
    if (input.workspace?.trim()) {
      if (!isAbsolute(input.workspace))
        throw new Error('Choose an absolute workspace directory.');
      workspace = normalizeWorkspace(input.workspace);
      if (!this.workspaceGrants.has(workspace)) {
        throw new Error('Choose this workspace with the native folder picker before saving.');
      }
    } else if (existing) {
      workspace = existing.workspace;
    } else {
      if (!this.deps.defaultWorkspaceRoot) {
        throw new Error('Automatic workspaces are unavailable in this build. Choose a folder.');
      }
      workspace = join(
        this.deps.defaultWorkspaceRoot,
        `${workspaceSlug(input.name)}-${agentId.slice(0, 8)}`,
      );
      await this.deps.createDirectory(workspace);
      this.workspaceGrants.add(workspace);
    }
    // Directory creation yields; another setup request may have finished meanwhile.
    if (input.startOnboarding && this.state.agents.length) {
      const created = this.state.agents.find(
        ({ id }) => id === this.state.preferences.onboarding?.agentId,
      );
      if (created) return { agentId: created.id, snapshot: this.resultSnapshot() };
      throw new Error('An agent was created while setup was in progress.');
    }
    const hue = input.hue ?? existing?.hue ?? this.leastUsedHue();
    const agent: AgentView = {
      id: agentId,
      name: input.name.trim(),
      instructions: input.instructions.trim(),
      provider,
      model,
      workspace,
      ...(input.harnessPreference
        ? { harnessPreference: structuredClone(input.harnessPreference) }
        : existing?.harnessPreference
          ? { harnessPreference: structuredClone(existing.harnessPreference) }
          : { harnessPreference: { mode: 'automatic' } as const }),
      ...(input.voiceId
        ? { voiceId: input.voiceId.trim() }
        : existing?.voiceId
          ? { voiceId: existing.voiceId }
          : {}),
      hue,
      pinned: input.pinned ?? existing?.pinned ?? false,
      notificationsEnabled:
        input.notificationsEnabled ?? existing?.notificationsEnabled ?? true,
      threadIds: existing?.threadIds ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const index = this.state.agents.findIndex(({ id }) => id === agentId);
    if (index >= 0) this.state.agents[index] = agent;
    else this.state.agents.push(agent);
    this.state.activeAgentId = agentId;
    if (!existing) {
      if (this.computerAccess.accessMode() === 'mac') {
        this.assistant.library.change(
          { operation: 'nativeLearning', agentId, enabled: true },
          (id) => this.requireAgent(id),
        );
      }
      if (input.startOnboarding) this.state.preferences.onboarding = { step: 'voice', agentId };
      else if (this.state.preferences.onboarding && !this.state.preferences.onboarding.agentId)
        this.state.preferences.onboarding = { step: 'complete' };
      const created = this.createThread({ agentId });
      return { agentId, snapshot: created.snapshot };
    }
    this.commit();
    return { agentId, snapshot: this.resultSnapshot() };
  }

  setAgentPinned(input: BridgeRequestMap['agents.setPinned']): DesktopSnapshot {
    const agent = this.requireAgent(input.agentId);
    agent.pinned = input.pinned;
    agent.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  setAgentNotifications(input: BridgeRequestMap['agents.setNotifications']): DesktopSnapshot {
    const agent = this.requireAgent(input.agentId);
    agent.notificationsEnabled = input.enabled;
    agent.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  duplicateAgent(agentId: string): BridgeResultMap['agents.duplicate'] {
    const source = this.requireAgent(agentId);
    requireReleaseProvider(source.provider);
    const now = new Date().toISOString();
    const copy: AgentView = {
      ...structuredClone(source),
      id: randomUUID(),
      name: `${source.name} copy`.slice(0, 80),
      threadIds: [],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.state.agents.push(copy);
    this.state.activeAgentId = copy.id;
    delete this.state.activeThreadId;
    this.commit();
    return { agentId: copy.id, snapshot: this.resultSnapshot() };
  }

  deleteAgent(agentId: string): DesktopSnapshot {
    const agent = this.requireAgent(agentId);
    const active = this.state.threads.some(
      (thread) =>
        thread.agentId === agent.id &&
        (thread.status === 'running' ||
          thread.status === 'queued' ||
          thread.status === 'waiting' ||
          this.runningTurns.has(thread.id) ||
          this.queuedTurns.some((turn) => turn.threadId === thread.id) ||
          this.pendingQuestions.has(thread.id)),
    );
    if (active) throw new Error('Cancel the active or queued task before deleting this agent.');
    this.assistant.library.forgetAgent(agentId);
    const threadIds = new Set(agent.threadIds);
    this.state.agents = this.state.agents.filter(({ id }) => id !== agentId);
    this.state.threads = this.state.threads.filter(({ agentId: id }) => id !== agentId);
    this.state.timeline = this.state.timeline.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.state.schedules = this.state.schedules.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.state.usageByTurn = Object.fromEntries(
      Object.entries(this.state.usageByTurn).filter(
        ([, usage]) => !threadIds.has(usage.threadId),
      ),
    );
    const nextAgentId = this.state.agents[0]?.id;
    if (nextAgentId) this.state.activeAgentId = nextAgentId;
    else delete this.state.activeAgentId;
    delete this.state.activeThreadId;
    this.commit();
    return this.resultSnapshot();
  }

  /**
   * The user-facing "New conversation" route. Like a single draft tab, it reopens the agent's
   * untouched thread instead of saving another empty "New thread" row.
   */
  openNewThread(input: BridgeRequestMap['threads.create']): BridgeResultMap['threads.create'] {
    this.requireSignedInReleaseAccount();
    const agent = this.requireAgent(input.agentId);
    const unused = input.title?.trim()
      ? undefined
      : this.state.threads.findLast(
          (thread) =>
            thread.agentId === agent.id &&
            !thread.archivedAt &&
            thread.status === 'idle' &&
            thread.provider === agent.provider &&
            thread.model === agent.model &&
            thread.workspace === agent.workspace &&
            thread.instructionsSnapshot === agent.instructions &&
            thread.worktree?.kind !== 'linked' &&
            !this.runningTurns.has(thread.id) &&
            !this.queuedTurns.some((turn) => turn.threadId === thread.id) &&
            !this.state.schedules.some((schedule) => schedule.threadId === thread.id) &&
            !this.state.timeline.some((item) => item.threadId === thread.id),
        );
    if (!unused) return this.createThread(input);
    return { threadId: unused.id, snapshot: this.selectThread(unused.id) };
  }

  createThread(
    input: BridgeRequestMap['threads.create'],
    activate = true,
  ): BridgeResultMap['threads.create'] {
    this.requireSignedInReleaseAccount();
    const agent = this.requireAgent(input.agentId);
    requireReleaseProvider(agent.provider);
    const id = randomUUID();
    const now = new Date().toISOString();
    const releaseRoute = legacyModelRoute(agent.provider, agent.model);
    const backendDefault = this.providers.backendModelRoutes.get(
      modelRouteKey(agent.provider, agent.model),
    );
    const allowedRoutes = this.providers.allowedModelRoutes.get(
      modelRouteKey(agent.provider, agent.model),
    ) ?? [releaseRoute];
    const resolution = resolveExecutionTarget({
      provider: agent.provider,
      model: agent.model,
      ...(agent.harnessPreference ? { preference: agent.harnessPreference } : {}),
      ...(backendDefault ? { backendDefault } : {}),
      allowedRoutes,
    });
    if (!resolution.ok) {
      throw new Error(
        resolution.harnessId === 'opencode_acp' || resolution.harnessId === 'pi_rpc'
          ? 'That beta harness has not passed this release’s conformance and security checks.'
          : resolution.message,
      );
    }
    const resolvedExecutionTarget = resolution.target;
    const revision = createHash('sha256')
      .update(
        JSON.stringify({
          instructions: agent.instructions,
          provider: agent.provider,
          model: agent.model,
          harnessPreference: agent.harnessPreference ?? { mode: 'automatic' },
          resolvedExecutionTarget,
          workspace: agent.workspace,
          updatedAt: agent.updatedAt,
        }),
      )
      .digest('hex');
    const reasoningEffort = this.providers.defaultReasoningEffort(agent.provider, agent.model);
    this.state.threads.push({
      id,
      agentId: agent.id,
      title: input.title?.trim() || UNTITLED_THREAD_TITLE,
      provider: agent.provider,
      model: agent.model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      workspace: agent.workspace,
      harnessId: resolvedExecutionTarget.harnessId,
      resolvedExecutionTarget,
      agentRevision: revision,
      instructionsSnapshot: agent.instructions,
      agentNameSnapshot: agent.name,
      status: 'idle',
      unread: false,
      pinned: false,
      worktree: { kind: 'primary', sourceWorkspace: agent.workspace },
      createdAt: now,
      updatedAt: now,
    });
    agent.threadIds.push(id);
    if (activate) {
      this.state.activeAgentId = agent.id;
      this.state.activeThreadId = id;
    }
    this.commit();
    return { threadId: id, snapshot: this.resultSnapshot() };
  }

  selectThread(threadId: string): DesktopSnapshot {
    const thread = this.requireThread(threadId);
    thread.unread = false;
    this.state.activeThreadId = thread.id;
    this.state.activeAgentId = thread.agentId;
    this.commit();
    return this.resultSnapshot();
  }

  renameThread(input: BridgeRequestMap['threads.rename']): DesktopSnapshot {
    const thread = this.requireThread(input.threadId);
    const title = input.title.trim();
    if (!title) throw new Error('Enter a thread name.');
    thread.title = title;
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  setThreadDraft(input: BridgeRequestMap['threads.draft']): { saved: true } {
    const thread = this.requireThread(input.threadId);
    if (input.text) thread.draft = input.text;
    else delete thread.draft;
    // Drafts are saved on each pause in typing. The composer already shows the text, so skip
    // the push and write the encrypted state with the next save, shortly after, or at shutdown.
    this.persistSoon();
    return { saved: true };
  }

  configureThread(input: BridgeRequestMap['threads.config']): DesktopSnapshot {
    const thread = this.requireIdleThread(input.threadId, 'change model settings');
    const provider = this.providers.requireReadyProvider(thread.provider, input.model.trim());
    const model = provider.models?.find((candidate) => candidate.id === input.model.trim());
    if (provider.models?.length && !model) {
      throw new Error(`${provider.label} does not currently offer that model.`);
    }
    const reasoningEffort = input.reasoningEffort?.trim();
    if (
      reasoningEffort &&
      model?.reasoningEfforts.length &&
      !model.reasoningEfforts.includes(reasoningEffort)
    ) {
      throw new Error(`${model.label} does not support that reasoning level.`);
    }
    thread.model = input.model.trim();
    if (reasoningEffort) thread.reasoningEffort = reasoningEffort;
    else delete thread.reasoningEffort;
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  archiveThread(threadId: string): DesktopSnapshot {
    const thread = this.requireIdleThread(threadId, 'archive this thread');
    thread.archivedAt = new Date().toISOString();
    thread.unread = false;
    if (this.state.activeThreadId === thread.id) delete this.state.activeThreadId;
    this.commit();
    return this.resultSnapshot();
  }

  unarchiveThread(threadId: string): DesktopSnapshot {
    const thread = this.requireThread(threadId);
    delete thread.archivedAt;
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  setThreadUnread(input: BridgeRequestMap['threads.setUnread']): DesktopSnapshot {
    const thread = this.requireThread(input.threadId);
    thread.unread = input.unread;
    this.commit();
    return this.resultSnapshot();
  }

  setThreadPinned(input: BridgeRequestMap['threads.setPinned']): DesktopSnapshot {
    const thread = this.requireThread(input.threadId);
    // Pinning only reorders the sidebar; it is not activity, so updatedAt stays.
    thread.pinned = input.pinned;
    this.commit();
    return this.resultSnapshot();
  }

  async forkThread(
    input: BridgeRequestMap['threads.fork'],
    primary = false,
  ): Promise<BridgeResultMap['threads.fork']> {
    // A busy thread's live approval, question and queued follow-ups belong to that run.
    const source = this.requireIdleThread(input.threadId, 'fork this thread');
    const id = randomUUID();
    let workspace = primary
      ? normalizeWorkspace(source.worktree?.sourceWorkspace ?? source.workspace)
      : source.workspace;
    let worktree = primary
      ? { kind: 'primary' as const, sourceWorkspace: workspace }
      : structuredClone(
          source.worktree ?? { kind: 'primary' as const, sourceWorkspace: source.workspace },
        );
    if (input.isolated) {
      const service = this.workspace.requireWorkspaceOperations();
      const created = await service.createWorktree(
        source.workspace,
        worktreeLabel(input.title?.trim() || `${source.title}-fork`, id),
      );
      workspace = normalizeWorkspace(created.path);
      this.workspaceGrants.add(workspace);
      worktree = {
        kind: 'linked',
        sourceWorkspace: source.worktree?.sourceWorkspace ?? source.workspace,
        ...(created.branch ? { branch: created.branch } : {}),
      };
    }
    const now = new Date().toISOString();
    const forked: ThreadView = {
      ...structuredClone(source),
      id,
      title: input.title?.trim() || `${source.title} (fork)`,
      workspace,
      worktree,
      status: 'idle',
      sourceThreadId: source.id,
      unread: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    delete forked.archivedAt;
    delete forked.draft;
    delete forked.queueReason;
    delete forked.interruptedTurnId;
    this.state.threads.push(forked);
    this.state.timeline.push(
      ...this.state.timeline
        .filter(
          (item) =>
            item.threadId === source.id &&
            !(
              item.status === 'pending' &&
              (item.kind === 'user' || item.kind === 'approval' || item.kind === 'question')
            ),
        )
        .map((item) => ({ ...structuredClone(item), id: randomUUID(), threadId: id })),
    );
    const agent = this.requireAgent(source.agentId);
    agent.threadIds.push(id);
    agent.updatedAt = now;
    this.state.activeAgentId = source.agentId;
    this.state.activeThreadId = id;
    this.commit();
    return { threadId: id, snapshot: this.resultSnapshot() };
  }

  async handoffThread(
    input: BridgeRequestMap['threads.handoff'],
  ): Promise<BridgeResultMap['threads.handoff']> {
    const source = this.requireIdleThread(input.threadId, 'handoff this thread');
    if (input.destination === 'primary' && source.worktree?.kind !== 'linked') {
      throw new Error('This thread is already using the primary workspace.');
    }
    return await this.forkThread(
      {
        threadId: source.id,
        isolated: input.destination === 'new_worktree',
        title:
          input.title?.trim() ||
          `${source.title}${input.destination === 'primary' ? ' (main)' : ' (worktree)'}`,
      },
      input.destination === 'primary',
    );
  }

  async cleanupWorktree(
    input: BridgeRequestMap['worktrees.cleanup'],
  ): Promise<DesktopSnapshot> {
    if (input.confirmation !== 'REMOVE WORKTREE') {
      throw new Error('Worktree removal confirmation is required.');
    }
    const thread = this.requireIdleThread(input.threadId, 'remove this worktree');
    if (thread.worktree?.kind !== 'linked') {
      throw new Error('This thread does not own a linked worktree.');
    }
    if (
      this.state.threads.some(
        (candidate) => candidate.id !== thread.id && candidate.workspace === thread.workspace,
      )
    ) {
      throw new Error('Another thread still uses this worktree.');
    }
    const service = this.workspace.requireWorkspaceOperations();
    if (!service.removeWorktree)
      throw new Error('Worktree cleanup is unavailable in this build.');
    await service.removeWorktree(thread.workspace);
    this.workspaceGrants.delete(thread.workspace);
    return this.deleteThread(thread.id);
  }

  searchThreads(query: string): BridgeResultMap['threads.search'] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return { results: [] };
    // One pass over the timeline instead of one full scan per thread.
    const timelineByThread = Map.groupBy(this.state.timeline, ({ threadId }) => threadId);
    const results = this.state.threads
      .map((thread) => {
        const matches: BridgeResultMap['threads.search']['results'][number]['matches'] = [];
        for (const item of timelineByThread.get(thread.id) ?? []) {
          const copy = [item.title, item.text, item.detail].filter(Boolean).join(' ');
          if (copy.toLocaleLowerCase().includes(needle)) {
            matches.push({
              itemId: item.id,
              excerpt: searchExcerpt(copy, needle),
              timestamp: item.timestamp,
              kind: 'message',
            });
          }
          for (const attachment of item.attachments ?? []) {
            if (!attachment.name.toLocaleLowerCase().includes(needle)) continue;
            matches.push({
              itemId: `${item.id}:file:${attachment.id}`,
              excerpt: attachment.name,
              label: attachment.name,
              timestamp: item.timestamp,
              kind: 'file',
            });
          }
          for (const [index, url] of extractHttpUrls(copy).entries()) {
            if (!url.toLocaleLowerCase().includes(needle)) continue;
            matches.push({
              itemId: `${item.id}:link:${index}`,
              excerpt: url,
              label: safeUrlHost(url),
              url,
              timestamp: item.timestamp,
              kind: 'link',
            });
          }
        }
        if (thread.title.toLocaleLowerCase().includes(needle) && matches.length === 0) {
          matches.push({
            itemId: thread.id,
            excerpt: thread.title,
            timestamp: thread.updatedAt,
            kind: 'thread',
          });
        }
        return {
          threadId: thread.id,
          threadTitle: thread.title,
          archived: Boolean(thread.archivedAt),
          matches: matches
            .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
            .slice(0, 12),
        };
      })
      .filter((result) => result.matches.length > 0)
      .sort((left, right) =>
        right.matches[0]!.timestamp.localeCompare(left.matches[0]!.timestamp),
      );
    return { results };
  }

  setGoal(input: BridgeRequestMap['threads.goal.set']): DesktopSnapshot {
    const thread = this.requireIdleThread(input.threadId, 'set a goal');
    const now = new Date().toISOString();
    thread.goal = {
      text: input.text.trim(),
      status: 'paused',
      createdAt: thread.goal?.createdAt ?? now,
      updatedAt: now,
    };
    this.commit();
    return this.resultSnapshot();
  }

  pauseGoal(threadId: string): DesktopSnapshot {
    const thread = this.requireThread(threadId);
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'paused';
    thread.goal.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  resumeGoal(threadId: string): DesktopSnapshot {
    const thread = this.requireIdleThread(threadId, 'resume this goal');
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'running';
    thread.goal.updatedAt = new Date().toISOString();
    const result = this.sendTurn(
      {
        threadId,
        text: `Continue working toward this long-running goal:\n\n${thread.goal.text}`,
      },
      'goal',
    );
    return result.snapshot;
  }

  clearGoal(threadId: string): DesktopSnapshot {
    const thread = this.requireIdleThread(threadId, 'clear this goal');
    delete thread.goal;
    this.commit();
    return this.resultSnapshot();
  }

  deleteThread(threadId: string): DesktopSnapshot {
    const thread = this.requireThread(threadId);
    if (
      this.runningTurns.has(thread.id) ||
      this.queuedTurns.some((turn) => turn.threadId === thread.id) ||
      this.pendingQuestions.has(thread.id) ||
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting'
    ) {
      throw new Error('Stop the active turn before deleting this thread.');
    }
    const agent = this.requireAgent(thread.agentId);
    agent.threadIds = agent.threadIds.filter((id) => id !== thread.id);
    agent.updatedAt = new Date().toISOString();
    // Release what the deleted thread still holds: its provider session and file grants.
    for (const item of this.state.timeline)
      if (item.threadId === thread.id && item.turnId)
        this.failedTurnAttachments.delete(item.turnId);
    for (const [id, grant] of this.attachments.grants)
      if (grant.threadId === thread.id) this.attachments.grants.delete(id);
    this.heldThreads.delete(thread.id);
    const runtime = this.runtime;
    void Promise.resolve()
      .then(() => runtime?.releaseSession(thread.id))
      .catch(() => undefined);
    this.state.threads = this.state.threads.filter((candidate) => candidate.id !== thread.id);
    this.state.timeline = this.state.timeline.filter((item) => item.threadId !== thread.id);
    this.state.approvals = this.state.approvals.filter(
      (approval) => approval.threadId !== thread.id,
    );
    this.state.schedules = this.state.schedules.filter(
      (schedule) => schedule.threadId !== thread.id,
    );
    this.state.usageByTurn = Object.fromEntries(
      Object.entries(this.state.usageByTurn).filter(
        ([, usage]) => usage.threadId !== thread.id,
      ),
    );
    if (this.state.activeThreadId === thread.id) delete this.state.activeThreadId;
    this.commit();
    return this.resultSnapshot();
  }

  /** Host-only Cmd+E capture, before the command panel takes the user's app focus. */
  async captureLauncherContext(): Promise<string | undefined> {
    const allowed = () =>
      !this.deps.fakeServices &&
      !this.speech.assistantSuspended &&
      !this.releaseAccessLocked() &&
      this.computerAccess.accessMode() === 'mac' &&
      !this.computerAccess.backgroundControl();
    if (!allowed()) return undefined;
    const context = await this.deps.captureMacContext?.().catch(() => undefined);
    return allowed() ? context : undefined;
  }

  sendLauncherTurn(
    input: BridgeRequestMap['threads.send'],
    context?: string,
  ): BridgeResultMap['threads.send'] {
    return this.sendTurn(
      input,
      'manual',
      undefined,
      undefined,
      this.computerAccess.accessMode() === 'mac' && !this.computerAccess.backgroundControl()
        ? context
        : undefined,
    );
  }

  sendTurn(
    input: BridgeRequestMap['threads.send'],
    source: QueuedTurn['source'] = 'manual',
    reviewTarget?: QueuedTurn['reviewTarget'],
    scheduleRunId?: string,
    context?: string,
  ): BridgeResultMap['threads.send'] {
    this.requireSignedInReleaseAccount();
    this.providers.requireCodexSetupIdle();
    if (this.state.capture.status === 'blocked') {
      throw new Error(
        this.state.capture.blockedReason ??
          'Raw research capture could not be stored. Free disk space or sign out before starting another task.',
      );
    }
    if (
      this.researchOutbox.requiredForCurrentAccount() &&
      (this.state.capture.consentVersion !== RESEARCH_CONSENT_VERSION ||
        !this.researchCapture.researchCaptureActive())
    ) {
      throw new Error(
        'Review and accept the current raw research consent, or sign out, before starting a task.',
      );
    }
    const thread = this.requireThread(input.threadId);
    if (thread.archivedAt) throw new Error('Unarchive this thread before sending a message.');
    const attachmentGrants = (input.attachmentIds ?? []).map((id) => {
      const grant = this.attachments.grants.get(id);
      if (!grant || grant.threadId !== thread.id || grant.expiresAt <= Date.now()) {
        throw new Error('An attachment expired. Choose it again before sending.');
      }
      return grant;
    });
    const messageText =
      input.text.trim() ||
      `Review the attached ${attachmentGrants.length === 1 ? 'file' : 'files'}.`;
    const pendingQuestion = this.pendingQuestions.get(thread.id);
    if (pendingQuestion) {
      if (attachmentGrants.length) {
        throw new Error('Answer the pending question with text before attaching files.');
      }
      this.pendingQuestions.delete(thread.id);
      const questionItem = this.state.timeline.findLast(
        (item) =>
          item.threadId === thread.id &&
          item.turnId === pendingQuestion.turnId &&
          item.kind === 'question' &&
          item.status === 'pending',
      );
      if (questionItem) questionItem.status = 'complete';
      delete thread.draft;
      const eventId = randomUUID();
      const timestamp = new Date().toISOString();
      this.appendTimeline(thread.id, {
        id: eventId,
        turnId: pendingQuestion.turnId,
        kind: 'user',
        text: messageText,
        status: 'complete',
        timestamp,
      });
      this.researchCapture.stageResearchText({
        turnId: pendingQuestion.turnId,
        eventId,
        occurredAt: timestamp,
        role: 'user',
        text: messageText,
        provider: thread.provider,
      });
      thread.status = 'running';
      void this.runtime
        ?.respondToRequest(thread.id, {
          requestId: pendingQuestion.requestId,
          text: messageText,
        })
        .catch((error: unknown) => {
          thread.status = 'failed';
          this.appendTimeline(thread.id, {
            id: randomUUID(),
            turnId: pendingQuestion.turnId,
            kind: 'error',
            title: 'Answer could not be delivered',
            text: error instanceof Error ? error.message : 'The provider session ended.',
            status: 'failed',
            timestamp: new Date().toISOString(),
          });
          this.commit();
        });
      this.commit();
      return { turnId: pendingQuestion.turnId, snapshot: this.resultSnapshot() };
    }
    // Provider state can change after an agent or immutable thread was created.
    // Revalidate every new turn instead of trusting persisted configuration.
    this.providers.requireReadyProvider(thread.provider, thread.model);
    const running = this.runningTurns.get(thread.id);
    // A person can add follow-ups while the thread works, or while a stopped turn is still
    // winding down. They wait behind the thread's own turn and start in order when it ends.
    const followUp =
      Boolean(running) || this.queuedTurns.some(({ threadId }) => threadId === thread.id);
    if (followUp && (source !== 'manual' || reviewTarget)) {
      throw new Error('This thread already has an active turn.');
    }
    delete thread.draft;
    const turnId = randomUUID();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    this.appendTimeline(thread.id, {
      id: eventId,
      turnId,
      kind: 'user',
      text: messageText,
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ view }) => structuredClone(view)) }
        : {}),
      // A pending user message is a queued follow-up. startTurn marks it complete.
      status: followUp ? 'pending' : 'complete',
      timestamp,
      ...(scheduleRunId ? { scheduleRunId } : {}),
    });
    this.researchCapture.stageResearchText({
      turnId,
      eventId,
      occurredAt: timestamp,
      role: 'user',
      text: messageText,
      provider: thread.provider,
    });
    if (thread.title === UNTITLED_THREAD_TITLE) {
      thread.title =
        conversationTitle(input.text) ||
        attachmentGrants[0]?.view.name ||
        (attachmentGrants.length ? 'Attached files' : UNTITLED_THREAD_TITLE);
    }
    const queued: QueuedTurn = {
      ...(context ? { context } : {}),
      id: turnId,
      threadId: thread.id,
      text: messageText,
      source,
      ...(input.fromPhone ? { fromPhone: true as const } : {}),
      ...(reviewTarget ? { reviewTarget } : {}),
      ...(scheduleRunId ? { scheduleRunId } : {}),
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ attachment }) => attachment) }
        : {}),
    };
    // Keep short-lived grants available for local preview/open after send. They still expire
    // after one hour and are never persisted, so a relaunch cannot revive file access.
    if (followUp && this.heldThreads.delete(thread.id)) {
      // Writing again after a pause moves on from it; held follow-ups run in order.
      this.queuedTurns.push(queued);
      if (running?.signal.aborted) {
        thread.status = 'queued';
        thread.queueReason = 'Finishing the stopped task.';
      } else {
        this.drainQueue();
        this.markWaitingFollowUps(thread);
      }
    } else if (followUp) {
      this.queuedTurns.push(queued);
      if (running?.signal.aborted) {
        thread.status = 'queued';
        thread.queueReason = 'Finishing the stopped task.';
      }
    } else if (this.runningTurns.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      this.queuedTurns.push(queued);
    } else if (this.workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      this.queuedTurns.push(queued);
      // A person's message goes ahead of a memory review that holds the agent's workspace;
      // the review runs again on a later idle pass.
      const review = this.state.threads.find(
        (candidate) =>
          candidate.id !== thread.id &&
          candidate.workspace === thread.workspace &&
          this.assistant.library.isReview(candidate.id) &&
          this.activeTurnId(candidate.id) === this.workspaceLeases.get(thread.workspace),
      );
      if (source === 'manual' && review && !this.assistant.library.isReview(thread.id)) {
        thread.queueReason = 'Starting after Sia pauses its memory review.';
        void this.cancelTurn(review.id).catch(() => undefined);
      }
    } else {
      this.startTurn(queued);
    }
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return { turnId, snapshot: this.resultSnapshot() };
  }

  /**
   * Edit or Try again: replaces the thread's last exchange with a new turn. The last message
   * and everything after it leave the transcript, and the provider starts a fresh session
   * seeded with the conversation before it, so the old reply is not part of the context.
   * Actions the agent already took stay done.
   */
  async redoLastTurn(
    input: BridgeRequestMap['threads.redo'],
  ): Promise<BridgeResultMap['threads.redo']> {
    const thread = this.requireThread(input.threadId);
    if (
      !['idle', 'failed'].includes(thread.status) ||
      this.runningTurns.has(thread.id) ||
      this.queuedTurns.some((turn) => turn.threadId === thread.id) ||
      this.pendingQuestions.has(thread.id)
    ) {
      throw new Error('Wait for Sia to finish before changing the last message.');
    }
    const items = this.state.timeline
      .filter((item) => item.threadId === thread.id)
      .sort((left, right) => left.sequence - right.sequence);
    const last = items.findLast((item) => item.kind === 'user' && item.status === 'complete');
    if (!last?.text) throw new Error('There is no message to change in this conversation.');
    const text = input.text?.trim() || last.text;
    // The original files go with the message again while their one-hour access lasts.
    const attachmentIds = [
      ...new Set([
        ...(last.attachments ?? []).map(({ id }) => id),
        ...(input.attachmentIds ?? []),
      ]),
    ];
    for (const id of attachmentIds) {
      const grant = this.attachments.grants.get(id);
      if (!grant || grant.threadId !== thread.id || grant.expiresAt <= Date.now()) {
        throw new Error(
          'A file on this message is no longer available. Attach it again and send.',
        );
      }
    }
    const removed = new Set(items.filter((item) => item.sequence >= last.sequence));
    const timeline = this.state.timeline;
    this.state.timeline = timeline.filter((item) => !removed.has(item));
    const previousStatus = thread.status;
    thread.status = 'idle';
    try {
      // The next turn starts a fresh provider session from the remaining conversation.
      void this.runtime?.releaseSession(thread.id).catch(() => undefined);
      return this.sendTurn({
        threadId: thread.id,
        text,
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
    } catch (error) {
      this.state.timeline = timeline;
      thread.status = previousStatus;
      throw error;
    }
  }

  retryTurn(threadId: string): BridgeResultMap['threads.retry'] {
    this.requireSignedInReleaseAccount();
    this.providers.requireCodexSetupIdle();
    const thread = this.requireThread(threadId);
    if (thread.status !== 'failed') throw new Error('Only a failed turn can be retried.');
    this.providers.requireReadyProvider(thread.provider, thread.model);
    // Follow-ups held behind a paused task run after it continues.
    const held = this.heldThreads.has(thread.id);
    if (
      this.runningTurns.has(thread.id) ||
      (!held && this.queuedTurns.some((turn) => turn.threadId === thread.id))
    ) {
      throw new Error('This thread already has an active turn.');
    }
    const failed = this.state.timeline.findLast(
      (item) => item.threadId === thread.id && item.kind === 'error' && Boolean(item.turnId),
    );
    const userMessage = failed?.turnId
      ? this.state.timeline.find(
          (item) =>
            item.threadId === thread.id &&
            item.turnId === failed.turnId &&
            item.kind === 'user' &&
            Boolean(item.text?.trim()),
        )
      : undefined;
    if (!failed?.turnId || !userMessage?.text) {
      throw new Error('There is no failed user turn to retry in this thread.');
    }

    this.researchCapture.stageResearchText({
      turnId: failed.turnId,
      eventId: userMessage.id,
      occurredAt: userMessage.timestamp,
      role: 'user',
      text: userMessage.text,
      provider: thread.provider,
    });
    const failedAttachments = this.failedTurnAttachments.get(failed.turnId);
    const retry: QueuedTurn = {
      id: failed.turnId,
      threadId: thread.id,
      text: userMessage.text,
      recovery: taskRecoveryContext(this.state.timeline, thread.id, failed.turnId),
      source: 'manual',
      fakeDelayMs: 160,
      ...(failedAttachments?.length ? { attachments: failedAttachments } : {}),
    };
    this.appendTimeline(thread.id, {
      id: randomUUID(),
      turnId: failed.turnId,
      kind: 'notice',
      title: 'Continuing task',
      status: 'complete',
      timestamp: new Date().toISOString(),
    });
    this.heldThreads.delete(thread.id);
    // The continued task goes ahead of any follow-ups that waited behind it.
    const enqueue = (turn: QueuedTurn) =>
      held ? this.queuedTurns.unshift(turn) : this.queuedTurns.push(turn);
    if (this.runningTurns.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      enqueue(retry);
    } else if (this.workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      enqueue(retry);
    } else {
      this.startTurn(retry);
    }
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return { turnId: failed.turnId, snapshot: this.resultSnapshot() };
  }

  async cancelTurn(threadId: string): Promise<DesktopSnapshot> {
    const thread = this.requireThread(threadId);
    this.speech.pushToTalk?.cancelTask(threadId);
    const running = this.runningTurns.get(threadId);
    const activeTurnId = running ? this.workspaceLeases.get(thread.workspace) : undefined;
    if (running) {
      running.abort();
      if (activeTurnId) {
        this.revokeApprovalsForTurn(threadId, activeTurnId);
        await this.runtime?.cancel(threadId, activeTurnId).catch(() => undefined);
      }
    }
    const queuedTurnIds = this.queuedTurns
      .filter((turn) => turn.threadId === threadId)
      .map((turn) => turn.id);
    this.queuedTurns = this.queuedTurns.filter((turn) => turn.threadId !== threadId);
    this.heldThreads.delete(threadId);
    if (activeTurnId) this.researchCapture.discardResearchTurn(activeTurnId);
    for (const turnId of queuedTurnIds) this.researchCapture.discardResearchTurn(turnId);
    // Stop cancels queued follow-ups too; their unsent messages leave the thread.
    const removedFollowUps = this.removeQueuedMessages(threadId, new Set(queuedTurnIds));
    const question = this.pendingQuestions.get(threadId);
    this.pendingQuestions.delete(threadId);
    if (question) {
      void this.runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    }
    thread.status = 'idle';
    delete thread.queueReason;
    this.appendTimeline(threadId, {
      id: randomUUID(),
      kind: 'notice',
      title: 'Task cancelled',
      text: removedFollowUps
        ? `Completed work remains in this thread. ${removedFollowUps === 1 ? 'Your queued message was' : 'Your queued messages were'} not sent.`
        : 'Completed work remains in this thread.',
      status: 'complete',
      timestamp: new Date().toISOString(),
    });
    this.commit();
    return this.resultSnapshot();
  }

  /** A finished turn leaves its thread idle, or queued when a follow-up is about to start. */
  settleFinishedTurn(thread: ThreadView): void {
    if (this.queuedTurns.some((turn) => turn.threadId === thread.id)) {
      thread.status = 'queued';
      thread.queueReason = 'Starting your next message.';
    } else {
      thread.status = 'idle';
      delete thread.queueReason;
    }
  }

  /** Removes a follow-up that has not started yet. */
  unqueueMessage(threadId: string, messageId: string): DesktopSnapshot {
    const thread = this.requireThread(threadId);
    const item = this.state.timeline.find(
      (candidate) =>
        candidate.id === messageId &&
        candidate.threadId === threadId &&
        candidate.kind === 'user' &&
        candidate.status === 'pending',
    );
    const turnId = item?.turnId;
    if (!turnId || !this.queuedTurns.some((turn) => turn.id === turnId)) {
      throw new Error('This message has already started or was removed.');
    }
    this.queuedTurns = this.queuedTurns.filter((turn) => turn.id !== turnId);
    this.researchCapture.discardResearchTurn(turnId);
    this.removeQueuedMessages(threadId, new Set([turnId]));
    if (
      thread.status === 'queued' &&
      !this.runningTurns.has(threadId) &&
      !this.queuedTurns.some((turn) => turn.threadId === threadId)
    ) {
      thread.status = 'idle';
      delete thread.queueReason;
    }
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  /**
   * "Send now": a queued follow-up joins the running turn instead of waiting for it to end.
   * The message stays queued when the provider cannot take it.
   */
  async steerQueuedMessage(threadId: string, messageId: string): Promise<DesktopSnapshot> {
    const thread = this.requireThread(threadId);
    const item = this.state.timeline.find(
      (candidate) =>
        candidate.id === messageId &&
        candidate.threadId === threadId &&
        candidate.kind === 'user' &&
        candidate.status === 'pending',
    );
    const index = this.queuedTurns.findIndex((turn) => turn.id === item?.turnId);
    const queued = this.queuedTurns[index];
    if (!item || !queued) throw new Error('This message has already started or was removed.');
    const activeTurnId = this.activeTurnId(threadId);
    if (
      !activeTurnId ||
      thread.status !== 'running' ||
      this.runningTurns.get(threadId)?.signal.aborted
    ) {
      throw new Error('Sia is not working on this right now. Your message will be sent next.');
    }
    // Take it out of the queue first so the turn ending meanwhile cannot also start it.
    this.queuedTurns.splice(index, 1);
    try {
      if (!this.deps.fakeServices) {
        const runtime = this.runtime;
        if (!runtime) throw new Error('The provider runtime did not initialize.');
        await runtime.steer(threadId, activeTurnId, {
          text: queued.text,
          ...(queued.attachments?.length ? { attachments: queued.attachments } : {}),
        });
      }
    } catch (error) {
      this.queuedTurns.splice(Math.min(index, this.queuedTurns.length), 0, queued);
      // The turn may have ended while the provider refused; the message then runs next.
      if (!this.runningTurns.has(threadId)) this.drainQueue();
      this.commit();
      throw new Error(
        `Sia could not add this to the current task, so it will be sent next. ${error instanceof Error ? error.message : ''}`.trim(),
      );
    }
    // The message now belongs to the running turn and appears where it joined.
    item.status = 'complete';
    item.turnId = activeTurnId;
    item.sequence =
      this.state.timeline.reduce(
        (highest, candidate) =>
          candidate.threadId === threadId ? Math.max(highest, candidate.sequence) : highest,
        0,
      ) + 1;
    this.researchCapture.discardResearchTurn(queued.id);
    this.researchCapture.stageResearchText({
      turnId: activeTurnId,
      eventId: item.id,
      occurredAt: item.timestamp,
      role: 'user',
      text: queued.text,
      provider: thread.provider,
    });
    thread.updatedAt = new Date().toISOString();
    this.commit();
    return this.resultSnapshot();
  }

  /** Drops the pending user messages of queued follow-ups that will no longer run. */
  removeQueuedMessages(threadId: string, turnIds: ReadonlySet<string>): number {
    const before = this.state.timeline.length;
    this.state.timeline = this.state.timeline.filter(
      (item) =>
        !(
          item.threadId === threadId &&
          item.kind === 'user' &&
          item.status === 'pending' &&
          item.turnId &&
          turnIds.has(item.turnId)
        ),
    );
    return before - this.state.timeline.length;
  }

  resolveApproval(input: BridgeRequestMap['approvals.resolve']): DesktopSnapshot {
    const pending = this.pendingApprovals.get(input.approvalId);
    if (!pending) throw new Error('This approval expired or was already resolved.');
    if (this.activeTurnId(pending.threadId) !== pending.turnId) {
      this.revokeApproval(input.approvalId, pending);
      this.commit();
      throw new Error('This approval belongs to a turn that is no longer active.');
    }
    const approval = this.state.approvals.find(({ id }) => id === input.approvalId);
    const forTask = input.decision === 'approve_task';
    if (forTask && (!approval?.allowForTask || this.phoneTurns.has(pending.turnId)))
      throw new Error('This request can only be allowed once.');
    const approved = input.decision !== 'deny';
    clearTimeout(pending.timeout);
    this.pendingApprovals.delete(input.approvalId);
    this.resumeAfterRequest(pending.threadId);
    if (forTask) {
      approval!.scope = 'task';
      if (pending.taskGrant) {
        const grants = this.taskGrants.get(pending.turnId) ?? new Set<string>();
        grants.add(`${pending.threadId}\u0000${pending.taskGrant}`);
        this.taskGrants.set(pending.turnId, grants);
      }
    }
    this.setApprovalStatus(input.approvalId, approved ? 'approved' : 'denied');
    this.stageApprovalDecision(
      input.approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      approved ? 'approved' : 'denied',
    );
    if (pending.kind === 'provider' && pending.threadId && pending.requestId) {
      void this.runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: forTask ? 'allow_task' : approved ? 'allow_once' : 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve(approved ? 'allow' : 'deny');
    return this.resultSnapshot();
  }

  startTurn(turn: QueuedTurn): void {
    if (this.shuttingDown) return;
    const thread = this.requireThread(turn.threadId);
    if (this.macUnavailable && this.isMacTurn(thread.id)) {
      // Screen control cannot work while the Mac is locked or asleep; start once it is back.
      this.queuedTurns.unshift(turn);
      thread.status = 'queued';
      thread.queueReason =
        this.macUnavailable === 'locked'
          ? 'Waiting for your Mac to unlock.'
          : 'Waiting for your Mac to wake.';
      return;
    }
    // Any turn starting on a paused thread means the person moved on from the pause.
    this.heldThreads.delete(thread.id);
    const followUp = this.state.timeline.find(
      (item) =>
        item.threadId === thread.id &&
        item.turnId === turn.id &&
        item.kind === 'user' &&
        item.status === 'pending',
    );
    if (followUp) {
      // A queued follow-up joins the conversation when it starts, after the previous turn.
      followUp.status = 'complete';
      followUp.sequence =
        this.state.timeline.reduce(
          (highest, item) =>
            item.threadId === thread.id ? Math.max(highest, item.sequence) : highest,
          0,
        ) + 1;
    }
    const unavailable = this.providers.providerReadinessError(thread.provider, thread.model);
    if (unavailable) {
      thread.status = 'failed';
      delete thread.queueReason;
      this.researchCapture.discardResearchTurn(turn.id);
      this.appendTimeline(thread.id, {
        id: randomUUID(),
        turnId: turn.id,
        kind: 'error',
        title: 'Provider is not ready',
        text: unavailable,
        status: 'failed',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const controller = new AbortController();
    this.runningTurns.set(thread.id, controller);
    this.workspaceLeases.set(thread.workspace, turn.id);
    if (this.isMacTurn(thread.id)) {
      this.macTurns.set(thread.id, turn);
      if (!this.computerAccess.backgroundControl()) this.foregroundTurns.add(thread.id);
      this.awakeTurns.add(thread.id);
      this.deps.keepAwake?.hold(thread.id);
    }
    if (turn.fromPhone) this.phoneTurns.add(turn.id);
    thread.status = 'running';
    delete thread.queueReason;
    this.appendTimeline(thread.id, {
      id: randomUUID(),
      turnId: turn.id,
      kind: 'activity',
      title: this.deps.fakeServices
        ? 'Preparing local tools'
        : `Starting ${thread.provider === 'codex' ? 'Codex' : thread.provider}`,
      detail: thread.workspace,
      status: 'running',
      toolName: 'runtime.start',
      timestamp: new Date().toISOString(),
    });
    const reviewTimeout = this.assistant.library.isReview(thread.id)
      ? setTimeout(() => {
          void this.cancelTurn(thread.id).catch(() => undefined);
        }, 180_000)
      : undefined;
    reviewTimeout?.unref();
    const task = this.runTurn(turn, controller.signal).finally(() => {
      if (reviewTimeout) clearTimeout(reviewTimeout);
      if (this.turnTasks.get(thread.id) === task) this.turnTasks.delete(thread.id);
    });
    this.turnTasks.set(thread.id, task);
  }

  async runTurn(turn: QueuedTurn, signal: AbortSignal): Promise<void> {
    let lease: TurnLease | undefined;
    let macTask: { request: string; result?: MacTaskResult } | undefined;
    let nativeVault: NotchVault | undefined;
    let recordVault: NotchVault | undefined;
    let nativeRawResponse = '';
    let nativeFollowUp = false;
    let recordedNative = false;
    const recordNative = async (outcome: 'complete' | 'failed') => {
      if (recordedNative || !recordVault || !macTask) return;
      recordedNative = true;
      try {
        const agentId = this.requireThread(turn.threadId).agentId;
        await recordVault.engine(this.deps.notchHelperPath, {
          operation: 'record',
          request: macTask.request,
          response:
            nativeRawResponse ||
            JSON.stringify({
              type: macTask.result?.success ? 'action' : 'clarify',
              success: macTask.result?.success ?? false,
              response: macTask.result?.response ?? 'The task ended without a verified result.',
              steps: macTask.result?.steps ?? [],
            }),
          learning: this.assistant.library.view().learningAgents?.includes(agentId) === true,
          outcome: signal.aborted ? 'cancelled' : outcome,
          followUp: nativeFollowUp,
        });
      } catch {
        /* Optional memory persistence cannot prevent task completion or cancellation. */
      }
    };
    try {
      const leasedThread = this.requireThread(turn.threadId);
      lease = await this.actionLeases.startTurn({
        turnId: turn.id,
        threadId: turn.threadId,
        signal,
      });
      await lease.acquire({ kind: 'workspace_writer', id: leasedThread.workspace }, signal);
      if (this.deps.fakeServices) {
        await abortableDelay(turn.fakeDelayMs ?? this.deps.fakeTurnDelayMs, signal);
        this.completeRunningActivities(turn.threadId, turn.id);
        const assistantEventId = randomUUID();
        const assistantTimestamp = new Date().toISOString();
        const assistantText =
          'I am ready. This development turn used the deterministic local runtime, so no provider account or connected-app data was accessed.';
        this.appendTimeline(turn.threadId, {
          id: assistantEventId,
          turnId: turn.id,
          kind: 'assistant',
          text: assistantText,
          status: 'complete',
          timestamp: assistantTimestamp,
        });
        const thread = this.requireThread(turn.threadId);
        this.researchCapture.stageResearchText({
          turnId: turn.id,
          eventId: assistantEventId,
          occurredAt: assistantTimestamp,
          role: 'assistant',
          text: assistantText,
          provider: thread.provider,
        });
        this.researchCapture.completeResearchTurn(turn.id);
        this.settleFinishedTurn(thread);
        delete thread.interruptedTurnId;
        this.markTurnFinished(thread, turn, 'complete');
        thread.updatedAt = new Date().toISOString();
      } else {
        const runtime = this.runtime;
        if (!runtime) throw new Error('The provider runtime did not initialize.');
        const thread = this.requireThread(turn.threadId);
        // Native Mac commands may observe private apps without a connector event.
        // Keep those turns out of optional research capture just like private gateway actions.
        if (
          this.computerAccess.accessMode() === 'mac' &&
          !this.assistant.library.isReview(thread.id)
        )
          this.researchCapture.taintResearchTurn(turn.id);
        if (
          this.computerAccess.accessMode() === 'mac' &&
          !this.assistant.library.isReview(thread.id)
        ) {
          macTask = { request: turn.text };
          recordVault = new NotchVault(thread.workspace, thread.agentId);
        }
        if (macTask && this.computerAccess.backgroundControl()) {
          // The background driver ships in the app, but it can fail to load or lack access.
          // Stop with a plain next step instead of letting the first window action fail.
          this.computerAccess.state = await this.deps.computer.permissions();
          const unavailable = backgroundControlUnavailable(this.computerAccess.state);
          if (unavailable) throw new Error(unavailable);
        }
        const notchReview = this.assistant.library.isNotchReview(thread.id);
        let nativeRequest: string | undefined;
        if (macTask) {
          nativeVault = recordVault!;
          const library = this.assistant.library.view();
          nativeVault.initialize(library);
          nativeFollowUp = this.state.timeline.some(
            (item) =>
              item.threadId === thread.id &&
              item.turnId !== turn.id &&
              item.kind === 'assistant',
          );
          // The native memory engine only enriches the request. If it fails or times out,
          // run the person's request with the ordinary memory prompt instead of failing.
          try {
            const prepared = await nativeVault.engine(
              this.deps.notchHelperPath,
              {
                operation: 'prepare',
                background: this.computerAccess.backgroundControl(),
                request: turn.text,
                context: turn.context ?? '',
                learning: library.learningAgents?.includes(thread.agentId) === true,
                nativeLearning: library.nativeLearningAgents?.includes(thread.agentId) === true,
                activeTasks: this.state.threads
                  .filter(
                    (item) =>
                      item.agentId === thread.agentId &&
                      item.id !== thread.id &&
                      ['running', 'waiting', 'queued'].includes(item.status),
                  )
                  .map((item) => `- ${item.title} [${item.status}]`)
                  .join('\n'),
              },
              signal,
            );
            if (!prepared.prompt)
              throw new Error('The native engine returned no request context.');
            nativeRequest = prepared.prompt;
          } catch (error) {
            signal.throwIfAborted();
            console.warn(
              `[sia:notch] Preparing the request failed; continuing without it. ${error instanceof Error ? error.message : ''}`.trim(),
            );
          }
        }
        const runtimeThread = {
          ...(nativeVault ? { notchVault: nativeVault.root } : {}),
          ...(notchReview
            ? { notchReview: true, notchVault: this.assistant.notchVault(thread.agentId).root }
            : {}),
          computerAccessMode: this.computerAccess.accessMode(),
          macBackgroundControl: this.computerAccess.backgroundControl(),
          macBackgroundFallback: this.computerAccess.backgroundFallback(),
          computerTrust: this.trustForTurn(turn.id),
          ...(this.assistant.library.isReview(thread.id)
            ? { nativeTools: 'disabled' as const }
            : {}),
          id: thread.id,
          provider: thread.provider,
          model: thread.model,
          ...(thread.resolvedExecutionTarget
            ? { resolvedExecutionTarget: thread.resolvedExecutionTarget }
            : {}),
          workspace: thread.workspace,
          instructions: this.assistant.library.isReview(thread.id)
            ? notchReview
              ? notchConsolidationInstructions(this.assistant.notchVault(thread.agentId).root)
              : this.assistant.library.reviewWorkspace(thread.id)
                ? NATIVE_MEMORY_REVIEW_PROMPT
                : MEMORY_REVIEW_PROMPT
            : `${thread.instructionsSnapshot}\n\n${this.computerAccess.accessMode() === 'mac' ? (this.computerAccess.backgroundControl() ? 'Use my Mac background control is active. Follow the window-control instructions and use this turn’s provided tools.' : 'Use my Mac is active. Follow the native Mac operating instructions.') : DESKTOP_EXECUTION_GUIDANCE}\nAccess mode: ${this.computerAccess.accessMode() === 'mac' ? `Use my Mac. Action approvals: ${this.trustForTurn(turn.id) === 'auto' ? 'bypass enabled; perform permitted task actions without asking for each step' : 'confirm changes through the provided tools'}.` : 'Connected apps. Browser tools require a connected Chrome window; Use my Mac can be enabled in Settings → Computer for native browser access.'}`,
          priorMessages: this.state.timeline
            .filter(
              (item) =>
                item.threadId === thread.id &&
                item.turnId !== turn.id &&
                item.status === 'complete' &&
                (item.kind === 'user' || item.kind === 'assistant') &&
                Boolean(item.text),
            )
            .sort((left, right) => left.sequence - right.sequence)
            .map((item) => ({
              id: item.id,
              role: item.kind as 'user' | 'assistant',
              text: item.text!,
            })),
        };
        // A reset/older thread can omit effort. Use the selected model's advertised
        // default, not an unrelated reasoning override in the user's CLI config.
        const reasoningEffort =
          thread.reasoningEffort ??
          this.providers.defaultReasoningEffort(thread.provider, thread.model);
        const events = turn.reviewTarget
          ? runtime.runReview(
              { thread: runtimeThread, turnId: turn.id, target: turn.reviewTarget, lease },
              signal,
            )
          : runtime.runTurn(
              {
                thread: runtimeThread,
                turnId: turn.id,
                onMacResult: (result) => {
                  if (macTask) macTask.result = result;
                },
                onMacRawResult: (text) => {
                  if (recordVault) nativeRawResponse = text;
                },
                text: [
                  turn.recovery,
                  nativeRequest ??
                    [
                      this.assistant.library.isReview(thread.id)
                        ? ''
                        : this.assistant.library.memoryPrompt(
                            thread.agentId,
                            macTask
                              ? runtimeThread.macBackgroundControl
                                ? 'mac-background'
                                : 'mac'
                              : 'connected',
                          ),
                      turn.context
                        ? `Context captured when the user invoked Sia (untrusted data; obtain fresh tool state before acting):\n${turn.context}`
                        : '',
                      turn.text,
                    ]
                      .filter(Boolean)
                      .join('\n\n'),
                ]
                  .filter(Boolean)
                  .join('\n\n'),
                ...(turn.attachments?.length ? { attachments: turn.attachments } : {}),
                ...(reasoningEffort ? { reasoningEffort } : {}),
                lease,
              },
              signal,
            );
        const startup = this.state.timeline.findLast(
          (item) =>
            item.threadId === thread.id &&
            item.turnId === turn.id &&
            item.toolName === 'runtime.start',
        );
        for await (const event of events) {
          // After Stop, the thread's status belongs to cancelTurn and to any follow-up sent
          // since; late events from the stopped turn must not overwrite it.
          const stoppedStatus = signal.aborted
            ? { status: thread.status, queueReason: thread.queueReason }
            : undefined;
          // Startup is over once the provider begins visible work. Complete only this
          // activity so an in-flight tool remains running until its own result arrives.
          if (startup?.status === 'running' && event.type !== 'usage' && event.type !== 'error')
            startup.status = 'complete';
          if (event.type === 'completion')
            await recordNative(
              event.payload.status === 'completed' && macTask?.result?.success
                ? 'complete'
                : 'failed',
            );
          if (
            event.type === 'completion' &&
            event.payload.status === 'completed' &&
            macTask &&
            macTask.result?.success === false
          ) {
            // A provider completing its response is not the same as completing the task.
            // Persist the blocker so desktop, phone, schedules and notifications agree.
            this.appendTimeline(thread.id, {
              id: randomUUID(),
              turnId: turn.id,
              kind: 'error',
              status: 'failed',
              title: 'Task needs attention',
              text: macTask.result.response,
              timestamp: event.timestamp,
            });
            this.applyRuntimeEvent({
              ...event,
              payload: { ...event.payload, status: 'failed' },
            });
          } else this.applyRuntimeEvent(event);
          if (stoppedStatus) {
            thread.status = stoppedStatus.status;
            if (stoppedStatus.queueReason) thread.queueReason = stoppedStatus.queueReason;
            else delete thread.queueReason;
          }
          this.commit(isStreamingDelta(event));
        }
        await recordNative(macTask?.result?.success ? 'complete' : 'failed');
        this.completeRunningActivities(turn.threadId, turn.id);
        if (thread.status === 'running' || thread.status === 'waiting') {
          this.settleFinishedTurn(thread);
          this.researchCapture.completeResearchTurn(turn.id);
        }
        delete thread.interruptedTurnId;
        this.markTurnFinished(
          thread,
          turn,
          thread.status === 'failed' ? 'failed' : 'complete',
          macTask,
        );
        thread.updatedAt = new Date().toISOString();
      }
    } catch (error) {
      this.researchCapture.discardResearchTurn(turn.id);
      if (!signal.aborted) {
        if (macTask && !macTask.result)
          macTask.result = {
            success: false,
            steps: [],
            response:
              error instanceof Error ? error.message : 'The provider failed unexpectedly.',
          };
        await recordNative('failed');
        const thread = this.requireThread(turn.threadId);
        thread.status = 'failed';
        thread.interruptedTurnId = turn.id;
        if (turn.attachments?.length) this.failedTurnAttachments.set(turn.id, turn.attachments);
        this.appendTimeline(turn.threadId, {
          id: randomUUID(),
          turnId: turn.id,
          kind: 'error',
          title: 'Task could not start',
          text: error instanceof Error ? error.message : 'The provider failed unexpectedly.',
          status: 'failed',
          timestamp: new Date().toISOString(),
        });
        this.markTurnFinished(thread, turn, 'failed', macTask);
      }
    } finally {
      await recordNative(
        this.requireThread(turn.threadId).status === 'failed' ? 'failed' : 'complete',
      );
      if (signal.aborted) {
        this.completeRunningActivities(turn.threadId, turn.id);
        this.researchCapture.discardResearchTurn(turn.id);
        this.schedules.markScheduleRunFinished(turn, 'cancelled');
        if (macTask) {
          try {
            this.assistant.library.recordMacTask({
              agentId: this.requireThread(turn.threadId).agentId,
              threadId: turn.threadId,
              turnId: turn.id,
              ...macTask,
              outcome: 'cancelled',
            });
          } catch {
            /* Optional journal storage cannot prevent cancellation. */
          }
        }
      }
      this.revokeApprovalsForTurn(turn.threadId, turn.id);
      lease?.release();
      this.releaseTurn(turn.threadId);
      this.commit();
    }
  }

  markTurnFinished(
    thread: ThreadView,
    turn: QueuedTurn,
    outcome: 'complete' | 'failed',
    macTask?: { request: string; result?: MacTaskResult },
  ): void {
    try {
      if (macTask)
        this.assistant.library.recordMacTask({
          agentId: thread.agentId,
          threadId: thread.id,
          turnId: turn.id,
          ...macTask,
          outcome,
        });
      else if (!this.assistant.library.isReview(thread.id))
        this.assistant.library.record({
          agentId: thread.agentId,
          threadId: thread.id,
          turnId: turn.id,
          kind: 'task',
          title: 'Task finished',
          text: outcome,
        });
    } catch {
      /* Optional memory storage must never turn completed work into a failed task. */
    }
    this.schedules.markScheduleRunFinished(
      turn,
      outcome === 'complete' ? 'completed' : 'failed',
    );
    // Continue task resends the failed turn's files, whatever ended it (start error,
    // model error or a task that reported it could not finish).
    if (outcome === 'complete') this.failedTurnAttachments.delete(turn.id);
    else if (turn.attachments?.length)
      this.failedTurnAttachments.set(turn.id, turn.attachments);
    // Streamed items are appended early and mutated as text arrives; the finished turn is
    // written once more so the log always ends with the final transcript for that turn.
    this.deps.trajectory?.record({
      type: 'turn_finished',
      threadId: thread.id,
      turnId: turn.id,
      outcome,
      source: turn.source ?? 'manual',
      items: structuredClone(
        this.state.timeline.filter(
          (item) => item.threadId === thread.id && item.turnId === turn.id,
        ),
      ),
    });
    if (turn.source === 'goal' && thread.goal && outcome === 'failed') {
      thread.goal.status = 'paused';
      thread.goal.updatedAt = new Date().toISOString();
    }
    // A memory review is Sia's own housekeeping, not work the person is waiting for.
    if (this.assistant.library.isReview(thread.id)) return;
    thread.unread = true;
    const agent = this.state.agents.find(({ id }) => id === thread.agentId);
    if (agent?.notificationsEnabled !== false) {
      this.deps.notify?.({
        threadId: thread.id,
        ...turnFinishedNotice({
          title: thread.title,
          outcome,
          reply: this.state.timeline
            .filter(
              (item) =>
                item.threadId === thread.id &&
                item.turnId === turn.id &&
                item.kind === 'assistant',
            )
            .map((item) => item.text ?? '')
            .join('\n\n'),
        }),
      });
    }
  }

  /** Tell someone who is away from the window that a task is paused on them. */
  notifyNeedsAttention(threadId: string, need: 'approval' | 'question', step: string): void {
    if (this.assistant.library.isReview(threadId)) return;
    const thread = this.state.threads.find(({ id }) => id === threadId);
    if (!thread) return;
    const agent = this.state.agents.find(({ id }) => id === thread.agentId);
    if (agent?.notificationsEnabled === false) return;
    const name = agent?.name ?? thread.title;
    const body = step.replace(/\s+/g, ' ').trim();
    this.deps.notify?.({
      threadId,
      title: need === 'approval' ? `${name} needs your OK` : `${name} has a question`,
      body:
        (body.length > 140 ? `${body.slice(0, 139)}…` : body) ||
        (need === 'approval'
          ? 'Open Sia to allow or deny the next step.'
          : 'Open Sia to answer.'),
    });
  }

  applyRuntimeEvent(event: ThreadEventEnvelope): void {
    const thread = this.requireThread(event.threadId);
    this.researchCapture.stageRawResearchEvent({
      threadId: event.threadId,
      turnId: event.turnId,
      eventType: `provider.${event.type}`,
      sequence: event.sequence,
      data: event,
      occurredAt: event.timestamp,
      sourceEventId: event.id,
    });
    if (event.type === 'approval' || event.type === 'question') {
      this.researchCapture.taintResearchTurn(event.turnId);
    }
    if (event.type === 'message') {
      const text = event.payload.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('');
      if (!text) return;
      if (event.payload.role === 'assistant') {
        this.researchCapture.stageResearchText({
          turnId: event.turnId,
          eventId: event.id,
          occurredAt: event.timestamp,
          role: 'assistant',
          text,
          provider: event.provider,
          messageId: event.payload.messageId,
          append: event.payload.delta,
        });
      }
      const existing = this.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'assistant' &&
          item.detail === event.payload.messageId,
      );
      if (existing && event.payload.delta) existing.text = `${existing.text ?? ''}${text}`;
      else {
        this.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: event.payload.role === 'assistant' ? 'assistant' : 'notice',
          text,
          detail: event.payload.messageId,
          status: event.payload.delta ? 'running' : 'complete',
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'reasoning') {
      // Only the reasoning summary is shown (as the live status line). Raw reasoning text is
      // never merged into it.
      if (event.payload.part === 'text') return;
      const existing = this.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'reasoning' &&
          item.detail === event.payload.reasoningId,
      );
      if (existing && event.payload.delta)
        existing.text = `${existing.text ?? ''}${event.payload.text}`;
      else {
        this.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'reasoning',
          title: 'Reasoning',
          text: event.payload.text,
          detail: event.payload.reasoningId,
          status: event.payload.delta ? 'running' : 'complete',
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'tool') {
      if (event.payload.native) {
        this.researchCapture.stageResearchTrajectory({
          turnId: event.turnId,
          eventId: event.id,
          occurredAt: event.timestamp,
          payload: {
            source: 'provider',
            type: 'tool',
            name: event.payload.name,
            phase: event.payload.phase,
            ...(event.payload.presentation
              ? { presentation: event.payload.presentation.kind }
              : {}),
          },
        });
      } else if (
        !this.researchCapture.consumeSafeResearchAction(event.turnId, event.payload.name)
      ) {
        this.researchCapture.taintResearchTurn(event.turnId);
      }
      const activity = mapRuntimePresentation(event.payload.presentation);
      const running = this.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.callId,
      );
      if (running) {
        running.status =
          event.payload.phase === 'failed'
            ? 'failed'
            : event.payload.phase === 'completed'
              ? 'complete'
              : 'running';
        running.title = runtimeToolTitle(event.payload.name, activity);
        if (event.payload.error) running.detail = event.payload.error;
        if (activity) running.activity = activity;
      } else {
        // Message and reasoning items already render as transcript content; an extra
        // "UserMessage"/"AgentMessage"/"Reasoning" activity row is pure noise.
        const normalizedTool = event.payload.name.replace(/[._-]/g, '').toLowerCase();
        if (
          event.payload.native &&
          (normalizedTool === 'usermessage' ||
            normalizedTool === 'agentmessage' ||
            normalizedTool === 'reasoning')
        ) {
          return;
        }
        this.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: runtimeToolTitle(event.payload.name, activity),
          status:
            event.payload.phase === 'failed'
              ? 'failed'
              : event.payload.phase === 'completed'
                ? 'complete'
                : 'running',
          toolName: event.payload.name,
          toolCallId: event.payload.callId,
          ...(activity ? { activity } : {}),
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'approval' && event.payload.phase === 'requested') {
      this.researchCapture.taintResearchTurn(event.turnId);
      void this.authorizeProviderRequest(event);
      thread.status = 'waiting';
      return;
    }
    if (event.type === 'question' && event.payload.phase === 'requested') {
      const alreadyAsked =
        this.pendingQuestions.get(event.threadId)?.requestId === event.payload.requestId;
      this.pendingQuestions.set(event.threadId, {
        requestId: event.payload.requestId,
        turnId: event.turnId,
      });
      this.appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'question',
        title: 'Provider needs input',
        text: event.payload.prompt,
        status: 'pending',
        timestamp: event.timestamp,
      });
      thread.status = 'waiting';
      if (!alreadyAsked)
        this.notifyNeedsAttention(event.threadId, 'question', event.payload.prompt);
      return;
    }
    if (event.type === 'plan') {
      this.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'plan',
          phase: event.payload.steps.every(({ status }) => status === 'completed')
            ? 'completed'
            : 'active',
          counts: {
            steps: event.payload.steps.length,
            completed: event.payload.steps.filter(({ status }) => status === 'completed')
              .length,
          },
        },
      });
      const existing = this.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.planId,
      );
      const activity = { kind: 'plan' as const, steps: structuredClone(event.payload.steps) };
      if (existing) {
        existing.title = event.payload.title ?? 'Plan';
        existing.activity = activity;
        existing.status = event.payload.steps.every((step) => step.status === 'completed')
          ? 'complete'
          : 'running';
      } else {
        this.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: event.payload.title ?? 'Plan',
          status: event.payload.steps.every((step) => step.status === 'completed')
            ? 'complete'
            : 'running',
          toolName: 'plan.update',
          toolCallId: event.payload.planId,
          activity,
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'subagent') {
      this.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'subagent',
          phase: event.payload.phase,
          ...(event.payload.operation ? { name: event.payload.operation } : {}),
        },
      });
      const existing = this.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.subagentId,
      );
      const activity: ActivityPresentationView = {
        kind: 'subagent',
        subagentId: event.payload.subagentId,
        name: event.payload.name,
        phase: event.payload.phase,
        ...(event.payload.text ? { text: event.payload.text } : {}),
        ...(event.payload.agentPath ? { agentPath: event.payload.agentPath } : {}),
        ...(event.payload.operation ? { operation: event.payload.operation } : {}),
        ...(event.payload.model ? { model: event.payload.model } : {}),
        ...(event.payload.reasoningEffort
          ? { reasoningEffort: event.payload.reasoningEffort }
          : {}),
      };
      const status =
        event.payload.phase === 'failed'
          ? 'failed'
          : event.payload.phase === 'completed'
            ? 'complete'
            : 'running';
      if (existing) {
        existing.title = event.payload.name;
        existing.status = status;
        existing.activity = activity;
        if (event.payload.text) existing.detail = event.payload.text;
      } else {
        this.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: event.payload.name,
          ...(event.payload.text ? { detail: event.payload.text } : {}),
          status,
          toolName: 'provider.subagent',
          toolCallId: event.payload.subagentId,
          activity,
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'usage') {
      if (event.payload.limits) {
        this.providers.usageLimits.set(thread.provider, {
          usedPercent: event.payload.limits.usedPercent,
          ...(event.payload.limits.resetsAt ? { resetsAt: event.payload.limits.resetsAt } : {}),
          ...(event.payload.limits.windowMinutes
            ? { windowMinutes: event.payload.limits.windowMinutes }
            : {}),
          updatedAt: event.timestamp,
        });
      }
      // A plan-usage update alone carries no token counts for this turn.
      if (
        event.payload.inputTokens === undefined &&
        event.payload.outputTokens === undefined &&
        event.payload.cachedInputTokens === undefined &&
        event.payload.limits
      )
        return;
      this.state.usageByTurn[event.turnId] = {
        threadId: event.threadId,
        provider: thread.provider,
        inputTokens: event.payload.inputTokens ?? 0,
        outputTokens: event.payload.outputTokens ?? 0,
        cachedInputTokens: event.payload.cachedInputTokens ?? 0,
        updatedAt: event.timestamp,
      };
      this.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'usage',
          counts: Object.fromEntries(
            Object.entries({
              inputTokens: event.payload.inputTokens,
              outputTokens: event.payload.outputTokens,
              cachedInputTokens: event.payload.cachedInputTokens,
            }).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          ),
        },
      });
      return;
    }
    if (event.type === 'error') {
      this.researchCapture.discardResearchTurn(event.turnId);
      thread.status = 'failed';
      const previous = this.state.timeline.findLast(
        (item) => item.threadId === event.threadId && item.kind === 'error',
      );
      // Providers can repeat the same failure notice; one card per distinct message is enough.
      if (previous?.turnId === event.turnId && previous.text === event.payload.message) return;
      this.appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'error',
        title: 'Task stopped',
        text: event.payload.message,
        status: 'failed',
        timestamp: event.timestamp,
      });
      return;
    }
    if (event.type === 'completion') {
      this.pendingQuestions.delete(event.threadId);
      this.completeRunningActivities(event.threadId, event.turnId);
      if (event.payload.status === 'failed') thread.status = 'failed';
      else this.settleFinishedTurn(thread);
      if (
        event.payload.status === 'failed' &&
        !this.state.timeline.some(
          (item) => item.turnId === event.turnId && item.kind === 'error',
        )
      ) {
        // A failed turn must never end silently: if the provider gave no reason, say so.
        this.appendTimeline(event.threadId, {
          id: randomUUID(),
          turnId: event.turnId,
          kind: 'error',
          title: 'Turn did not complete',
          text: 'The model stopped before finishing this task. Try again. If it keeps happening, check your plan’s sign-in and usage in Settings → AI.',
          status: 'failed',
          timestamp: event.timestamp,
        });
      }
      if (event.payload.status === 'completed')
        this.researchCapture.completeResearchTurn(event.turnId);
      else this.researchCapture.discardResearchTurn(event.turnId);
    }
  }

  async authorizeProviderRequest(
    event: Extract<ThreadEventEnvelope, { type: 'approval' }>,
  ): Promise<void> {
    if (this.assistant.library.isReview(event.threadId)) {
      await this.runtime?.respondToRequest(event.threadId, {
        requestId: event.payload.requestId,
        choiceId: 'deny',
      });
      return;
    }
    this.researchCapture.taintResearchTurn(event.turnId);
    const alreadyRequested = [...this.pendingApprovals.values()].some(
      (pending) =>
        pending.kind === 'provider' &&
        pending.threadId === event.threadId &&
        pending.requestId === event.payload.requestId,
    );
    const approvalId = randomUUID();
    // Like Codex, a native approval waits until it is answered or the turn ends.
    this.state.approvals.push({
      id: approvalId,
      threadId: event.threadId,
      callId: event.payload.requestId,
      kind: 'native_tool',
      title: event.payload.title,
      summary: event.payload.description,
      target: event.provider,
      reversible: false,
      status: 'pending',
      // Phone turns always ask on the Mac, one request at a time.
      ...(event.payload.choices?.some(({ kind }) => kind === 'allow_task') &&
      !this.phoneTurns.has(event.turnId)
        ? { allowForTask: true }
        : {}),
    });
    this.appendTimeline(event.threadId, {
      id: event.id,
      turnId: event.turnId,
      kind: 'approval',
      title: event.payload.title,
      text: event.payload.description,
      detail: event.provider,
      status: 'pending',
      approvalId,
      toolName: 'provider.native',
      timestamp: event.timestamp,
    });
    this.pendingApprovals.set(approvalId, {
      resolve: () => undefined,
      kind: 'provider',
      threadId: event.threadId,
      turnId: event.turnId,
      requestId: event.payload.requestId,
    });
    this.commit();
    if (!alreadyRequested)
      this.notifyNeedsAttention(
        event.threadId,
        'approval',
        event.payload.description || event.payload.title,
      );
  }

  async authorizeGatewayAction(
    request: GatewayApprovalRequest,
    signal?: AbortSignal,
  ): Promise<{ approved: boolean }> {
    this.researchCapture.taintResearchTurn(request.turnId);
    const approvalId = randomUUID();
    const connector = /^(mail|drive|docs|sheets|slides|slack)_/.test(request.tool.name);
    const upload = /upload/.test(request.tool.name);
    let reviewArguments = request.arguments;
    if (request.tool.name === 'skill_run') {
      const args = parseActionArguments('skill_run', request.arguments);
      const agentId = this.requireThread(request.threadId).agentId;
      const skill = this.assistant.library.skill(agentId, args.id, args.revision);
      // The approval digest binds id + SHA-256 revision + input. Resolve the
      // exact source in the host, never ask the model to copy it back to us.
      reviewArguments = { ...args, source: skill.source };
    }
    const dataLeaving = summarizeDataLeaving(reviewArguments, request.tool.name);
    const dataLabel = request.tool.name.startsWith('skill_')
      ? 'Bash source and inputs to review'
      : request.tool.name === 'mac_automation'
        ? 'Native app action'
        : dataLeaving && request.tool.name === 'computer_action'
          ? 'Text or keys used in this action'
          : undefined;
    const capabilityBound = ['computer_action', 'browser_action', 'browser_upload'].includes(
      request.tool.name,
    );
    const trustedTarget = capabilityBound
      ? this.browserCapabilitySink?.trustedApprovalTarget(request.tool.name, request.arguments)
      : undefined;
    if (capabilityBound && !trustedTarget) return { approved: false };
    const connectorApp = connector ? connectorAppForTool(request.tool.name) : undefined;
    const connectorSelector =
      connector && typeof request.arguments.account_id === 'string'
        ? request.arguments.account_id
        : undefined;
    const pinnedConnectionId =
      connectorApp && connectorSelector
        ? this.connections.connectionIdForAction(connectorApp, connectorSelector)
        : undefined;
    const pinnedGeneration = connectorApp
      ? (this.connections.generations.get(connectorApp) ?? 0)
      : undefined;
    if (connector && (!connectorApp || !connectorSelector || !pinnedConnectionId)) {
      return { approved: false };
    }
    const account = connector
      ? this.connections.connectorAccountLabel(request.arguments.account_id)
      : undefined;
    const taskGrant = this.phoneTurns.has(request.turnId)
      ? undefined
      : gatewayTaskGrant(request.tool.name, request.arguments);
    if (
      (this.trustForTurn(request.turnId) === 'auto' &&
        !request.tool.name.startsWith('skill_')) ||
      (taskGrant && this.hasTaskGrant(request.threadId, request.turnId, taskGrant))
    ) {
      if (
        connectorApp &&
        connectorSelector &&
        pinnedConnectionId &&
        pinnedGeneration !== undefined
      ) {
        this.approvedConnectorBindings.set(request.id, {
          approvalId: request.id,
          threadId: request.threadId,
          turnId: request.turnId,
          app: connectorApp,
          selector: connectorSelector,
          connectionId: pinnedConnectionId,
          generation: pinnedGeneration,
          ...(account ? { account } : {}),
        });
      }
      const automaticTarget =
        trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name);
      this.deps.trajectory?.record({
        type: 'action_authorization',
        threadId: request.threadId,
        turnId: request.turnId,
        decision: 'allow',
        automatic: true,
        toolName: request.tool.name,
        target: GOOGLE_WORKSPACE_ACTION.test(request.tool.name)
          ? 'Google Workspace'
          : automaticTarget,
      });
      this.researchCapture.stageRawResearchEvent({
        threadId: request.threadId,
        turnId: request.turnId,
        eventType: 'action.authorization',
        data: {
          requestId: request.id,
          decision: 'allow',
          automatic: true,
          toolName: request.tool.name,
          target: automaticTarget,
          ...(account ? { account } : {}),
          ...(dataLeaving ? { dataLeaving } : {}),
        },
      });
      return { approved: true };
    }
    this.state.approvals.push({
      id: approvalId,
      threadId: request.threadId,
      callId: request.id,
      kind: connector ? 'connector_write' : upload ? 'file_upload' : 'native_tool',
      title: `Approve ${humanizeToolName(request.tool.name)}`,
      summary: request.reason,
      target: trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name),
      ...(account ? { account } : {}),
      ...(dataLeaving ? { dataLeaving } : {}),
      ...(dataLabel ? { dataLabel } : {}),
      reversible: false,
      status: 'pending',
      ...(taskGrant ? { allowForTask: true } : {}),
    });
    this.appendTimeline(request.threadId, {
      id: randomUUID(),
      turnId: request.turnId,
      kind: 'approval',
      title: `Approve ${humanizeToolName(request.tool.name)}`,
      text: request.reason,
      detail: trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name),
      status: 'pending',
      approvalId,
      toolName: request.tool.name,
      timestamp: new Date().toISOString(),
    });
    this.waitForApproval(request.threadId);
    this.commit();
    // The notification names the step in words ("Sending your mail"), not the tool id.
    const step = activityLabel(request.tool.name);
    this.notifyNeedsAttention(
      request.threadId,
      'approval',
      step === activityLabel(undefined) ? runtimeToolTitle(request.tool.name) : step,
    );
    return await new Promise((resolve) => {
      const finish = (decision: 'allow' | 'deny' | 'cancel'): void => {
        signal?.removeEventListener('abort', abort);
        const connectionUnchanged =
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId &&
          pinnedGeneration !== undefined
            ? this.connections.connectionIdForAction(connectorApp, connectorSelector) ===
                pinnedConnectionId &&
              (this.connections.generations.get(connectorApp) ?? 0) === pinnedGeneration
            : true;
        if (
          decision === 'allow' &&
          connectionUnchanged &&
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId
        ) {
          this.approvedConnectorBindings.set(request.id, {
            approvalId: request.id,
            threadId: request.threadId,
            turnId: request.turnId,
            app: connectorApp,
            selector: connectorSelector,
            connectionId: pinnedConnectionId,
            generation: pinnedGeneration!,
            ...(account ? { account } : {}),
          });
        } else {
          this.approvedConnectorBindings.delete(request.id);
        }
        resolve({ approved: decision === 'allow' && connectionUnchanged });
      };
      const abort = (): void => {
        this.pendingApprovals.delete(approvalId);
        this.resumeAfterRequest(request.threadId);
        this.setApprovalStatus(approvalId, 'expired');
        finish('cancel');
      };
      // Waits for the person; the turn ending (or the tool call aborting) revokes it.
      this.pendingApprovals.set(approvalId, {
        resolve: finish,
        kind: 'gateway',
        threadId: request.threadId,
        turnId: request.turnId,
        requestId: request.id,
        ...(taskGrant ? { taskGrant } : {}),
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }

  /** A task keeps working after its approval is answered; leave "waiting" once nothing is pending. */
  resumeAfterRequest(threadId: string): void {
    const thread = this.state.threads.find(({ id }) => id === threadId);
    if (
      thread?.status === 'waiting' &&
      this.runningTurns.has(threadId) &&
      !this.pendingQuestions.has(threadId) &&
      ![...this.pendingApprovals.values()].some((pending) => pending.threadId === threadId)
    )
      thread.status = 'running';
  }

  /** A running task that asks the person to approve an action is waiting on them. */
  waitForApproval(threadId: string): void {
    const thread = this.state.threads.find(({ id }) => id === threadId);
    if (thread?.status === 'running' && this.runningTurns.has(threadId))
      thread.status = 'waiting';
  }

  activeTurnId(threadId: string): string | undefined {
    if (!this.runningTurns.has(threadId)) return undefined;
    const thread = this.state.threads.find(({ id }) => id === threadId);
    return thread ? this.workspaceLeases.get(thread.workspace) : undefined;
  }

  hasTaskGrant(threadId: string, turnId: string, grant: string): boolean {
    return (
      !this.phoneTurns.has(turnId) &&
      this.activeTurnId(threadId) === turnId &&
      Boolean(this.taskGrants.get(turnId)?.has(`${threadId}\u0000${grant}`))
    );
  }

  revokeApprovalsForTurn(threadId: string, turnId: string): void {
    this.taskGrants.delete(turnId);
    for (const [approvalId, pending] of [...this.pendingApprovals]) {
      if (pending.threadId === threadId && pending.turnId === turnId) {
        this.revokeApproval(approvalId, pending);
      }
    }
    for (const [approvalId, binding] of this.approvedConnectorBindings) {
      if (binding.threadId === threadId && binding.turnId === turnId) {
        this.approvedConnectorBindings.delete(approvalId);
      }
    }
  }

  revokeApproval(approvalId: string, pending: PendingApproval): void {
    clearTimeout(pending.timeout);
    this.pendingApprovals.delete(approvalId);
    if (pending.requestId) this.approvedConnectorBindings.delete(pending.requestId);
    const approval = this.state.approvals.find(({ id }) => id === approvalId);
    if (approval?.status === 'pending') approval.status = 'expired';
    this.stageApprovalDecision(
      approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      'expired',
    );
    if (pending.kind === 'provider' && pending.requestId) {
      void this.runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve('cancel');
  }

  stageApprovalDecision(
    approvalId: string,
    context: { threadId: string; turnId: string },
    decision: 'approved' | 'denied' | 'expired',
  ): void {
    const approval = this.state.approvals.find(({ id }) => id === approvalId);
    this.researchCapture.stageRawResearchEvent({
      threadId: context.threadId,
      turnId: context.turnId,
      eventType: 'approval.decision',
      data: {
        approvalId,
        decision,
        ...(approval
          ? {
              kind: approval.kind,
              title: approval.title,
              summary: approval.summary,
              target: approval.target,
            }
          : {}),
      },
    });
  }

  releaseTurn(threadId: string): void {
    const thread = this.state.threads.find(({ id }) => id === threadId);
    const turnId = this.activeTurnId(threadId);
    if (turnId) {
      this.phoneTurns.delete(turnId);
      this.taskGrants.delete(turnId);
    }
    this.runningTurns.delete(threadId);
    this.macTurns.delete(threadId);
    this.foregroundTurns.delete(threadId);
    if (this.awakeTurns.delete(threadId)) this.deps.keepAwake?.release(threadId);
    if (thread) this.workspaceLeases.delete(thread.workspace);
    this.drainQueue();
    // A follow-up can still wait when another thread took the workspace first. A paused
    // thread keeps its failed state and Continue task until the person acts.
    if (thread && !this.heldThreads.has(threadId)) this.markWaitingFollowUps(thread);
  }

  /** Shows why a thread's queued follow-up has not started yet. */
  markWaitingFollowUps(thread: ThreadView): void {
    if (
      this.runningTurns.has(thread.id) ||
      !this.queuedTurns.some((turn) => turn.threadId === thread.id)
    )
      return;
    thread.status = 'queued';
    thread.queueReason =
      this.macUnavailable && this.isMacTurn(thread.id)
        ? this.macUnavailable === 'locked'
          ? 'Waiting for your Mac to unlock.'
          : 'Waiting for your Mac to wake.'
        : 'Waiting for another task to release this workspace.';
  }

  drainQueue(): void {
    if (this.shuttingDown) return;
    if (this.runningTurns.size >= 4) return;
    const nextIndex = this.queuedTurns.findIndex((turn) => {
      const thread = this.state.threads.find(({ id }) => id === turn.threadId);
      return (
        thread &&
        !this.heldThreads.has(thread.id) &&
        !this.workspaceLeases.has(thread.workspace) &&
        !(this.macUnavailable && this.isMacTurn(thread.id))
      );
    });
    if (nextIndex < 0) return;
    const [next] = this.queuedTurns.splice(nextIndex, 1);
    if (next) this.startTurn(next);
    if (this.runningTurns.size < 4) this.drainQueue();
  }

  completeRunningActivities(threadId: string, turnId: string): void {
    for (const item of this.state.timeline) {
      if (item.threadId === threadId && item.turnId === turnId && item.status === 'running') {
        item.status = 'complete';
      }
    }
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

  setApprovalStatus(id: string, status: ApprovalView['status']): void {
    const approval = this.state.approvals.find((candidate) => candidate.id === id);
    if (approval) approval.status = status;
    this.commit();
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

  leastUsedHue(): number {
    const counts = [0, 0, 0, 0];
    for (const agent of this.state.agents) {
      const slot =
        Number.isInteger(agent.hue) && agent.hue! >= 0 && agent.hue! <= 3 ? agent.hue! : 0;
      counts[slot] = (counts[slot] ?? 0) + 1;
    }
    return counts.reduce((best, count, index) => (count < counts[best]! ? index : best), 0);
  }

  requireThread(id: string): ThreadView {
    const thread = this.state.threads.find((candidate) => candidate.id === id);
    if (!thread) throw new Error('Thread not found.');
    return thread;
  }

  requireIdleThread(id: string, action: string): ThreadView {
    const thread = this.requireThread(id);
    if (
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting' ||
      this.runningTurns.has(id) ||
      this.queuedTurns.some(({ threadId }) => threadId === id)
    ) {
      throw new Error(`Stop the active task before you ${action}.`);
    }
    return thread;
  }

  /**
   * While a Mac task waits on the person (an approval or a question), let the display sleep
   * as usual; hold it awake again once the task resumes.
   */
  syncKeepAwake(): void {
    for (const threadId of this.macTurns.keys()) {
      const waiting =
        this.state.threads.find(({ id }) => id === threadId)?.status === 'waiting';
      if (waiting && this.awakeTurns.delete(threadId)) this.deps.keepAwake?.release(threadId);
      else if (!waiting && !this.awakeTurns.has(threadId)) {
        this.awakeTurns.add(threadId);
        this.deps.keepAwake?.hold(threadId);
      }
    }
  }

  commit(deferStreamDelta = false): void {
    this.revision += 1;
    this.syncKeepAwake();
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
