import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, normalize, resolve } from 'node:path';

import { LocalLeaseCoordinator, type TurnLease } from '@sia/action-gateway';
import type {
  ActionInvocationObserver,
  ActionResultObserver,
  ApprovalBroker,
  ApprovalRequest as GatewayApprovalRequest,
} from '@sia/action-gateway';
import type { ModelRoute, ProviderAttachment, ThreadEventEnvelope } from '@sia/protocol';
import { admitHostedRoutes, legacyModelRoute, resolveExecutionTarget } from '@sia/runtime';

import type { CloudClient } from './cloud-client.js';
import type {
  ActivityPresentationView,
  AgentView,
  AttachmentView,
  BackgroundTerminalView,
  ApprovalView,
  BridgeMethod,
  BridgeRequestMap,
  BridgeResultMap,
  BrowserView,
  BrowserWindowView,
  CaptureView,
  CloudFeatureFlags,
  ComputerPermissionsView,
  ComputerView,
  ConnectionView,
  DesktopPushEvent,
  DesktopSnapshot,
  ProviderId,
  ProviderUsageView,
  ProviderView,
  ScheduleView,
  ThreadView,
  TimelineItemView,
  UpdateView,
  VoiceView,
  WorkspaceDiffView,
  WorkspaceSnapshotView,
  TerminalResultView,
} from '../shared/bridge.js';
import type { RecordRepository } from './persistence.js';
import { probeProviders } from './provider-probe.js';
import type { RuntimeCoordinator } from './runtime-coordinator.js';
import type { CloudIdentityStatus } from './identity.js';
import type { CuaAuthorizationContext } from './cua-service.js';
import type { VoiceOperations } from './voice-service.js';
import type { TrajectoryRecorder } from './trajectory-recorder.js';
import { RESEARCH_CONSENT_VERSION, SCHEDULE_RUN_HISTORY_LIMIT } from '../shared/bridge.js';
import { verifyUpdateManifestResponse } from './update-manifest.js';

interface ComputerAutomation {
  permissions(): Promise<ComputerPermissionsView>;
  requestPermissions(): Promise<ComputerPermissionsView>;
  call(
    tool: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown>;
  shutdown(): Promise<void>;
}

interface BrowserCapabilitySink {
  acceptBrowserState(value: unknown, sessionId?: string): void;
  resetBrowserCapabilities(): void;
  trustedApprovalTarget(
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): string | undefined;
}

interface ControllerOptions {
  repository: RecordRepository;
  cloud: CloudClient;
  computer: ComputerAutomation;
  identity: {
    initialize(): Promise<CloudIdentityStatus>;
    read?(): Promise<string | undefined>;
    refreshSession?(): Promise<CloudIdentityStatus>;
    status(): CloudIdentityStatus;
    startEmailSignIn(email: string): Promise<CloudIdentityStatus>;
    completeEmailSignIn(code: string): Promise<CloudIdentityStatus>;
    completePasswordSignIn?(password: string): Promise<CloudIdentityStatus>;
    completeMfaSignIn?(code: string): Promise<CloudIdentityStatus>;
    beginMfaEnrollment?(): Promise<{ secretCode: string }>;
    completeMfaEnrollment?(code: string): Promise<CloudIdentityStatus>;
    signOut(): Promise<CloudIdentityStatus>;
  };
  fakeServices: boolean;
  fakeTurnDelayMs?: number;
  openExternal(url: string): Promise<void>;
  openMessages?(): Promise<void>;
  /** Always-on local trajectory log; absent in unit tests that do not care about it. */
  trajectory?: TrajectoryRecorder;
  /** Runs a read-only shell command (lsof); injectable for tests. */
  runCommand?: (file: string, args: readonly string[]) => Promise<string>;
  /** Provider discovery boundary; production uses the real CLI probe. */
  providerProbe?: typeof probeProviders;
  /** One-click capability unlock helpers; absent in unit tests that do not use them. */
  capabilitySetup?: {
    messagesStatus(): 'ready' | 'needs_full_disk_access' | 'unavailable';
    chromeDebugStatus(): Promise<'enabled' | 'off' | 'unavailable'>;
    enableChromeDebug(): Promise<unknown>;
    openFullDiskAccess(): Promise<void>;
    /** Fires one benign Apple event at Messages so macOS shows the Automation consent now. */
    prewarmMessagesAutomation(): Promise<void>;
  };
  /** Reveals a directory in Finder; used for the trajectory log. */
  revealDirectory?(path: string): Promise<void>;
  chooseDirectory(): Promise<string | null>;
  /** Visible app-managed root used when a new agent does not choose a custom folder. */
  defaultWorkspaceRoot?: string;
  createDirectory?(path: string): Promise<void>;
  chooseFiles?(): Promise<string[]>;
  openPath?(path: string): Promise<void>;
  composeFeedback?(subject: string, body: string): Promise<void>;
  appVersion?: string;
  updateManifestUrl?: string;
  updateManifestPublicKey?: string;
  exportJson(value: unknown): Promise<string | null>;
  notify?(notice: { threadId: string; title: string; body: string }): void;
  workspaceOperations?: {
    readDiff(workspace: string): Promise<WorkspaceDiffView>;
    stage(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
    restore(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
    listSnapshots?(workspace: string): Promise<WorkspaceSnapshotView[]>;
    createSnapshot?(workspace: string): Promise<WorkspaceSnapshotView[]>;
    restoreSnapshot?(workspace: string, snapshotId: string): Promise<WorkspaceDiffView>;
    deleteSnapshot?(workspace: string, snapshotId: string): Promise<WorkspaceSnapshotView[]>;
    runTerminal(workspace: string, command: string): Promise<TerminalResultView>;
    startBackgroundTerminal?(
      workspace: string,
      command: string,
    ): Promise<BackgroundTerminalView>;
    listBackgroundTerminals?(workspace: string): Promise<BackgroundTerminalView[]>;
    writeBackgroundTerminal?(
      workspace: string,
      id: string,
      input: string,
    ): Promise<BackgroundTerminalView>;
    stopBackgroundTerminal?(workspace: string, id: string): Promise<BackgroundTerminalView>;
    dispose?(): void;
    createWorktree(
      sourceWorkspace: string,
      threadId: string,
    ): Promise<{ path: string; branch?: string }>;
    removeWorktree?(workspace: string): Promise<void>;
  };
  voice?: VoiceOperations;
  startupNotice?: {
    title: string;
    detail: string;
  };
}

interface PersistedState {
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
  cloudFeatures: CloudFeatureFlags;
  preferences: {
    completionSound: boolean;
    /** All eligible actions run without in-app approval when 'auto' (default). */
    computerTrust?: 'auto' | 'ask';
    /** Eligible local trajectory log; Google Workspace connector turns are excluded. */
    trajectoryLog?: boolean;
    /** Set once the automatic macOS permission prompt has been shown for this profile. */
    permissionsPromptedAt?: string;
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

interface QueuedTurn {
  id: string;
  threadId: string;
  text: string;
  attachments?: readonly ProviderAttachment[];
  source?: 'manual' | 'schedule' | 'goal' | 'review';
  reviewTarget?: BridgeRequestMap['reviews.start']['target'];
  fakeDelayMs?: number;
  scheduleRunId?: string;
}

interface AttachmentGrant {
  readonly threadId: string;
  readonly attachment: ProviderAttachment;
  readonly view: AttachmentView;
  readonly expiresAt: number;
}

interface ResearchEventBase {
  id: string;
  occurredAt: string;
  classification: 'research_allowed';
  taints: [];
  sourceEventIds: string[];
}

type ResearchEventRecord = ResearchEventBase &
  (
    | {
        kind: 'conversation.text';
        payload: { role: 'user' | 'assistant'; text: string; provider: ProviderId };
      }
    | {
        kind: 'trajectory.step';
        payload: {
          source: 'provider' | 'sia_action';
          type: 'tool' | 'plan' | 'subagent' | 'usage' | 'action_result';
          name?: string;
          phase?: string;
          presentation?: string;
          outcome?: string;
          counts?: Record<string, number>;
        };
      }
    | {
        kind: 'trajectory.screenshot';
        payload: {
          source: 'sia_action';
          tool: 'computer_snapshot';
          mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
          dataBase64: string;
        };
      }
  );

interface RawResearchEventRecord extends ResearchEventBase {
  kind: 'raw.event' | 'raw.event_chunk';
  payload: {
    schemaVersion: 1;
    threadId: string;
    turnId: string;
    eventType: string;
    eventId?: string;
    sequence?: number;
    data?: unknown;
    encoding?: 'base64-json';
    chunkIndex?: number;
    chunkCount?: number;
    chunkData?: string;
  };
}

interface ResearchBatchRecord {
  batchId: string;
  /** False for captures created before cloud was configured; never retroactively upload them. */
  syncEligible?: boolean;
  consent: {
    version: string;
    acceptedAt: string;
    purpose: 'research_evaluation_debugging';
  };
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
  events: Array<ResearchEventRecord | RawResearchEventRecord>;
}

interface ResearchSyncRecord {
  batchId: string;
  synced: boolean;
}

interface StagedResearchTurn {
  tainted: boolean;
  events: ResearchEventRecord[];
  rawEvents: RawResearchEventRecord[];
  eventByMessageId: Map<string, string>;
  safeActionNames: string[];
}

const SAFE_RESEARCH_ACTIONS = new Set(['computer_list', 'computer_snapshot']);
const SIGN_IN_BRIDGE_METHODS: ReadonlySet<BridgeMethod> = new Set([
  'bootstrap',
  'auth.start',
  'auth.complete',
  'auth.signOut',
]);
const GOOGLE_WORKSPACE_ACTION = /^(?:mail|drive|docs|sheets|slides)_/;
const MAX_LOCAL_RESEARCH_BATCH_BYTES = 3 * 1024 * 1024;
const MAX_RESEARCH_SCREENSHOT_BASE64_BYTES = 1_500_000;
const MAX_RAW_EVENT_JSON_BYTES = 768 * 1024;
// Synced batches are pruned at these soft targets. Unsynced research is never discarded to
// satisfy an application quota: it remains in the encrypted outbox until AWS acknowledges it.
const TARGET_LOCAL_RESEARCH_BYTES = 128 * 1024 * 1024;
const TARGET_LOCAL_RESEARCH_BATCHES = 500;
const LOCAL_RESEARCH_RETENTION_MS = 90 * 24 * 60 * 60_000;
const LOCAL_RESEARCH_IDENTITY = '__local__';

interface PendingApproval {
  resolve(decision: 'allow' | 'deny' | 'cancel'): void;
  timeout: NodeJS.Timeout;
  kind: 'computer' | 'gateway' | 'provider';
  threadId: string;
  turnId: string;
  requestId?: string;
}

interface ApprovedConnectorBinding {
  readonly approvalId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly app: ConnectionView['id'];
  readonly selector: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly account?: string;
}

const EMPTY_CONNECTIONS: ConnectionView[] = [
  { id: 'gmail', label: 'Gmail', status: 'disconnected' },
  { id: 'drive', label: 'Google Drive', status: 'disconnected' },
  { id: 'docs', label: 'Google Docs', status: 'disconnected' },
  { id: 'sheets', label: 'Google Sheets', status: 'disconnected' },
  { id: 'slides', label: 'Google Slides', status: 'disconnected' },
  { id: 'slack', label: 'Slack', status: 'disconnected' },
];
const GOOGLE_CONNECTION_IDS: readonly ConnectionView['id'][] = [
  'gmail',
  'drive',
  'docs',
  'sheets',
  'slides',
];

function isGoogleConnection(id: ConnectionView['id']): boolean {
  return id !== 'slack';
}

function isConnectorActionTool(name: string): boolean {
  return /^(?:mail|drive|docs|sheets|slides|slack)_/.test(name);
}

const INITIAL_STATE: PersistedState = {
  agents: [],
  threads: [],
  timeline: [],
  approvals: [],
  connections: EMPTY_CONNECTIONS,
  capture: { status: 'not_consented', pendingCount: 0 },
  browser: { status: 'detached', grantedOrigins: [] },
  connectionOwners: {},
  schedules: [],
  cloudFeatures: {
    researchUploads: true,
    researchArchive: false,
    connectors: true,
    schedules: true,
  },
  preferences: { completionSound: false },
  usageByTurn: {},
};

export class DesktopController {
  readonly #repository: RecordRepository;
  readonly #cloud: CloudClient;
  readonly #computer: ComputerAutomation;
  readonly #identity: ControllerOptions['identity'];
  readonly #fakeServices: boolean;
  readonly #fakeTurnDelayMs: number;
  readonly #openExternal: (url: string) => Promise<void>;
  readonly #openMessages: (() => Promise<void>) | undefined;
  readonly #chooseDirectory: () => Promise<string | null>;
  readonly #defaultWorkspaceRoot: string | undefined;
  readonly #createDirectory: (path: string) => Promise<void>;
  readonly #chooseFiles: (() => Promise<string[]>) | undefined;
  readonly #openPath: ((path: string) => Promise<void>) | undefined;
  readonly #composeFeedback: ((subject: string, body: string) => Promise<void>) | undefined;
  readonly #appVersion: string;
  readonly #updateManifestUrl: string | undefined;
  readonly #updateManifestPublicKey: string | undefined;
  readonly #exportJson: (value: unknown) => Promise<string | null>;
  readonly #notify:
    ((notice: { threadId: string; title: string; body: string }) => void) | undefined;
  readonly #workspaceOperations: ControllerOptions['workspaceOperations'];
  readonly #voice: VoiceOperations | undefined;
  readonly #startupNotice: ControllerOptions['startupNotice'];
  readonly #listeners = new Set<(event: DesktopPushEvent) => void>();
  readonly #runningTurns = new Map<string, AbortController>();
  readonly #turnTasks = new Map<string, Promise<void>>();
  readonly #workspaceLeases = new Map<string, string>();
  readonly #pendingApprovals = new Map<string, PendingApproval>();
  readonly #approvedConnectorBindings = new Map<string, ApprovedConnectorBinding>();
  readonly #connectorGenerations = new Map<ConnectionView['id'], number>();
  readonly #connectorLinkExpiries = new Map<string, number>();
  readonly #pendingQuestions = new Map<string, { requestId: string; turnId: string }>();
  readonly #researchStaging = new Map<string, StagedResearchTurn>();
  /**
   * A Google Workspace action excludes its entire turn from research capture. The set lets us
   * discard events staged before the action was invoked and reject events that arrive afterwards.
   */
  readonly #researchExcludedTurns = new Set<string>();
  readonly #workspaceGrants = new Set<string>();
  readonly #attachmentGrants = new Map<string, AttachmentGrant>();
  readonly #failedTurnAttachments = new Map<string, readonly ProviderAttachment[]>();
  readonly #backendModelRoutes = new Map<string, ModelRoute>();
  readonly #allowedModelRoutes = new Map<string, readonly ModelRoute[]>();
  readonly #actionLeases = new LocalLeaseCoordinator(4);
  #queuedTurns: QueuedTurn[] = [];
  #researchSync: Promise<void> | undefined;
  #connectionSetup: { controller: AbortController; task: Promise<void> } | undefined;
  #researchRetryTimer: NodeJS.Timeout | undefined;
  #streamCommitTimer: NodeJS.Timeout | undefined;
  #scheduleTimer: NodeJS.Timeout | undefined;
  #scheduleRunInFlight = false;
  #researchRetryDelayMs = 15_000;
  #researchGeneration = 0;
  #runtime: RuntimeCoordinator | undefined;
  #browserCapabilitySink: BrowserCapabilitySink | undefined;
  #browserTarget: { targetId: string; tabId: string } | undefined;
  #browserSessionId: string | undefined;
  #state: PersistedState = structuredClone(INITIAL_STATE);
  #providers: ProviderView[] = [];
  #computerState: ComputerPermissionsView = {
    status: 'unavailable',
    accessibility: false,
    screenRecording: false,
  };
  readonly #trajectory: TrajectoryRecorder | undefined;
  readonly #capabilitySetup: ControllerOptions['capabilitySetup'];
  readonly #runCommand: (file: string, args: readonly string[]) => Promise<string>;
  readonly #providerProbe: typeof probeProviders;
  #messagesAccess: 'ready' | 'needs_full_disk_access' | 'unavailable' | undefined;
  #chromeConnection: 'enabled' | 'off' | 'unavailable' | undefined;
  readonly #revealDirectory: ((path: string) => Promise<void>) | undefined;
  #browserAutoAttach: Promise<void> | undefined;
  #revision = 0;
  #accountDeletionInProgress = false;
  #signOutInProgress = false;
  #cloudParticipant = false;
  #updates: UpdateView;

  constructor(options: ControllerOptions) {
    this.#repository = options.repository;
    this.#cloud = options.cloud;
    this.#computer = options.computer;
    this.#identity = options.identity;
    this.#fakeServices = options.fakeServices;
    this.#fakeTurnDelayMs = options.fakeTurnDelayMs ?? 160;
    this.#openExternal = options.openExternal;
    this.#trajectory = options.trajectory;
    this.#capabilitySetup = options.capabilitySetup;
    this.#runCommand = options.runCommand ?? defaultRunCommand;
    this.#providerProbe = options.providerProbe ?? probeProviders;
    this.#revealDirectory = options.revealDirectory;
    this.#openMessages = options.openMessages;
    this.#chooseDirectory = options.chooseDirectory;
    this.#defaultWorkspaceRoot = options.defaultWorkspaceRoot
      ? normalizeWorkspace(options.defaultWorkspaceRoot)
      : undefined;
    this.#createDirectory =
      options.createDirectory ??
      (async (path) => {
        await mkdir(path, { recursive: true, mode: 0o700 });
      });
    this.#chooseFiles = options.chooseFiles;
    this.#openPath = options.openPath;
    this.#composeFeedback = options.composeFeedback;
    this.#appVersion = options.appVersion ?? 'development';
    this.#updateManifestUrl = options.updateManifestUrl;
    this.#updateManifestPublicKey = options.updateManifestPublicKey;
    this.#updates = {
      status: options.updateManifestUrl ? 'idle' : 'unconfigured',
      currentVersion: this.#appVersion,
      detail: options.updateManifestUrl
        ? 'Ready to check the configured release feed.'
        : 'This build does not have a persistent signed update feed configured.',
    };
    this.#exportJson = options.exportJson;
    this.#notify = options.notify;
    this.#workspaceOperations = options.workspaceOperations;
    this.#voice = options.voice;
    this.#startupNotice = options.startupNotice;
  }

  attachRuntime(runtime: RuntimeCoordinator): void {
    if (this.#runtime) throw new Error('The provider runtime is already attached.');
    this.#runtime = runtime;
  }

  attachBrowserCapabilitySink(sink: BrowserCapabilitySink): void {
    if (this.#browserCapabilitySink)
      throw new Error('The browser action backend is already attached.');
    this.#browserCapabilitySink = sink;
  }

  approvalBroker(): ApprovalBroker {
    return {
      requestApproval: (request, signal) => this.#authorizeGatewayAction(request, signal),
    };
  }

  actionInvocationObserver(): ActionInvocationObserver {
    return (invocation) => {
      if (GOOGLE_WORKSPACE_ACTION.test(invocation.name)) {
        this.#excludeResearchTurn(invocation.context.turnId);
        this.#trajectory?.excludeTurn(invocation.context.threadId, invocation.context.turnId);
        return;
      }
      if (SAFE_RESEARCH_ACTIONS.has(invocation.name)) {
        this.#markSafeResearchAction(invocation.context.turnId, invocation.name);
      } else {
        this.#taintResearchTurn(invocation.context.turnId);
      }
    };
  }

  actionResultObserver(): ActionResultObserver {
    return (notice) => {
      this.#recordActionResult(notice);
      if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) return;
      this.#stageRawResearchEvent({
        threadId: notice.context.threadId,
        turnId: notice.context.turnId,
        eventType: 'sia.action_result',
        data: {
          name: notice.name,
          arguments: notice.arguments ?? {},
          result: notice.result,
        },
      });
      this.#stageResearchActionResult(notice);
    };
  }

  actionToolAvailable(name: string): boolean {
    if (this.#releaseAccessLocked()) return false;
    if (isConnectorActionTool(name)) {
      return (
        this.#fakeServices ||
        (this.#cloud.configured &&
          this.#identity.status().state === 'signed_in' &&
          this.#state.cloudFeatures.connectors)
      );
    }
    if (name.startsWith('schedule_')) return this.#schedulesAvailable();
    return true;
  }

  /** 'auto' runs eligible actions without in-app approval. */
  computerTrust(): 'auto' | 'ask' {
    return this.#state.preferences.computerTrust ?? 'auto';
  }

  trajectoryLogEnabled(): boolean {
    return this.#state.preferences.trajectoryLog ?? true;
  }

  createScheduleFromAction(
    threadId: string,
    input: {
      task: string;
      cadence: ScheduleView['cadence'];
      firstRunAt?: string;
      maxRuns?: number;
    },
  ): ScheduleView {
    const firstRunAt =
      input.firstRunAt ??
      new Date(
        Date.now() + (input.cadence === 'once' ? 0 : scheduleIntervalMs(input.cadence)),
      ).toISOString();
    const schedule = this.#insertSchedule({
      threadId,
      prompt: input.task,
      cadence: input.cadence,
      nextRunAt: firstRunAt,
      ...(input.maxRuns === undefined ? {} : { maxRuns: input.maxRuns }),
    });
    return structuredClone(schedule);
  }

  listSchedulesForAction(threadId: string): ScheduleView[] {
    this.#requireThread(threadId);
    return structuredClone(
      this.#state.schedules.filter((schedule) => schedule.threadId === threadId),
    );
  }

  updateScheduleFromAction(
    threadId: string,
    input: {
      scheduleId: string;
      task?: string;
      cadence?: ScheduleView['cadence'];
      nextRunAt?: string;
      enabled?: boolean;
      maxRuns?: number;
    },
  ): ScheduleView {
    const schedule = this.#requireSchedule(input.scheduleId);
    if (schedule.threadId !== threadId)
      throw new Error('Scheduled task not found in this thread.');
    if (input.task !== undefined) {
      const task = input.task.trim();
      if (!task) throw new Error('A scheduled task cannot be empty.');
      schedule.prompt = task;
    }
    if (input.cadence !== undefined) schedule.cadence = input.cadence;
    if (input.nextRunAt !== undefined) {
      schedule.nextRunAt = validScheduleTime(input.nextRunAt);
    }
    if (input.enabled !== undefined) schedule.enabled = input.enabled;
    if (input.maxRuns !== undefined) schedule.maxRuns = validScheduleRunLimit(input.maxRuns);
    this.#commit();
    if (schedule.enabled) void this.#runDueSchedules();
    return structuredClone(schedule);
  }

  deleteScheduleFromAction(threadId: string, scheduleId: string): void {
    const schedule = this.#requireSchedule(scheduleId);
    if (schedule.threadId !== threadId)
      throw new Error('Scheduled task not found in this thread.');
    this.#state.schedules = this.#state.schedules.filter(({ id }) => id !== scheduleId);
    this.#commit();
  }

  /** Any HTTP(S) origin is allowed while trusted; otherwise only origins granted at attach. */
  isBrowserOriginAllowed(origin: string): boolean {
    if (this.#state.browser.grantedOrigins.includes(origin)) return true;
    return this.computerTrust() === 'auto' && /^https?:$/.test(new URL(origin).protocol);
  }

  /**
   * In trusted mode the model does not need the person to pick a Chrome window first: the
   * frontmost visible window is attached on demand the first time a browser tool runs.
   */
  async #chromeDebugOwnerPid(): Promise<number | undefined> {
    return chromeDebugPortOwnerPid(this.#runCommand);
  }

  async ensureBrowserAttachedForActions(): Promise<string | undefined> {
    if (this.computerTrust() !== 'auto')
      return 'Trusted auto-attach is off; attach a Chrome window in Settings.';
    if (this.#state.browser.status === 'attached' && this.#browserSessionId) return undefined;
    if (!this.#browserAutoAttach) {
      this.#browserAutoAttach = this.#attachBrowser({}, { auto: true })
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          this.#browserAutoAttach = undefined;
        });
    }
    await this.#browserAutoAttach;
    return this.#state.browser.status === 'attached' ? undefined : this.#state.browser.detail;
  }

  #recordActionResult(notice: Parameters<ActionResultObserver>[0]): void {
    if (!this.#trajectory) return;
    if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) {
      return;
    }
    const images = (notice.result.images ?? []).map((image) => ({
      mimeType: image.mimeType,
      dataBase64: image.dataBase64,
    }));
    this.#trajectory.record(
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

  async #grantChosenDirectory(): Promise<string | null> {
    const chosen = await this.#chooseDirectory();
    if (!chosen) return null;
    if (!isAbsolute(chosen))
      throw new Error('The native picker returned an invalid workspace.');
    const workspace = normalizeWorkspace(chosen);
    this.#workspaceGrants.add(workspace);
    return workspace;
  }

  async #composeFeedbackMessage(
    input: BridgeRequestMap['feedback.compose'],
  ): Promise<BridgeResultMap['feedback.compose']> {
    if (!this.#composeFeedback)
      throw new Error('Feedback handoff is unavailable in this build.');
    if (input.threadId) this.#requireThread(input.threadId);
    const diagnostics = input.includeDiagnostics
      ? [
          '',
          '--- Sia diagnostics (no transcript or file contents) ---',
          `Version: ${this.#appVersion}`,
          ...(input.threadId ? [`Thread ID: ${input.threadId}`] : []),
          `Providers: ${this.#providers.map(({ id, status }) => `${id}=${status}`).join(', ')}`,
        ].join('\n')
      : '';
    await this.#composeFeedback(
      'Sia internal feedback',
      `${input.message.trim()}${diagnostics}`,
    );
    return { opened: true };
  }

  async #checkForUpdates(): Promise<UpdateView> {
    if (!this.#updateManifestUrl) return structuredClone(this.#updates);
    if (!isCleanHttpsUrl(this.#updateManifestUrl)) {
      this.#updates = {
        status: 'error',
        currentVersion: this.#appVersion,
        detail: 'The configured release feed must be a clean HTTPS URL.',
      };
      this.#emit();
      return structuredClone(this.#updates);
    }
    this.#updates = {
      status: 'checking',
      currentVersion: this.#appVersion,
      detail: 'Checking the configured release feed…',
    };
    this.#emit();
    try {
      if (!this.#updateManifestPublicKey) {
        throw new Error('The release feed does not have a pinned signing key.');
      }
      await this.#identity.refreshSession?.();
      const token = await this.#identity.read?.();
      if (!token) throw new Error('Sign in with an approved Sia account to check for updates.');
      const response = await fetch(this.#updateManifestUrl, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Release feed returned HTTP ${response.status}.`);
      const verified = verifyUpdateManifestResponse(
        await response.json(),
        this.#updateManifestPublicKey,
      );
      const latestVersion = verified.payload.version;
      const downloadUrl = verified.downloadUrl;
      const available = compareVersions(latestVersion, this.#appVersion) > 0;
      this.#updates = {
        status: available ? 'available' : 'current',
        currentVersion: this.#appVersion,
        latestVersion,
        ...(available ? { downloadUrl } : {}),
        detail: available
          ? `Sia ${latestVersion} is ready to download.`
          : 'This build is up to date.',
      };
    } catch (error) {
      this.#updates = {
        status: 'error',
        currentVersion: this.#appVersion,
        detail:
          error instanceof Error ? error.message : 'The release feed could not be checked.',
      };
    }
    this.#emit();
    return structuredClone(this.#updates);
  }

  async #openUpdateDownload(): Promise<BridgeResultMap['updates.openDownload']> {
    if (this.#updates.status !== 'available' || !this.#updates.downloadUrl) {
      throw new Error('Check for updates before opening a download.');
    }
    await this.#openExternal(this.#updates.downloadUrl);
    return { opened: true };
  }

