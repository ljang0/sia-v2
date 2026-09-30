import type { TextSize, ThemePreference } from './display.js';

export type ProviderId = 'codex' | 'meta' | 'grok' | 'gemini' | 'claude';

/** Safe catalog id. Executability still requires an audited runtime registration. */
export type HarnessId = string;

export interface ResolvedExecutionTargetView {
  provider: ProviderId;
  model: string;
  harnessId: HarnessId;
  harnessModelId: string;
  credentialSource: 'provider_subscription' | 'provider_api' | 'sia_managed';
  resolutionSource: 'user' | 'backend_default' | 'legacy_default';
}

export type ProviderStatus =
  'ready' | 'needs_install' | 'needs_login' | 'incompatible' | 'disabled' | 'unavailable';

export interface ProviderSetupProgress {
  phase: 'installing' | 'restarting' | 'signing-in' | 'checking' | 'error';
  message: string;
}

export interface ProviderView {
  id: ProviderId;
  label: string;
  /** Plan wording from the provider catalog, e.g. "ChatGPT plan". */
  plan?: string;
  status: ProviderStatus;
  model: string;
  version?: string;
  account?: string;
  detail: string;
  billing: string;
  restriction?: string;
  models?: ProviderModelView[];
  setup?: ProviderSetupProgress;
  /** Latest plan usage window the provider reported this session. */
  limits?: ProviderUsageLimitView;
}

export interface ProviderUsageLimitView {
  /** 0–100. */
  usedPercent: number;
  /** ISO time the window resets. */
  resetsAt?: string;
  windowMinutes?: number;
  updatedAt: string;
}

export interface ProviderModelView {
  id: string;
  label: string;
  description: string;
  reasoningEfforts: string[];
  defaultReasoningEffort?: string;
}