  async initialize(): Promise<void> {
    const stored = this.#repository.get<PersistedState>('desktop', 'state');
    this.#state = stored ? this.#recover(stored) : structuredClone(INITIAL_STATE);
    this.#pruneExpiredResearchBatches();
    for (const workspace of [
      ...this.#state.agents.map((agent) => agent.workspace),
      ...this.#state.threads.map((thread) => thread.workspace),
    ]) {
      if (isAbsolute(workspace)) this.#workspaceGrants.add(normalizeWorkspace(workspace));
    }
    const [providers, computer] = await Promise.all([
      // Fake-services mode must not inspect or depend on host CLI installs or
      // authentication. An empty PATH produces deterministic placeholder views;
      // Codex is replaced with the explicit fake runtime below.
      this.#fakeServices ? probeProviders(undefined, { PATH: '' }) : this.#providerProbe(),
      this.#computer.permissions(),
      this.#identity.initialize(),
    ]);
    this.#providers = providers;
    await this.#refreshCapabilityStatuses().catch(() => undefined);
    if (
      !this.#fakeServices &&
      this.#identity.status().state === 'signed_in' &&
      computer.status === 'needs_permission' &&
      this.computerTrust() === 'auto' &&
      !this.#state.preferences.permissionsPromptedAt
    ) {
      // Ask macOS for Accessibility and Screen Recording once per profile so computer use is
      // ready without a trip through Settings; the person can still deny at the OS prompt.
      this.#state.preferences.permissionsPromptedAt = new Date().toISOString();
      this.#commit();
      void this.#computer
        .requestPermissions()
        .then((view) => {
          this.#computerState = view;
          this.#emit();
        })
        .catch(() => undefined);
    }
    if (this.#fakeServices) {
      const codexIndex = this.#providers.findIndex(({ id }) => id === 'codex');
      const fakeCodex: ProviderView = {
        id: 'codex',
        label: 'Codex',
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
      if (codexIndex >= 0) this.#providers[codexIndex] = fakeCodex;
      else this.#providers.push(fakeCodex);
    }
    await this.#refreshProviderModels();
    await this.#reconcileIdentityBoundState();
    await this.#refreshCloudSession();
    await this.#refreshMetaProviderState();
    if (this.#identity.status().state === 'signed_in') {
      await this.#voice?.refresh().catch(() => undefined);
    }
    this.#computerState = computer;
    this.#refreshResearchPendingCount();
    this.#persist();
    this.#scheduleResearchSync();
    this.#scheduleTimer = setInterval(() => void this.#runDueSchedules(), 30_000);
    this.#scheduleTimer.unref();
    void this.#runDueSchedules();
  }

  snapshot(): DesktopSnapshot {
    const identity = this.#identity.status();
    const cloud: DesktopSnapshot['cloud'] = {
      status:
        this.#cloud.configured && identity.state === 'signed_in' && !this.#signOutInProgress
          ? 'online'
          : 'offline',
      auth: this.#cloud.configured
        ? this.#signOutInProgress || identity.state === 'unconfigured'
          ? 'signed_out'
          : identity.state
        : 'unconfigured',
      ...(identity.email ? { account: identity.email } : {}),
      ...(identity.admin ? { admin: true } : {}),
      ...(this.#cloudParticipant ? { participant: true } : {}),
      ...(identity.adminMfa ? { adminMfa: true } : {}),
      features: structuredClone(this.#state.cloudFeatures),
    };
    if (this.#releaseAccessLocked()) {
      return {
        revision: this.#revision,
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
          trust: 'ask',
          trajectoryLog: false,
          detail: 'Sign in to Sia to use computer access.',
        },
        browser: { status: 'detached', grantedOrigins: [] },
        voice: { status: 'disconnected', voices: [] },
        preferences: { completionSound: false },
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
      revision: this.#revision,
      agents: structuredClone(this.#state.agents),
      threads: structuredClone(this.#state.threads),
      timeline: structuredClone(this.#state.timeline),
      approvals: structuredClone(this.#state.approvals),
      providers: structuredClone(this.#providers),
      connections: structuredClone(this.#state.connections),
      capture: structuredClone(this.#state.capture),
      computer: {
        ...structuredClone(this.#computerState),
        ...(this.#messagesAccess ? { messagesAccess: this.#messagesAccess } : {}),
        ...(this.#chromeConnection ? { chromeConnection: this.#chromeConnection } : {}),
        trust: this.computerTrust(),
        trajectoryLog: this.trajectoryLogEnabled(),
        ...(this.#trajectory ? { trajectoryDirectory: this.#trajectory.rootDirectory } : {}),
      },
      browser: structuredClone(this.#state.browser),
      voice: structuredClone(
        this.#voice?.view() ?? ({ status: 'disconnected', voices: [] } satisfies VoiceView),
      ),
      preferences: structuredClone(this.#state.preferences),
      providerUsage: this.#providerUsage(),
      updates: structuredClone(this.#updates),
      schedules: structuredClone(this.#state.schedules),
      ...(this.#state.activeAgentId ? { activeAgentId: this.#state.activeAgentId } : {}),
      ...(this.#state.activeThreadId ? { activeThreadId: this.#state.activeThreadId } : {}),
      cloud,
      ...(this.#startupNotice ? { startupNotice: structuredClone(this.#startupNotice) } : {}),
    };
  }

  subscribe(listener: (event: DesktopPushEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #providerUsage(): ProviderUsageView[] {
    const totals = new Map<ProviderId, ProviderUsageView>();
    for (const record of Object.values(this.#state.usageByTurn)) {
      const current = totals.get(record.provider) ?? {
        provider: record.provider,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        lastUsedAt: record.updatedAt,
        providerReported: true as const,
      };
      current.requests += 1;
      current.inputTokens += record.inputTokens;
      current.outputTokens += record.outputTokens;
      current.cachedInputTokens += record.cachedInputTokens;
      if (record.updatedAt > current.lastUsedAt) current.lastUsedAt = record.updatedAt;
      totals.set(record.provider, current);
    }
    return [...totals.values()].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }

  /** Keeps opaque cloud connection ids out of model arguments and renderer-controlled routing. */
  connectionIdForAction(
    app: ConnectionView['id'],
    selector: string,
    approvalId?: string,
  ): string | undefined {
    if (this.#releaseAccessLocked()) return undefined;
    const connection = this.#state.connections.find((candidate) => candidate.id === app);
    if (
      !connection?.connectionId ||
      connection.status !== 'connected' ||
      connection.enabled === false ||
      (selector !== app && selector !== connection.account)
    ) {
      return undefined;
    }
    if (approvalId) {
      const approved = this.#approvedConnectorBindings.get(approvalId);
      this.#approvedConnectorBindings.delete(approvalId);
      if (
        !approved ||
        approved.app !== app ||
        approved.selector !== selector ||
        approved.connectionId !== connection.connectionId ||
        approved.generation !== (this.#connectorGenerations.get(app) ?? 0) ||
        approved.account !== connection.account ||
        this.#activeTurnId(approved.threadId) !== approved.turnId
      ) {
        return undefined;
      }
    }
    return connection.connectionId;
  }

  markConnectionReconnectRequired(app: ConnectionView['id'], connectionId: string): void {
    const connection = this.#state.connections.find((candidate) => candidate.id === app);
    if (!connection || connection.connectionId !== connectionId) return;
    const affected = isGoogleConnection(app) ? GOOGLE_CONNECTION_IDS : [app];
    for (const id of affected) {
      const candidate = this.#state.connections.find((connection) => connection.id === id);
      if (candidate?.connectionId !== connectionId) continue;
      this.#updateConnection(id, {
        status: 'error',
        detail:
          'This app connection expired. Reconnect Google Workspace, then retry the action.',
      });
    }
    this.#commit();
    this.#recordLifecycleEvent('connector.setup.failed', {
      app,
      connectionId,
      reason: 'connection_reconnect_required',
    });
  }

  async invoke<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    if (this.#accountDeletionInProgress && method !== 'bootstrap') {
      throw new Error('Sia account deletion is in progress. Wait for it to finish.');
    }
    if (this.#signOutInProgress && method !== 'bootstrap') {
      throw new Error('Sia sign-out is in progress. Wait for it to finish.');
    }
    if (this.#releaseAccessLocked() && !SIGN_IN_BRIDGE_METHODS.has(method)) {
      throw new Error('Sign in to Sia to continue.');
    }
    switch (method) {
      case 'bootstrap':
        return this.snapshot() as BridgeResultMap[M];
      case 'agents.save':
        return (await this.#saveAgent(
          input as BridgeRequestMap['agents.save'],
        )) as BridgeResultMap[M];
      case 'agents.delete':
        return this.#deleteAgent(
          (input as BridgeRequestMap['agents.delete']).agentId,
        ) as BridgeResultMap[M];
      case 'agents.setPinned':
        return this.#setAgentPinned(
          input as BridgeRequestMap['agents.setPinned'],
        ) as BridgeResultMap[M];
      case 'agents.setNotifications':
        return this.#setAgentNotifications(
          input as BridgeRequestMap['agents.setNotifications'],
        ) as BridgeResultMap[M];
      case 'agents.duplicate':
        return this.#duplicateAgent(
          (input as BridgeRequestMap['agents.duplicate']).agentId,
        ) as BridgeResultMap[M];
      case 'threads.create':
        return this.#createThread(
          input as BridgeRequestMap['threads.create'],
        ) as BridgeResultMap[M];
      case 'threads.select':
        return this.#selectThread(
          (input as BridgeRequestMap['threads.select']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.rename':
        return this.#renameThread(
          input as BridgeRequestMap['threads.rename'],
        ) as BridgeResultMap[M];
      case 'threads.draft':
        return this.#setThreadDraft(
          input as BridgeRequestMap['threads.draft'],
        ) as BridgeResultMap[M];
      case 'threads.config':
        return this.#configureThread(
          input as BridgeRequestMap['threads.config'],
        ) as BridgeResultMap[M];
      case 'threads.archive':
        return this.#archiveThread(
          (input as BridgeRequestMap['threads.archive']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.unarchive':
        return this.#unarchiveThread(
          (input as BridgeRequestMap['threads.unarchive']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.setUnread':
        return this.#setThreadUnread(
          input as BridgeRequestMap['threads.setUnread'],
        ) as BridgeResultMap[M];
      case 'threads.fork':
        return (await this.#forkThread(
          input as BridgeRequestMap['threads.fork'],
        )) as BridgeResultMap[M];
      case 'threads.handoff':
        return (await this.#handoffThread(
          input as BridgeRequestMap['threads.handoff'],
        )) as BridgeResultMap[M];
      case 'worktrees.cleanup':
        return (await this.#cleanupWorktree(
          input as BridgeRequestMap['worktrees.cleanup'],
        )) as BridgeResultMap[M];
      case 'threads.search':
        return this.#searchThreads(
          (input as BridgeRequestMap['threads.search']).query,
        ) as BridgeResultMap[M];
      case 'threads.goal.set':
        return this.#setGoal(
          input as BridgeRequestMap['threads.goal.set'],
        ) as BridgeResultMap[M];
      case 'threads.goal.pause':
        return this.#pauseGoal(
          (input as BridgeRequestMap['threads.goal.pause']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.goal.resume':
        return this.#resumeGoal(
          (input as BridgeRequestMap['threads.goal.resume']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.goal.clear':
        return this.#clearGoal(
          (input as BridgeRequestMap['threads.goal.clear']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.delete':
        return this.#deleteThread(
          (input as BridgeRequestMap['threads.delete']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.send':
        return this.#sendTurn(input as BridgeRequestMap['threads.send']) as BridgeResultMap[M];
      case 'threads.retry':
        return this.#retryTurn(
          (input as BridgeRequestMap['threads.retry']).threadId,
        ) as BridgeResultMap[M];
      case 'threads.cancel':
        return (await this.#cancelTurn(
          (input as BridgeRequestMap['threads.cancel']).threadId,
        )) as BridgeResultMap[M];
      case 'attachments.pick':
        return (await this.#pickAttachments(
          (input as BridgeRequestMap['attachments.pick']).threadId,
        )) as BridgeResultMap[M];
      case 'attachments.drop':
        return (await this.#grantAttachments(
          (input as BridgeRequestMap['attachments.drop']).threadId,
          (input as BridgeRequestMap['attachments.drop']).paths,
        )) as BridgeResultMap[M];
      case 'attachments.preview':
        return (await this.#previewAttachment(
          input as BridgeRequestMap['attachments.preview'],
        )) as BridgeResultMap[M];
      case 'attachments.open':
        return (await this.#openAttachment(
          input as BridgeRequestMap['attachments.open'],
        )) as BridgeResultMap[M];
      case 'attachments.reveal':
        return (await this.#revealAttachment(
          input as BridgeRequestMap['attachments.reveal'],
        )) as BridgeResultMap[M];
      case 'changes.read':
        return (await this.#readChanges(
          (input as BridgeRequestMap['changes.read']).threadId,
        )) as BridgeResultMap[M];
      case 'changes.stage':
        return (await this.#stageChanges(
          input as BridgeRequestMap['changes.stage'],
        )) as BridgeResultMap[M];
      case 'changes.restore':
        return (await this.#restoreChanges(
          input as BridgeRequestMap['changes.restore'],
        )) as BridgeResultMap[M];
      case 'changes.snapshots.list':
        return (await this.#listWorkspaceSnapshots(
          (input as BridgeRequestMap['changes.snapshots.list']).threadId,
        )) as BridgeResultMap[M];
      case 'changes.snapshots.create':
        return (await this.#createWorkspaceSnapshot(
          (input as BridgeRequestMap['changes.snapshots.create']).threadId,
        )) as BridgeResultMap[M];
      case 'changes.snapshots.restore':
        return (await this.#restoreWorkspaceSnapshot(
          input as BridgeRequestMap['changes.snapshots.restore'],
        )) as BridgeResultMap[M];
      case 'changes.snapshots.delete':
        return (await this.#deleteWorkspaceSnapshot(
          input as BridgeRequestMap['changes.snapshots.delete'],
        )) as BridgeResultMap[M];
      case 'terminal.run':
        return (await this.#runTerminal(
          input as BridgeRequestMap['terminal.run'],
        )) as BridgeResultMap[M];
      case 'terminal.start':
        return (await this.#startBackgroundTerminal(
          input as BridgeRequestMap['terminal.start'],
        )) as BridgeResultMap[M];
      case 'terminal.list':
        return (await this.#listBackgroundTerminals(
          (input as BridgeRequestMap['terminal.list']).threadId,
        )) as BridgeResultMap[M];
      case 'terminal.write':
        return (await this.#writeBackgroundTerminal(
          input as BridgeRequestMap['terminal.write'],
        )) as BridgeResultMap[M];
      case 'terminal.stop':
        return (await this.#stopBackgroundTerminal(
          input as BridgeRequestMap['terminal.stop'],
        )) as BridgeResultMap[M];
      case 'reviews.start':
        return this.#startReview(
          input as BridgeRequestMap['reviews.start'],
        ) as BridgeResultMap[M];
      case 'schedules.create':
        return this.#createSchedule(
          input as BridgeRequestMap['schedules.create'],
        ) as BridgeResultMap[M];
      case 'schedules.setEnabled':
        return this.#setScheduleEnabled(
          input as BridgeRequestMap['schedules.setEnabled'],
        ) as BridgeResultMap[M];
      case 'schedules.delete':
        return this.#deleteSchedule(
          (input as BridgeRequestMap['schedules.delete']).scheduleId,
        ) as BridgeResultMap[M];
      case 'schedules.runNow':
        return this.#runScheduleNow(
          (input as BridgeRequestMap['schedules.runNow']).scheduleId,
        ) as BridgeResultMap[M];
      case 'approvals.resolve':
        return this.#resolveApproval(
          input as BridgeRequestMap['approvals.resolve'],
        ) as BridgeResultMap[M];
      case 'providers.probe':
        return (await this.#probeProviders(
          (input as BridgeRequestMap['providers.probe']).providerId,
        )) as unknown as BridgeResultMap[M];
      case 'providers.login':
        return (await this.#providerLogin(
          (input as BridgeRequestMap['providers.login']).providerId,
        )) as unknown as BridgeResultMap[M];
      case 'settings.openDirectory':
        return { path: await this.#grantChosenDirectory() } as unknown as BridgeResultMap[M];
      case 'settings.setCompletionSound':
        this.#state.preferences.completionSound = (
          input as BridgeRequestMap['settings.setCompletionSound']
        ).enabled;
        this.#commit();
        return this.snapshot() as BridgeResultMap[M];
      case 'feedback.compose':
        return (await this.#composeFeedbackMessage(
          input as BridgeRequestMap['feedback.compose'],
        )) as BridgeResultMap[M];
      case 'updates.check':
        return (await this.#checkForUpdates()) as BridgeResultMap[M];
      case 'updates.openDownload':
        return (await this.#openUpdateDownload()) as BridgeResultMap[M];
      case 'computer.permissions':
        return (await this.#refreshComputer(false)) as unknown as BridgeResultMap[M];
      case 'computer.requestPermissions':
        return (await this.#refreshComputer(true)) as unknown as BridgeResultMap[M];
      case 'computer.openMessages':
        return (await this.#openMessagesApp()) as unknown as BridgeResultMap[M];
      case 'computer.unlock':
        return (await this.#unlockComputerCapabilities()) as unknown as BridgeResultMap[M];
      case 'computer.setTrust':
        this.#state.preferences.computerTrust = (
          input as BridgeRequestMap['computer.setTrust']
        ).trust;
        this.#commit();
        return this.snapshot() as BridgeResultMap[M];
      case 'computer.setTrajectoryLog':
        this.#state.preferences.trajectoryLog = (
          input as BridgeRequestMap['computer.setTrajectoryLog']
        ).enabled;
        this.#commit();
        return this.snapshot() as BridgeResultMap[M];
      case 'computer.revealTrajectories':
        if (this.#trajectory && this.#revealDirectory) {
          await this.#revealDirectory(this.#trajectory.rootDirectory);
        }
        return this.snapshot() as BridgeResultMap[M];
      case 'browser.attach':
        return (await this.#attachBrowser(
          input as BridgeRequestMap['browser.attach'],
        )) as unknown as BridgeResultMap[M];
      case 'browser.open':
        return (await this.#openBrowserUrl(
          (input as BridgeRequestMap['browser.open']).url,
        )) as unknown as BridgeResultMap[M];
      case 'browser.detach':
        return (await this.#detachBrowser()) as unknown as BridgeResultMap[M];
      case 'voice.configure':
        return (await this.#configureVoice()) as unknown as BridgeResultMap[M];
      case 'voice.refresh':
        return (await this.#refreshVoice()) as unknown as BridgeResultMap[M];
      case 'voice.select':
        return (await this.#selectVoice(
          (input as BridgeRequestMap['voice.select']).voiceId,
        )) as unknown as BridgeResultMap[M];
      case 'voice.disconnect':
        return this.#disconnectVoice() as unknown as BridgeResultMap[M];
      case 'voice.transcribe': {
        const value = input as BridgeRequestMap['voice.transcribe'];
        return {
          text: await this.#requireVoice().transcribe(value.audioBase64, value.mimeType),
        } as unknown as BridgeResultMap[M];
      }
      case 'voice.realtime.start':
        return (await this.#requireVoice().startRealtime()) as unknown as BridgeResultMap[M];
      case 'voice.realtime.append': {
        const value = input as BridgeRequestMap['voice.realtime.append'];
        this.#requireVoice().appendRealtime(value.sessionId, value.audioBase64);
        return undefined as BridgeResultMap[M];
      }
      case 'voice.realtime.stop': {
        const value = input as BridgeRequestMap['voice.realtime.stop'];
        return {
          text: await this.#requireVoice().stopRealtime(value.sessionId, value.commit),
        } as unknown as BridgeResultMap[M];
      }
      case 'voice.speak': {
        const value = input as BridgeRequestMap['voice.speak'];
        return (await this.#requireVoice().speak(
          value.text,
          value.voiceId,
        )) as unknown as BridgeResultMap[M];
      }
      case 'connections.startAll':
        return (await this.#startAllConnections()) as unknown as BridgeResultMap[M];
      case 'connections.startGoogle':
        return (await this.#startGoogleConnections()) as unknown as BridgeResultMap[M];
      case 'connections.upgradeGoogle':
        return (await this.#upgradeGoogleConnections()) as unknown as BridgeResultMap[M];
      case 'connections.startSelected':
        return (await this.#startSelectedConnections(
          (input as BridgeRequestMap['connections.startSelected']).connectionIds,
        )) as unknown as BridgeResultMap[M];
      case 'connections.start':
        return (await (isGoogleConnection(
          (input as BridgeRequestMap['connections.start']).connectionId,
        )
          ? this.#startSelectedConnections([
              (input as BridgeRequestMap['connections.start']).connectionId,
            ])
          : this.#startConnection(
              (input as BridgeRequestMap['connections.start']).connectionId,
            ))) as unknown as BridgeResultMap[M];
      case 'connections.setEnabled':
        return this.#setConnectionEnabled(
          input as BridgeRequestMap['connections.setEnabled'],
        ) as unknown as BridgeResultMap[M];
      case 'connections.disconnect':
        return (await this.#disconnectConnection(
          input as BridgeRequestMap['connections.disconnect'],
        )) as unknown as BridgeResultMap[M];
      case 'auth.start':
        return (await this.#startSignIn(
          (input as BridgeRequestMap['auth.start']).email,
        )) as unknown as BridgeResultMap[M];
      case 'auth.complete':
        return (await this.#completeSignIn(
          (input as BridgeRequestMap['auth.complete']).code,
        )) as unknown as BridgeResultMap[M];
      case 'auth.mfaBegin':
        if (!this.#identity.beginMfaEnrollment) {
          throw new Error('Authenticator setup is unavailable in this build.');
        }
        return (await this.#identity.beginMfaEnrollment()) as BridgeResultMap[M];
      case 'auth.mfaComplete':
        return (await this.#completeMfaEnrollment(
          (input as BridgeRequestMap['auth.mfaComplete']).code,
        )) as BridgeResultMap[M];
      case 'auth.signOut':
        return (await this.#signOut()) as unknown as BridgeResultMap[M];
      case 'auth.deleteAccount':
        return (await this.#deleteCloudAccount(
          (input as BridgeRequestMap['auth.deleteAccount']).confirmation,
        )) as unknown as BridgeResultMap[M];
      case 'research.setCapture':
        return this.#setCapture(
          input as BridgeRequestMap['research.setCapture'],
        ) as BridgeResultMap[M];
      case 'research.export':
        return (await this.#exportResearch()) as unknown as BridgeResultMap[M];
      case 'research.delete':
        return (await this.#deleteResearch(
          (input as BridgeRequestMap['research.delete']).confirmation,
        )) as unknown as BridgeResultMap[M];
      case 'research.admin.invites':
        return (await this.#cloud.listAdminInvites()) as BridgeResultMap[M];
      case 'research.admin.invite':
        return (await this.#cloud.createAdminInvite(
          (input as BridgeRequestMap['research.admin.invite']).email,
        )) as BridgeResultMap[M];
      case 'research.admin.participants':
        return (await this.#cloud.listAdminResearchParticipants()) as BridgeResultMap[M];
      case 'research.admin.batches':
        return (await this.#cloud.listAdminResearchBatches(
          (input as BridgeRequestMap['research.admin.batches']).subject,
        )) as BridgeResultMap[M];
      case 'research.admin.readBatch': {
        const value = input as BridgeRequestMap['research.admin.readBatch'];
        return (await this.#cloud.readAdminResearchBatch(
          value.subject,
          value.batchId,
        )) as BridgeResultMap[M];
      }
    }
    throw new Error(`Unknown desktop method: ${String(method)}`);
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
    if (this.#releaseAccessLocked()) return 'deny';
    if (context.kind === 'direct_user') return 'allow';
    const active = this.#activeTurnId(context.threadId);
    if (active !== context.turnId) return 'cancel';
    if (this.computerTrust() === 'auto') {
      // Trusted local mode: the driver's own risk prompt is answered for the person, but the
      // decision is written to the trajectory log so every action stays reviewable afterwards.
      this.#trajectory?.record({
        type: 'computer_authorization',
        threadId: context.threadId,
        turnId: context.turnId,
        decision: 'allow',
        automatic: true,
        adapterId: request.adapterId,
        riskClass: request.riskClass,
        summary: request.humanSummary,
      });
      this.#stageRawResearchEvent({
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
    const presentation = computerApprovalPresentation(request.adapterId, request.humanSummary);
    const resource = safeResourceLabel(request.resourceJson, presentation.kind);
    this.#state.approvals.push({
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
    });
    this.#stageRawResearchEvent({
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
    this.#commit();

    return new Promise((resolve) => {
      const remaining = Math.max(0, Number(request.expiresUnixMs) - Date.now());
      const timeout = setTimeout(
        () => {
          this.#pendingApprovals.delete(approvalId);
          this.#setApprovalStatus(approvalId, 'expired');
          this.#stageApprovalDecision(approvalId, context, 'expired');
          resolve('cancel');
        },
        Math.min(remaining, 120_000),
      );
      this.#pendingApprovals.set(approvalId, {
        resolve,
        timeout,
        kind: 'computer',
        threadId: context.threadId,
        turnId: context.turnId,
      });
    });
  }

  async shutdown(): Promise<void> {
    // Quit must remain bounded even when an OS integration or provider subprocess
    // stops responding. The app has already stopped accepting work at this point.
    const shutdownDeadline = Date.now() + 8_000;
    if (this.#researchRetryTimer) clearTimeout(this.#researchRetryTimer);
    if (this.#scheduleTimer) clearInterval(this.#scheduleTimer);
    for (const controller of this.#runningTurns.values()) controller.abort();
    for (const pending of this.#pendingApprovals.values()) {
      clearTimeout(pending.timeout);
      pending.resolve('cancel');
    }
    this.#pendingApprovals.clear();
    this.#approvedConnectorBindings.clear();
    this.#connectionSetup?.controller.abort();
    this.#browserCapabilitySink?.resetBrowserCapabilities();
    await settleBeforeShutdown(
      Promise.allSettled([...this.#turnTasks.values()]),
      shutdownDeadline,
    );
    await settleBeforeShutdown(this.#connectionSetup?.task, shutdownDeadline);
    await settleBeforeShutdown(this.#researchSync, shutdownDeadline);
    await settleBeforeShutdown(this.#runtime?.dispose(), shutdownDeadline);
    this.#workspaceOperations?.dispose?.();
    this.#voice?.dispose?.();
    await settleBeforeShutdown(this.#computer.shutdown(), shutdownDeadline);
    this.#cancelStreamCommit();
    this.#persist();
    this.#repository.close();
  }

  async #saveAgent(
    input: BridgeRequestMap['agents.save'],
  ): Promise<BridgeResultMap['agents.save']> {
    this.#requireSignedInReleaseAccount();
    const now = new Date().toISOString();
    const existing = input.id
      ? this.#state.agents.find((candidate) => candidate.id === input.id)
      : undefined;
    const agentId = existing?.id ?? randomUUID();
    const model = input.model.trim();
    const provider = input.provider ?? existing?.provider ?? this.#providerForModel(model);
    this.#requireReadyProvider(provider, model);
    let workspace: string;
    if (input.workspace?.trim()) {
      if (!isAbsolute(input.workspace))
        throw new Error('Choose an absolute workspace directory.');
      workspace = normalizeWorkspace(input.workspace);
      if (!this.#workspaceGrants.has(workspace)) {
        throw new Error('Choose this workspace with the native folder picker before saving.');
      }
    } else if (existing) {
      workspace = existing.workspace;
    } else {
      if (!this.#defaultWorkspaceRoot) {
        throw new Error('Automatic workspaces are unavailable in this build. Choose a folder.');
      }
      workspace = join(
        this.#defaultWorkspaceRoot,
        `${workspaceSlug(input.name)}-${agentId.slice(0, 8)}`,
      );
      await this.#createDirectory(workspace);
      this.#workspaceGrants.add(workspace);
    }
    const hue = input.hue ?? existing?.hue ?? this.#leastUsedHue();
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
    const index = this.#state.agents.findIndex(({ id }) => id === agentId);
    if (index >= 0) this.#state.agents[index] = agent;
    else this.#state.agents.push(agent);
    this.#state.activeAgentId = agentId;
    if (!existing) {
      const created = this.#createThread({ agentId });
      return { agentId, snapshot: created.snapshot };
    }
    this.#commit();
    return { agentId, snapshot: this.snapshot() };
  }

  #setAgentPinned(input: BridgeRequestMap['agents.setPinned']): DesktopSnapshot {
    const agent = this.#requireAgent(input.agentId);
    agent.pinned = input.pinned;
    agent.updatedAt = new Date().toISOString();
    this.#commit();
    return this.snapshot();
  }

  #setAgentNotifications(input: BridgeRequestMap['agents.setNotifications']): DesktopSnapshot {
    const agent = this.#requireAgent(input.agentId);
    agent.notificationsEnabled = input.enabled;
    agent.updatedAt = new Date().toISOString();
    this.#commit();
    return this.snapshot();
  }

  #duplicateAgent(agentId: string): BridgeResultMap['agents.duplicate'] {
    const source = this.#requireAgent(agentId);
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
    this.#state.agents.push(copy);
    this.#state.activeAgentId = copy.id;
    delete this.#state.activeThreadId;
    this.#commit();
    return { agentId: copy.id, snapshot: this.snapshot() };
  }

  #deleteAgent(agentId: string): DesktopSnapshot {
    const agent = this.#requireAgent(agentId);
    const active = this.#state.threads.some(
      (thread) =>
        thread.agentId === agent.id &&
        (thread.status === 'running' ||
          thread.status === 'queued' ||
          thread.status === 'waiting' ||
          this.#runningTurns.has(thread.id) ||
          this.#queuedTurns.some((turn) => turn.threadId === thread.id) ||
          this.#pendingQuestions.has(thread.id)),
    );
    if (active) throw new Error('Cancel the active or queued task before deleting this agent.');
    const threadIds = new Set(agent.threadIds);
    this.#state.agents = this.#state.agents.filter(({ id }) => id !== agentId);
    this.#state.threads = this.#state.threads.filter(({ agentId: id }) => id !== agentId);
    this.#state.timeline = this.#state.timeline.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.#state.schedules = this.#state.schedules.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.#state.usageByTurn = Object.fromEntries(
      Object.entries(this.#state.usageByTurn).filter(
        ([, usage]) => !threadIds.has(usage.threadId),
      ),
    );
    const nextAgentId = this.#state.agents[0]?.id;
    if (nextAgentId) this.#state.activeAgentId = nextAgentId;
    else delete this.#state.activeAgentId;
    delete this.#state.activeThreadId;
    this.#commit();
    return this.snapshot();
  }

  #createThread(input: BridgeRequestMap['threads.create']): BridgeResultMap['threads.create'] {
    this.#requireSignedInReleaseAccount();
    const agent = this.#requireAgent(input.agentId);
    const id = randomUUID();
    const now = new Date().toISOString();
    const releaseRoute = legacyModelRoute(agent.provider, agent.model);
    const backendDefault = this.#backendModelRoutes.get(
      modelRouteKey(agent.provider, agent.model),
    );
    const allowedRoutes = this.#allowedModelRoutes.get(
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
    const reasoningEffort = this.#defaultReasoningEffort(agent.provider, agent.model);
    this.#state.threads.push({
      id,
      agentId: agent.id,
      title: input.title?.trim() || 'New thread',
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
      worktree: { kind: 'primary', sourceWorkspace: agent.workspace },
      createdAt: now,
      updatedAt: now,
    });
    agent.threadIds.push(id);
    this.#state.activeAgentId = agent.id;
    this.#state.activeThreadId = id;
    this.#commit();
    return { threadId: id, snapshot: this.snapshot() };
  }

  #selectThread(threadId: string): DesktopSnapshot {
    const thread = this.#requireThread(threadId);
    thread.unread = false;
    this.#state.activeThreadId = thread.id;
    this.#state.activeAgentId = thread.agentId;
    this.#commit();
    return this.snapshot();
  }

  #renameThread(input: BridgeRequestMap['threads.rename']): DesktopSnapshot {
    const thread = this.#requireThread(input.threadId);
    const title = input.title.trim();
    if (!title) throw new Error('Enter a thread name.');
    thread.title = title;
    thread.updatedAt = new Date().toISOString();
    this.#commit();
    return this.snapshot();
  }

  #setThreadDraft(input: BridgeRequestMap['threads.draft']): DesktopSnapshot {
    const thread = this.#requireThread(input.threadId);
    if (input.text) thread.draft = input.text;
    else delete thread.draft;
    this.#commit();
    return this.snapshot();
  }

  #configureThread(input: BridgeRequestMap['threads.config']): DesktopSnapshot {
    const thread = this.#requireIdleThread(input.threadId, 'change model settings');
    const provider = this.#requireReadyProvider(thread.provider, input.model.trim());
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
    this.#commit();
    return this.snapshot();
  }

  #archiveThread(threadId: string): DesktopSnapshot {
    const thread = this.#requireIdleThread(threadId, 'archive this thread');
    thread.archivedAt = new Date().toISOString();
    thread.unread = false;
    if (this.#state.activeThreadId === thread.id) delete this.#state.activeThreadId;
    this.#commit();
    return this.snapshot();
  }

  #unarchiveThread(threadId: string): DesktopSnapshot {
    const thread = this.#requireThread(threadId);
    delete thread.archivedAt;
    thread.updatedAt = new Date().toISOString();
    this.#commit();
    return this.snapshot();
  }

  #setThreadUnread(input: BridgeRequestMap['threads.setUnread']): DesktopSnapshot {
    const thread = this.#requireThread(input.threadId);
    thread.unread = input.unread;
    this.#commit();
    return this.snapshot();
  }

  async #forkThread(
    input: BridgeRequestMap['threads.fork'],
    primary = false,
  ): Promise<BridgeResultMap['threads.fork']> {
    const source = this.#requireThread(input.threadId);
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
      const service = this.#requireWorkspaceOperations();
      const created = await service.createWorktree(
        source.workspace,
        worktreeLabel(input.title?.trim() || `${source.title}-fork`, id),
      );
      workspace = normalizeWorkspace(created.path);
      this.#workspaceGrants.add(workspace);
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
      createdAt: now,
      updatedAt: now,
    };
    delete forked.archivedAt;
    delete forked.draft;
    delete forked.queueReason;
    delete forked.interruptedTurnId;
    this.#state.threads.push(forked);
    this.#state.timeline.push(
      ...this.#state.timeline
        .filter((item) => item.threadId === source.id)
        .map((item) => ({ ...structuredClone(item), id: randomUUID(), threadId: id })),
    );
    const agent = this.#requireAgent(source.agentId);
    agent.threadIds.push(id);
    agent.updatedAt = now;
    this.#state.activeAgentId = source.agentId;
    this.#state.activeThreadId = id;
    this.#commit();
    return { threadId: id, snapshot: this.snapshot() };
  }

  async #handoffThread(
    input: BridgeRequestMap['threads.handoff'],
  ): Promise<BridgeResultMap['threads.handoff']> {
    const source = this.#requireIdleThread(input.threadId, 'handoff this thread');
    if (input.destination === 'primary' && source.worktree?.kind !== 'linked') {
      throw new Error('This thread is already using the primary workspace.');
    }
    return await this.#forkThread(
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

  async #cleanupWorktree(
    input: BridgeRequestMap['worktrees.cleanup'],
  ): Promise<DesktopSnapshot> {
    if (input.confirmation !== 'REMOVE WORKTREE') {
      throw new Error('Worktree removal confirmation is required.');
    }
    const thread = this.#requireIdleThread(input.threadId, 'remove this worktree');
    if (thread.worktree?.kind !== 'linked') {
      throw new Error('This thread does not own a linked worktree.');
    }
    if (
      this.#state.threads.some(
        (candidate) => candidate.id !== thread.id && candidate.workspace === thread.workspace,
      )
    ) {
      throw new Error('Another thread still uses this worktree.');
    }
    const service = this.#requireWorkspaceOperations();
    if (!service.removeWorktree)
      throw new Error('Worktree cleanup is unavailable in this build.');
    await service.removeWorktree(thread.workspace);
    this.#workspaceGrants.delete(thread.workspace);
    return this.#deleteThread(thread.id);
  }

  #searchThreads(query: string): BridgeResultMap['threads.search'] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return { results: [] };
    const results = this.#state.threads
      .map((thread) => {
        const matches: BridgeResultMap['threads.search']['results'][number]['matches'] = [];
        for (const item of this.#state.timeline.filter(
          ({ threadId }) => threadId === thread.id,
        )) {
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

  #setGoal(input: BridgeRequestMap['threads.goal.set']): DesktopSnapshot {
    const thread = this.#requireIdleThread(input.threadId, 'set a goal');
    const now = new Date().toISOString();
    thread.goal = {
      text: input.text.trim(),
      status: 'paused',
      createdAt: thread.goal?.createdAt ?? now,
      updatedAt: now,
    };
    this.#commit();
    return this.snapshot();
  }

  #pauseGoal(threadId: string): DesktopSnapshot {
    const thread = this.#requireThread(threadId);
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'paused';
    thread.goal.updatedAt = new Date().toISOString();
    this.#commit();
    return this.snapshot();
  }

  #resumeGoal(threadId: string): DesktopSnapshot {
    const thread = this.#requireIdleThread(threadId, 'resume this goal');
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'running';
    thread.goal.updatedAt = new Date().toISOString();
    const result = this.#sendTurn(
      {
        threadId,
        text: `Continue working toward this long-running goal:\n\n${thread.goal.text}`,
      },
      'goal',
    );
    return result.snapshot;
  }

  #clearGoal(threadId: string): DesktopSnapshot {
    const thread = this.#requireIdleThread(threadId, 'clear this goal');
    delete thread.goal;
    this.#commit();
    return this.snapshot();
  }

  #deleteThread(threadId: string): DesktopSnapshot {
    const thread = this.#requireThread(threadId);
    if (
      this.#runningTurns.has(thread.id) ||
      this.#queuedTurns.some((turn) => turn.threadId === thread.id) ||
      this.#pendingQuestions.has(thread.id) ||
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting'
    ) {
      throw new Error('Stop the active turn before deleting this thread.');
    }
    const agent = this.#requireAgent(thread.agentId);
    agent.threadIds = agent.threadIds.filter((id) => id !== thread.id);
    agent.updatedAt = new Date().toISOString();
    this.#state.threads = this.#state.threads.filter((candidate) => candidate.id !== thread.id);
    this.#state.timeline = this.#state.timeline.filter((item) => item.threadId !== thread.id);
    this.#state.approvals = this.#state.approvals.filter(
      (approval) => approval.threadId !== thread.id,
    );
    this.#state.schedules = this.#state.schedules.filter(
      (schedule) => schedule.threadId !== thread.id,
    );
    this.#state.usageByTurn = Object.fromEntries(
      Object.entries(this.#state.usageByTurn).filter(
        ([, usage]) => usage.threadId !== thread.id,
      ),
    );
    if (this.#state.activeThreadId === thread.id) delete this.#state.activeThreadId;
    this.#commit();
    return this.snapshot();
  }

  #sendTurn(
    input: BridgeRequestMap['threads.send'],
    source: QueuedTurn['source'] = 'manual',
    reviewTarget?: QueuedTurn['reviewTarget'],
    scheduleRunId?: string,
  ): BridgeResultMap['threads.send'] {
    this.#requireSignedInReleaseAccount();
    if (this.#state.capture.status === 'blocked') {
      throw new Error(
        this.#state.capture.blockedReason ??
          'Raw research capture could not be stored. Free disk space or sign out before starting another task.',
      );
    }
    if (
      this.#researchRequiredForCurrentAccount() &&
      (this.#state.capture.consentVersion !== RESEARCH_CONSENT_VERSION ||
        !this.#researchCaptureActive())
    ) {
      throw new Error(
        'Review and accept the current raw research consent, or sign out, before starting a task.',
      );
    }
    const thread = this.#requireThread(input.threadId);
    if (thread.archivedAt) throw new Error('Unarchive this thread before sending a message.');
    const attachmentGrants = (input.attachmentIds ?? []).map((id) => {
      const grant = this.#attachmentGrants.get(id);
      if (!grant || grant.threadId !== thread.id || grant.expiresAt <= Date.now()) {
        throw new Error('An attachment expired. Choose it again before sending.');
      }
      return grant;
    });
    const messageText =
      input.text.trim() ||
      `Review the attached ${attachmentGrants.length === 1 ? 'file' : 'files'}.`;
    const pendingQuestion = this.#pendingQuestions.get(thread.id);
    if (pendingQuestion) {
      if (attachmentGrants.length) {
        throw new Error('Answer the pending question with text before attaching files.');
      }
      this.#pendingQuestions.delete(thread.id);
      const questionItem = this.#state.timeline.findLast(
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
      this.#appendTimeline(thread.id, {
        id: eventId,
        turnId: pendingQuestion.turnId,
        kind: 'user',
        text: messageText,
        status: 'complete',
        timestamp,
      });
      this.#stageResearchText({
        turnId: pendingQuestion.turnId,
        eventId,
        occurredAt: timestamp,
        role: 'user',
        text: messageText,
        provider: thread.provider,
      });
      thread.status = 'running';
      void this.#runtime
        ?.respondToRequest(thread.id, {
          requestId: pendingQuestion.requestId,
          text: messageText,
        })
        .catch((error: unknown) => {
          thread.status = 'failed';
          this.#appendTimeline(thread.id, {
            id: randomUUID(),
            turnId: pendingQuestion.turnId,
            kind: 'error',
            title: 'Answer could not be delivered',
            text: error instanceof Error ? error.message : 'The provider session ended.',
            status: 'failed',
            timestamp: new Date().toISOString(),
          });
          this.#commit();
        });
      this.#commit();
      return { turnId: pendingQuestion.turnId, snapshot: this.snapshot() };
    }
    // Provider state can change after an agent or immutable thread was created.
    // Revalidate every new turn instead of trusting persisted configuration.
    this.#requireReadyProvider(thread.provider, thread.model);
    if (
      this.#runningTurns.has(thread.id) ||
      this.#queuedTurns.some(({ threadId }) => threadId === thread.id)
    ) {
      throw new Error('This thread already has an active turn.');
    }
    delete thread.draft;
    const turnId = randomUUID();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    this.#appendTimeline(thread.id, {
      id: eventId,
      turnId,
      kind: 'user',
      text: messageText,
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ view }) => structuredClone(view)) }
        : {}),
      status: 'complete',
      timestamp,
      ...(scheduleRunId ? { scheduleRunId } : {}),
    });
    this.#stageResearchText({
      turnId,
      eventId,
      occurredAt: timestamp,
      role: 'user',
      text: messageText,
      provider: thread.provider,
    });
    if (thread.title === 'New thread') {
      thread.title = summarizeTitle(
        input.text || attachmentGrants[0]?.view.name || 'Attached files',
      );
    }
    const queued: QueuedTurn = {
      id: turnId,
      threadId: thread.id,
      text: messageText,
      source,
      ...(reviewTarget ? { reviewTarget } : {}),
      ...(scheduleRunId ? { scheduleRunId } : {}),
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ attachment }) => attachment) }
        : {}),
    };
    // Keep short-lived grants available for local preview/open after send. They still expire
    // after one hour and are never persisted, so a relaunch cannot revive file access.
    if (this.#runningTurns.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      this.#queuedTurns.push(queued);
    } else if (this.#workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      this.#queuedTurns.push(queued);
    } else {
      this.#startTurn(queued);
    }
    thread.updatedAt = new Date().toISOString();
    this.#commit();
    return { turnId, snapshot: this.snapshot() };
  }

  #retryTurn(threadId: string): BridgeResultMap['threads.retry'] {
    this.#requireSignedInReleaseAccount();
    const thread = this.#requireThread(threadId);
    if (thread.status !== 'failed') throw new Error('Only a failed turn can be retried.');
    this.#requireReadyProvider(thread.provider, thread.model);
    if (
      this.#runningTurns.has(thread.id) ||
      this.#queuedTurns.some((turn) => turn.threadId === thread.id)
    ) {
      throw new Error('This thread already has an active turn.');
    }
    const failed = this.#state.timeline.findLast(
      (item) => item.threadId === thread.id && item.kind === 'error' && Boolean(item.turnId),
    );
    const userMessage = failed?.turnId
      ? this.#state.timeline.find(
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

    this.#stageResearchText({
      turnId: failed.turnId,
      eventId: userMessage.id,
      occurredAt: userMessage.timestamp,
      role: 'user',
      text: userMessage.text,
      provider: thread.provider,
    });
    const failedAttachments = this.#failedTurnAttachments.get(failed.turnId);
    const retry: QueuedTurn = {
      id: failed.turnId,
      threadId: thread.id,
      text: userMessage.text,
      source: 'manual',
      fakeDelayMs: 160,
      ...(failedAttachments?.length ? { attachments: failedAttachments } : {}),
    };
    if (this.#runningTurns.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      this.#queuedTurns.push(retry);
    } else if (this.#workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      this.#queuedTurns.push(retry);
    } else {
      this.#startTurn(retry);
    }
    thread.updatedAt = new Date().toISOString();
    this.#commit();
    return { turnId: failed.turnId, snapshot: this.snapshot() };
  }

  async #cancelTurn(threadId: string): Promise<DesktopSnapshot> {
    const thread = this.#requireThread(threadId);
    const running = this.#runningTurns.get(threadId);
    const activeTurnId = running ? this.#workspaceLeases.get(thread.workspace) : undefined;
    if (running) {
      running.abort();
      if (activeTurnId) {
        this.#revokeApprovalsForTurn(threadId, activeTurnId);
        await this.#runtime?.cancel(threadId, activeTurnId).catch(() => undefined);
      }
    }
    const queuedTurnIds = this.#queuedTurns
      .filter((turn) => turn.threadId === threadId)
      .map((turn) => turn.id);
    this.#queuedTurns = this.#queuedTurns.filter((turn) => turn.threadId !== threadId);
    if (activeTurnId) this.#discardResearchTurn(activeTurnId);
    for (const turnId of queuedTurnIds) this.#discardResearchTurn(turnId);
    const question = this.#pendingQuestions.get(threadId);
    this.#pendingQuestions.delete(threadId);
    if (question) {
      void this.#runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    }
    thread.status = 'idle';
    delete thread.queueReason;
    this.#appendTimeline(threadId, {
      id: randomUUID(),
      kind: 'notice',
      title: 'Task cancelled',
      text: 'Completed work remains in this thread.',
      status: 'complete',
      timestamp: new Date().toISOString(),
    });
    this.#commit();
    return this.snapshot();
  }

  async #pickAttachments(threadId: string): Promise<BridgeResultMap['attachments.pick']> {
    if (!this.#chooseFiles) throw new Error('File attachments are unavailable in this build.');
    const selected = await this.#chooseFiles();
    return await this.#grantAttachments(threadId, selected);
  }

  async #grantAttachments(
    threadId: string,
    selected: readonly string[],
  ): Promise<BridgeResultMap['attachments.pick']> {
    const thread = this.#requireIdleThread(threadId, 'attach files');
    if (selected.length > 20) throw new Error('Choose at most 20 files at a time.');
    const grants: AttachmentView[] = [];
    let totalBytes = 0;
    for (const path of selected) {
      if (!isAbsolute(path)) throw new Error('The native picker returned an invalid file.');
      const info = await stat(path);
      if (!info.isFile()) throw new Error('Attachments must be regular files.');
      if (info.size > 25 * 1024 * 1024) {
        throw new Error(`${basename(path)} is larger than the 25 MB attachment limit.`);
      }
      totalBytes += info.size;
      if (totalBytes > 100 * 1024 * 1024) {
        throw new Error('The selected attachments exceed the 100 MB combined limit.');
      }
      const kind = attachmentKind(path);
      const id = randomUUID();
      const view: AttachmentView = { id, name: basename(path), kind, bytes: info.size };
      this.#attachmentGrants.set(id, {
        threadId: thread.id,
        attachment: { kind, path: normalize(path), name: view.name },
        view,
        expiresAt: Date.now() + 60 * 60_000,
      });
      grants.push(view);
    }
    this.#pruneAttachmentGrants();
    return { attachments: grants };
  }

  async #previewAttachment(
    input: BridgeRequestMap['attachments.preview'],
  ): Promise<BridgeResultMap['attachments.preview']> {
    const grant = this.#requireAttachmentGrant(input.threadId, input.attachmentId);
    const path = grant.attachment.path;
    const extension = extname(path).toLocaleLowerCase();
    if (extension === '.pdf') return { kind: 'pdf' };
    const mimeType = previewImageMimeType(path);
    const info = await stat(path);
    const textPreview = textAttachmentPreview(extension);
    if (textPreview) {
      if (info.size > 512 * 1024) {
        return {
          kind: 'unavailable',
          detail: 'Open this file to view it. Text previews are limited to 512 KB.',
        };
      }
      const content = await readFile(path, 'utf8');
      if (content.includes('\u0000')) {
        return { kind: 'unavailable', detail: 'This file does not contain previewable text.' };
      }
      return { kind: 'text', content, ...textPreview };
    }
    if (!mimeType) {
      return {
        kind: 'unavailable',
        detail: 'Preview is available for images, PDF metadata, and common text files.',
      };
    }
    if (info.size > 8 * 1024 * 1024) {
      return { kind: 'unavailable', detail: 'Open this image to view the full-size file.' };
    }
    const bytes = await readFile(path);
    return { kind: 'image', dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
  }

  async #openAttachment(
    input: BridgeRequestMap['attachments.open'],
  ): Promise<BridgeResultMap['attachments.open']> {
    if (!this.#openPath) throw new Error('Opening local files is unavailable in this build.');
    const grant = this.#requireAttachmentGrant(input.threadId, input.attachmentId);
    await this.#openPath(grant.attachment.path);
    return { opened: true };
  }

  async #revealAttachment(
    input: BridgeRequestMap['attachments.reveal'],
  ): Promise<BridgeResultMap['attachments.reveal']> {
    if (!this.#revealDirectory) throw new Error('Finder reveal is unavailable in this build.');
    const grant = this.#requireAttachmentGrant(input.threadId, input.attachmentId);
    await this.#revealDirectory(grant.attachment.path);
    return { revealed: true };
  }

  #requireAttachmentGrant(threadId: string, attachmentId: string): AttachmentGrant {
    this.#requireThread(threadId);
    this.#pruneAttachmentGrants();
    const grant = this.#attachmentGrants.get(attachmentId);
    if (!grant || grant.threadId !== threadId) {
      throw new Error('This local file grant expired. Attach the file again to reopen it.');
    }
    return grant;
  }

  async #readChanges(threadId: string): Promise<WorkspaceDiffView> {
    const thread = this.#requireThread(threadId);
    return await this.#requireWorkspaceOperations().readDiff(thread.workspace);
  }

  async #stageChanges(input: BridgeRequestMap['changes.stage']): Promise<WorkspaceDiffView> {
    const thread = this.#requireIdleThread(input.threadId, 'stage changes');
    return await this.#requireWorkspaceOperations().stage(thread.workspace, input.paths);
  }

  async #restoreChanges(
    input: BridgeRequestMap['changes.restore'],
  ): Promise<WorkspaceDiffView> {
    if (input.confirmation !== 'RESTORE') throw new Error('Restore confirmation is required.');
    const thread = this.#requireIdleThread(input.threadId, 'restore changes');
    return await this.#requireWorkspaceOperations().restore(thread.workspace, input.paths);
  }

  async #listWorkspaceSnapshots(
    threadId: string,
  ): Promise<BridgeResultMap['changes.snapshots.list']> {
    const thread = this.#requireThread(threadId);
    const operations = this.#requireWorkspaceOperations();
    if (!operations.listSnapshots) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.listSnapshots(thread.workspace) };
  }

  async #createWorkspaceSnapshot(
    threadId: string,
  ): Promise<BridgeResultMap['changes.snapshots.create']> {
    const thread = this.#requireIdleThread(threadId, 'create a workspace snapshot');
    const operations = this.#requireWorkspaceOperations();
    if (!operations.createSnapshot) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.createSnapshot(thread.workspace) };
  }

  async #restoreWorkspaceSnapshot(
    input: BridgeRequestMap['changes.snapshots.restore'],
  ): Promise<BridgeResultMap['changes.snapshots.restore']> {
    const thread = this.#requireIdleThread(input.threadId, 'restore a workspace snapshot');
    const operations = this.#requireWorkspaceOperations();
    if (!operations.restoreSnapshot || !operations.listSnapshots) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    const diff = await operations.restoreSnapshot(thread.workspace, input.snapshotId);
    return { snapshots: await operations.listSnapshots(thread.workspace), diff };
  }

  async #deleteWorkspaceSnapshot(
    input: BridgeRequestMap['changes.snapshots.delete'],
  ): Promise<BridgeResultMap['changes.snapshots.delete']> {
    if (input.confirmation !== 'DELETE SNAPSHOT') {
      throw new Error('Snapshot deletion confirmation is required.');
    }
    const thread = this.#requireIdleThread(input.threadId, 'delete a workspace snapshot');
    const operations = this.#requireWorkspaceOperations();
    if (!operations.deleteSnapshot) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.deleteSnapshot(thread.workspace, input.snapshotId) };
  }

  async #runTerminal(input: BridgeRequestMap['terminal.run']): Promise<TerminalResultView> {
    const thread = this.#requireIdleThread(input.threadId, 'run a terminal command');
    return await this.#requireWorkspaceOperations().runTerminal(
      thread.workspace,
      input.command.trim(),
    );
  }

  async #startBackgroundTerminal(
    input: BridgeRequestMap['terminal.start'],
  ): Promise<BackgroundTerminalView> {
    const thread = this.#requireIdleThread(input.threadId, 'start a background process');
    const service = this.#requireWorkspaceOperations();
    if (!service.startBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return await service.startBackgroundTerminal(thread.workspace, input.command.trim());
  }

  async #listBackgroundTerminals(threadId: string): Promise<BridgeResultMap['terminal.list']> {
    const thread = this.#requireThread(threadId);
    const service = this.#requireWorkspaceOperations();
    if (!service.listBackgroundTerminals) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return { sessions: await service.listBackgroundTerminals(thread.workspace) };
  }

  async #writeBackgroundTerminal(
    input: BridgeRequestMap['terminal.write'],
  ): Promise<BackgroundTerminalView> {
    const thread = this.#requireThread(input.threadId);
    const service = this.#requireWorkspaceOperations();
    if (!service.writeBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return await service.writeBackgroundTerminal(
      thread.workspace,
      input.terminalId,
      input.input,
    );
  }

  async #stopBackgroundTerminal(
    input: BridgeRequestMap['terminal.stop'],
  ): Promise<BackgroundTerminalView> {
    const thread = this.#requireThread(input.threadId);
    const service = this.#requireWorkspaceOperations();
    if (!service.stopBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return await service.stopBackgroundTerminal(thread.workspace, input.terminalId);
  }

  #startReview(input: BridgeRequestMap['reviews.start']): BridgeResultMap['reviews.start'] {
    const thread = this.#requireIdleThread(input.threadId, 'start a code review');
    if (thread.provider !== 'codex') {
      throw new Error('Dedicated code review currently requires the Codex provider.');
    }
    const text =
      input.target.type === 'uncommitted_changes'
        ? 'Review uncommitted changes'
        : input.target.type === 'base_branch'
          ? `Review changes against ${input.target.branch}`
          : `Review: ${input.target.instructions}`;
    return this.#sendTurn({ threadId: thread.id, text }, 'review', input.target);
  }

  #createSchedule(input: BridgeRequestMap['schedules.create']): DesktopSnapshot {
    this.#insertSchedule(input);
    return this.snapshot();
  }

  #insertSchedule(input: BridgeRequestMap['schedules.create']): ScheduleView {
    if (!this.#schedulesAvailable()) {
      throw new Error('Scheduled execution is temporarily disabled by the alpha operator.');
    }
    const thread = this.#requireThread(input.threadId);
    if (thread.archivedAt) throw new Error('Unarchive this thread before scheduling work.');
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error('A scheduled task cannot be empty.');
    const schedule: ScheduleView = {
      id: randomUUID(),
      threadId: thread.id,
      prompt,
      cadence: input.cadence,
      nextRunAt: validScheduleTime(input.nextRunAt),
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0,
      ...(input.maxRuns === undefined ? {} : { maxRuns: validScheduleRunLimit(input.maxRuns) }),
    };
    this.#state.schedules.push(schedule);
    this.#commit();
    void this.#runDueSchedules();
    return schedule;
  }

  #setScheduleEnabled(input: BridgeRequestMap['schedules.setEnabled']): DesktopSnapshot {
    if (input.enabled && !this.#schedulesAvailable()) {
      throw new Error('Scheduled execution is temporarily disabled by the alpha operator.');
    }
    const schedule = this.#requireSchedule(input.scheduleId);
    schedule.enabled = input.enabled;
    this.#commit();
    if (input.enabled) void this.#runDueSchedules();
    return this.snapshot();
  }

  #deleteSchedule(scheduleId: string): DesktopSnapshot {
    this.#requireSchedule(scheduleId);
    this.#state.schedules = this.#state.schedules.filter(({ id }) => id !== scheduleId);
    this.#commit();
    return this.snapshot();
  }

  #runScheduleNow(scheduleId: string): BridgeResultMap['schedules.runNow'] {
    if (!this.#schedulesAvailable()) {
      throw new Error('Scheduled execution is temporarily disabled by the alpha operator.');
    }
    const schedule = this.#requireSchedule(scheduleId);
    return this.#dispatchSchedule(schedule, new Date());
  }

  async #runDueSchedules(): Promise<void> {
    if (
      this.#scheduleRunInFlight ||
      this.#accountDeletionInProgress ||
      !this.#schedulesAvailable()
    )
      return;
    this.#scheduleRunInFlight = true;
    try {
      const now = new Date();
      const due = this.#state.schedules.filter(
        (schedule) =>
          Boolean(schedule.activeRun) ||
          (schedule.enabled && Date.parse(schedule.nextRunAt) <= now.getTime()),
      );
      for (const schedule of due) {
        const thread = this.#state.threads.find(({ id }) => id === schedule.threadId);
        if (!thread || thread.archivedAt) {
          schedule.enabled = false;
          continue;
        }
        if (
          thread.status === 'running' ||
          thread.status === 'queued' ||
          thread.status === 'waiting'
        ) {
          continue;
        }
        try {
          this.#dispatchSchedule(schedule, now);
        } catch (error) {
          delete schedule.activeRun;
          schedule.enabled = false;
          this.#appendTimeline(thread.id, {
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
      if (due.length) this.#commit();
    } finally {
      this.#scheduleRunInFlight = false;
    }
  }

  #advanceSchedule(schedule: ScheduleView, now: Date): void {
    if (schedule.cadence === 'once') {
      schedule.enabled = false;
      return;
    }
    const interval = scheduleIntervalMs(schedule.cadence);
    let next = Date.parse(schedule.nextRunAt);
    do next += interval;
    while (next <= now.getTime());
    schedule.nextRunAt = new Date(next).toISOString();
  }

  #dispatchSchedule(schedule: ScheduleView, now: Date): BridgeResultMap['schedules.runNow'] {
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
      this.#commit();
    }
    const dispatched = this.#state.timeline.find(
      (item) => item.scheduleRunId === claim.id && item.kind === 'user' && item.turnId,
    );
    const result = dispatched?.turnId
      ? { turnId: dispatched.turnId, snapshot: this.snapshot() }
      : this.#sendTurn(
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
    this.#advanceSchedule(schedule, now);
    if (schedule.maxRuns !== undefined && schedule.runCount >= schedule.maxRuns) {
      schedule.enabled = false;
    }
    delete schedule.activeRun;
    this.#commit();
    return result;
  }

  #resolveApproval(input: BridgeRequestMap['approvals.resolve']): DesktopSnapshot {
    const pending = this.#pendingApprovals.get(input.approvalId);
    if (!pending) throw new Error('This approval expired or was already resolved.');
    if (this.#activeTurnId(pending.threadId) !== pending.turnId) {
      this.#revokeApproval(input.approvalId, pending);
      this.#commit();
      throw new Error('This approval belongs to a turn that is no longer active.');
    }
    clearTimeout(pending.timeout);
    this.#pendingApprovals.delete(input.approvalId);
    this.#setApprovalStatus(
      input.approvalId,
      input.decision === 'approve' ? 'approved' : 'denied',
    );
    this.#stageApprovalDecision(
      input.approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      input.decision === 'approve' ? 'approved' : 'denied',
    );
    if (pending.kind === 'provider' && pending.threadId && pending.requestId) {
      void this.#runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: input.decision === 'approve' ? 'allow_once' : 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve(input.decision === 'approve' ? 'allow' : 'deny');
    return this.snapshot();
  }

  async #probeProviders(providerId?: ProviderId): Promise<DesktopSnapshot> {
    if (providerId === 'meta' && this.#identity.status().state === 'signed_in') {
      await this.#identity.refreshSession?.();
      await this.#refreshCloudSession();
    }
    const updated = await this.#providerProbe(providerId);
    if (providerId) {
      const value = updated[0];
      if (value) {
        const index = this.#providers.findIndex(({ id }) => id === providerId);
        if (index >= 0) this.#providers[index] = value;
        else this.#providers.push(value);
      }
    } else this.#providers = updated;
    await this.#refreshMetaProviderState();
    await this.#refreshProviderModels(providerId);
    this.#emit();
    return this.snapshot();
  }

  async #refreshProviderModels(providerId?: ProviderId): Promise<void> {
    if (this.#fakeServices || !this.#runtime || (providerId && providerId !== 'codex')) return;
    const codex = this.#providers.find(({ id }) => id === 'codex');
    if (!codex || codex.status !== 'ready') return;
    try {
      const models = await this.#runtime.listModels('codex');
      if (models.length) {
        codex.models = models.map((model) => ({
          ...model,
          reasoningEfforts: [...model.reasoningEfforts],
        }));
      }
    } catch {
      // The provider probe remains authoritative. Catalog failure leaves the
      // verified release model available instead of making Codex unusable.
    }
  }

  async #providerLogin(providerId: ProviderId): Promise<BridgeResultMap['providers.login']> {
    const provider = this.#providers.find(({ id }) => id === providerId);
    if (!provider) throw new Error('Provider status is unavailable. Check again first.');
    if (provider.status === 'disabled') {
      throw new Error(
        provider.restriction ?? 'This provider is disabled in the current release.',
      );
    }
    if (providerId === 'meta') {
      if (provider.status === 'unavailable') {
        throw new Error('Included models require a configured Sia cloud deployment.');
      }
      if (provider.status === 'needs_login') {
        throw new Error('Sign in to Sia to use included lab models.');
      }
      throw new Error('Lab model access is already included with your Sia account.');
    }
    const installation =
      provider.status === 'needs_install' || provider.status === 'incompatible';
    if (providerId === 'codex' && !installation) {
      if (!this.#runtime) {
        if (!this.#fakeServices) {
          throw new Error(
            'Codex sign-in is temporarily unavailable. Restart Sia and try again.',
          );
        }
        await this.#openExternal('https://developers.openai.com/codex/auth/');
        return { opened: true, snapshot: this.snapshot() };
      }
      const login = await this.#runtime.startCodexChatGptLogin();
      try {
        await this.#openExternal(login.authUrl);
        await this.#runtime.waitForCodexChatGptLogin(login.loginId);
      } catch (error) {
        await this.#runtime.cancelCodexChatGptLogin(login.loginId).catch(() => undefined);
        throw error;
      }
      const snapshot = await this.#probeProviders('codex');
      const connected = snapshot.providers.find(({ id }) => id === 'codex');
      if (connected?.status !== 'ready') {
        throw new Error(
          'ChatGPT sign-in finished, but Codex could not verify the connected plan.',
        );
      }
      return { opened: true, snapshot };
    }
    const urls: Partial<Record<ProviderId, string>> = {
      codex: installation
        ? 'https://developers.openai.com/codex/cli/'
        : 'https://developers.openai.com/codex/auth/',
      claude: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
    };
    const url = urls[providerId];
    if (!url) throw new Error('This provider has no supported sign-in flow in the alpha.');
    await this.#openExternal(url);
    return { opened: true, snapshot: this.snapshot() };
  }

  async #refreshCapabilityStatuses(): Promise<void> {
    if (!this.#capabilitySetup) return;
    this.#messagesAccess = this.#capabilitySetup.messagesStatus();
    this.#chromeConnection = await this.#capabilitySetup.chromeDebugStatus();
  }

  /** One click grants everything grantable and opens the panes for the user-only rest. */
  async #unlockComputerCapabilities(): Promise<DesktopSnapshot> {
    this.#computerState = await this.#computer.requestPermissions();
    const setup = this.#capabilitySetup;
    if (setup) {
      await setup.enableChromeDebug().catch(() => undefined);
      await setup.prewarmMessagesAutomation().catch(() => undefined);
      if (setup.messagesStatus() === 'needs_full_disk_access') {
        await setup.openFullDiskAccess().catch(() => undefined);
      }
      await this.#refreshCapabilityStatuses();
    }
    this.#trajectory?.record({
      type: 'capability_unlock',
      threadId: 'app',
      accessibility: this.#computerState.accessibility,
      screenRecording: this.#computerState.screenRecording,
      messagesAccess: this.#messagesAccess,
      chromeConnection: this.#chromeConnection,
    });
    this.#emit();
    return this.snapshot();
  }

  async #refreshComputer(request: boolean): Promise<DesktopSnapshot> {
    this.#computerState = request
      ? await this.#computer.requestPermissions()
      : await this.#computer.permissions();
    this.#emit();
    return this.snapshot();
  }

  async #openMessagesApp(): Promise<DesktopSnapshot> {
    if (!this.#openMessages) throw new Error('Messages is unavailable on this Mac.');
    await this.#openMessages();
    return this.snapshot();
  }

  async #attachBrowser(
    input: BridgeRequestMap['browser.attach'],
    options: { auto?: boolean } = {},
  ): Promise<DesktopSnapshot> {
    this.#browserTarget = undefined;
    this.#browserSessionId = undefined;
    this.#browserCapabilitySink?.resetBrowserCapabilities();
    let availableWindows = this.#state.browser.availableWindows ?? [];
    this.#state.browser = {
      status: 'attaching',
      grantedOrigins: [],
      ...(availableWindows.length ? { availableWindows } : {}),
    };
    this.#commit();
    try {
      const directContext = { kind: 'direct_user', operation: 'browser_attach' } as const;
      const apps = await this.#computer.call('list_apps', {}, directContext);
      const candidates = findChromeCandidates(apps);
      if (!candidates.length) throw new Error('Open Chrome, then try attaching again.');
      // Several Chrome processes can coexist (a leftover instance, a helper). Only the one that
      // owns the remote-debugging port can attach, so its windows are tried first and are the
      // only ones offered the silent cdp_port route.
      const debugOwnerPid = await this.#chromeDebugOwnerPid();
      const orderedCandidates = [...candidates].sort((left, right) => {
        const leftOwns = left.pid === debugOwnerPid ? 0 : 1;
        const rightOwns = right.pid === debugOwnerPid ? 0 : 1;
        return leftOwns - rightOwns;
      });
      const windowPairs: { pid: number; window: BrowserWindowView }[] = [];
      for (const candidate of orderedCandidates.slice(0, 3)) {
        const windows = await this.#computer.call(
          'list_windows',
          { pid: candidate.pid },
          directContext,
        );
        for (const window of preferredChromeWindows(windows)) {
          windowPairs.push({ pid: candidate.pid, window });
        }
      }
      windowPairs.forEach((pair, index) => {
        pair.window = { ...pair.window, label: `Chrome window ${index + 1}` };
      });
      availableWindows = windowPairs.map(({ window }) => window);
      if (!windowPairs.length) {
        throw new Error(
          'No visible Chrome window was found. Bring a Chrome window onto this Space (not minimized), then try again.',
        );
      }
      const explicitPair =
        input.windowId === undefined
          ? windowPairs.length === 1
            ? windowPairs[0]
            : undefined
          : windowPairs.find(({ window }) => window.id === input.windowId);
      // In trusted auto mode any candidate will do; a window the driver cannot
      // disambiguate is skipped in favour of the next one.
      const pairsToTry = explicitPair
        ? [explicitPair]
        : options.auto
          ? windowPairs.slice(0, 3)
          : [];
      if (!pairsToTry.length) {
        this.#state.browser = {
          status: input.windowId === undefined ? 'detached' : 'error',
          grantedOrigins: [],
          availableWindows,
          detail:
            input.windowId === undefined
              ? 'Choose the signed-in Chrome window you want Sia to use.'
              : 'That Chrome window changed or closed. Choose one of the current windows.',
        };
        this.#commit();
        return this.snapshot();
      }
      let lastFailure: unknown;
      let attachedWindow: BrowserWindowView | undefined;
      candidates: for (const { pid: chromePid, window: candidate } of pairsToTry) {
        // The silent cdp_port route only works against the process that owns the debugging
        // port; offering it to another process's window just fails, so it is scoped here.
        const attempts =
          debugOwnerPid === undefined || chromePid === debugOwnerPid
            ? [{ cdp_port: 9222 }, {}]
            : [{}];
        for (const prepareArguments of attempts) {
          try {
            // CUA sessions are terminal after end_session. Minting a new opaque id for
            // every attachment lets a user detach and reattach without restarting Sia,
            // while resetBrowserCapabilities still revokes every prior model-visible ref.
            const browserSessionId = `sia-browser-${randomUUID()}`;
            const prepared = await this.#computer.call(
              'browser_prepare',
              {
                pid: chromePid,
                window_id: candidate.id,
                session: browserSessionId,
                strategy: { kind: 'existing_profile' },
                ...prepareArguments,
              },
              directContext,
            );
            const state = await this.#computer.call(
              'get_browser_state',
              {
                session: browserSessionId,
                pid: chromePid,
                window_id: candidate.id,
              },
              directContext,
            );
            // browser_prepare can include transitional target ids while Chrome enables
            // and reconnects its existing-profile route. Only the follow-up live state
            // is safe to mint into model-visible browser capabilities.
            this.#browserCapabilitySink?.acceptBrowserState(state, browserSessionId);
            this.#browserTarget = findBrowserTarget([state, prepared]);
            this.#browserSessionId = browserSessionId;
            const grantedOrigins = collectHttpOrigins([prepared, state]);
            this.#state.browser = {
              status: 'attached',
              browser: 'Chrome',
              profileLabel: candidate.label,
              grantedOrigins,
              ...(grantedOrigins.length === 0
                ? { detail: 'Attached, but no HTTP or HTTPS tab is currently granted.' }
                : {}),
            };
            this.#trajectory?.record({
              type: 'browser_attached',
              threadId: this.#state.activeThreadId ?? 'app',
              window: candidate.label,
              automatic: Boolean(options.auto),
              grantedOrigins,
            });
            attachedWindow = candidate;
            break candidates;
          } catch (candidateError) {
            lastFailure = candidateError;
          }
        }
      }
      if (!attachedWindow)
        throw lastFailure ?? new Error('No Chrome window could be attached.');
    } catch (error) {
      this.#browserTarget = undefined;
      this.#browserSessionId = undefined;
      const detail = browserAttachmentError(error);
      this.#state.browser = {
        status: 'error',
        grantedOrigins: [],
        ...(availableWindows.length ? { availableWindows } : {}),
        detail,
      };
    }
    this.#commit();
    return this.snapshot();
  }

  async #openBrowserUrl(urlValue: string): Promise<DesktopSnapshot> {
    if (
      this.#state.browser.status !== 'attached' ||
      !this.#browserTarget ||
      !this.#browserSessionId
    ) {
      throw new Error('Attach a Chrome window before opening a site.');
    }
    const url = directBrowserUrl(urlValue);
    const context = { kind: 'direct_user', operation: 'browser_navigate' } as const;
    const target = this.#browserTarget;
    const browserSessionId = this.#browserSessionId;
    await this.#computer.call(
      'browser_navigate',
      {
        session: browserSessionId,
        target_id: target.targetId,
        tab_id: target.tabId,
        url: url.toString(),
      },
      context,
    );
    const state = await this.#computer.call(
      'get_browser_state',
      {
        session: browserSessionId,
        target_id: target.targetId,
        tab_id: target.tabId,
      },
      context,
    );
    this.#browserCapabilitySink?.acceptBrowserState(state, browserSessionId);
    this.#browserTarget = findBrowserTarget(state) ?? target;
    const grantedOrigins = collectHttpOrigins(state);
    if (!grantedOrigins.length) {
      throw new Error('Chrome opened the site, but did not return a usable web tab.');
    }
    this.#state.browser = {
      status: 'attached',
      browser: this.#state.browser.browser ?? 'Chrome',
      ...(this.#state.browser.profileLabel
        ? { profileLabel: this.#state.browser.profileLabel }
        : {}),
      grantedOrigins,
    };
    this.#commit();
    return this.snapshot();
  }

  async #detachBrowser(): Promise<DesktopSnapshot> {
    try {
      if (this.#browserSessionId) {
        await this.#computer.call(
          'end_session',
          { session: this.#browserSessionId },
          { kind: 'direct_user', operation: 'browser_detach' },
        );
      }
    } catch {
      // A missing or already-ended CUA session is safely detached locally.
    }
    this.#browserCapabilitySink?.resetBrowserCapabilities();
    this.#browserTarget = undefined;
    this.#browserSessionId = undefined;
    this.#state.browser = { status: 'detached', grantedOrigins: [] };
    this.#commit();
    return this.snapshot();
  }

  async #configureVoice(): Promise<DesktopSnapshot> {
    await this.#requireVoice().configure();
    this.#emit();
    return this.snapshot();
  }

  async #refreshVoice(): Promise<DesktopSnapshot> {
    await this.#requireVoice().refresh();
    this.#emit();
    return this.snapshot();
  }

  async #selectVoice(voiceId: string): Promise<DesktopSnapshot> {
    await this.#requireVoice().select(voiceId);
    this.#emit();
    return this.snapshot();
  }

  #disconnectVoice(): DesktopSnapshot {
    this.#requireVoice().disconnect();
    this.#emit();
    return this.snapshot();
  }

  #requireVoice(): VoiceOperations {
    if (!this.#voice) throw new Error('Voice is unavailable in this build.');
    return this.#voice;
  }

  async #startAllConnections(): Promise<BridgeResultMap['connections.startAll']> {
    await this.#removeLegacyGoogleConnections();
    for (const id of GOOGLE_CONNECTION_IDS) this.#updateConnection(id, { enabled: true });
    return await this.#startConnectionGroup(['gmail', 'slack']);
  }

  async #startGoogleConnections(): Promise<BridgeResultMap['connections.startGoogle']> {
    await this.#removeLegacyGoogleConnections();
    for (const id of GOOGLE_CONNECTION_IDS) this.#updateConnection(id, { enabled: true });
    return await this.#startConnectionGroup(['gmail']);
  }

  async #upgradeGoogleConnections(): Promise<BridgeResultMap['connections.upgradeGoogle']> {
    const google = this.#state.connections.filter(({ id }) => isGoogleConnection(id));
    const grantIds = new Set(google.map(({ connectionId }) => connectionId).filter(Boolean));
    if (
      grantIds.size !== 1 ||
      google.some(({ status, connectionId }) => status !== 'connected' || !connectionId)
    ) {
      throw new Error('Connect Google read-only before enabling editing and sending.');
    }
    if (google.every(({ googleAccess }) => googleAccess === 'read_write')) {
      return { opened: false, snapshot: this.snapshot() };
    }
    if (google.some(({ upgradeConnectionId }) => Boolean(upgradeConnectionId))) {
      return { opened: false, snapshot: this.snapshot() };
    }
    const owner = this.#currentIdentityKey();
    if (!this.#fakeServices && !owner) {
      throw new Error('Sign in to Sia cloud before enabling Google editing.');
    }
    if (this.#fakeServices) {
      for (const id of GOOGLE_CONNECTION_IDS) {
        this.#updateConnection(id, { googleAccess: 'read_write' });
      }
      this.#commit();
      return { opened: false, snapshot: this.snapshot() };
    }

    const started = await this.#cloud.startConnection('gmail', 'read_write');
    const linkExpiry = Date.parse(started.expiresAt);
    if (Number.isFinite(linkExpiry)) {
      this.#connectorLinkExpiries.set(started.connectionId, linkExpiry);
    }
    for (const id of GOOGLE_CONNECTION_IDS) {
      this.#updateConnection(id, { upgradeConnectionId: started.connectionId });
    }
    this.#commit();
    const url = new URL(started.redirectUrl);
    if (url.protocol !== 'https:') throw new Error('Connector authorization must use HTTPS.');
    await this.#openExternal(url.toString());
    this.#recordLifecycleEvent('connector.google_access.upgrade_started', {
      app: 'gmail',
      connectionId: started.connectionId,
    });
    void this.#pollGoogleUpgrade(started.connectionId);
    return { opened: true, snapshot: this.snapshot() };
  }

  async #startSelectedConnections(
    connectionIds: BridgeRequestMap['connections.startSelected']['connectionIds'],
  ): Promise<BridgeResultMap['connections.startSelected']> {
    const selected = new Set(connectionIds);
    const ordered: ConnectionView['id'][] = [];
    const selectedGoogle = GOOGLE_CONNECTION_IDS.filter((id) => selected.has(id));
    if (selectedGoogle.length > 0) {
      await this.#removeLegacyGoogleConnections();
      const googleAlreadyConnected = this.#state.connections.some(
        ({ id, status, connectionId }) =>
          isGoogleConnection(id) && status === 'connected' && Boolean(connectionId),
      );
      for (const id of GOOGLE_CONNECTION_IDS) {
        if (selected.has(id) || !googleAlreadyConnected) {
          this.#updateConnection(id, { enabled: selected.has(id) });
        }
      }
      ordered.push(selectedGoogle[0]!);
    }
    if (selected.has('slack')) ordered.push('slack');
    this.#commit();
    return await this.#startConnectionGroup(ordered);
  }

  #setConnectionEnabled(request: BridgeRequestMap['connections.setEnabled']): DesktopSnapshot {
    const { connectionId, enabled } = request;
    if (!isGoogleConnection(connectionId)) {
      throw new Error('Slack access is managed by connecting or disconnecting its workspace.');
    }
    const connection = this.#state.connections.find(({ id }) => id === connectionId);
    if (!connection?.connectionId || connection.status !== 'connected') {
      throw new Error('Connect Google Workspace before changing its service access.');
    }
    const owner = this.#state.connectionOwners[connectionId];
    if (!this.#fakeServices && owner !== this.#currentIdentityKey()) {
      throw new Error('Sign in with the account that created this grant before changing it.');
    }
    this.#connectorGenerations.set(
      connectionId,
      (this.#connectorGenerations.get(connectionId) ?? 0) + 1,
    );
    this.#updateConnection(connectionId, { enabled });
    this.#commit();
    this.#recordLifecycleEvent(
      enabled ? 'connector.service.enabled' : 'connector.service.disabled',
      { app: connectionId, connectionId: connection.connectionId },
    );
    return this.snapshot();
  }

  async #removeLegacyGoogleConnections(): Promise<void> {
    const google = this.#state.connections.filter(({ id }) => isGoogleConnection(id));
    const grants = new Set(google.map(({ connectionId }) => connectionId).filter(Boolean));
    const unified =
      grants.size === 1 &&
      google.every(
        ({ status, connectionId }) => status === 'connected' && Boolean(connectionId),
      );
    if (unified || grants.size === 0) return;
    const revoked = new Set<string>();
    for (const connection of google) {
      if (!connection.connectionId || revoked.has(connection.connectionId)) continue;
      revoked.add(connection.connectionId);
      await this.#disconnectConnection({
        connectionId: connection.id,
        expectedConnectionId: connection.connectionId,
      });
    }
  }

  async #startConnectionGroup(
    included: readonly ConnectionView['id'][],
  ): Promise<BridgeResultMap['connections.startAll']> {
    if (this.#connectionSetup) {
      throw new Error('Work-app setup is already waiting for provider approval.');
    }
    const interrupted = this.#state.connections.find(
      (connection) =>
        included.includes(connection.id) &&
        connection.status === 'error' &&
        connection.connectionId,
    );
    if (interrupted) {
      throw new Error(`Disconnect ${interrupted.label}'s saved grant before continuing setup.`);
    }
    if (
      this.#state.connections.some(
        (connection) => included.includes(connection.id) && connection.status === 'connecting',
      )
    ) {
      throw new Error('Finish the current app approval before continuing setup.');
    }
    const pending = this.#state.connections
      .filter(
        (connection) => included.includes(connection.id) && connection.status !== 'connected',
      )
      .map((connection) => connection.id);
    if (pending.length === 0) return { opened: false, snapshot: this.snapshot() };
    this.#recordLifecycleEvent('connector.guided_setup.started', { apps: pending });

    if (this.#fakeServices) {
      for (const connectionId of pending) {
        await this.#startConnection(connectionId, { partOfBundle: true });
      }
      this.#recordLifecycleEvent('connector.guided_setup.completed', { apps: pending });
      return { opened: false, snapshot: this.snapshot() };
    }

    const firstId = pending[0]!;
    const started = await this.#startConnection(firstId, {
      poll: false,
      partOfBundle: true,
    });
    const expectedId = this.#state.connections.find(({ id }) => id === firstId)?.connectionId;
    if (!expectedId) throw new Error('The connected-app provider did not return a grant id.');

    const controller = new AbortController();
    const task = this.#continueConnectionSetup(pending, firstId, expectedId, controller.signal);
    this.#connectionSetup = { controller, task };
    const finish = (): void => {
      if (this.#connectionSetup?.task === task) this.#connectionSetup = undefined;
    };
    void task.then(finish, finish);
    return { opened: started.opened, snapshot: this.snapshot() };
  }

  async #continueConnectionSetup(
    ordered: readonly ConnectionView['id'][],
    firstId: ConnectionView['id'],
    firstExpectedId: string,
    signal: AbortSignal,
  ): Promise<void> {
    let index = ordered.indexOf(firstId);
    let expectedId = firstExpectedId;
    while (index >= 0 && index < ordered.length && !signal.aborted) {
      const currentId = ordered[index]!;
      if (!(await this.#pollConnection(currentId, expectedId, signal))) return;
      index += 1;
      const nextId = ordered[index];
      if (!nextId || signal.aborted) {
        if (!signal.aborted && index >= ordered.length) {
          this.#recordLifecycleEvent('connector.guided_setup.completed', {
            apps: ordered,
          });
        }
        return;
      }
      try {
        await this.#startConnection(nextId, {
          poll: false,
          partOfBundle: true,
        });
      } catch {
        return;
      }
      const nextExpectedId = this.#state.connections.find(
        ({ id }) => id === nextId,
      )?.connectionId;
      if (!nextExpectedId) return;
      expectedId = nextExpectedId;
    }
  }

  async #startConnection(
    connectionId: BridgeRequestMap['connections.start']['connectionId'],
    options: { poll?: boolean; partOfBundle?: boolean } = {},
  ): Promise<BridgeResultMap['connections.start']> {
    if (!this.#fakeServices && this.#state.cloudFeatures?.connectors === false) {
      throw new Error('Connected apps are temporarily disabled by the alpha operator.');
    }
    if (this.#connectionSetup && !options.partOfBundle) {
      throw new Error('Finish or cancel the guided work-app setup first.');
    }
    const googleConnection = isGoogleConnection(connectionId);
    let existing = this.#state.connections.find(({ id }) => id === connectionId);
    if (existing?.connectionId) {
      if (existing.status !== 'error') {
        throw new Error('Disconnect the existing or pending grant before connecting again.');
      }
      await this.#disconnectConnection({
        connectionId,
        expectedConnectionId: existing.connectionId,
      });
      existing = this.#state.connections.find(({ id }) => id === connectionId);
    }
    const owner = this.#currentIdentityKey();
    if (!this.#fakeServices && !owner) {
      throw new Error('Sign in to Sia cloud before connecting an app.');
    }
    this.#recordLifecycleEvent('connector.setup.started', {
      app: connectionId,
      guided: Boolean(options.partOfBundle),
    });
    const affected = googleConnection ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.#connectorGenerations.set(id, (this.#connectorGenerations.get(id) ?? 0) + 1);
      this.#updateConnection(id, { status: 'connecting' });
    }
    this.#commit();
    if (this.#fakeServices) {
      const connectedAccount = `demo@${googleConnection ? 'google' : connectionId}.test`;
      const connectedId = `fake-${googleConnection ? 'google' : connectionId}-${randomUUID()}`;
      for (const id of affected) {
        this.#updateConnection(id, {
          status: 'connected',
          account: connectedAccount,
          connectionId: connectedId,
          ...(googleConnection ? { googleAccess: 'read_write' as const } : {}),
        });
      }
      this.#commit();
      this.#recordLifecycleEvent('connector.connected', {
        app: connectionId,
        account: connectedAccount,
        connectionId: connectedId,
      });
      return { opened: false, snapshot: this.snapshot() };
    }
    try {
      const started = await this.#cloud.startConnection(connectionId);
      const linkExpiry = Date.parse(started.expiresAt);
      if (Number.isFinite(linkExpiry)) {
        this.#connectorLinkExpiries.set(started.connectionId, linkExpiry);
      }
      for (const id of affected) {
        this.#state.connectionOwners[id] = owner!;
        this.#updateConnection(id, {
          status: 'connecting',
          connectionId: started.connectionId,
        });
      }
      this.#commit();
      const url = new URL(started.redirectUrl);
      if (url.protocol !== 'https:') throw new Error('Connector authorization must use HTTPS.');
      await this.#openExternal(url.toString());
      this.#recordLifecycleEvent('connector.authorization.opened', {
        app: connectionId,
        connectionId: started.connectionId,
      });
      if (options.poll !== false) void this.#pollConnection(connectionId, started.connectionId);
      return { opened: true, snapshot: this.snapshot() };
    } catch (error) {
      for (const id of affected) {
        this.#updateConnection(id, {
          status: 'error',
          detail: error instanceof Error ? error.message : 'Connection setup failed.',
        });
      }
      this.#commit();
      this.#recordLifecycleEvent('connector.setup.failed', {
        app: connectionId,
        reason: 'Connection setup failed.',
      });
      throw error;
    }
  }

  async #startSignIn(email: string): Promise<DesktopSnapshot> {
    if (this.#cloud.configured) await this.#cloud.registerAccount(email);
    await this.#identity.startEmailSignIn(email);
    this.#emit();
    return this.snapshot();
  }

  async #completeSignIn(code: string): Promise<DesktopSnapshot> {
    const state = this.#identity.status().state;
    if (state === 'password_required') {
      if (!this.#identity.completePasswordSignIn) {
        throw new Error('Administrator password sign-in is unavailable in this build.');
      }
      await this.#identity.completePasswordSignIn(code);
    } else if (state === 'mfa_required') {
      if (!this.#identity.completeMfaSignIn) {
        throw new Error('Authenticator sign-in is unavailable in this build.');
      }
      await this.#identity.completeMfaSignIn(code);
    } else {
      await this.#identity.completeEmailSignIn(code);
    }
    await this.#reconcileIdentityBoundState();
    await this.#refreshCloudSession();
    await this.#refreshMetaProviderState();
    await this.#voice?.refresh().catch(() => undefined);
    this.#scheduleResearchSync();
    this.#commit();
    return this.snapshot();
  }

  async #completeMfaEnrollment(code: string): Promise<DesktopSnapshot> {
    if (!this.#identity.completeMfaEnrollment) {
      throw new Error('Authenticator setup is unavailable in this build.');
    }
    await this.#identity.completeMfaEnrollment(code);
    this.#commit();
    return this.snapshot();
  }

  async #refreshCloudSession(): Promise<void> {
    if (
      this.#fakeServices ||
      !this.#cloud.configured ||
      this.#identity.status().state !== 'signed_in'
    )
      return;
    try {
      const previousToolAvailability = this.#toolAvailabilitySignature();
      const session = await this.#cloud.sessionStatus();
      this.#cloudParticipant = session.participant;
      this.#state.cloudFeatures = structuredClone(session.features);
      if (!session.features.researchUploads) this.#disableResearchForCurrentAccessPolicy();
      if (previousToolAvailability !== this.#toolAvailabilitySignature()) {
        await this.#runtime?.resetSessions();
      }
    } catch {
      // Keep the last signed operator policy while offline. Cloud endpoints enforce the current
      // policy independently, so a stale cache cannot re-enable a server-side capability.
    }
  }

  #schedulesAvailable(): boolean {
    if (this.#releaseAccessLocked()) return false;
    return this.#state.cloudFeatures?.schedules !== false;
  }

  #toolAvailabilitySignature(): string {
    return `${this.actionToolAvailable('mail_search')}:${this.actionToolAvailable('schedule_list')}`;
  }

  async #signOut(): Promise<DesktopSnapshot> {
    this.#signOutInProgress = true;
    this.#emit();
    try {
      this.#connectionSetup?.controller.abort();
      await this.#stopAllWorkForAuthenticationBoundary();
      if (this.#cloud.configured) {
        await this.#researchSync?.catch(() => undefined);
        this.#refreshResearchPendingCount();
        if (this.#state.capture.pendingCount > 0) {
          await this.#syncResearchBatches(this.#researchGeneration);
          this.#refreshResearchPendingCount();
        }
        if (this.#state.capture.pendingCount > 0) {
          throw new Error(
            'Sia still has raw research waiting for AWS. Reconnect and retry, or delete the research data before signing out.',
          );
        }
      }
      await this.#clearResearchForIdentityBoundary();
      await this.#identity.signOut();
      this.#cloudParticipant = false;
      this.#state.cloudFeatures = structuredClone(INITIAL_STATE.cloudFeatures);
      await this.#runtime?.resetSessions();
      await this.#refreshMetaProviderState();
      this.#lockConnections('Sign in with the account that created this grant to manage it.');
      this.#commit();
      return this.snapshot();
    } finally {
      this.#signOutInProgress = false;
      this.#emit();
    }
  }

  async #stopAllWorkForAuthenticationBoundary(): Promise<void> {
    const queuedTurnIds = this.#queuedTurns.map(({ id }) => id);
    const affectedThreadIds = new Set(this.#queuedTurns.map(({ threadId }) => threadId));
    this.#queuedTurns = [];
    for (const turnId of queuedTurnIds) this.#discardResearchTurn(turnId);

    for (const [threadId, running] of this.#runningTurns) {
      affectedThreadIds.add(threadId);
      const thread = this.#state.threads.find(({ id }) => id === threadId);
      const turnId = thread ? this.#workspaceLeases.get(thread.workspace) : undefined;
      running.abort(new Error('Sia signed out.'));
      if (turnId) {
        this.#revokeApprovalsForTurn(threadId, turnId);
        void this.#runtime?.cancel(threadId, turnId).catch(() => undefined);
      }
    }
    for (const [threadId, question] of this.#pendingQuestions) {
      affectedThreadIds.add(threadId);
      void this.#runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    }
    this.#pendingQuestions.clear();
    for (const [approvalId, pending] of [...this.#pendingApprovals]) {
      this.#revokeApproval(approvalId, pending);
    }
    for (const threadId of affectedThreadIds) {
      const thread = this.#state.threads.find(({ id }) => id === threadId);
      if (thread) {
        thread.status = 'idle';
        delete thread.queueReason;
      }
    }
    await Promise.allSettled([...this.#turnTasks.values()]);
  }

  async #deleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<DesktopSnapshot> {
    if (confirmation !== 'DELETE ACCOUNT') {
      throw new Error('Enter DELETE ACCOUNT exactly to confirm account deletion.');
    }
    if (!this.#cloud.configured) {
      throw new Error('Sia cloud account deletion is not configured in this build.');
    }
    if (this.#identity.status().state !== 'signed_in') {
      throw new Error('Sign in to the Sia cloud account you want to delete.');
    }

    const previousCapture = structuredClone(this.#state.capture);
    this.#connectionSetup?.controller.abort();
    const inFlightResearchSync = this.#researchSync;
    let cloudCompleted = false;
    this.#accountDeletionInProgress = true;
    this.#state.capture.status = 'deleting';
    this.#commit();

    try {
      this.#researchGeneration += 1;
      if (this.#researchRetryTimer) {
        clearTimeout(this.#researchRetryTimer);
        this.#researchRetryTimer = undefined;
      }

      const queuedTurnIds = this.#queuedTurns.map(({ id }) => id);
      const affectedThreadIds = new Set(this.#queuedTurns.map(({ threadId }) => threadId));
      this.#queuedTurns = [];
      for (const turnId of queuedTurnIds) this.#discardResearchTurn(turnId);

      for (const [threadId, running] of this.#runningTurns) {
        affectedThreadIds.add(threadId);
        const thread = this.#state.threads.find(({ id }) => id === threadId);
        const turnId = thread ? this.#workspaceLeases.get(thread.workspace) : undefined;
        running.abort(new Error('Sia account deletion was requested.'));
        if (turnId) {
          this.#revokeApprovalsForTurn(threadId, turnId);
          void this.#runtime?.cancel(threadId, turnId).catch(() => undefined);
        }
      }
      for (const [threadId, question] of this.#pendingQuestions) {
        affectedThreadIds.add(threadId);
        void this.#runtime
          ?.respondToRequest(threadId, { requestId: question.requestId })
          .catch(() => undefined);
      }
      this.#pendingQuestions.clear();
      for (const [approvalId, pending] of [...this.#pendingApprovals]) {
        this.#revokeApproval(approvalId, pending);
      }
      for (const threadId of affectedThreadIds) {
        const thread = this.#state.threads.find(({ id }) => id === threadId);
        if (thread) {
          thread.status = 'idle';
          delete thread.queueReason;
        }
      }

      await Promise.allSettled([...this.#turnTasks.values()]);
      await inFlightResearchSync?.catch(() => undefined);

      const deletion = await this.#cloud.deleteAccountData();
      if (
        deletion.scope !== 'account' ||
        deletion.state !== 'completed' ||
        deletion.id.length === 0
      ) {
        throw new Error('Sia cloud did not confirm the accepted account deletion job.');
      }
      cloudCompleted = true;

      // The concrete identity manager clears encrypted local tokens before its
      // best-effort Cognito revocation call. The cloud identity is already gone.
      await this.#identity.signOut().catch(() => undefined);
      if (this.#browserSessionId) {
        await this.#computer
          .call(
            'end_session',
            { session: this.#browserSessionId },
            { kind: 'direct_user', operation: 'browser_detach' },
          )
          .catch(() => undefined);
      }
      this.#browserCapabilitySink?.resetBrowserCapabilities();
      this.#browserTarget = undefined;
      this.#browserSessionId = undefined;
      await this.#runtime?.resetSessions();

      this.#researchStaging.clear();
      this.#workspaceGrants.clear();
      this.#approvedConnectorBindings.clear();
      this.#runningTurns.clear();
      this.#turnTasks.clear();
      this.#workspaceLeases.clear();
      this.#pendingApprovals.clear();
      this.#repository.clearAll();
      this.#state = structuredClone(INITIAL_STATE);
      this.#researchSync = undefined;
      this.#researchRetryDelayMs = 15_000;
      await this.#refreshMetaProviderState();
      this.#revision += 1;
      this.#emit();
      return this.snapshot();
    } catch (error) {
      if (cloudCompleted) {
        throw new Error(
          'Your Sia cloud account was deleted, but this Mac could not finish clearing local Sia data. Quit Sia and contact the maintainer before using it again.',
        );
      }
      this.#state.capture = previousCapture;
      this.#commit();
      this.#scheduleResearchSync();
      throw error;
    } finally {
      this.#accountDeletionInProgress = false;
    }
  }

  async #refreshMetaProviderState(): Promise<void> {
    const index = this.#providers.findIndex(({ id }) => id === 'meta');
    if (index < 0) return;
    const current = this.#providers[index]!;
    if (!this.#cloud.configured) {
      this.#providers[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Included models require a release build configured for Sia cloud.',
      };
      return;
    }
    if (this.#identity.status().state !== 'signed_in') {
      this.#providers[index] = {
        ...current,
        status: 'needs_login',
        detail: 'Sign in to Sia before using included lab models.',
      };
      return;
    }
    if (this.#fakeServices) {
      this.#providers[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Included models require an authenticated live capability check.',
      };
      return;
    }
    const codexHarness = this.#providers.find(({ id }) => id === 'codex');
    if (
      !codexHarness ||
      codexHarness.status === 'needs_install' ||
      codexHarness.status === 'incompatible' ||
      codexHarness.status === 'disabled' ||
      codexHarness.status === 'unavailable'
    ) {
      this.#providers[index] = {
        ...current,
        status: codexHarness?.status === 'incompatible' ? 'incompatible' : 'needs_install',
        detail:
          codexHarness?.status === 'incompatible'
            ? 'Included models require the supported Codex harness version. Update Codex, then check again.'
            : 'Included models require the Codex harness. Install Codex, then check again.',
      };
      return;
    }
    this.#providers[index] = {
      ...current,
      status: 'unavailable',
      detail: 'Checking included model labs…',
    };
    try {
      const capabilities = await this.#cloud.capabilities();
      const catalog = await (typeof this.#cloud.hostedCatalog === 'function'
        ? this.#cloud
            .hostedCatalog()
            .catch(() => ({ schemaVersion: 1 as const, providers: [] }))
        : Promise.resolve({ schemaVersion: 1 as const, providers: [] }));
      for (const key of this.#backendModelRoutes.keys()) {
        if (key.startsWith('meta\u0000')) this.#backendModelRoutes.delete(key);
      }
      for (const key of this.#allowedModelRoutes.keys()) {
        if (key.startsWith('meta\u0000')) this.#allowedModelRoutes.delete(key);
      }
      for (const hostedProvider of catalog.providers) {
        if (!hostedProvider.execution) continue;
        const admitted = admitHostedRoutes({
          provider: 'meta',
          defaultHarnessId: hostedProvider.execution.defaultHarnessId,
          routes: hostedProvider.execution.routes,
        });
        const routesByModel = Map.groupBy(admitted.allowedRoutes, ({ model }) => model);
        for (const [model, routes] of routesByModel) {
          this.#allowedModelRoutes.set(modelRouteKey('meta', model), routes);
        }
        for (const route of admitted.allowedRoutes) {
          if (route.harnessId !== hostedProvider.execution.defaultHarnessId) continue;
          this.#backendModelRoutes.set(modelRouteKey('meta', route.model), route);
        }
      }
      const availableHostedProviders = catalog.providers.filter(({ available }) => available);
      const catalogModels = availableHostedProviders.flatMap(({ models }) =>
        models.map(({ id }) => id),
      );
      const model = catalogModels.includes(current.model)
        ? current.model
        : availableHostedProviders[0]?.defaultModel || capabilities.models[0] || current.model;
      if (
        (catalog.providers.length > 0 && availableHostedProviders.length === 0) ||
        !capabilities.available ||
        !capabilities.streaming ||
        !capabilities.tools
      ) {
        this.#providers[index] = {
          ...current,
          status: 'unavailable',
          detail:
            capabilities.reason ?? 'The included model relay is missing required capabilities.',
        };
        return;
      }
      this.#providers[index] = {
        ...current,
        model,
        ...(availableHostedProviders.length > 0
          ? {
              models: availableHostedProviders.flatMap((hostedProvider) =>
                hostedProvider.models.map(({ id, name }) => ({
                  id,
                  label: name,
                  description: `${hostedProvider.name} · included with Sia · up to ${hostedProvider.limits.maxOutputTokens.toLocaleString()} output tokens per turn`,
                  reasoningEfforts: [],
                })),
              ),
            }
          : {}),
        status: 'ready',
        detail:
          availableHostedProviders.length > 0
            ? `${availableHostedProviders.length} model lab${availableHostedProviders.length === 1 ? '' : 's'} verified live`
            : 'Included model verified live; local tools remain on this Mac.',
      };
    } catch {
      this.#providers[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Sia could not verify the authenticated model relay.',
      };
    }
  }

  async #disconnectConnection(
    request: BridgeRequestMap['connections.disconnect'],
  ): Promise<DesktopSnapshot> {
    const { connectionId, expectedConnectionId } = request;
    const current = this.#state.connections.find(({ id }) => id === connectionId);
    if (expectedConnectionId && current?.connectionId !== expectedConnectionId) {
      throw new Error(
        `${current?.label ?? 'This app'} changed since this screen was shown. Review the current connection before disconnecting it.`,
      );
    }
    this.#connectionSetup?.controller.abort();
    this.#connectorGenerations.set(
      connectionId,
      (this.#connectorGenerations.get(connectionId) ?? 0) + 1,
    );
    const owner = this.#state.connectionOwners[connectionId];
    if (!this.#fakeServices && owner && owner !== this.#currentIdentityKey()) {
      throw new Error('Sign in with the account that created this grant before revoking it.');
    }
    if (!this.#fakeServices && current?.connectionId) {
      if (!this.#cloud.configured || this.#identity.status().state !== 'signed_in') {
        throw new Error('Sign in to Sia cloud before revoking this connected app.');
      }
    }
    if (!this.#fakeServices && this.#cloud.configured && current?.connectionId) {
      await this.#cloud.disconnect(connectionId, current.connectionId);
    }
    const unifiedGoogle = Boolean(
      isGoogleConnection(connectionId) &&
      current?.connectionId &&
      (current.connectionId.startsWith('gw_') ||
        this.#state.connections.filter(({ connectionId: id }) => id === current.connectionId)
          .length > 1),
    );
    const affected = unifiedGoogle ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.#updateConnection(id, { status: 'disconnected' });
      const disconnected = this.#state.connections.find((connection) => connection.id === id);
      if (disconnected) {
        delete disconnected.account;
        delete disconnected.detail;
        delete disconnected.connectionId;
        delete disconnected.googleAccess;
        delete disconnected.upgradeConnectionId;
      }
      delete this.#state.connectionOwners[id];
    }
    this.#commit();
    this.#recordLifecycleEvent('connector.disconnected', {
      app: connectionId,
      ...(current?.connectionId ? { connectionId: current.connectionId } : {}),
    });
    return this.snapshot();
  }

  async #pollConnection(
    connectionId: ConnectionView['id'],
    expectedId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    // Provider authorization links currently remain valid for roughly ten minutes. Honor the
    // exact server-supplied expiry (plus a small callback grace period) so users are not shown a
    // false timeout while they review Google or Slack's consent screens.
    const deadline =
      (this.#connectorLinkExpiries.get(expectedId) ?? Date.now() + 10 * 60_000) + 15_000;
    const finish = (connected: boolean): boolean => {
      this.#connectorLinkExpiries.delete(expectedId);
      return connected;
    };
    let lastStatusError: unknown;
    while (Date.now() < deadline) {
      await abortableDelay(2_000, signal);
      const current = this.#state.connections.find(({ id }) => id === connectionId);
      if (!current || current.connectionId !== expectedId || current.status !== 'connecting')
        return finish(false);
      try {
        const status = await this.#cloud.connectionStatus(connectionId);
        const pending = this.#state.connections.find(({ id }) => id === connectionId);
        if (
          signal?.aborted ||
          !pending ||
          pending.connectionId !== expectedId ||
          pending.status !== 'connecting'
        ) {
          return finish(false);
        }
        const remote = status.connections.find(({ id }) => id === expectedId);
        if (remote?.status === 'connected') {
          const affected = isGoogleConnection(connectionId)
            ? GOOGLE_CONNECTION_IDS
            : [connectionId];
          for (const id of affected) {
            this.#updateConnection(id, {
              status: 'connected',
              connectionId: expectedId,
              ...(remote.accountLabel ? { account: remote.accountLabel } : {}),
              ...(isGoogleConnection(connectionId) && remote.access
                ? { googleAccess: remote.access }
                : {}),
            });
          }
          this.#commit();
          this.#recordLifecycleEvent('connector.connected', {
            app: connectionId,
            connectionId: expectedId,
            ...(remote.accountLabel ? { account: remote.accountLabel } : {}),
          });
          return finish(true);
        }
        if (remote?.status === 'failed') {
          const affected = isGoogleConnection(connectionId)
            ? GOOGLE_CONNECTION_IDS
            : [connectionId];
          for (const id of affected) {
            this.#updateConnection(id, {
              status: 'error',
              detail: 'The connected-app provider declined setup.',
            });
          }
          this.#commit();
          this.#recordLifecycleEvent('connector.setup.failed', {
            app: connectionId,
            connectionId: expectedId,
            reason: 'The connected-app provider declined setup.',
          });
          return finish(false);
        }
        lastStatusError = undefined;
      } catch (error) {
        const pending = this.#state.connections.find(({ id }) => id === connectionId);
        if (
          signal?.aborted ||
          !pending ||
          pending.connectionId !== expectedId ||
          pending.status !== 'connecting'
        ) {
          return finish(false);
        }
        // OAuth approval often outlives a brief laptop/network interruption. Keep the
        // pending grant stable and retry rather than forcing the user to disconnect it.
        lastStatusError = error;
      }
    }
    const affected = isGoogleConnection(connectionId) ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.#updateConnection(id, {
        status: 'error',
        detail: lastStatusError
          ? 'Sia could not verify the connection before setup timed out. Check your network, then try again.'
          : 'Connection setup timed out. You can safely try again.',
      });
    }
    this.#commit();
    this.#recordLifecycleEvent('connector.setup.timed_out', {
      app: connectionId,
      connectionId: expectedId,
    });
    return finish(false);
  }

  async #pollGoogleUpgrade(expectedId: string): Promise<void> {
    const deadline =
      (this.#connectorLinkExpiries.get(expectedId) ?? Date.now() + 10 * 60_000) + 15_000;
    const previousIds = new Set(
      this.#state.connections
        .filter(({ upgradeConnectionId }) => upgradeConnectionId === expectedId)
        .map(({ connectionId }) => connectionId)
        .filter((connectionId): connectionId is string =>
          Boolean(connectionId && connectionId !== expectedId),
        ),
    );
    const clearPending = (): void => {
      this.#connectorLinkExpiries.delete(expectedId);
      for (const id of GOOGLE_CONNECTION_IDS) {
        const connection = this.#state.connections.find((candidate) => candidate.id === id);
        if (connection?.upgradeConnectionId === expectedId) {
          delete connection.upgradeConnectionId;
        }
      }
      this.#commit();
    };
    while (Date.now() < deadline) {
      await abortableDelay(2_000);
      if (
        !this.#state.connections.some(
          ({ upgradeConnectionId }) => upgradeConnectionId === expectedId,
        )
      ) {
        return;
      }
      try {
        const status = await this.#cloud.connectionStatus('gmail');
        const remote = status.connections.find(({ id }) => id === expectedId);
        if (remote?.status === 'connected' && remote.access === 'read_write') {
          // Retire only Sia's encrypted copy of the prior credential. Do not disconnect it from
          // Google: both refresh tokens may belong to the same authorization grant, so revoking
          // the old token can invalidate the verified editor replacement as well.
          for (const previousId of previousIds) {
            await this.#cloud.retireSupersededGoogleConnection(previousId, expectedId);
          }
          for (const id of GOOGLE_CONNECTION_IDS) {
            const connection = this.#state.connections.find((candidate) => candidate.id === id);
            if (!connection || connection.upgradeConnectionId !== expectedId) continue;
            connection.connectionId = expectedId;
            connection.googleAccess = 'read_write';
            if (remote.accountLabel) connection.account = remote.accountLabel;
            delete connection.upgradeConnectionId;
            delete connection.detail;
          }
          this.#connectorLinkExpiries.delete(expectedId);
          this.#commit();
          this.#recordLifecycleEvent('connector.google_access.upgraded', {
            app: 'gmail',
            connectionId: expectedId,
          });
          return;
        }
        if (remote?.status === 'failed') {
          clearPending();
          this.#recordLifecycleEvent('connector.google_access.upgrade_failed', {
            app: 'gmail',
            connectionId: expectedId,
          });
          return;
        }
      } catch {
        // The existing read-only grant remains usable while transient status checks retry.
      }
    }
    clearPending();
  }

  #setCapture(input: BridgeRequestMap['research.setCapture']): DesktopSnapshot {
    if (input.enabled && this.#state.capture.status === 'deleting') {
      throw new Error('Finish or retry research deletion before enabling capture.');
    }
    if (
      input.enabled &&
      this.#cloud.configured &&
      this.#identity.status().state === 'signed_in' &&
      this.#state.cloudFeatures.researchUploads === false
    ) {
      throw new Error('Research capture is not enabled for this Sia account.');
    }
    if (!input.enabled && !input.consentVersion && this.#researchRequiredForCurrentAccount()) {
      throw new Error(
        'Research capture is required while signed in. Sign out to stop capture.',
      );
    }
    const consentVersion = input.consentVersion ?? this.#state.capture.consentVersion;
    if (
      input.enabled &&
      (!consentVersion || (!this.#state.capture.consentAcceptedAt && !input.consentVersion))
    ) {
      throw new Error('Review and accept the research consent before enabling capture.');
    }
    if (input.enabled) {
      const identity = this.#currentIdentityKey();
      if (
        identity &&
        this.#state.researchIdentity &&
        this.#state.researchIdentity !== LOCAL_RESEARCH_IDENTITY &&
        this.#state.researchIdentity !== identity &&
        this.#researchBatches().some(({ batchId }) => !this.#researchBatchSynced(batchId))
      ) {
        throw new Error(
          'This Mac has unsynced research for another Sia account. Sign in with that account or delete its local research before continuing.',
        );
      }
      this.#state.researchIdentity = identity ?? LOCAL_RESEARCH_IDENTITY;
      const acceptedAt =
        input.consentVersion &&
        (input.consentVersion !== this.#state.capture.consentVersion ||
          !this.#state.capture.consentAcceptedAt)
          ? new Date().toISOString()
          : this.#state.capture.consentAcceptedAt;
      this.#state.capture = {
        status: 'recording',
        pendingCount: this.#state.capture.pendingCount,
        consentVersion: consentVersion!,
        promptReviewedVersion: consentVersion!,
        ...(acceptedAt ? { consentAcceptedAt: acceptedAt } : {}),
      };
      this.#refreshResearchPendingCount();
    } else if (input.consentVersion) {
      this.#state.capture = {
        status: 'not_consented',
        pendingCount: this.#state.capture.pendingCount,
        promptReviewedVersion: input.consentVersion,
      };
      for (const staged of this.#researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
    } else {
      this.#state.capture.status = 'paused';
      for (const staged of this.#researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
    }
    this.#trajectory?.record({
      type: input.enabled
        ? 'research_consent_accepted'
        : input.consentVersion
          ? 'research_consent_declined'
          : 'research_capture_paused',
      threadId: 'app-lifecycle',
      consentVersion,
      signedIn: this.#identity.status().state === 'signed_in',
    });
    this.#commit();
    if (input.enabled) this.#scheduleResearchSync();
    return this.snapshot();
  }

  async #exportResearch(): Promise<BridgeResultMap['research.export']> {
    if (!this.#fakeServices && this.#researchRequiredForCurrentAccount()) {
      const { downloadUrl } = await this.#cloud.requestResearchExport();
      await this.#openExternal(downloadUrl);
      return { path: null };
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      consentVersion: this.#state.capture.consentVersion,
      batches: this.#researchBatches(),
    };
    return { path: await this.#exportJson(payload) };
  }

  async #deleteResearch(confirmation: 'DELETE'): Promise<DesktopSnapshot> {
    if (confirmation !== 'DELETE') throw new Error('Deletion confirmation was not supplied.');
    const previousCapture = structuredClone(this.#state.capture);
    this.#state.capture.status = 'deleting';
    this.#commit();
    try {
      const inFlightResearchSync = this.#researchSync;
      for (const staged of this.#researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
      this.#researchGeneration += 1;
      if (this.#researchRetryTimer) {
        clearTimeout(this.#researchRetryTimer);
        this.#researchRetryTimer = undefined;
      }
      await inFlightResearchSync?.catch(() => undefined);
      if (!this.#fakeServices && this.#researchRequiredForCurrentAccount()) {
        try {
          await this.#cloud.deleteResearchData();
        } catch {
          throw new Error(
            'Sia could not confirm cloud deletion. Local research batches remain available so you can retry safely.',
          );
        }
      } else if (!this.#fakeServices && this.#cloud.configured) {
        throw new Error(
          'Sign in to Sia cloud to delete local research batches and any previously synced copy.',
        );
      }
      this.#researchStaging.clear();
      for (const record of this.#repository.list<Record<string, unknown>>('research')) {
        const id =
          typeof record.batchId === 'string'
            ? record.batchId
            : typeof record.id === 'string'
              ? record.id
              : undefined;
        if (id) this.#repository.remove('research', id);
      }
      for (const record of this.#repository.list<ResearchSyncRecord>('research_sync')) {
        if (record.batchId) this.#repository.remove('research_sync', record.batchId);
      }
      const promptReviewedVersion =
        this.#state.capture.consentVersion ?? this.#state.capture.promptReviewedVersion;
      this.#state.capture = {
        status: 'not_consented',
        pendingCount: 0,
        ...(promptReviewedVersion ? { promptReviewedVersion } : {}),
      };
      this.#commit();
      return this.snapshot();
    } catch (error) {
      this.#state.capture = previousCapture;
      this.#refreshResearchPendingCount();
      this.#commit();
      this.#scheduleResearchSync();
      throw error;
    }
  }

  #stageResearchText(input: {
    turnId: string;
    eventId: string;
    occurredAt: string;
    role: 'user' | 'assistant';
    text: string;
    provider: ProviderId;
    messageId?: string;
    append?: boolean;
  }): void {
    if (
      !this.#researchCaptureActive() ||
      !input.text ||
      this.#researchExcludedTurns.has(input.turnId)
    )
      return;
    let staged = this.#researchStaging.get(input.turnId);
    if (!staged && input.role === 'assistant') return;
    if (!staged) {
      staged = {
        tainted: false,
        events: [],
        rawEvents: [],
        eventByMessageId: new Map(),
        safeActionNames: [],
      };
      this.#researchStaging.set(input.turnId, staged);
    }
    if (staged.tainted) return;
    if (containsSecretShapedText(input.text)) {
      staged.tainted = true;
      staged.events = [];
      staged.eventByMessageId.clear();
      return;
    }
    const existingId = input.messageId
      ? staged.eventByMessageId.get(input.messageId)
      : undefined;
    const existing = existingId
      ? staged.events.find((event) => event.id === existingId)
      : undefined;
    if (existing?.kind === 'conversation.text') {
      existing.payload.text = input.append
        ? `${existing.payload.text}${input.text}`
        : input.text;
      if (!existing.sourceEventIds.includes(input.eventId)) {
        existing.sourceEventIds.push(input.eventId);
      }
      if (containsSecretShapedText(existing.payload.text)) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
      return;
    }
    const event: ResearchEventRecord = {
      id: randomUUID(),
      occurredAt: input.occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'conversation.text',
      payload: { role: input.role, text: input.text, provider: input.provider },
      sourceEventIds: [input.eventId],
    };
    staged.events.push(event);
    if (input.messageId) staged.eventByMessageId.set(input.messageId, event.id);
  }

  #taintResearchTurn(turnId: string): void {
    if (this.#researchExcludedTurns.has(turnId)) return;
    const staged = this.#researchStaging.get(turnId) ?? {
      tainted: false,
      events: [],
      rawEvents: [],
      eventByMessageId: new Map<string, string>(),
      safeActionNames: [],
    };
    staged.tainted = true;
    staged.events = [];
    staged.eventByMessageId.clear();
    this.#researchStaging.set(turnId, staged);
  }

  #excludeResearchTurn(turnId: string): void {
    this.#researchExcludedTurns.add(turnId);
    this.#researchStaging.delete(turnId);
  }

  #discardResearchTurn(turnId: string): void {
    if (this.#researchExcludedTurns.delete(turnId)) {
      this.#researchStaging.delete(turnId);
      return;
    }
    if (this.#rawResearchEnabled()) {
      this.#persistRawResearchTurn(turnId, 'discarded');
      return;
    }
    this.#researchStaging.delete(turnId);
  }

  #rawResearchEnabled(): boolean {
    return (
      this.#researchCaptureActive() &&
      this.#state.capture.consentVersion === RESEARCH_CONSENT_VERSION
    );
  }

  /**
   * Records non-turn product activity without ever retaining an OAuth URL, code, or token.
   * Research is optional; lifecycle telemetry is copied only while capture is active.
   */
  #recordLifecycleEvent(eventType: string, data: Record<string, unknown>): void {
    const occurredAt = new Date().toISOString();
    const threadId = 'app-lifecycle';
    const turnId = `lifecycle-${randomUUID()}`;
    this.#trajectory?.record({
      type: eventType,
      threadId,
      turnId,
      data: jsonSafeValue(data),
    });

    if (!this.#rawResearchEnabled()) {
      return;
    }

    this.#stageRawResearchEvent({
      threadId,
      turnId,
      eventType,
      data,
      occurredAt,
    });
    this.#persistRawResearchTurn(turnId, 'completed');
  }

  #stageRawResearchEvent(input: {
    threadId: string;
    turnId: string;
    eventType: string;
    sequence?: number;
    data: unknown;
    occurredAt?: string;
    sourceEventId?: string;
  }): void {
    if (!this.#rawResearchEnabled() || this.#researchExcludedTurns.has(input.turnId)) return;
    const staged = this.#researchStaging.get(input.turnId) ?? {
      tainted: false,
      events: [],
      rawEvents: [],
      eventByMessageId: new Map<string, string>(),
      safeActionNames: [],
    };
    staged.rawEvents.push({
      id: randomUUID(),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      classification: 'research_allowed',
      taints: [],
      kind: 'raw.event',
      payload: {
        schemaVersion: 1,
        threadId: input.threadId,
        turnId: input.turnId,
        eventType: input.eventType,
        ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
        data: jsonSafeValue(input.data),
      },
      sourceEventIds: input.sourceEventId ? [input.sourceEventId] : [],
    });
    this.#researchStaging.set(input.turnId, staged);
  }

  #markSafeResearchAction(turnId: string, name: string): void {
    if (!this.#researchCaptureActive()) return;
    const staged = this.#researchStaging.get(turnId);
    if (!staged || staged.tainted) return;
    staged.safeActionNames.push(name);
  }

  #consumeSafeResearchAction(turnId: string, name: string): boolean {
    const staged = this.#researchStaging.get(turnId);
    if (!staged || staged.tainted) return false;
    const index = staged.safeActionNames.indexOf(name);
    if (index < 0) return false;
    staged.safeActionNames.splice(index, 1);
    return true;
  }

  #stageResearchTrajectory(input: {
    turnId: string;
    eventId: string;
    occurredAt: string;
    payload: Extract<ResearchEventRecord['payload'], { source: string; type: string }>;
  }): void {
    if (!this.#researchCaptureActive() || this.#researchExcludedTurns.has(input.turnId)) return;
    const staged = this.#researchStaging.get(input.turnId);
    if (!staged || staged.tainted) return;
    staged.events.push({
      id: randomUUID(),
      occurredAt: input.occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'trajectory.step',
      payload: input.payload,
      sourceEventIds: [input.eventId],
    });
  }

  #stageResearchActionResult(notice: Parameters<ActionResultObserver>[0]): void {
    if (!SAFE_RESEARCH_ACTIONS.has(notice.name) || !this.#researchCaptureActive()) return;
    const staged = this.#researchStaging.get(notice.context.turnId);
    if (!staged || staged.tainted) return;
    const occurredAt = new Date().toISOString();
    this.#stageResearchTrajectory({
      turnId: notice.context.turnId,
      eventId: randomUUID(),
      occurredAt,
      payload: {
        source: 'sia_action',
        type: 'action_result',
        name: notice.name,
        outcome: notice.result.outcome,
      },
    });
    if (
      notice.name !== 'computer_snapshot' ||
      notice.result.outcome !== 'verified' ||
      staged.events.some(({ kind }) => kind === 'trajectory.screenshot')
    ) {
      return;
    }
    const image = notice.result.images?.find(
      (candidate) =>
        /^(?:image\/png|image\/jpeg|image\/webp)$/.test(candidate.mimeType) &&
        Buffer.byteLength(candidate.dataBase64, 'utf8') <= MAX_RESEARCH_SCREENSHOT_BASE64_BYTES,
    );
    if (!image) return;
    staged.events.push({
      id: randomUUID(),
      occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'trajectory.screenshot',
      payload: {
        source: 'sia_action',
        tool: 'computer_snapshot',
        mimeType: image.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        dataBase64: image.dataBase64,
      },
      sourceEventIds: [],
    });
  }

  #completeResearchTurn(turnId: string): void {
    if (this.#researchExcludedTurns.delete(turnId)) {
      this.#researchStaging.delete(turnId);
      return;
    }
    if (this.#rawResearchEnabled()) {
      this.#persistRawResearchTurn(turnId, 'completed');
      return;
    }
    const staged = this.#researchStaging.get(turnId);
    this.#researchStaging.delete(turnId);
    if (!staged || staged.tainted || staged.events.length === 0) return;
    const version = this.#state.capture.consentVersion;
    const acceptedAt = this.#state.capture.consentAcceptedAt;
    if (!version || !acceptedAt) return;
    const batch: ResearchBatchRecord = {
      batchId: randomUUID(),
      syncEligible: this.#state.researchIdentity !== LOCAL_RESEARCH_IDENTITY,
      consent: {
        version,
        acceptedAt,
        purpose: 'research_evaluation_debugging',
      },
      events: staged.events,
    };
    const batchBytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
    if (batchBytes > MAX_LOCAL_RESEARCH_BATCH_BYTES) {
      this.#blockResearchCapture(
        "A research bundle exceeded Sia's durable batch limit. Sign out and contact the alpha team before continuing.",
      );
      return;
    }
    this.#prepareLocalResearchStorage(batchBytes);
    if (!this.#storeResearchBatch(batch)) return;
    this.#refreshResearchPendingCount();
    this.#scheduleResearchSync();
  }

  #persistRawResearchTurn(turnId: string, outcome: 'completed' | 'discarded'): void {
    if (this.#researchExcludedTurns.has(turnId)) {
      this.#researchStaging.delete(turnId);
      return;
    }
    const staged = this.#researchStaging.get(turnId);
    if (!staged?.rawEvents.length) return;
    const version = this.#state.capture.consentVersion;
    const acceptedAt = this.#state.capture.consentAcceptedAt;
    if (version !== RESEARCH_CONSENT_VERSION || !acceptedAt) return;
    const first = staged.rawEvents[0]!;
    const threadId = first.payload.threadId;
    const expanded = expandRawResearchEvents([
      ...staged.rawEvents,
      {
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        classification: 'research_allowed',
        taints: [],
        kind: 'raw.event',
        payload: {
          schemaVersion: 1,
          threadId,
          turnId,
          eventType: 'turn.capture_finished',
          data: { outcome },
        },
        sourceEventIds: [],
      },
    ]);
    for (const events of partitionRawResearchEvents(expanded)) {
      const sequences = events
        .map(({ payload }) => payload.sequence)
        .filter((value): value is number => typeof value === 'number');
      const batch: ResearchBatchRecord = {
        batchId: randomUUID(),
        syncEligible: this.#state.researchIdentity !== LOCAL_RESEARCH_IDENTITY,
        format: 'raw_v1',
        scope: {
          threadId,
          turnId,
          ...(sequences.length ? { sequenceStart: Math.min(...sequences) } : {}),
          ...(sequences.length ? { sequenceEnd: Math.max(...sequences) } : {}),
          eventKinds: [...new Set(events.map(({ payload }) => payload.eventType))],
        },
        consent: {
          version,
          acceptedAt,
          purpose: 'research_evaluation_debugging',
        },
        events,
      };
      const batchBytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
      if (batchBytes > MAX_LOCAL_RESEARCH_BATCH_BYTES) {
        this.#blockResearchCapture(
          "A raw research bundle exceeded Sia's durable batch limit. Sign out and contact the alpha team before continuing.",
        );
        return;
      }
      this.#prepareLocalResearchStorage(batchBytes);
      if (!this.#storeResearchBatch(batch)) return;
    }
    this.#researchStaging.delete(turnId);
    this.#refreshResearchPendingCount();
    this.#scheduleResearchSync();
  }

  #researchCaptureActive(): boolean {
    if (
      this.#cloud.configured &&
      this.#identity.status().state === 'signed_in' &&
      this.#state.cloudFeatures.researchUploads === false
    ) {
      return false;
    }
    return (
      this.#state.capture.status === 'recording' ||
      this.#state.capture.status === 'sync_pending'
    );
  }

  #researchBatches(): ResearchBatchRecord[] {
    return this.#repository
      .list<unknown>('research')
      .filter((value): value is ResearchBatchRecord => isResearchBatchRecord(value));
  }

  #pruneExpiredResearchBatches(): void {
    const cutoff = Date.now() - LOCAL_RESEARCH_RETENTION_MS;
    for (const batch of this.#researchBatches()) {
      const occurredAt = Date.parse(batch.events[0]?.occurredAt ?? '');
      if (
        Number.isFinite(occurredAt) &&
        occurredAt < cutoff &&
        this.#researchBatchSynced(batch.batchId)
      ) {
        this.#repository.remove('research', batch.batchId);
        this.#repository.remove('research_sync', batch.batchId);
      }
    }
  }

  #prepareLocalResearchStorage(incomingBytes: number): void {
    const batches = this.#researchBatches();
    let storedBytes = batches.reduce(
      (total, batch) => total + Buffer.byteLength(JSON.stringify(batch), 'utf8'),
      0,
    );
    let storedBatches = batches.length;
    const removable = batches
      .filter(({ batchId }) => this.#researchBatchSynced(batchId))
      .sort(
        (left, right) =>
          Date.parse(left.events[0]?.occurredAt ?? '') -
          Date.parse(right.events[0]?.occurredAt ?? ''),
      );
    while (
      storedBytes + incomingBytes > TARGET_LOCAL_RESEARCH_BYTES ||
      storedBatches >= TARGET_LOCAL_RESEARCH_BATCHES
    ) {
      const oldest = removable.shift();
      if (!oldest) break;
      storedBytes -= Buffer.byteLength(JSON.stringify(oldest), 'utf8');
      storedBatches -= 1;
      this.#repository.remove('research', oldest.batchId);
      this.#repository.remove('research_sync', oldest.batchId);
    }
  }

  #storeResearchBatch(batch: ResearchBatchRecord): boolean {
    try {
      this.#repository.put('research', batch.batchId, batch);
      this.#repository.put<ResearchSyncRecord>('research_sync', batch.batchId, {
        batchId: batch.batchId,
        synced: false,
      });
      return true;
    } catch {
      // Do not continue taking research-required turns after the encrypted outbox fails. If the
      // batch write succeeded but its sync marker did not, the absent marker already means
      // "unsynced", so the raw batch remains eligible for a later upload.
      this.#blockResearchCapture(
        'Sia could not durably queue the raw research record. Free disk space or sign out, then reopen Sia before continuing.',
      );
      return false;
    }
  }

  #blockResearchCapture(reason: string): void {
    this.#state.capture.status = 'blocked';
    this.#state.capture.blockedReason = reason;
    this.#state.capture.lastSyncError = reason;
    this.#refreshResearchPendingCount();
    try {
      this.#commit();
    } catch {
      // A storage failure may prevent even the status update from reaching disk. The in-memory
      // status still makes the running process fail closed.
    }
  }

  #refreshResearchPendingCount(): void {
    const pending = this.#researchBatches().filter(
      (batch) => batch.syncEligible !== false && !this.#researchBatchSynced(batch.batchId),
    );
    this.#state.capture.pendingCount = pending.reduce(
      (count, batch) => count + batch.events.length,
      0,
    );
    if (pending.length) {
      this.#state.capture.pendingBytes = pending.reduce(
        (bytes, batch) => bytes + Buffer.byteLength(JSON.stringify(batch), 'utf8'),
        0,
      );
    } else {
      delete this.#state.capture.pendingBytes;
    }
    const oldest = pending
      .map((batch) => batch.events[0]?.occurredAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (oldest) this.#state.capture.oldestPendingAt = oldest;
    else delete this.#state.capture.oldestPendingAt;
  }

  #scheduleResearchSync(): void {
    if (
      this.#state.capture.status === 'deleting' ||
      this.#state.capture.pendingCount === 0 ||
      this.#researchSync ||
      this.#state.cloudFeatures.researchUploads === false
    )
      return;
    if (
      this.#fakeServices ||
      !this.#cloud.configured ||
      this.#identity.status().state !== 'signed_in' ||
      this.#state.researchIdentity !== this.#currentIdentityKey()
    ) {
      if (this.#state.capture.status === 'recording') {
        this.#state.capture.status = 'sync_pending';
        this.#commit();
      }
      return;
    }
    const generation = this.#researchGeneration;
    this.#researchSync = this.#syncResearchBatches(generation).finally(() => {
      this.#researchSync = undefined;
      if (this.#state.capture.pendingCount > 0 && !this.#researchRetryTimer) {
        this.#scheduleResearchSync();
      }
    });
  }

  async #syncResearchBatches(generation: number): Promise<void> {
    try {
      for (const batch of this.#researchBatches().filter(
        ({ batchId, syncEligible }) =>
          syncEligible !== false && !this.#researchBatchSynced(batchId),
      )) {
        await this.#cloud.uploadResearchBatch(batch);
        if (generation !== this.#researchGeneration) return;
        const current = this.#repository.get<ResearchBatchRecord>('research', batch.batchId);
        if (!current) continue;
        this.#repository.put<ResearchSyncRecord>('research_sync', batch.batchId, {
          batchId: batch.batchId,
          synced: true,
        });
      }
      if (generation !== this.#researchGeneration) return;
      this.#researchRetryDelayMs = 15_000;
      delete this.#state.capture.lastSyncError;
      this.#refreshResearchPendingCount();
      if (
        this.#state.capture.pendingCount === 0 &&
        (this.#state.capture.status === 'sync_pending' ||
          this.#state.capture.status === 'blocked')
      ) {
        this.#state.capture.status = 'recording';
        delete this.#state.capture.blockedReason;
      }
      this.#commit();
    } catch (error) {
      if (generation !== this.#researchGeneration) return;
      this.#refreshResearchPendingCount();
      this.#state.capture.lastSyncError = researchSyncErrorMessage(error);
      if (this.#state.capture.status === 'recording') {
        this.#state.capture.status = 'sync_pending';
      }
      this.#commit();
      this.#scheduleResearchRetry();
    }
  }

  #scheduleResearchRetry(): void {
    if (
      this.#state.capture.status === 'deleting' ||
      this.#researchRetryTimer ||
      this.#state.capture.pendingCount === 0 ||
      this.#state.cloudFeatures.researchUploads === false
    )
      return;
    const delay = this.#researchRetryDelayMs;
    this.#researchRetryDelayMs = Math.min(this.#researchRetryDelayMs * 2, 5 * 60_000);
    this.#researchRetryTimer = setTimeout(() => {
      this.#researchRetryTimer = undefined;
      this.#scheduleResearchSync();
    }, delay);
    this.#researchRetryTimer.unref();
  }

  #researchRequiredForCurrentAccount(): boolean {
    return (
      this.#cloud.configured &&
      this.#identity.status().state === 'signed_in' &&
      this.#state.cloudFeatures.researchUploads !== false
    );
  }

  #disableResearchForCurrentAccessPolicy(): void {
    this.#researchGeneration += 1;
    if (this.#researchRetryTimer) {
      clearTimeout(this.#researchRetryTimer);
      this.#researchRetryTimer = undefined;
    }
    for (const staged of this.#researchStaging.values()) {
      staged.tainted = true;
      staged.events = [];
      staged.rawEvents = [];
      staged.eventByMessageId.clear();
    }
    this.#researchStaging.clear();
    for (const batch of this.#researchBatches()) {
      if (batch.syncEligible === false || this.#researchBatchSynced(batch.batchId)) continue;
      this.#repository.put('research', batch.batchId, { ...batch, syncEligible: false });
    }
    this.#state.capture = { status: 'not_consented', pendingCount: 0 };
    this.#refreshResearchPendingCount();
  }

  #researchBatchSynced(batchId: string): boolean {
    return this.#repository.get<ResearchSyncRecord>('research_sync', batchId)?.synced ?? false;
  }

  #startTurn(turn: QueuedTurn): void {
    const thread = this.#requireThread(turn.threadId);
    const unavailable = this.#providerReadinessError(thread.provider, thread.model);
    if (unavailable) {
      thread.status = 'failed';
      delete thread.queueReason;
      this.#discardResearchTurn(turn.id);
      this.#appendTimeline(thread.id, {
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
    this.#runningTurns.set(thread.id, controller);
    this.#workspaceLeases.set(thread.workspace, turn.id);
    thread.status = 'running';
    delete thread.queueReason;
    this.#appendTimeline(thread.id, {
      id: randomUUID(),
      turnId: turn.id,
      kind: 'activity',
      title: this.#fakeServices
        ? 'Preparing local tools'
        : `Starting ${thread.provider === 'codex' ? 'Codex' : thread.provider}`,
      detail: thread.workspace,
      status: 'running',
      toolName: 'runtime.start',
      timestamp: new Date().toISOString(),
    });
    const task = this.#runTurn(turn, controller.signal).finally(() => {
      if (this.#turnTasks.get(thread.id) === task) this.#turnTasks.delete(thread.id);
    });
    this.#turnTasks.set(thread.id, task);
  }

  async #runTurn(turn: QueuedTurn, signal: AbortSignal): Promise<void> {
    let lease: TurnLease | undefined;
    try {
      const leasedThread = this.#requireThread(turn.threadId);
      lease = await this.#actionLeases.startTurn({
        turnId: turn.id,
        threadId: turn.threadId,
        signal,
      });
      await lease.acquire({ kind: 'workspace_writer', id: leasedThread.workspace }, signal);
      if (this.#fakeServices) {
        await abortableDelay(turn.fakeDelayMs ?? this.#fakeTurnDelayMs, signal);
        this.#completeRunningActivities(turn.threadId, turn.id);
        const assistantEventId = randomUUID();
        const assistantTimestamp = new Date().toISOString();
        const assistantText =
          'I am ready. This development turn used the deterministic local runtime, so no provider account or connected-app data was accessed.';
        this.#appendTimeline(turn.threadId, {
          id: assistantEventId,
          turnId: turn.id,
          kind: 'assistant',
          text: assistantText,
          status: 'complete',
          timestamp: assistantTimestamp,
        });
        const thread = this.#requireThread(turn.threadId);
        this.#stageResearchText({
          turnId: turn.id,
          eventId: assistantEventId,
          occurredAt: assistantTimestamp,
          role: 'assistant',
          text: assistantText,
          provider: thread.provider,
        });
        this.#completeResearchTurn(turn.id);
        thread.status = 'idle';
        delete thread.interruptedTurnId;
        this.#markTurnFinished(thread, turn, 'complete');
        thread.updatedAt = new Date().toISOString();
      } else {
        const runtime = this.#runtime;
        if (!runtime) throw new Error('The provider runtime did not initialize.');
        const thread = this.#requireThread(turn.threadId);
        const runtimeThread = {
          id: thread.id,
          provider: thread.provider,
          model: thread.model,
          ...(thread.resolvedExecutionTarget
            ? { resolvedExecutionTarget: thread.resolvedExecutionTarget }
            : {}),
          workspace: thread.workspace,
          instructions: thread.instructionsSnapshot,
          priorMessages: this.#state.timeline
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
        const events = turn.reviewTarget
          ? runtime.runReview(
              { thread: runtimeThread, turnId: turn.id, target: turn.reviewTarget, lease },
              signal,
            )
          : runtime.runTurn(
              {
                thread: runtimeThread,
                turnId: turn.id,
                text: turn.text,
                ...(turn.attachments?.length ? { attachments: turn.attachments } : {}),
                ...(thread.reasoningEffort ? { reasoningEffort: thread.reasoningEffort } : {}),
                lease,
              },
              signal,
            );
        for await (const event of events) {
          this.#applyRuntimeEvent(event);
          this.#commit(isStreamingDelta(event));
        }
        this.#completeRunningActivities(turn.threadId, turn.id);
        if (thread.status === 'running' || thread.status === 'waiting') {
          thread.status = 'idle';
          this.#completeResearchTurn(turn.id);
        }
        delete thread.interruptedTurnId;
        this.#markTurnFinished(thread, turn, 'complete');
        thread.updatedAt = new Date().toISOString();
      }
    } catch (error) {
      this.#discardResearchTurn(turn.id);
      if (!signal.aborted) {
        const thread = this.#requireThread(turn.threadId);
        thread.status = 'failed';
        thread.interruptedTurnId = turn.id;
        if (turn.attachments?.length)
          this.#failedTurnAttachments.set(turn.id, turn.attachments);
        this.#appendTimeline(turn.threadId, {
          id: randomUUID(),
          turnId: turn.id,
          kind: 'error',
          title: 'Task could not start',
          text: error instanceof Error ? error.message : 'The provider failed unexpectedly.',
          status: 'failed',
          timestamp: new Date().toISOString(),
        });
        this.#markTurnFinished(thread, turn, 'failed');
      }
    } finally {
      if (signal.aborted) {
        this.#discardResearchTurn(turn.id);
        this.#markScheduleRunFinished(turn, 'cancelled');
      }
      this.#revokeApprovalsForTurn(turn.threadId, turn.id);
      lease?.release();
      this.#releaseTurn(turn.threadId);
      this.#commit();
    }
  }

  #markTurnFinished(
    thread: ThreadView,
    turn: QueuedTurn,
    outcome: 'complete' | 'failed',
  ): void {
    this.#markScheduleRunFinished(turn, outcome === 'complete' ? 'completed' : 'failed');
    if (outcome === 'complete') this.#failedTurnAttachments.delete(turn.id);
    // Streamed items are appended early and mutated as text arrives; the finished turn is
    // written once more so the log always ends with the final transcript for that turn.
    this.#trajectory?.record({
      type: 'turn_finished',
      threadId: thread.id,
      turnId: turn.id,
      outcome,
      source: turn.source ?? 'manual',
      items: structuredClone(
        this.#state.timeline.filter(
          (item) => item.threadId === thread.id && item.turnId === turn.id,
        ),
      ),
    });
    if (turn.source === 'goal' && thread.goal && outcome === 'failed') {
      thread.goal.status = 'paused';
      thread.goal.updatedAt = new Date().toISOString();
    }
    thread.unread = true;
    const agent = this.#state.agents.find(({ id }) => id === thread.agentId);
    if (agent?.notificationsEnabled !== false) {
      this.#notify?.({
        threadId: thread.id,
        title:
          outcome === 'complete'
            ? `${thread.title} finished`
            : `${thread.title} needs attention`,
        body:
          outcome === 'complete'
            ? 'Background work is ready to review.'
            : 'The task stopped before it could finish.',
      });
    }
  }

  #markScheduleRunFinished(
    turn: QueuedTurn,
    outcome: 'completed' | 'failed' | 'cancelled',
  ): void {
    if (!turn.scheduleRunId) return;
    const schedule = this.#state.schedules.find(
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

  #applyRuntimeEvent(event: ThreadEventEnvelope): void {
    const thread = this.#requireThread(event.threadId);
    this.#stageRawResearchEvent({
      threadId: event.threadId,
      turnId: event.turnId,
      eventType: `provider.${event.type}`,
      sequence: event.sequence,
      data: event,
      occurredAt: event.timestamp,
      sourceEventId: event.id,
    });
    if (event.type === 'approval' || event.type === 'question') {
      this.#taintResearchTurn(event.turnId);
    }
    if (event.type === 'message') {
      const text = event.payload.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('');
      if (!text) return;
      if (event.payload.role === 'assistant') {
        this.#stageResearchText({
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
      const existing = this.#state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'assistant' &&
          item.detail === event.payload.messageId,
      );
      if (existing && event.payload.delta) existing.text = `${existing.text ?? ''}${text}`;
      else {
        this.#appendTimeline(event.threadId, {
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
      const existing = this.#state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'reasoning' &&
          item.detail === event.payload.reasoningId,
      );
      if (existing && event.payload.delta)
        existing.text = `${existing.text ?? ''}${event.payload.text}`;
      else {
        this.#appendTimeline(event.threadId, {
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
        this.#stageResearchTrajectory({
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
      } else if (!this.#consumeSafeResearchAction(event.turnId, event.payload.name)) {
        this.#taintResearchTurn(event.turnId);
      }
      const activity = mapRuntimePresentation(event.payload.presentation);
      const running = this.#state.timeline.findLast(
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
        this.#appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: runtimeToolTitle(event.payload.name, activity),
          detail: event.payload.native ? 'Provider-native tool' : 'Sia action gateway',
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
      this.#taintResearchTurn(event.turnId);
      void this.#authorizeProviderRequest(event);
      thread.status = 'waiting';
      return;
    }
    if (event.type === 'question' && event.payload.phase === 'requested') {
      this.#pendingQuestions.set(event.threadId, {
        requestId: event.payload.requestId,
        turnId: event.turnId,
      });
      this.#appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'question',
        title: 'Provider needs input',
        text: event.payload.prompt,
        status: 'pending',
        timestamp: event.timestamp,
      });
      thread.status = 'waiting';
      return;
    }
    if (event.type === 'plan') {
      this.#stageResearchTrajectory({
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
      const existing = this.#state.timeline.findLast(
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
        this.#appendTimeline(event.threadId, {
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
      this.#stageResearchTrajectory({
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
      const existing = this.#state.timeline.findLast(
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
        this.#appendTimeline(event.threadId, {
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
      this.#state.usageByTurn[event.turnId] = {
        threadId: event.threadId,
        provider: thread.provider,
        inputTokens: event.payload.inputTokens ?? 0,
        outputTokens: event.payload.outputTokens ?? 0,
        cachedInputTokens: event.payload.cachedInputTokens ?? 0,
        updatedAt: event.timestamp,
      };
      this.#stageResearchTrajectory({
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
      this.#discardResearchTurn(event.turnId);
      thread.status = 'failed';
      const previous = this.#state.timeline.findLast(
        (item) => item.threadId === event.threadId && item.kind === 'error',
      );
      // Providers can repeat the same failure notice; one card per distinct message is enough.
      if (previous?.turnId === event.turnId && previous.text === event.payload.message) return;
      this.#appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'error',
        title: 'Provider error',
        text: event.payload.message,
        status: 'failed',
        timestamp: event.timestamp,
      });
      return;
    }
    if (event.type === 'completion') {
      this.#pendingQuestions.delete(event.threadId);
      this.#completeRunningActivities(event.threadId, event.turnId);
      thread.status = event.payload.status === 'failed' ? 'failed' : 'idle';
      if (
        event.payload.status === 'failed' &&
        !this.#state.timeline.some(
          (item) => item.turnId === event.turnId && item.kind === 'error',
        )
      ) {
        // A failed turn must never end silently: if the provider gave no reason, say so.
        this.#appendTimeline(event.threadId, {
          id: randomUUID(),
          turnId: event.turnId,
          kind: 'error',
          title: 'Turn did not complete',
          text: 'The provider ended this turn without completing it. Check the provider account (sign-in, usage limits) and try again.',
          status: 'failed',
          timestamp: event.timestamp,
        });
      }
      if (event.payload.status === 'completed') this.#completeResearchTurn(event.turnId);
      else this.#discardResearchTurn(event.turnId);
    }
  }

  async #authorizeProviderRequest(
    event: Extract<ThreadEventEnvelope, { type: 'approval' }>,
  ): Promise<void> {
    this.#taintResearchTurn(event.turnId);
    const approvalId = randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    this.#state.approvals.push({
      id: approvalId,
      threadId: event.threadId,
      callId: event.payload.requestId,
      kind: 'native_tool',
      title: event.payload.title,
      summary: event.payload.description,
      target: event.provider,
      reversible: false,
      expiresAt,
      status: 'pending',
    });
    this.#appendTimeline(event.threadId, {
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
    const timeout = setTimeout(() => {
      this.#pendingApprovals.delete(approvalId);
      this.#setApprovalStatus(approvalId, 'expired');
      void this.#runtime
        ?.respondToRequest(event.threadId, {
          requestId: event.payload.requestId,
          choiceId: 'deny',
        })
        .catch(() => undefined);
    }, 120_000);
    this.#pendingApprovals.set(approvalId, {
      resolve: () => undefined,
      timeout,
      kind: 'provider',
      threadId: event.threadId,
      turnId: event.turnId,
      requestId: event.payload.requestId,
    });
    this.#commit();
  }

  async #authorizeGatewayAction(
    request: GatewayApprovalRequest,
    signal?: AbortSignal,
  ): Promise<{ approved: boolean }> {
    this.#taintResearchTurn(request.turnId);
    const approvalId = randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const connector = /^(mail|drive|docs|sheets|slides|slack)_/.test(request.tool.name);
    const upload = /upload/.test(request.tool.name);
    const dataLeaving = summarizeDataLeaving(request.arguments, request.tool.name);
    const dataLabel =
      dataLeaving && request.tool.name === 'computer_action'
        ? 'Text or keys used in this action'
        : undefined;
    const capabilityBound = ['computer_action', 'browser_action', 'browser_upload'].includes(
      request.tool.name,
    );
    const trustedTarget = capabilityBound
      ? this.#browserCapabilitySink?.trustedApprovalTarget(request.tool.name, request.arguments)
      : undefined;
    if (capabilityBound && !trustedTarget) return { approved: false };
    const connectorApp = connector ? connectorAppForTool(request.tool.name) : undefined;
    const connectorSelector =
      connector && typeof request.arguments.account_id === 'string'
        ? request.arguments.account_id
        : undefined;
    const pinnedConnectionId =
      connectorApp && connectorSelector
        ? this.connectionIdForAction(connectorApp, connectorSelector)
        : undefined;
    const pinnedGeneration = connectorApp
      ? (this.#connectorGenerations.get(connectorApp) ?? 0)
      : undefined;
    if (connector && (!connectorApp || !connectorSelector || !pinnedConnectionId)) {
      return { approved: false };
    }
    const account = connector
      ? this.#connectorAccountLabel(request.arguments.account_id)
      : undefined;
    if (this.computerTrust() === 'auto') {
      if (
        connectorApp &&
        connectorSelector &&
        pinnedConnectionId &&
        pinnedGeneration !== undefined
      ) {
        this.#approvedConnectorBindings.set(request.id, {
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
      this.#trajectory?.record({
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
      this.#stageRawResearchEvent({
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
    this.#state.approvals.push({
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
      expiresAt,
      status: 'pending',
    });
    this.#appendTimeline(request.threadId, {
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
    this.#commit();
    return await new Promise((resolve) => {
      const finish = (decision: 'allow' | 'deny' | 'cancel'): void => {
        signal?.removeEventListener('abort', abort);
        const connectionUnchanged =
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId &&
          pinnedGeneration !== undefined
            ? this.connectionIdForAction(connectorApp, connectorSelector) ===
                pinnedConnectionId &&
              (this.#connectorGenerations.get(connectorApp) ?? 0) === pinnedGeneration
            : true;
        if (
          decision === 'allow' &&
          connectionUnchanged &&
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId
        ) {
          this.#approvedConnectorBindings.set(request.id, {
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
          this.#approvedConnectorBindings.delete(request.id);
        }
        resolve({ approved: decision === 'allow' && connectionUnchanged });
      };
      const abort = (): void => {
        this.#pendingApprovals.delete(approvalId);
        this.#setApprovalStatus(approvalId, 'expired');
        finish('cancel');
      };
      const timeout = setTimeout(abort, 120_000);
      this.#pendingApprovals.set(approvalId, {
        resolve: finish,
        timeout,
        kind: 'gateway',
        threadId: request.threadId,
        turnId: request.turnId,
        requestId: request.id,
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }

  #activeTurnId(threadId: string): string | undefined {
    if (!this.#runningTurns.has(threadId)) return undefined;
    const thread = this.#state.threads.find(({ id }) => id === threadId);
    return thread ? this.#workspaceLeases.get(thread.workspace) : undefined;
  }

  #revokeApprovalsForTurn(threadId: string, turnId: string): void {
    for (const [approvalId, pending] of [...this.#pendingApprovals]) {
      if (pending.threadId === threadId && pending.turnId === turnId) {
        this.#revokeApproval(approvalId, pending);
      }
    }
    for (const [approvalId, binding] of this.#approvedConnectorBindings) {
      if (binding.threadId === threadId && binding.turnId === turnId) {
        this.#approvedConnectorBindings.delete(approvalId);
      }
    }
  }

  #revokeApproval(approvalId: string, pending: PendingApproval): void {
    clearTimeout(pending.timeout);
    this.#pendingApprovals.delete(approvalId);
    if (pending.requestId) this.#approvedConnectorBindings.delete(pending.requestId);
    const approval = this.#state.approvals.find(({ id }) => id === approvalId);
    if (approval?.status === 'pending') approval.status = 'expired';
    this.#stageApprovalDecision(
      approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      'expired',
    );
    if (pending.kind === 'provider' && pending.requestId) {
      void this.#runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve('cancel');
  }

  #stageApprovalDecision(
    approvalId: string,
    context: { threadId: string; turnId: string },
    decision: 'approved' | 'denied' | 'expired',
  ): void {
    const approval = this.#state.approvals.find(({ id }) => id === approvalId);
    this.#stageRawResearchEvent({
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

  #releaseTurn(threadId: string): void {
    const thread = this.#state.threads.find(({ id }) => id === threadId);
    this.#runningTurns.delete(threadId);
    if (thread) this.#workspaceLeases.delete(thread.workspace);
    this.#drainQueue();
  }

  #drainQueue(): void {
    if (this.#runningTurns.size >= 4) return;
    const nextIndex = this.#queuedTurns.findIndex((turn) => {
      const thread = this.#state.threads.find(({ id }) => id === turn.threadId);
      return thread && !this.#workspaceLeases.has(thread.workspace);
    });
    if (nextIndex < 0) return;
    const [next] = this.#queuedTurns.splice(nextIndex, 1);
    if (next) this.#startTurn(next);
    if (this.#runningTurns.size < 4) this.#drainQueue();
  }

  #completeRunningActivities(threadId: string, turnId: string): void {
    for (const item of this.#state.timeline) {
      if (item.threadId === threadId && item.turnId === turnId && item.status === 'running') {
        item.status = 'complete';
      }
    }
  }

  #appendTimeline(
    threadId: string,
    item: Omit<TimelineItemView, 'threadId' | 'sequence'>,
  ): void {
    const sequence =
      this.#state.timeline.reduce(
        (highest, candidate) =>
          candidate.threadId === threadId ? Math.max(highest, candidate.sequence) : highest,
        0,
      ) + 1;
    if (item.turnId) {
      this.#stageRawResearchEvent({
        threadId,
        turnId: item.turnId,
        eventType: `timeline.${item.kind}`,
        sequence,
        data: item,
        occurredAt: item.timestamp,
        sourceEventId: item.id,
      });
    }
    this.#state.timeline.push({ ...item, threadId, sequence });
    this.#trajectory?.record({
      type: `timeline_${item.kind}`,
      threadId,
      turnId: item.turnId,
      item: structuredClone(item),
    });
  }

  #setApprovalStatus(id: string, status: ApprovalView['status']): void {
    const approval = this.#state.approvals.find((candidate) => candidate.id === id);
    if (approval) approval.status = status;
    this.#commit();
  }

  #updateConnection(
    id: ConnectionView['id'],
    patch: Partial<Omit<ConnectionView, 'id' | 'label'>>,
  ): void {
    const connection = this.#state.connections.find((candidate) => candidate.id === id);
    if (!connection) throw new Error(`Unknown connection ${id}.`);
    Object.assign(connection, patch);
  }

  #currentIdentityKey(): string | undefined {
    const status = this.#identity.status();
    return status.state === 'signed_in' && status.email
      ? status.email.trim().toLowerCase()
      : undefined;
  }

  async #clearResearchForIdentityBoundary(): Promise<void> {
    const inFlight = this.#researchSync;
    this.#researchGeneration += 1;
    if (this.#researchRetryTimer) {
      clearTimeout(this.#researchRetryTimer);
      this.#researchRetryTimer = undefined;
    }
    for (const staged of this.#researchStaging.values()) {
      staged.tainted = true;
      staged.events = [];
      staged.eventByMessageId.clear();
    }
    await inFlight?.catch(() => undefined);
    this.#researchStaging.clear();
    for (const batch of this.#repository.list<ResearchBatchRecord>('research')) {
      if (batch.batchId) this.#repository.remove('research', batch.batchId);
    }
    for (const sync of this.#repository.list<ResearchSyncRecord>('research_sync')) {
      if (sync.batchId) this.#repository.remove('research_sync', sync.batchId);
    }
    delete this.#state.researchIdentity;
    this.#state.capture = { status: 'not_consented', pendingCount: 0 };
  }

  #lockConnections(detail: string): void {
    for (const connection of this.#state.connections) {
      if (!connection.connectionId) continue;
      connection.status = 'error';
      connection.detail = detail;
      delete connection.account;
    }
  }

  async #reconcileIdentityBoundState(): Promise<void> {
    if (this.#fakeServices) return;
    const storedBatches = this.#researchBatches();
    if (!this.#state.researchIdentity && storedBatches.length > 0) {
      // Old local-only builds predate the ownership marker. Fail private: retain those
      // batches locally and mark them ineligible for any future cloud sync.
      this.#state.researchIdentity = LOCAL_RESEARCH_IDENTITY;
      for (const batch of storedBatches) {
        if (batch.syncEligible === false) continue;
        this.#repository.put('research', batch.batchId, { ...batch, syncEligible: false });
      }
    }
    const identity = this.#currentIdentityKey();
    if (!identity) {
      if (
        this.#cloud.configured &&
        this.#state.researchIdentity !== LOCAL_RESEARCH_IDENTITY &&
        (this.#state.researchIdentity || storedBatches.length)
      ) {
        this.#state.capture = {
          status: 'not_consented',
          pendingCount: this.#state.capture.pendingCount,
          ...(this.#state.capture.promptReviewedVersion
            ? { promptReviewedVersion: this.#state.capture.promptReviewedVersion }
            : {}),
        };
      }
      this.#lockConnections('Sign in with the account that created this grant to manage it.');
      return;
    }
    if (this.#state.researchIdentity === LOCAL_RESEARCH_IDENTITY) {
      // Existing local captures stay local-only. New captures can sync under the
      // explicitly signed-in identity covered by the same reviewed consent.
      this.#state.researchIdentity = identity;
    } else if (this.#state.researchIdentity && this.#state.researchIdentity !== identity) {
      if (storedBatches.some(({ batchId }) => !this.#researchBatchSynced(batchId))) {
        this.#blockResearchCapture(
          'This Mac has unsynced research for another Sia account. Sign in with that account or delete its local research before continuing.',
        );
        this.#lockConnections('This grant belongs to another Sia cloud account.');
        return;
      }
      await this.#clearResearchForIdentityBoundary();
    }
    const pendingGoogleUpgrades = new Set<string>();
    for (const connection of this.#state.connections) {
      if (!connection.connectionId) continue;
      const owner = this.#state.connectionOwners[connection.id];
      if (owner !== identity) {
        connection.status = 'error';
        delete connection.account;
        connection.detail = owner
          ? 'This grant belongs to another Sia cloud account.'
          : 'This legacy grant has no verifiable account owner; reconnect is blocked.';
        continue;
      }
      try {
        const result = await this.#cloud.connectionStatus(connection.id);
        const remote = result.connections.find(({ id }) => id === connection.connectionId);
        if (remote?.status === 'connected') {
          connection.status = 'connected';
          if (remote.accountLabel) connection.account = remote.accountLabel;
          if (isGoogleConnection(connection.id) && remote.access) {
            connection.googleAccess = remote.access;
          }
          if (connection.upgradeConnectionId) {
            pendingGoogleUpgrades.add(connection.upgradeConnectionId);
          }
          delete connection.detail;
        } else {
          connection.status = 'error';
          connection.detail =
            'This saved grant is not connected. Disconnect it before starting a new grant.';
        }
      } catch {
        connection.status = 'error';
        connection.detail = 'Sia could not verify this saved grant. Try again when online.';
      }
    }
    for (const upgradeId of pendingGoogleUpgrades) void this.#pollGoogleUpgrade(upgradeId);
  }

  #connectorAccountLabel(accountId: unknown): string | undefined {
    if (typeof accountId !== 'string') return undefined;
    const connection = this.#state.connections.find(
      (candidate) => candidate.connectionId === accountId || candidate.id === accountId,
    );
    return connection?.account;
  }

  #requireAgent(id: string): AgentView {
    const agent = this.#state.agents.find((candidate) => candidate.id === id);
    if (!agent) throw new Error('Agent not found.');
    return agent;
  }

  #providerReadinessError(providerId: ProviderId, model?: string): string | undefined {
    const provider = this.#providers.find(({ id }) => id === providerId);
    if (!provider) return 'Provider status is unavailable. Check again before starting.';
    if (
      provider.status === 'ready' &&
      model !== undefined &&
      provider.models?.length &&
      !provider.models.some(({ id }) => id === model)
    ) {
      return provider.models.length === 1
        ? `${provider.label} model must be ${provider.models[0]!.id} in this release.`
        : `${provider.label} does not currently offer model ${model}.`;
    }
    if (
      provider.status === 'ready' &&
      model !== undefined &&
      !provider.models?.length &&
      model !== provider.model
    ) {
      return `${provider.label} model must be ${provider.model} in this release.`;
    }
    if (provider.status === 'ready') return undefined;
    return `${provider.label} is not ready (${provider.status}). ${provider.detail}`;
  }

  #requireReadyProvider(providerId: ProviderId, model?: string): ProviderView {
    const error = this.#providerReadinessError(providerId, model);
    if (error) throw new Error(error);
    return this.#providers.find(({ id }) => id === providerId)!;
  }

  #requireSignedInReleaseAccount(): void {
    if (!this.#releaseAccessLocked()) return;
    throw new Error('Sign in to Sia to continue.');
  }

  #releaseAccessLocked(): boolean {
    return (
      this.#cloud.configured &&
      (this.#signOutInProgress || this.#identity.status().state !== 'signed_in')
    );
  }

  #providerForModel(model: string): ProviderId {
    const matches = this.#providers.filter(
      (provider) =>
        provider.status === 'ready' &&
        (provider.model === model ||
          provider.models?.some((candidate) => candidate.id === model)),
    );
    if (matches.length !== 1) {
      throw new Error('Choose an available model before saving this agent.');
    }
    return matches[0]!.id;
  }

  #leastUsedHue(): number {
    const counts = [0, 0, 0, 0];
    for (const agent of this.#state.agents) {
      const slot =
        Number.isInteger(agent.hue) && agent.hue! >= 0 && agent.hue! <= 3 ? agent.hue! : 0;
      counts[slot] = (counts[slot] ?? 0) + 1;
    }
    return counts.reduce((best, count, index) => (count < counts[best]! ? index : best), 0);
  }

  #requireThread(id: string): ThreadView {
    const thread = this.#state.threads.find((candidate) => candidate.id === id);
    if (!thread) throw new Error('Thread not found.');
    return thread;
  }

  #requireIdleThread(id: string, action: string): ThreadView {
    const thread = this.#requireThread(id);
    if (
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting' ||
      this.#runningTurns.has(id) ||
      this.#queuedTurns.some(({ threadId }) => threadId === id)
    ) {
      throw new Error(`Stop the active task before you ${action}.`);
    }
    return thread;
  }

  #requireSchedule(id: string): ScheduleView {
    const schedule = this.#state.schedules.find((candidate) => candidate.id === id);
    if (!schedule) throw new Error('Scheduled task not found.');
    return schedule;
  }

  #requireWorkspaceOperations(): NonNullable<ControllerOptions['workspaceOperations']> {
    if (!this.#workspaceOperations) {
      throw new Error('Local workspace operations are unavailable in this build.');
    }
    return this.#workspaceOperations;
  }

  #defaultReasoningEffort(providerId: ProviderId, modelId: string): string | undefined {
    return this.#providers
      .find(({ id }) => id === providerId)
      ?.models?.find(({ id }) => id === modelId)?.defaultReasoningEffort;
  }

  #pruneAttachmentGrants(): void {
    const now = Date.now();
    for (const [id, grant] of this.#attachmentGrants) {
      if (grant.expiresAt <= now) this.#attachmentGrants.delete(id);
    }
  }

  #recover(state: PersistedState): PersistedState {
    const recovered = structuredClone(state);
    recovered.connectionOwners = recovered.connectionOwners ?? {};
    recovered.schedules = (recovered.schedules ?? []).map((schedule) => {
      const runHistory = (schedule.runHistory ?? (schedule.lastRun ? [schedule.lastRun] : []))
        .filter((run, index, history) => history.findIndex(({ id }) => id === run.id) === index)
        .slice(0, SCHEDULE_RUN_HISTORY_LIMIT);
      return {
        ...schedule,
        runCount: schedule.runCount ?? 0,
        ...(runHistory.length > 0 ? { runHistory } : {}),
      };
    });
    recovered.cloudFeatures =
      recovered.cloudFeatures ?? structuredClone(INITIAL_STATE.cloudFeatures);
    recovered.preferences = recovered.preferences ?? { completionSound: false };
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
    recovered.approvals = recovered.approvals.map((approval) =>
      approval.status === 'pending' ? { ...approval, status: 'expired' } : approval,
    );
    const recoveredConnections = new Map(
      recovered.connections.map((connection) => [connection.id, connection]),
    );
    recovered.connections = EMPTY_CONNECTIONS.map((fallback) => {
      const connection = recoveredConnections.get(fallback.id) ?? fallback;
      return connection.status === 'connecting'
        ? {
            ...connection,
            status: 'error',
            detail: 'Connection setup was interrupted. Verify or disconnect this saved grant.',
          }
        : connection;
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

  #commit(deferStreamDelta = false): void {
    this.#revision += 1;
    if (deferStreamDelta) {
      if (!this.#streamCommitTimer) {
        this.#streamCommitTimer = setTimeout(() => {
          this.#streamCommitTimer = undefined;
          this.#persist();
          this.#emit();
        }, 50);
        this.#streamCommitTimer.unref();
      }
      return;
    }
    this.#cancelStreamCommit();
    this.#persist();
    this.#emit();
  }

  #cancelStreamCommit(): void {
    if (!this.#streamCommitTimer) return;
    clearTimeout(this.#streamCommitTimer);
    this.#streamCommitTimer = undefined;
  }

  #persist(): void {
    const browser = { ...this.#state.browser };
    // Chrome window titles and native ids are process-local chooser data. Keep them out of
    // durable storage even though the rest of the application state is encrypted at rest.
    delete browser.availableWindows;
    this.#repository.put('desktop', 'state', { ...this.#state, browser });
  }

  #emit(): void {
    const event: DesktopPushEvent = { type: 'snapshot', snapshot: this.snapshot() };
    for (const listener of this.#listeners) listener(event);
  }
}

async function settleBeforeShutdown(
  operation: PromiseLike<unknown> | undefined,
  deadline: number,
): Promise<void> {
  if (!operation) return;
  const remaining = Math.max(0, deadline - Date.now());
  if (remaining === 0) return;
  let timeout: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.resolve(operation).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, remaining);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

function summarizeTitle(value: string): string {
  const words = value.trim().replace(/\s+/g, ' ').split(' ').slice(0, 7).join(' ');
  return words.length > 52 ? `${words.slice(0, 49)}...` : words || 'New thread';
}

function isStreamingDelta(event: ThreadEventEnvelope): boolean {
  return (
    (event.type === 'message' || event.type === 'reasoning') && event.payload.delta === true
  );
}

function normalizeWorkspace(value: string): string {
  return normalize(resolve(value));
}

function workspaceSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'agent';
}

function modelRouteKey(provider: ProviderId, model: string): string {
  return `${provider}\u0000${model}`;
}

function legacyHarnessForProvider(
  provider: ProviderId,
): import('../shared/bridge.js').HarnessId {
  if (provider === 'codex') return 'codex_app_server';
  if (provider === 'claude') return 'claude_code';
  if (provider === 'meta') return 'sia_direct';
  return 'legacy_acp';
}

function legacyResolvedExecutionTarget(
  thread: Pick<ThreadView, 'provider' | 'model' | 'harnessId'>,
): NonNullable<ThreadView['resolvedExecutionTarget']> {
  const route = legacyModelRoute(thread.provider, thread.model);
  const storedHarness = (thread as { harnessId?: string }).harnessId;
  const harnessId =
    storedHarness === 'sia_default'
      ? 'sia_direct'
      : storedHarness &&
          [
            'codex_app_server',
            'claude_code',
            'legacy_acp',
            'opencode_acp',
            'pi_rpc',
            'sia_direct',
          ].includes(storedHarness)
        ? (storedHarness as NonNullable<ThreadView['harnessId']>)
        : legacyHarnessForProvider(thread.provider);
  return { ...route, harnessId, resolutionSource: 'legacy_default' };
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function safeResourceLabel(resourceJson: string, kind: ApprovalView['kind']): string {
  try {
    const value = JSON.parse(resourceJson) as Record<string, unknown>;
    const window = typeof value.window_title === 'string' ? value.window_title : undefined;
    if (kind === 'browser_attach') {
      const browser = typeof value.browser === 'string' ? value.browser : 'selected browser';
      return window ? `${browser}, ${window}` : `${browser} profile`;
    }
    const app =
      typeof value.app_name === 'string'
        ? value.app_name
        : typeof value.application === 'string'
          ? value.application
          : undefined;
    if (app && window) return `${app}, ${window}`;
    if (app) return app;
    if (window) return window;
    return kind === 'foreground_takeover'
      ? 'Selected application window'
      : 'Protected computer resource';
  } catch {
    return kind === 'browser_attach'
      ? 'Selected browser profile'
      : 'Protected computer resource';
  }
}

function computerApprovalPresentation(
  adapterId: string,
  summary: string,
): { kind: ApprovalView['kind']; title: string } {
  const identity = `${adapterId} ${summary}`.toLowerCase();
  if (identity.includes('existing_profile') || identity.includes('browser_prepare')) {
    return { kind: 'browser_attach', title: 'Attach to signed-in browser' };
  }
  if (identity.includes('foreground') || identity.includes('bring_to_front')) {
    return { kind: 'foreground_takeover', title: 'Allow foreground control' };
  }
  if (
    identity.includes('upload') ||
    identity.includes('download') ||
    identity.includes('file')
  ) {
    return { kind: 'file_upload', title: 'Allow local file access' };
  }
  return { kind: 'native_tool', title: 'Allow computer access' };
}

/** Every Chrome process, best-scored first; several can run at once (profiles, dev instances). */
function findChromeCandidates(value: unknown): { pid: number }[] {
  const candidates = collectRecords(value)
    .map((candidate) => {
      const name = stringField(candidate, ['name', 'application_name', 'applicationName']);
      const bundleId = stringField(candidate, [
        'bundle_id',
        'bundleId',
        'bundle_identifier',
        'bundleIdentifier',
      ]);
      const pid = Number(candidate.pid);
      const normalizedName = name?.trim().toLowerCase() ?? '';
      const normalizedBundleId = bundleId?.trim().toLowerCase() ?? '';
      const helper = /\b(helper|crashpad)\b/.test(normalizedName);
      const score =
        normalizedBundleId === 'com.google.chrome'
          ? 4
          : normalizedName === 'google chrome'
            ? 3
            : normalizedBundleId.startsWith('com.google.chrome.') && !helper
              ? 2
              : normalizedName.includes('chrome') && !helper
                ? 1
                : 0;
      const active = candidate.active === true;
      return { candidate, pid, score, active };
    })
    .filter(({ pid, score }) => Number.isSafeInteger(pid) && pid > 0 && score > 0)
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return right.score - left.score;
    });
  const seen = new Set<number>();
  return candidates
    .filter(({ pid }) => (seen.has(pid) ? false : (seen.add(pid), true)))
    .map(({ pid }) => ({ pid }));
}