export interface AgentView {
  id: string;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  /** Backend/catalog harness preference. Automatic resolves when a thread is created. */
  harnessPreference?: { mode: 'automatic' } | { mode: 'explicit'; harnessId: HarnessId };
  /** Optional ElevenLabs voice used for this agent's read-aloud control. */
  voiceId?: string;
  /** Hue slot (0-3) that tints this agent's room; unset falls back to a stable id-derived slot. */
  hue?: number;
  /** Keeps this room near the top of the local room list. */
  pinned?: boolean;
  /** Controls background completion notifications for this room. */
  notificationsEnabled?: boolean;
  threadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ThreadStatus = 'idle' | 'queued' | 'running' | 'waiting' | 'failed';

export interface ThreadView {
  id: string;
  agentId: string;
  title: string;
  provider: ProviderId;
  model: string;
  reasoningEffort?: string;
  workspace: string;
  /** Immutable harness chosen when this thread was created. */
  harnessId?: HarnessId;
  /** Canonical immutable route selected when this thread was created. */
  resolvedExecutionTarget?: ResolvedExecutionTargetView;
  agentRevision: string;
  /** Immutable agent instructions captured when this thread was created. */
  instructionsSnapshot: string;
  agentNameSnapshot: string;
  status: ThreadStatus;
  queueReason?: string;
  archivedAt?: string;
  sourceThreadId?: string;
  unread?: boolean;
  /** Listed first in its agent's conversations. Older saved state has none: unpinned. */
  pinned?: boolean;
  /** Local encrypted composer text that has not been sent. */
  draft?: string;
  interruptedTurnId?: string;
  goal?: ThreadGoalView;
  worktree?: WorktreeView;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadGoalView {
  text: string;
  status: 'running' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeView {
  kind: 'primary' | 'linked';
  sourceWorkspace: string;
  branch?: string;
}

export type AttachmentKind = 'image' | 'audio' | 'file';

export interface AttachmentView {
  id: string;
  name: string;
  kind: AttachmentKind;
  bytes: number;
}

export type AttachmentPreviewView =
  | { kind: 'image'; dataUrl: string }
  | {
      kind: 'text';
      content: string;
      format: 'text' | 'code' | 'diff' | 'csv';
      language?: string;
    }
  | { kind: 'pdf' }
  | { kind: 'unavailable'; detail: string };

export type TimelineItemKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'activity'
  | 'approval'
  | 'question'
  | 'notice'
  | 'error';

export type ActivityPresentationView =
  | {
      kind: 'command';
      command: string;
      cwd?: string | undefined;
      output?: string | undefined;
      exitCode?: number | null | undefined;
      durationMs?: number | null | undefined;
      processId?: string | null | undefined;
    }
  | {
      kind: 'file_change';
      files: Array<{
        path: string;
        change: string;
        movePath?: string | undefined;
        diff?: string | undefined;
      }>;
    }
  | {
      kind: 'web_search';
      query?: string | undefined;
      sources: Array<{ title?: string | undefined; url: string }>;
    }
  | { kind: 'image'; path: string }
  | { kind: 'review'; phase: 'entered' | 'exited'; review: string }
  | { kind: 'compaction' }
  | {
      kind: 'plan';
      steps: Array<{
        id: string;
        text: string;
        status: 'pending' | 'in_progress' | 'completed';
      }>;
    }
  | {
      kind: 'subagent';
      subagentId: string;
      name: string;
      phase: 'started' | 'message' | 'completed' | 'failed';
      text?: string | undefined;
      agentPath?: string | undefined;
      operation?: 'spawn' | 'send' | 'resume' | 'wait' | 'close' | 'activity' | undefined;
      model?: string | undefined;
      reasoningEffort?: string | undefined;
    };

export interface TimelineItemView {
  id: string;
  threadId: string;
  turnId?: string;
  sequence: number;
  kind: TimelineItemKind;
  title?: string;
  text?: string;
  detail?: string;
  status?: 'pending' | 'running' | 'complete' | 'denied' | 'failed';
  timestamp: string;
  approvalId?: string;
  toolName?: string;
  toolCallId?: string;
  /** Stable dispatch id used to recover a claimed schedule without creating a duplicate turn. */
  scheduleRunId?: string;
  activity?: ActivityPresentationView;
  attachments?: AttachmentView[];
}

export interface ThreadSearchResultView {
  threadId: string;
  threadTitle: string;
  archived: boolean;
  matches: Array<{
    itemId: string;
    excerpt: string;
    timestamp: string;
    kind: 'thread' | 'message' | 'file' | 'link';
    label?: string;
    url?: string;
  }>;
}

export interface ProviderUsageView {
  provider: ProviderId;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  lastUsedAt: string;
  providerReported: true;
}

export interface UpdateView {
  status: 'unconfigured' | 'idle' | 'checking' | 'available' | 'current' | 'error';
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  detail: string;
}

export interface WorkspaceChangeView {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
}

export interface WorkspaceDiffView {
  workspace: string;
  files: WorkspaceChangeView[];
  unifiedDiff: string;
  generatedAt: string;
}

export interface WorkspaceSnapshotView {
  id: string;
  createdAt: string;
}

/**
 * The files one reply changed, checked against the disk. `ready`: they still hold the reply's
 * changes, so they can go back. `undone`: they are back as before, so the changes can be redone.
 * `changed`: some were edited since, so neither is safe. `unavailable`: Sia has no complete
 * record to put them back.
 */
export interface TurnChangesView {
  state: 'ready' | 'undone' | 'changed' | 'unavailable';
  files: Array<{ path: string; change: 'added' | 'edited' | 'deleted' | 'renamed' }>;
  /** Files edited since, or ones Sia may not touch; they block undo and redo. */
  blocked: string[];
}

export interface TerminalResultView {
  command: string;
  cwd: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface BackgroundTerminalView {
  id: string;
  command: string;
  cwd: string;
  output: string;
  status: 'running' | 'exited' | 'stopped' | 'failed';
  exitCode: number | null;
  startedAt: string;
  updatedAt: string;
  truncated: boolean;
}

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
  cadence: 'once' | 'hourly' | 'daily' | 'weekly';
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

export type ApprovalKind =
  'native_tool' | 'connector_write' | 'foreground_takeover' | 'file_upload' | 'browser_attach';

export interface ApprovalView {
  id: string;
  threadId?: string;
  callId: string;
  kind: ApprovalKind;
  title: string;
  summary: string;
  target: string;
  /** Trusted account label resolved from controller-owned connection state. */
  account?: string;
  dataLeaving?: string;
  dataLabel?: string;
  reversible: boolean;
  /** Absent when the request waits until it is answered or its turn ends, as in Codex. */
  expiresAt?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  /** The request can be allowed for the rest of its task (never on phone turns). */
  allowForTask?: boolean;
  /** The person allowed this request, and equivalent ones, for the rest of its task. */
  scope?: 'task';
}

export type ConnectionId = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';

export interface ConnectionView {
  id: ConnectionId;
  label: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Local capability switch. A connected grant cannot be used while this is false. */
  enabled?: boolean;
  /** Opaque Sia-cloud connection id; never an OAuth credential. */
  connectionId?: string;
  /** Google starts read-only and can be upgraded with a second explicit consent. */
  googleAccess?: 'read_only' | 'read_write';
  /** Opaque pending grant used while read access remains available during an upgrade. */
  upgradeConnectionId?: string;
  account?: string;
  detail?: string;
}

export interface CaptureView {
  status: 'not_consented' | 'recording' | 'paused' | 'sync_pending' | 'blocked' | 'deleting';
  consentVersion?: string;
  consentAcceptedAt?: string;
  /** Last consent text shown to the current local identity, including a decline. */
  promptReviewedVersion?: string;
  pendingCount: number;
  /** Encrypted raw batches still waiting for a cloud acknowledgement. */
  pendingBytes?: number;
  /** Creation time of the oldest batch that has not been acknowledged by the cloud. */
  oldestPendingAt?: string;
  /** Sanitized operational detail from the most recent failed upload attempt. */
  lastSyncError?: string;
  /** Set when Sia cannot durably queue raw capture. New turns fail closed until resolved. */
  blockedReason?: string;
}

export interface AdminResearchParticipantView {
  subject: string;
  email?: string;
  batchCount: number;
  byteLength: number;
  lastCreatedAt: string;
}

export interface AdminInviteView {
  email: string;
  invitedAt: string;
  status: 'invited' | 'active' | 'failed';
}

export interface AdminResearchBatchView {
  batchId: string;
  consentVersion: string;
  eventCount: number;
  sha256: string;
  byteLength: number;
  createdAt: string;
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
}

export const RESEARCH_CONSENT_VERSION = 'alpha-research-v3-raw' as const;

export interface ComputerPermissionsView {
  status: 'unavailable' | 'needs_permission' | 'ready' | 'error';
  accessibility: boolean;
  screenRecording: boolean;
  /** Granted in System Settings, but macOS applies it to Sia only after one relaunch. */
  relaunchFor?: ('accessibility' | 'screenRecording')[];
  detail?: string;
}

export interface ComputerView extends ComputerPermissionsView {
  accessMode?: 'mac' | 'connected';
  backgroundControl?: boolean;
  backgroundFallback?: 'pause' | 'foreground';
  automation?: import('./mac-permissions.js').AutomationPermissions;
  /** Local Apple Messages readability; sends additionally prompt for Automation once. */
  messagesAccess?: 'ready' | 'needs_full_disk_access' | 'unavailable';
  /** Chrome's own remote-debugging toggle, read-only; Sia never changes it. */
  chromeConnection?: 'enabled' | 'off' | 'unavailable';
  /**
   * 'auto': computer and browser actions run without per-action approval and Chrome
   * attaches to the frontmost window on demand. 'ask' restores confirmation previews.
   */
  trust: 'auto' | 'ask';
  /** Whether the local trajectory log is kept for turns allowed by the connector data policy. */
  trajectoryLog: boolean;
  trajectoryDirectory?: string;
}

export interface BrowserWindowView {
  id: number;
  label: string;
  detail?: string;
}

export interface BrowserView {
  status: 'detached' | 'attaching' | 'attached' | 'error';
  browser?: string;
  profileLabel?: string;
  grantedOrigins: string[];
  availableWindows?: BrowserWindowView[];
  detail?: string;
}

export interface PushToTalkView {
  speakReplies?: boolean;
  available: boolean;
  enabled: boolean;
  agentId?: string;
  accessibility: boolean;
  microphone?: boolean;
  phase: 'idle' | 'starting' | 'listening' | 'transcribing' | 'error';
  detail?: string | undefined;
}

export interface VoiceView {
  engine?: 'macos' | 'elevenlabs';
  dictationAvailable?: boolean;
  dictationDetail?: string | undefined;
  speechRecognition?: 'allowed' | 'denied' | 'not-requested' | undefined;
  pushToTalk?: PushToTalkView;
  status: 'disconnected' | 'connected';
  selectedVoiceId?: string;
  selectedVoiceName?: string;
  voices: Array<{ id: string; name: string; category?: string }>;
  detail?: string;
}

/** A one-line sidebar summary of a thread's latest turn. */
export interface ThreadPreview {
  label: 'Request' | 'Latest reply' | 'Latest activity';
  text: string;
}

export interface DesktopSnapshot {
  revision: number;
  agents: AgentView[];
  threads: ThreadView[];
  /**
   * The full history for in-process callers. Snapshots pushed to the renderer carry only the
   * active thread's items and summarize every other thread in `previews`.
   */
  timeline: TimelineItemView[];
  previews?: Record<string, ThreadPreview>;
  approvals: ApprovalView[];
  providers: ProviderView[];
  connections: ConnectionView[];
  capture: CaptureView;
  computer: ComputerView;
  browser: BrowserView;
  voice: VoiceView;
  preferences: {
    completionSound: boolean;
    openAtLogin?: boolean;
    appearance?: 'calm' | 'expressive';
    /** Light or dark follows the Mac unless set. Applies to every Sia window. */
    theme?: ThemePreference;
    /** Scales Sia's type. Default when unset. */
    textSize?: TextSize;
    /** Shows the workspace Command tool. Off unless turned on in Settings; main enforces it. */
    developerTools?: boolean;
    onboarding?: OnboardingProgress;
  };
  providerUsage?: ProviderUsageView[];
  updates?: UpdateView;
  schedules?: ScheduleView[];
  activeAgentId?: string;
  activeThreadId?: string;
  cloud: {
    status: 'offline' | 'connecting' | 'online' | 'error';
    auth:
      | 'unconfigured'
      | 'signed_out'
      | 'code_sent'
      | 'password_required'
      | 'mfa_required'
      | 'signed_in';
    account?: string;
    admin?: boolean;
    participant?: boolean;
    adminMfa?: boolean;
    features?: CloudFeatureFlags;
  };
  startupNotice?: {
    title: string;
    detail: string;
  };
}

export interface CloudFeatureFlags {
  researchUploads: boolean;
  researchArchive: boolean;
  connectors: boolean;
  schedules: boolean;
}

export type OnboardingStep =
  | 'welcome'
  | 'agent'
  | 'voice'
  | 'access'
  | 'apps'
  | 'restart'
  | 'verify'
  | 'practice'
  | 'complete';
export interface OnboardingProgress {
  step: OnboardingStep;
  agentId?: string;
  restartPending?: boolean;
  restarted?: boolean;
  /** `skipped` lists optional checklist rows the person skipped, so a relaunch does not re-ask. */
  permissionSetup?: { includeApps: boolean; active: boolean; skipped?: string[] };
}

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
  nextRunAt: string;
  maxRuns?: number;
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

export interface BridgeRequestMap {
  'scotty.configure': import('./scotty.js').ScottyCommand;
  'phone.remote': import('./phone-remote.js').PhoneRemoteCommand;
  'assistant.library': import('./assistant-library.js').AssistantLibraryCommand;
  bootstrap: undefined;
  'agents.save': SaveAgentInput;
  'agents.delete': { agentId: string };
  'agents.setPinned': { agentId: string; pinned: boolean };
  'agents.setNotifications': { agentId: string; enabled: boolean };
  'agents.duplicate': { agentId: string };
  'threads.create': CreateThreadInput;
  'threads.select': { threadId: string };
  'threads.rename': { threadId: string; title: string };
  'threads.draft': { threadId: string; text: string };
  'threads.config': UpdateThreadConfigInput;
  'threads.archive': { threadId: string };
  'threads.unarchive': { threadId: string };
  'threads.setUnread': { threadId: string; unread: boolean };
  'threads.setPinned': { threadId: string; pinned: boolean };
  'threads.fork': { threadId: string; title?: string; isolated: boolean };
  'threads.handoff': {
    threadId: string;
    destination: 'primary' | 'new_worktree';
    title?: string;
  };
  'worktrees.cleanup': { threadId: string; confirmation: 'REMOVE WORKTREE' };
  'threads.search': { query: string };
  'threads.goal.set': { threadId: string; text: string };
  'threads.goal.pause': { threadId: string };
  'threads.goal.resume': { threadId: string };
  'threads.goal.clear': { threadId: string };
  'threads.delete': { threadId: string };
  'threads.send': SendTurnInput;
  'threads.retry': { threadId: string };
  /** Replaces the last exchange: Try again resends it, Edit sends new text in its place. */
  'threads.redo': { threadId: string; text?: string; attachmentIds?: string[] };
  'threads.cancel': { threadId: string };
  /** Removes a queued follow-up (a pending user message) before it starts. */
  'threads.unqueue': { threadId: string; messageId: string };
  'threads.steer': { threadId: string; messageId: string };
  'attachments.pick': { threadId: string };
  'attachments.drop': { threadId: string; paths: string[] };
  'attachments.paste': { threadId: string; name?: string; mimeType: string; data: Uint8Array };
  'attachments.preview': { threadId: string; attachmentId: string };
  'attachments.open': { threadId: string; attachmentId: string };
  'attachments.reveal': { threadId: string; attachmentId: string };
  'changes.read': { threadId: string };
  'changes.stage': { threadId: string; paths: string[] };
  'changes.restore': { threadId: string; paths: string[]; confirmation: 'RESTORE' };
  'changes.snapshots.list': { threadId: string };
  'changes.snapshots.create': { threadId: string };
  'changes.snapshots.restore': { threadId: string; snapshotId: string };
  'changes.snapshots.delete': {
    threadId: string;
    snapshotId: string;
    confirmation: 'DELETE SNAPSHOT';
  };
  'changes.turn.read': { threadId: string; eventId: string };
  'changes.turn.apply': { threadId: string; eventId: string; direction: 'undo' | 'redo' };
  'terminal.run': { threadId: string; command: string };
  'terminal.start': { threadId: string; command: string };
  'terminal.list': { threadId: string };
  'terminal.write': { threadId: string; terminalId: string; input: string };
  'terminal.stop': { threadId: string; terminalId: string };
  'reviews.start': StartReviewInput;
  'schedules.create': CreateScheduleInput;
  'schedules.setEnabled': { scheduleId: string; enabled: boolean };
  'schedules.delete': { scheduleId: string };
  'schedules.runNow': { scheduleId: string };
  'approvals.resolve': ResolveApprovalInput;
  'providers.probe': { providerId?: ProviderId };
  'providers.login': { providerId: ProviderId };
  'providers.cancelLogin': { providerId: ProviderId };
  'settings.openDirectory': undefined;
  'settings.setOnboarding': {
    step: OnboardingStep;
    permissionSetup?: OnboardingProgress['permissionSetup'];
  };
  'settings.restartForOnboarding': undefined;
  'computer.setupMessages': undefined;
  'settings.setAppearance': { appearance: 'calm' | 'expressive' };
  'settings.setTheme': { theme: ThemePreference };
  'settings.setTextSize': { textSize: TextSize };
  'settings.setCompletionSound': { enabled: boolean };
  'settings.setOpenAtLogin': { enabled: boolean };
  'settings.setDeveloperTools': { enabled: boolean };
  'feedback.compose': { message: string; threadId?: string; includeDiagnostics: boolean };
  'updates.check': undefined;
  'updates.openDownload': undefined;
  'computer.permissions': undefined;
  'computer.requestPermissions':
    { permission?: 'accessibility' | 'screenRecording' } | undefined;
  'computer.requestAutomation': { app: import('./mac-permissions.js').AutomationApp };
  'computer.openMessages': undefined;
  'computer.setAccessMode': {
    mode: 'mac' | 'connected';
    background?: boolean;
    backgroundFallback?: 'pause' | 'foreground';
  };
  'computer.setTrust': { trust: 'auto' | 'ask' };
  'computer.setTrajectoryLog': { enabled: boolean };
  'computer.revealTrajectories': undefined;
  'browser.attach': { windowId?: number };
  'browser.connectAndContinue': { threadId: string; userMessageId: string; windowId?: number };
  'browser.open': { url: string };
  'browser.detach': undefined;
  'voice.pushToTalk.configure': {
    enabled: boolean;
    agentId?: string;
    requestAccessibility?: boolean;
    speakReplies?: boolean;
  };
  'voice.pushToTalk.cancel': undefined;
  'voice.capture.acquire': undefined;
  'voice.capture.release': { leaseId: string };
  'voice.configure': undefined;
  'voice.refresh': undefined;
  'voice.select': { voiceId: string };
  'voice.disconnect': undefined;
  'voice.transcribe': { audioBase64: string; mimeType: string };
  'voice.realtime.start': undefined;
  'voice.realtime.append': { sessionId: string; audioBase64: string };
  'voice.realtime.stop': { sessionId: string; commit: boolean };
  'voice.speak': { text: string; voiceId?: string };
  'connections.startGoogle': undefined;
  'connections.startSelected': { apps: ('google' | 'slack')[] };
  'connections.upgradeGoogle': undefined;
  'connections.start': { connectionId: ConnectionId };
  'connections.setEnabled': { connectionId: ConnectionId; enabled: boolean };
  'connections.disconnect': { connectionId: ConnectionId; expectedConnectionId?: string };
  'auth.start': { email: string };
  'auth.complete': { code: string };
  'auth.mfaBegin': undefined;
  'auth.mfaComplete': { code: string };
  'auth.signOut': undefined;
  'auth.deleteAccount': { confirmation: 'DELETE ACCOUNT' };
  'research.setCapture': { enabled: boolean; consentVersion?: string };
  'research.export': undefined;
  'research.delete': { confirmation: 'DELETE' };
  'research.admin.invites': undefined;
  'research.admin.invite': { email: string };
  'research.admin.participants': undefined;
  'research.admin.batches': { subject: string };
  'research.admin.readBatch': { subject: string; batchId: string };
}

export interface BridgeResultMap {
  'scotty.configure': import('./scotty.js').ScottySettings;
  'phone.remote': import('./phone-remote.js').PhoneRemoteSettings;
  'assistant.library': import('./assistant-library.js').AssistantLibraryView;
  bootstrap: DesktopSnapshot;
  'agents.save': { agentId: string; snapshot: DesktopSnapshot };
  'agents.delete': DesktopSnapshot;
  'agents.setPinned': DesktopSnapshot;
  'agents.setNotifications': DesktopSnapshot;
  'agents.duplicate': { agentId: string; snapshot: DesktopSnapshot };
  'threads.create': { threadId: string; snapshot: DesktopSnapshot };
  'threads.select': DesktopSnapshot;
  'threads.rename': DesktopSnapshot;
  'threads.draft': { saved: true };
  'threads.config': DesktopSnapshot;
  'threads.archive': DesktopSnapshot;
  'threads.unarchive': DesktopSnapshot;
  'threads.setUnread': DesktopSnapshot;
  'threads.setPinned': DesktopSnapshot;
  'threads.fork': { threadId: string; snapshot: DesktopSnapshot };
  'threads.handoff': { threadId: string; snapshot: DesktopSnapshot };
  'worktrees.cleanup': DesktopSnapshot;
  'threads.search': { results: ThreadSearchResultView[] };
  'threads.goal.set': DesktopSnapshot;
  'threads.goal.pause': DesktopSnapshot;
  'threads.goal.resume': DesktopSnapshot;
  'threads.goal.clear': DesktopSnapshot;
  'threads.delete': DesktopSnapshot;
  'threads.send': { turnId: string; snapshot: DesktopSnapshot };
  'threads.retry': { turnId: string; snapshot: DesktopSnapshot };
  'threads.redo': { turnId: string; snapshot: DesktopSnapshot };
  'threads.cancel': DesktopSnapshot;
  'threads.unqueue': DesktopSnapshot;
  'threads.steer': DesktopSnapshot;
  'attachments.pick': { attachments: AttachmentView[] };
  'attachments.drop': { attachments: AttachmentView[] };
  'attachments.paste': { attachments: AttachmentView[] };
  'attachments.preview': AttachmentPreviewView;
  'attachments.open': { opened: boolean };
  'attachments.reveal': { revealed: boolean };
  'changes.read': WorkspaceDiffView;
  'changes.stage': WorkspaceDiffView;
  'changes.restore': WorkspaceDiffView;
  'changes.snapshots.list': { snapshots: WorkspaceSnapshotView[] };
  'changes.snapshots.create': { snapshots: WorkspaceSnapshotView[] };
  'changes.snapshots.restore': {
    snapshots: WorkspaceSnapshotView[];
    diff: WorkspaceDiffView;
  };
  'changes.snapshots.delete': { snapshots: WorkspaceSnapshotView[] };
  'changes.turn.read': TurnChangesView;
  'changes.turn.apply': TurnChangesView;
  'terminal.run': TerminalResultView;
  'terminal.start': BackgroundTerminalView;
  'terminal.list': { sessions: BackgroundTerminalView[] };
  'terminal.write': BackgroundTerminalView;
  'terminal.stop': BackgroundTerminalView;
  'reviews.start': { turnId: string; snapshot: DesktopSnapshot };
  'schedules.create': DesktopSnapshot;
  'schedules.setEnabled': DesktopSnapshot;
  'schedules.delete': DesktopSnapshot;
  'schedules.runNow': { turnId: string; snapshot: DesktopSnapshot };
  'approvals.resolve': DesktopSnapshot;
  'providers.probe': DesktopSnapshot;
  'providers.login': { opened: boolean; snapshot: DesktopSnapshot };
  'providers.cancelLogin': DesktopSnapshot;
  'settings.openDirectory': { path: string | null };
  'settings.setOnboarding': DesktopSnapshot;
  'settings.restartForOnboarding': DesktopSnapshot;
  'computer.setupMessages': DesktopSnapshot;
  'settings.setAppearance': DesktopSnapshot;
  'settings.setTheme': DesktopSnapshot;
  'settings.setTextSize': DesktopSnapshot;
  'settings.setCompletionSound': DesktopSnapshot;
  'settings.setOpenAtLogin': DesktopSnapshot;
  'settings.setDeveloperTools': DesktopSnapshot;
  'feedback.compose': { opened: boolean };
  'updates.check': UpdateView;
  'updates.openDownload': { opened: boolean };
  'computer.permissions': DesktopSnapshot;
  'computer.requestPermissions': DesktopSnapshot;
  'computer.requestAutomation': DesktopSnapshot;
  'computer.openMessages': DesktopSnapshot;
  'computer.setAccessMode': DesktopSnapshot;
  'computer.setTrust': DesktopSnapshot;
  'computer.setTrajectoryLog': DesktopSnapshot;
  'computer.revealTrajectories': DesktopSnapshot;
  'browser.attach': DesktopSnapshot;
  'browser.connectAndContinue': DesktopSnapshot;
  'browser.open': DesktopSnapshot;
  'browser.detach': DesktopSnapshot;
  'voice.pushToTalk.configure': DesktopSnapshot;
  'voice.pushToTalk.cancel': undefined;
  'voice.capture.acquire': { leaseId: string };
  'voice.capture.release': undefined;
  'voice.configure': DesktopSnapshot;
  'voice.refresh': DesktopSnapshot;
  'voice.select': DesktopSnapshot;
  'voice.disconnect': DesktopSnapshot;
  'voice.transcribe': { text: string };
  'voice.realtime.start': { sessionId: string };
  'voice.realtime.append': undefined;
  'voice.realtime.stop': { text: string };
  'voice.speak': { audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' };
  'connections.startGoogle': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.startSelected': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.upgradeGoogle': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.start': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.setEnabled': DesktopSnapshot;
  'connections.disconnect': DesktopSnapshot;
  'auth.start': DesktopSnapshot;
  'auth.complete': DesktopSnapshot;
  'auth.mfaBegin': { secretCode: string };
  'auth.mfaComplete': DesktopSnapshot;
  'auth.signOut': DesktopSnapshot;
  'auth.deleteAccount': DesktopSnapshot;
  'research.setCapture': DesktopSnapshot;
  'research.export': { path: string | null };
  'research.delete': DesktopSnapshot;
  'research.admin.invites': { invites: AdminInviteView[]; limit: number };
  'research.admin.invite': { invite: AdminInviteView };
  'research.admin.participants': { participants: AdminResearchParticipantView[] };
  'research.admin.batches': { batches: AdminResearchBatchView[] };
  'research.admin.readBatch': { batch: unknown };
}

export type BridgeMethod = keyof BridgeRequestMap;

export interface BridgeInvokeEnvelope<M extends BridgeMethod = BridgeMethod> {
  method: M;
  input: BridgeRequestMap[M];
}

export interface BridgeErrorShape {
  code: string;
  message: string;
  retryable: boolean;
}

export type DesktopPushEvent =
  | { type: 'open-conversation' }
  | { type: 'snapshot'; snapshot: DesktopSnapshot }
  | { type: 'fatal'; error: BridgeErrorShape };

export interface DesktopBridgeApi {
  scotty: import('./scotty.js').ScottySettingsApi;
  phoneRemote: import('./phone-remote.js').PhoneRemoteApi;
  assistantLibrary(
    input: BridgeRequestMap['assistant.library'],
  ): Promise<BridgeResultMap['assistant.library']>;
  bootstrap(): Promise<DesktopSnapshot>;
  agents: {
    save(input: SaveAgentInput): Promise<BridgeResultMap['agents.save']>;
    delete(agentId: string): Promise<DesktopSnapshot>;
    setPinned(agentId: string, pinned: boolean): Promise<DesktopSnapshot>;
    setNotifications(agentId: string, enabled: boolean): Promise<DesktopSnapshot>;
    duplicate(agentId: string): Promise<BridgeResultMap['agents.duplicate']>;
  };
  threads: {
    create(input: CreateThreadInput): Promise<BridgeResultMap['threads.create']>;
    select(threadId: string): Promise<DesktopSnapshot>;
    rename(threadId: string, title: string): Promise<DesktopSnapshot>;
    setDraft(threadId: string, text: string): Promise<{ saved: true }>;
    config(input: UpdateThreadConfigInput): Promise<DesktopSnapshot>;
    archive(threadId: string): Promise<DesktopSnapshot>;
    unarchive(threadId: string): Promise<DesktopSnapshot>;
    setUnread(threadId: string, unread: boolean): Promise<DesktopSnapshot>;
    setPinned(threadId: string, pinned: boolean): Promise<DesktopSnapshot>;
    fork(
      threadId: string,
      isolated: boolean,
      title?: string,
    ): Promise<BridgeResultMap['threads.fork']>;
    handoff(
      threadId: string,
      destination: 'primary' | 'new_worktree',
      title?: string,
    ): Promise<BridgeResultMap['threads.handoff']>;
    search(query: string): Promise<BridgeResultMap['threads.search']>;
    setGoal(threadId: string, text: string): Promise<DesktopSnapshot>;
    pauseGoal(threadId: string): Promise<DesktopSnapshot>;
    resumeGoal(threadId: string): Promise<DesktopSnapshot>;
    clearGoal(threadId: string): Promise<DesktopSnapshot>;
    delete(threadId: string): Promise<DesktopSnapshot>;
    send(input: SendTurnInput): Promise<BridgeResultMap['threads.send']>;
    retry(threadId: string): Promise<BridgeResultMap['threads.retry']>;
    redo(
      threadId: string,
      text?: string,
      attachmentIds?: readonly string[],
    ): Promise<BridgeResultMap['threads.redo']>;
    cancel(threadId: string): Promise<DesktopSnapshot>;
    unqueue(threadId: string, messageId: string): Promise<DesktopSnapshot>;
    steer(threadId: string, messageId: string): Promise<DesktopSnapshot>;
  };
  worktrees: {
    cleanup(threadId: string): Promise<DesktopSnapshot>;
  };
  attachments: {
    pick(threadId: string): Promise<BridgeResultMap['attachments.pick']>;
    drop(threadId: string, files: File[]): Promise<BridgeResultMap['attachments.drop']>;
    /** Clipboard files: Finder copies attach by path, screenshots and text are saved first. */
    paste(threadId: string, files: File[]): Promise<BridgeResultMap['attachments.paste']>;
    preview(
      threadId: string,
      attachmentId: string,
    ): Promise<BridgeResultMap['attachments.preview']>;
    open(threadId: string, attachmentId: string): Promise<BridgeResultMap['attachments.open']>;
    reveal(
      threadId: string,
      attachmentId: string,
    ): Promise<BridgeResultMap['attachments.reveal']>;
  };
  changes: {
    read(threadId: string): Promise<WorkspaceDiffView>;
    stage(threadId: string, paths: string[]): Promise<WorkspaceDiffView>;
    restore(threadId: string, paths: string[]): Promise<WorkspaceDiffView>;
    listSnapshots(threadId: string): Promise<{ snapshots: WorkspaceSnapshotView[] }>;
    createSnapshot(threadId: string): Promise<{ snapshots: WorkspaceSnapshotView[] }>;
    restoreSnapshot(
      threadId: string,
      snapshotId: string,
    ): Promise<BridgeResultMap['changes.snapshots.restore']>;
    deleteSnapshot(
      threadId: string,
      snapshotId: string,
    ): Promise<{ snapshots: WorkspaceSnapshotView[] }>;
    readTurn(threadId: string, eventId: string): Promise<TurnChangesView>;
    applyTurn(
      threadId: string,
      eventId: string,
      direction: 'undo' | 'redo',
    ): Promise<TurnChangesView>;
  };
  terminal: {
    run(threadId: string, command: string): Promise<TerminalResultView>;
    start(threadId: string, command: string): Promise<BackgroundTerminalView>;
    list(threadId: string): Promise<{ sessions: BackgroundTerminalView[] }>;
    write(threadId: string, terminalId: string, input: string): Promise<BackgroundTerminalView>;
    stop(threadId: string, terminalId: string): Promise<BackgroundTerminalView>;
  };
  reviews: {
    start(input: StartReviewInput): Promise<BridgeResultMap['reviews.start']>;
  };
  schedules: {
    create(input: CreateScheduleInput): Promise<DesktopSnapshot>;
    setEnabled(scheduleId: string, enabled: boolean): Promise<DesktopSnapshot>;
    delete(scheduleId: string): Promise<DesktopSnapshot>;
    runNow(scheduleId: string): Promise<BridgeResultMap['schedules.runNow']>;
  };
  approvals: {
    resolve(input: ResolveApprovalInput): Promise<DesktopSnapshot>;
  };
  providers: {
    probe(providerId?: ProviderId): Promise<DesktopSnapshot>;
    login(providerId: ProviderId): Promise<BridgeResultMap['providers.login']>;
    /** Stops a browser sign-in that is still waiting, so setup can start over. */
    cancelLogin(providerId: ProviderId): Promise<DesktopSnapshot>;
  };
  settings: {
    openDirectory(): Promise<{ path: string | null }>;
    setOnboarding(
      step: OnboardingStep,
      permissionSetup?: OnboardingProgress['permissionSetup'],
    ): Promise<DesktopSnapshot>;
    restartForOnboarding(): Promise<DesktopSnapshot>;
    setAppearance(appearance: 'calm' | 'expressive'): Promise<DesktopSnapshot>;
    setTheme(theme: ThemePreference): Promise<DesktopSnapshot>;
    setTextSize(textSize: TextSize): Promise<DesktopSnapshot>;
    setCompletionSound(enabled: boolean): Promise<DesktopSnapshot>;
    setOpenAtLogin(enabled: boolean): Promise<DesktopSnapshot>;
    setDeveloperTools(enabled: boolean): Promise<DesktopSnapshot>;
  };
  feedback: {
    compose(
      message: string,
      threadId: string | undefined,
      includeDiagnostics: boolean,
    ): Promise<BridgeResultMap['feedback.compose']>;
  };
  updates: {
    check(): Promise<UpdateView>;
    openDownload(): Promise<BridgeResultMap['updates.openDownload']>;
  };
  computer: {
    permissions(): Promise<DesktopSnapshot>;
    requestPermissions(
      permission?: 'accessibility' | 'screenRecording',
    ): Promise<DesktopSnapshot>;
    requestAutomation(
      app: import('./mac-permissions.js').AutomationApp,
    ): Promise<DesktopSnapshot>;
    openMessages(): Promise<DesktopSnapshot>;
    setupMessages(): Promise<DesktopSnapshot>;
    setAccessMode(
      mode: 'mac' | 'connected',
      background?: boolean,
      backgroundFallback?: 'pause' | 'foreground',
    ): Promise<DesktopSnapshot>;
    setTrust(trust: 'auto' | 'ask'): Promise<DesktopSnapshot>;
    setTrajectoryLog(enabled: boolean): Promise<DesktopSnapshot>;
    revealTrajectories(): Promise<DesktopSnapshot>;
  };
  browser: {
    attach(windowId?: number): Promise<DesktopSnapshot>;
    connectAndContinue(
      input: BridgeRequestMap['browser.connectAndContinue'],
    ): Promise<DesktopSnapshot>;
    open(url: string): Promise<DesktopSnapshot>;
    detach(): Promise<DesktopSnapshot>;
  };
  voice: {
    configurePushToTalk(
      enabled: boolean,
      agentId?: string,
      requestAccessibility?: boolean,
      speakReplies?: boolean,
    ): Promise<DesktopSnapshot>;
    cancelPushToTalk(): Promise<void>;
    acquireCapture(): Promise<{ leaseId: string }>;
    releaseCapture(leaseId: string): Promise<void>;
    configure(): Promise<DesktopSnapshot>;
    refresh(): Promise<DesktopSnapshot>;
    select(voiceId: string): Promise<DesktopSnapshot>;
    disconnect(): Promise<DesktopSnapshot>;
    transcribe(audioBase64: string, mimeType: string): Promise<{ text: string }>;
    startRealtime(): Promise<{ sessionId: string }>;
    appendRealtime(sessionId: string, audioBase64: string): Promise<void>;
    stopRealtime(sessionId: string, commit: boolean): Promise<{ text: string }>;
    speak(
      text: string,
      voiceId?: string,
    ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' }>;
  };
  connections: {
    startGoogle(): Promise<BridgeResultMap['connections.startGoogle']>;
    startSelected(
      apps: ('google' | 'slack')[],
    ): Promise<BridgeResultMap['connections.startSelected']>;
    upgradeGoogle(): Promise<BridgeResultMap['connections.upgradeGoogle']>;
    start(connectionId: ConnectionId): Promise<BridgeResultMap['connections.start']>;
    setEnabled(connectionId: ConnectionId, enabled: boolean): Promise<DesktopSnapshot>;
    disconnect(
      connectionId: ConnectionId,
      expectedConnectionId?: string,
    ): Promise<DesktopSnapshot>;
  };
  auth: {
    start(email: string): Promise<DesktopSnapshot>;
    complete(code: string): Promise<DesktopSnapshot>;
    mfaBegin(): Promise<{ secretCode: string }>;
    mfaComplete(code: string): Promise<DesktopSnapshot>;
    signOut(): Promise<DesktopSnapshot>;
    deleteAccount(confirmation: 'DELETE ACCOUNT'): Promise<DesktopSnapshot>;
  };
  research: {
    setCapture(enabled: boolean, consentVersion?: string): Promise<DesktopSnapshot>;
    export(): Promise<{ path: string | null }>;
    delete(): Promise<DesktopSnapshot>;
    listAdminInvites(): Promise<BridgeResultMap['research.admin.invites']>;
    createAdminInvite(email: string): Promise<BridgeResultMap['research.admin.invite']>;
    listAdminParticipants(): Promise<BridgeResultMap['research.admin.participants']>;
    listAdminBatches(subject: string): Promise<BridgeResultMap['research.admin.batches']>;
    readAdminBatch(
      subject: string,
      batchId: string,
    ): Promise<BridgeResultMap['research.admin.readBatch']>;
  };
  subscribe(listener: (event: DesktopPushEvent) => void): () => void;
}

declare global {
  interface Window {
    sia: DesktopBridgeApi;
  }
}