function preferredChromeWindows(value: unknown): BrowserWindowView[] {
  const windows = collectRecords(value)
    .map((record) => ({
      id: Number(record.window_id ?? record.id),
      minimized: record.minimized === true || record.is_minimized === true,
      title: typeof record.title === 'string' ? record.title : '',
      visible: record.is_on_screen !== false,
      bounds: isRecord(record.bounds)
        ? {
            width: Number(record.bounds.width),
            height: Number(record.bounds.height),
          }
        : undefined,
      zIndex: Number(record.z_index ?? record.zIndex ?? 0),
    }))
    .filter(({ id, title, minimized, bounds }) => {
      const hasUsableBounds =
        !bounds ||
        (!Number.isFinite(bounds.width) && !Number.isFinite(bounds.height)) ||
        (bounds.width >= 500 && bounds.height >= 300);
      // The driver's is_on_screen flag is unreliable for windows on other Spaces and can
      // briefly read false for real visible windows, so it only affects ordering below;
      // background window operations address windows by id and do not need visibility.
      return (
        Number.isSafeInteger(id) &&
        id > 0 &&
        !minimized &&
        hasUsableBounds &&
        !/^allow remote debugging\?$/i.test(title.trim())
      );
    })
    .sort((left, right) => {
      if (left.visible !== right.visible) return left.visible ? -1 : 1;
      if (Boolean(left.title) !== Boolean(right.title)) return left.title ? -1 : 1;
      return right.zIndex - left.zIndex || left.id - right.id;
    });
  return windows.map(({ id, minimized, title }, index) => {
    const safeTitle = sanitizeChromeWindowTitle(title);
    const detail = [safeTitle, minimized ? 'Minimized' : undefined]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    return {
      id,
      label: `Chrome window ${index + 1}`,
      ...(detail ? { detail } : {}),
    };
  });
}

function sanitizeChromeWindowTitle(value: string): string | undefined {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized) return undefined;
  return sanitized.slice(0, 160);
}

async function defaultRunCommand(file: string, args: readonly string[]): Promise<string> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { stdout } = await promisify(execFile)(file, [...args]);
  return stdout;
}

async function chromeDebugPortOwnerPid(
  runCommand: (file: string, args: readonly string[]) => Promise<string>,
): Promise<number | undefined> {
  try {
    const stdout = await runCommand('lsof', ['-nP', '-iTCP:9222', '-sTCP:LISTEN', '-Fp']);
    const match = stdout.split('\n').find((line) => line.startsWith('p'));
    const pid = match ? Number(match.slice(1)) : Number.NaN;
    return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

function browserAttachmentError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Chrome attachment failed.';
  if (message.includes('browser_binding_ambiguous')) {
    return 'Chrome could not distinguish that window from another open window. Choose a window showing a unique page, or close the duplicate and retry.';
  }
  if (message.includes('browser_reconnect_exhausted')) {
    return 'Chrome is waiting for permission. Click Allow in the “Allow remote debugging?” prompt, then try again. This is a one-time Chrome security step.';
  }
  if (message.includes('browser_wrong_target_refused')) {
    return 'Chrome refused the connection. One-time fix: open chrome://inspect in Chrome, tick “Allow remote debugging” (port 9222), restart Chrome — after that Sia connects automatically. Or click Allow on Chrome’s prompt when it appears.';
  }
  return message;
}

function collectRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of ['apps', 'windows', 'elements', 'structuredContent', 'data']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
    if (isRecord(nested)) {
      const records = collectRecords(nested);
      if (records.length) return records;
    }
  }
  return [value];
}

function collectHttpOrigins(value: unknown): string[] {
  const origins = new Set<string>();
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    if (!isRecord(current)) return;
    const targetId =
      stringField(current, ['target_id', 'targetId', 'target', 'page_id', 'pageId']) ??
      inheritedTarget;
    const tabId =
      stringField(current, ['tab_id', 'tabId', 'tab', 'id']) ??
      (targetId ? stringField(current, ['page_id', 'pageId']) : undefined);
    if (tabId || targetId) {
      const candidate =
        stringField(current, ['url', 'origin', 'page_url', 'pageUrl', 'location']) ?? undefined;
      if (candidate) {
        try {
          const url = new URL(candidate);
          if (url.protocol === 'https:' || url.protocol === 'http:') origins.add(url.origin);
        } catch {
          // Ignore non-web and malformed tab locations.
        }
      }
    }
    for (const [key, nested] of Object.entries(current)) {
      if (
        depth < 2 ||
        [
          'tabs',
          'targets',
          'pages',
          'data',
          'structuredContent',
          'structured_content',
        ].includes(key)
      ) {
        visit(nested, targetId, depth + 1);
      }
    }
  };
  visit(value);
  return [...origins].sort();
}

function findBrowserTarget(value: unknown): { targetId: string; tabId: string } | undefined {
  let found: { targetId: string; tabId: string } | undefined;
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (found || depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    if (!isRecord(current)) return;
    const targetId =
      stringField(current, ['target_id', 'targetId', 'target', 'page_id', 'pageId']) ??
      inheritedTarget;
    const tabId = stringField(current, ['tab_id', 'tabId', 'tab']);
    if (targetId && tabId) {
      found = { targetId, tabId };
      return;
    }
    for (const nested of Object.values(current)) visit(nested, targetId, depth + 1);
  };
  visit(value);
  return found;
}

function directBrowserUrl(value: string): URL {
  const input = value.trim();
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Enter a valid website address.');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS website without credentials in the address.');
  }
  return url;
}

function stringField(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isResearchBatchRecord(value: unknown): value is ResearchBatchRecord {
  if (!isRecord(value) || typeof value.batchId !== 'string') return false;
  if (!Array.isArray(value.events) || !isRecord(value.consent)) return false;
  return (
    typeof value.consent.version === 'string' &&
    typeof value.consent.acceptedAt === 'string' &&
    value.consent.purpose === 'research_evaluation_debugging'
  );
}

const SECRET_SHAPED_TEXT = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|xai|meta|composio)[-_][A-Za-z0-9_-]{16,}\b/i,
];

function containsSecretShapedText(value: string): boolean {
  return SECRET_SHAPED_TEXT.some((pattern) => pattern.test(value));
}

function humanizeToolName(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const RUNTIME_TOOL_LABELS: Record<string, string> = {
  websearch: 'Searching the web',
  browser_tabs: 'Checking browser tabs',
  browser_snapshot: 'Reading the page',
  browser_navigate: 'Opening a page',
  browser_action: 'Acting in the browser',
  browser_upload: 'Uploading a file',
  computer_list: 'Checking open apps',
  computer_open_app: 'Opening Apple Notes',
  computer_snapshot: 'Looking at a window',
  computer_action: 'Acting on the Mac',
};

function runtimeToolTitle(name: string, presentation?: ActivityPresentationView): string {
  if (!presentation) {
    const label = RUNTIME_TOOL_LABELS[name.replace(/[.-]/g, '_').toLowerCase()];
    return label ?? humanizeToolName(name);
  }
  if (presentation.kind === 'command') return presentation.command;
  if (presentation.kind === 'file_change') {
    const count = presentation.files.length;
    if (count === 0) return 'Reviewing changes';
    return count === 1 ? `Changed ${presentation.files[0]!.path}` : `Changed ${count} files`;
  }
  if (presentation.kind === 'web_search') {
    return presentation.query ? `Searched for ${presentation.query}` : 'Searched the web';
  }
  if (presentation.kind === 'image') return `Viewed ${basename(presentation.path)}`;
  if (presentation.kind === 'review') return presentation.review || 'Code review';
  if (presentation.kind === 'compaction') return 'Compacted context';
  return humanizeToolName(name);
}

function mapRuntimePresentation(
  presentation: Extract<ThreadEventEnvelope, { type: 'tool' }>['payload']['presentation'],
): ActivityPresentationView | undefined {
  if (!presentation) return undefined;
  if (presentation.kind === 'command') {
    return {
      kind: 'command',
      command: presentation.command,
      ...(presentation.cwd ? { cwd: presentation.cwd } : {}),
      ...(presentation.output ? { output: presentation.output } : {}),
      ...(presentation.exitCode !== undefined ? { exitCode: presentation.exitCode } : {}),
      ...(presentation.durationMs !== undefined ? { durationMs: presentation.durationMs } : {}),
      ...(presentation.processId !== undefined ? { processId: presentation.processId } : {}),
    };
  }
  if (presentation.kind === 'file_change') {
    return {
      kind: 'file_change',
      files: presentation.files.map((file) => ({
        path: file.path,
        change: file.change,
        ...(file.diff ? { diff: file.diff } : {}),
      })),
    };
  }
  if (presentation.kind === 'web_search') {
    return {
      kind: 'web_search',
      ...(presentation.query ? { query: presentation.query } : {}),
      sources: presentation.sources.map((source) => ({
        url: source.url,
        ...(source.title ? { title: source.title } : {}),
      })),
    };
  }
  return structuredClone(presentation);
}

function connectorAppForTool(value: string): ConnectionView['id'] | undefined {
  if (value.startsWith('mail_')) return 'gmail';
  if (value.startsWith('drive_')) return 'drive';
  if (value.startsWith('docs_')) return 'docs';
  if (value.startsWith('sheets_')) return 'sheets';
  if (value.startsWith('slides_')) return 'slides';
  if (value.startsWith('slack_')) return 'slack';
  return undefined;
}

function summarizeActionTarget(
  argumentsValue: Readonly<Record<string, unknown>>,
  toolName?: string,
): string {
  if (toolName === 'schedule_create') {
    const firstRun =
      typeof argumentsValue.first_run_at === 'string'
        ? ` starting ${argumentsValue.first_run_at}`
        : '';
    return `${String(argumentsValue.cadence)}: ${String(argumentsValue.task)}${firstRun}`;
  }
  if (toolName === 'schedule_update' || toolName === 'schedule_delete') {
    return `schedule ${String(argumentsValue.schedule_id)}`;
  }
  if (toolName === 'browser_upload') {
    return `${String(argumentsValue.origin)}, file input ${String(argumentsValue.element_ref)}`;
  }
  if (toolName === 'browser_action') {
    return `${String(argumentsValue.origin)}, ${String(argumentsValue.action)}${argumentsValue.element_ref ? ` element ${String(argumentsValue.element_ref)}` : ''}`;
  }
  if (toolName === 'browser_navigate') return `navigate to ${String(argumentsValue.url)}`;
  if (toolName === 'drive_share') {
    return `Drive resource ${String(argumentsValue.resource_id)} with ${String(argumentsValue.recipient)} as ${String(argumentsValue.role)}`;
  }
  if (toolName === 'computer_action') {
    return `${String(argumentsValue.app_name)}, window ${String(argumentsValue.window_id)}: ${String(argumentsValue.action)}${argumentsValue.element_ref ? ` element ${String(argumentsValue.element_ref)}` : ''}`;
  }
  const to = stringArray(argumentsValue.to);
  if (to.length > 0) return `email recipients: ${to.join(', ')}`;
  const appName = argumentsValue.app_name;
  const windowId = argumentsValue.window_id;
  if (typeof appName === 'string' && typeof windowId === 'string') {
    return `${appName}, window ${windowId}`;
  }
  for (const key of [
    'url',
    'origin',
    'recipient',
    'channel_id',
    'resource_id',
    'document_id',
    'spreadsheet_id',
    'presentation_id',
    'title',
    'parent_id',
    'tab_id',
    'window_id',
    'account_id',
  ]) {
    const value = argumentsValue[key];
    if (typeof value === 'string' && value.length > 0)
      return `${key.replaceAll('_', ' ')}: ${value}`;
  }
  return 'Exact action shown above';
}

function validScheduleTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid schedule time.');
  return date.toISOString();
}

function validScheduleRunLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error('Schedule run limit must be between 1 and 10,000.');
  }
  return value;
}

function scheduleIntervalMs(cadence: ScheduleView['cadence']): number {
  if (cadence === 'hourly') return 60 * 60_000;
  if (cadence === 'daily') return 24 * 60 * 60_000;
  if (cadence === 'weekly') return 7 * 24 * 60 * 60_000;
  return 0;
}

function textAttachmentPreview(
  extension: string,
): { format: 'text' | 'code' | 'diff' | 'csv'; language?: string } | undefined {
  if (extension === '.csv' || extension === '.tsv') {
    return { format: 'csv', language: extension.slice(1).toUpperCase() };
  }
  if (extension === '.diff' || extension === '.patch') {
    return { format: 'diff', language: 'Diff' };
  }
  const languages: Readonly<Record<string, string>> = {
    '.css': 'CSS',
    '.go': 'Go',
    '.html': 'HTML',
    '.js': 'JavaScript',
    '.json': 'JSON',
    '.jsx': 'JSX',
    '.py': 'Python',
    '.rb': 'Ruby',
    '.rs': 'Rust',
    '.sh': 'Shell',
    '.sql': 'SQL',
    '.toml': 'TOML',
    '.ts': 'TypeScript',
    '.tsx': 'TSX',
    '.xml': 'XML',
    '.yaml': 'YAML',
    '.yml': 'YAML',
  };
  if (languages[extension]) return { format: 'code', language: languages[extension] };
  if (['.log', '.md', '.txt'].includes(extension)) return { format: 'text' };
  return undefined;
}

function upsertScheduleRun(
  schedule: ScheduleView,
  run: NonNullable<ScheduleView['lastRun']>,
): void {
  schedule.runHistory = [
    run,
    ...(schedule.runHistory ?? []).filter(({ id }) => id !== run.id),
  ].slice(0, SCHEDULE_RUN_HISTORY_LIMIT);
}

function summarizeDataLeaving(
  argumentsValue: Readonly<Record<string, unknown>>,
  toolName: string,
): string | undefined {
  const lines: string[] = [];
  const to = stringArray(argumentsValue.to);
  const cc = stringArray(argumentsValue.cc);
  if (to.length > 0) lines.push(`To: ${to.join(', ')}`);
  if (cc.length > 0) lines.push(`Cc: ${cc.join(', ')}`);
  if (typeof argumentsValue.subject === 'string') {
    lines.push(`Subject: ${argumentsValue.subject}`);
  }
  if (typeof argumentsValue.body === 'string') {
    lines.push(`Body:\n${argumentsValue.body}`);
  }
  if (typeof argumentsValue.markdown === 'string') {
    lines.push(`Markdown:\n${argumentsValue.markdown}`);
  }
  if (typeof argumentsValue.text === 'string') {
    const action = argumentsValue.action;
    const label =
      toolName === 'slack_post'
        ? 'Slack message'
        : toolName === 'computer_action' && action === 'set'
          ? 'Exact replacement text'
          : 'Text to type';
    lines.push(`${label}:\n${argumentsValue.text}`);
  }
  if (typeof argumentsValue.value === 'string') {
    lines.push(`Value to enter:\n${argumentsValue.value}`);
  }
  if (typeof argumentsValue.recipient === 'string') {
    lines.push(`Recipient: ${argumentsValue.recipient}`);
  }
  if (typeof argumentsValue.role === 'string') lines.push(`Role: ${argumentsValue.role}`);
  if (typeof argumentsValue.resource_id === 'string') {
    lines.push(`Resource: ${argumentsValue.resource_id}`);
  }
  if (typeof argumentsValue.document_id === 'string') {
    lines.push(`Document: ${argumentsValue.document_id}`);
  }
  if (typeof argumentsValue.spreadsheet_id === 'string') {
    lines.push(`Spreadsheet: ${argumentsValue.spreadsheet_id}`);
  }
  if (typeof argumentsValue.presentation_id === 'string') {
    lines.push(`Presentation: ${argumentsValue.presentation_id}`);
  }
  if (typeof argumentsValue.range === 'string') lines.push(`Range: ${argumentsValue.range}`);
  if (Array.isArray(argumentsValue.values)) {
    lines.push(`Values:\n${JSON.stringify(argumentsValue.values)}`);
  }
  if (typeof argumentsValue.thread_id === 'string') {
    lines.push(`Thread: ${argumentsValue.thread_id}`);
  }
  if (typeof argumentsValue.parent_id === 'string') {
    lines.push(`Destination folder: ${argumentsValue.parent_id}`);
  }
  if (typeof argumentsValue.name === 'string') {
    lines.push(`Remote name: ${argumentsValue.name}`);
  }
  if (typeof argumentsValue.title === 'string') {
    lines.push(`Title: ${argumentsValue.title}`);
  }
  for (const key of ['file_path', 'file_paths']) {
    const value = argumentsValue[key];
    if (typeof value === 'string' && value.length > 0) lines.push(`File: ${value}`);
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`Files:\n${value.map(String).join('\n')}`);
    }
  }
  return lines.length > 0 ? lines.join('\n\n') : undefined;
}

function jsonSafeValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return { serializationError: 'The raw event was not JSON-serializable.' };
  }
}

function researchSyncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return 'The encrypted research outbox could not reach AWS.';
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

function expandRawResearchEvents(
  events: readonly RawResearchEventRecord[],
): RawResearchEventRecord[] {
  const expanded: RawResearchEventRecord[] = [];
  for (const event of events) {
    const body = Buffer.from(JSON.stringify(event.payload.data ?? null), 'utf8');
    if (body.byteLength <= MAX_RAW_EVENT_JSON_BYTES) {
      expanded.push(event);
      continue;
    }
    const chunkCount = Math.ceil(body.byteLength / MAX_RAW_EVENT_JSON_BYTES);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      expanded.push({
        ...event,
        id: randomUUID(),
        kind: 'raw.event_chunk',
        payload: {
          schemaVersion: 1,
          threadId: event.payload.threadId,
          turnId: event.payload.turnId,
          eventType: event.payload.eventType,
          eventId: event.id,
          ...(event.payload.sequence === undefined ? {} : { sequence: event.payload.sequence }),
          encoding: 'base64-json',
          chunkIndex,
          chunkCount,
          chunkData: body
            .subarray(
              chunkIndex * MAX_RAW_EVENT_JSON_BYTES,
              (chunkIndex + 1) * MAX_RAW_EVENT_JSON_BYTES,
            )
            .toString('base64'),
        },
      });
    }
  }
  return expanded;
}

function partitionRawResearchEvents(
  events: readonly RawResearchEventRecord[],
): RawResearchEventRecord[][] {
  const partitions: RawResearchEventRecord[][] = [];
  let current: RawResearchEventRecord[] = [];
  let bytes = 0;
  const targetBytes = MAX_LOCAL_RESEARCH_BATCH_BYTES - 256 * 1024;
  for (const event of events) {
    const eventBytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
    if (current.length && bytes + eventBytes > targetBytes) {
      partitions.push(current);
      current = [];
      bytes = 0;
    }
    current.push(event);
    bytes += eventBytes;
  }
  if (current.length) partitions.push(current);
  return partitions;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function attachmentKind(path: string): AttachmentView['kind'] {
  const extension = extname(path).toLocaleLowerCase();
  if (
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff'].includes(
      extension,
    )
  ) {
    return 'image';
  }
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus'].includes(extension)) {
    return 'audio';
  }
  return 'file';
}

function previewImageMimeType(path: string): string | undefined {
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  }[extname(path).toLocaleLowerCase()];
}

function searchExcerpt(value: string, needle: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  const index = compact.toLocaleLowerCase().indexOf(needle);
  if (index < 0) return compact.slice(0, 180);
  const start = Math.max(0, index - 60);
  const end = Math.min(compact.length, index + needle.length + 100);
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`;
}

function extractHttpUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s<>()]+/gi)].map((match) =>
    match[0].replace(/[),.;!?]+$/, ''),
  );
}

function safeUrlHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return 'Link';
  }
}

function isCleanHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol === 'https:' && !url.username && !url.password && !url.hash);
  } catch {
    return false;
  }
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const [core = '', prerelease] = value.replace(/^v/, '').split('-', 2);
    return {
      core: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prerelease?.split('.'),
    };
  };
  const leftVersion = parse(left);
  const rightVersion = parse(right);
  const leftParts = leftVersion.core;
  const rightParts = rightVersion.core;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  for (
    let index = 0;
    index < Math.max(leftVersion.prerelease?.length ?? 0, rightVersion.prerelease?.length ?? 0);
    index += 1
  ) {
    const leftPart = leftVersion.prerelease?.[index];
    const rightPart = rightVersion.prerelease?.[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber;
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

function worktreeLabel(title: string, id: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'thread'}-${id}`;
}
