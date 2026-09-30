import type { OnboardingProgress, OnboardingStep, PushToTalkView } from '../shared/bridge';
export type ProviderId = 'codex' | 'meta' | 'grok' | 'gemini' | 'claude';
/** Safe catalog id. The main process decides whether the corresponding adapter is admitted. */
type HarnessId = string;
type HarnessPreference = { mode: 'automatic' } | { mode: 'explicit'; harnessId: HarnessId };

export type ThreadStatus = 'idle' | 'running' | 'queued' | 'waiting' | 'error';

type CaptureState = 'recording' | 'paused' | 'sync-pending' | 'blocked';

export type ProviderStatus =
  'ready' | 'needs-install' | 'needs-login' | 'incompatible' | 'unavailable' | 'disabled';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface AgentSummary {
  id: string;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  harnessPreference?: HarnessPreference;
  voiceId?: string;
  initials: string;
  /** Resolved hue slot 0-3 (explicit choice or stable id-derived default). */
  hue: number;
  pinned: boolean;
  notificationsEnabled: boolean;
  threads: ThreadSummary[];
}

export interface ThreadSummary {
  preview?: { label: 'Request' | 'Latest reply' | 'Latest activity'; text: string } | undefined;
  id: string;
  agentId: string;
  title: string;
  updatedAt: string;
  status: ThreadStatus;
  queueReason?: string | undefined;
  archivedAt?: string | undefined;
  sourceThreadId?: string | undefined;
  unread?: boolean | undefined;
  draft?: string | undefined;
  worktree?:
    | { kind: 'primary'; sourceWorkspace: string; branch?: string | undefined }
    | { kind: 'linked'; sourceWorkspace: string; branch?: string | undefined }
    | undefined;
}

export interface MessageEvent {
  id: string;
  type: 'message';
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: ProviderId | undefined;
  attachments?: RendererAttachment[] | undefined;
}

export interface ActivityEvent {
  toolName?: string;
  id: string;
  type: 'activity';
  kind: 'command' | 'browser' | 'computer' | 'connector' | 'plan' | 'other';
  title: string;
  detail?: string | undefined;
  status: 'running' | 'complete' | 'error' | 'queued';
  timestamp: string;
  presentation?: ActivityPresentation;
}

type ActivityPresentation =
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

interface ForegroundApproval {
  id: string;
  kind: 'foreground';
  title: string;
  reason: string;
  appName: string;
  target: string;
  restoresFocusTo: string;
  allowForTask?: boolean | undefined;
}

interface ConnectorApproval {
  id: string;
  kind: 'connector';
  title: string;
  app: 'Gmail' | 'Google Drive' | 'Google Docs' | 'Google Sheets' | 'Google Slides' | 'Slack';
  account: string;
  action: string;
  destination: string;
  preview: string;
  expiresAt?: string | undefined;
  allowForTask?: boolean | undefined;
}

interface ActionApproval {
  id: string;
  kind: 'action';
  title: string;
  category: 'Tool' | 'Browser' | 'File';
  summary: string;
  target: string;
  dataLeaving?: string | undefined;
  dataLabel?: string | undefined;
  reversible: boolean;
  expiresAt?: string | undefined;
  allowForTask?: boolean | undefined;
}

type ApprovalRequest = ForegroundApproval | ConnectorApproval | ActionApproval;

export interface ApprovalEvent {
  id: string;
  type: 'approval';
  request: ApprovalRequest;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  /** Approved for the rest of its task, not just once. */
  scope?: 'task' | undefined;
  timestamp: string;
}

interface NoticeEvent {
  id: string;
  type: 'notice';
  tone: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  actionLabel?: string | undefined;
}

interface QuestionEvent {
  id: string;
  type: 'question';
  prompt: string;
  status: 'pending' | 'answered';
  timestamp: string;
}

export type ThreadEvent =
  MessageEvent | ActivityEvent | ApprovalEvent | NoticeEvent | QuestionEvent;

export interface ThreadDetail extends ThreadSummary {
  provider: ProviderId;
  model: string;
  reasoningEffort?: string | undefined;
  workspace: string;
  goal?: ThreadGoal | undefined;
  events: ThreadEvent[];
  /** The thread's provider plan usage window, when reported. */
  usageLimit?: { usedPercent: number; resetsAt?: string | undefined } | undefined;
  /** Headline of the running turn's latest reasoning summary, for the live status line. */
  thinking?: string | undefined;
  /** Follow-ups sent while the thread works; they start in order after the current task. */
  queuedMessages?: MessageEvent[] | undefined;
  error?: string | undefined;
}

export interface ThreadGoal {
  text: string;
  status: 'running' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface RendererAttachment {
  id: string;
  name: string;
  kind: 'file' | 'image' | 'audio';
  bytes: number;
}

export type AttachmentPreview =
  | { kind: 'image'; dataUrl: string }
  | {
      kind: 'text';
      content: string;
      format: 'text' | 'code' | 'diff' | 'csv';
      language?: string;
    }
  | { kind: 'pdf' }
  | { kind: 'unavailable'; detail: string };

interface WorkspaceChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  staged: boolean;
}

export interface WorkspaceDiff {
  workspace: string;
  files: WorkspaceChange[];
  unifiedDiff: string;
  generatedAt: string;
}

export interface WorkspaceSnapshot {
  id: string;
  createdAt: string;
}

export interface TerminalResult {
  command: string;
  cwd: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface BackgroundTerminal {
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

interface ThreadSchedule {
  id: string;
  threadId: string;
  prompt: string;
  cadence: 'once' | 'hourly' | 'daily' | 'weekly';
  nextRunAt: string;
  enabled?: boolean | undefined;
  createdAt: string;
  lastRunAt?: string | undefined;
  runCount?: number | undefined;
  maxRuns?: number | undefined;
  lastRun?: ScheduleRun;
  runHistory?: ScheduleRun[];
}

export interface ScheduleRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  outcome: 'started' | 'completed' | 'failed' | 'cancelled';
}

export interface TranscriptSearchResult {
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

interface BrowserTab {
  id: string;
  title: string;
  origin: string;
  active: boolean;
  granted: boolean;
}

export interface BrowserWindowChoice {
  id: number;
  label: string;
  detail?: string | undefined;
}

export interface BrowserInspectorState {
  status: 'detached' | 'attaching' | 'attached' | 'error';
  profileName: string;
  attached: boolean;
  tabs: BrowserTab[];
  availableWindows: BrowserWindowChoice[];
  snapshotLabel?: string | undefined;
  snapshotAt?: string | undefined;
}

export interface VoiceSettingsState {
  engine?: 'macos' | 'elevenlabs';
  dictationAvailable?: boolean;
  dictationDetail?: string | undefined;
  speechRecognition?: 'allowed' | 'denied' | 'not-requested' | undefined;
  pushToTalk?: PushToTalkView | undefined;
  status: 'disconnected' | 'connected';
  selectedVoiceId?: string | undefined;
  selectedVoiceName?: string | undefined;
  voices: Array<{ id: string; name: string; category?: string | undefined }>;
  detail?: string | undefined;
}

interface ComputerWindow {
  id: string;
  appName: string;
  title: string;
  granted: boolean;
  state: 'visible' | 'occluded' | 'minimized';
}

export interface ComputerInspectorState {
  accessMode?: 'mac' | 'connected' | undefined;
  backgroundControl?: boolean | undefined;
  backgroundFallback?: 'pause' | 'foreground' | undefined;
  accessibility: 'allowed' | 'denied' | 'not-requested';
  screenRecording: 'allowed' | 'denied' | 'not-requested';
  /** Turned on in System Settings; macOS applies it after Sia reopens once. */
  relaunchFor?: ('accessibility' | 'screenRecording')[] | undefined;
  windows: ComputerWindow[];
  /** 'auto' runs eligible actions without in-app approval. */
  trust: 'auto' | 'ask';
  automation?: import('../shared/mac-permissions').AutomationPermissions | undefined;
  messagesAccess?: 'ready' | 'needs_full_disk_access' | 'unavailable' | undefined;
  chromeConnection?: 'enabled' | 'off' | 'unavailable' | undefined;
  trajectoryLog: boolean;
  trajectoryDirectory?: string | undefined;
}

export interface ProviderSetup {
  setup?: import('../shared/bridge').ProviderSetupProgress | undefined;
  id: ProviderId;
  name: string;
  /** Plan wording from the provider catalog, e.g. "ChatGPT plan". */
  plan?: string | undefined;
  model: string;
  description: string;
  status: ProviderStatus;
  account?: string | undefined;
  version?: string | undefined;
  billedBy: string;
  restriction?: string | undefined;
  /** Latest plan usage window the provider reported. */
  limits?: { usedPercent: number; resetsAt?: string | undefined } | undefined;
  usage?: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    lastUsedAt: string;
    providerReported: true;
  };
  models?: Array<{
    id: string;
    label: string;
    description: string;
    reasoningEfforts: string[];
    defaultReasoningEffort?: string | undefined;
  }>;
}

export interface AppConnection {
  id: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';
  name: string;
  description: string;
  status: ConnectionStatus;
  enabled: boolean;
  /** Opaque cloud grant id used only to guard connection-specific UI actions. */
  connectionId?: string | undefined;
  account?: string | undefined;
  googleAccess?: 'read_only' | 'read_write' | undefined;
  upgrading?: boolean | undefined;
  permissions: string[];
}

export interface ResearchSettings {
  consented: boolean;
  capture: CaptureState;
  promptReviewedVersion?: string | undefined;
  allowedOrigins: string[];
  excludedPaths: string[];
  lastSyncedAt?: string | undefined;
  pendingItems: number;
  pendingBytes: number;
  oldestPendingAt?: string | undefined;
  lastSyncError?: string | undefined;
  blockedReason?: string | undefined;
}

export interface RendererSnapshot {
  connection: 'online' | 'offline';
  cloudAuth: {
    state:
      | 'unconfigured'
      | 'signed-out'
      | 'code-sent'
      | 'password-required'
      | 'mfa-required'
      | 'signed-in';
    email?: string | undefined;
    admin?: boolean | undefined;
    participant?: boolean | undefined;
    adminMfa?: boolean | undefined;
    features?: {
      researchUploads: boolean;
      researchArchive: boolean;
      connectors: boolean;
      schedules: boolean;
    };
  };
  agents: AgentSummary[];
  selectedAgentId?: string | undefined;
  selectedThreadId?: string | undefined;
  activeThread?: ThreadDetail | undefined;
  providers: ProviderSetup[];
  apps: AppConnection[];
  browser: BrowserInspectorState;
  computer: ComputerInspectorState;
  voice: VoiceSettingsState;
  preferences: {
    completionSound: boolean;
    /** Sia opens when the person logs in to their Mac. Off unless they turn it on. */
    openAtLogin?: boolean;
    appearance?: 'calm' | 'expressive';
    /** Shows the workspace Command tool. Off unless turned on in Settings. */
    developerTools?: boolean;
    onboarding?: OnboardingProgress;
  };
  updates: {
    status: 'unconfigured' | 'idle' | 'checking' | 'available' | 'current' | 'error';
    currentVersion: string;
    latestVersion?: string;
    detail: string;
  };
  research: ResearchSettings;
  archivedThreads: ThreadSummary[];
  schedules: ThreadSchedule[];
  startupNotice?: {
    title: string;
    detail: string;
  };
}

export interface AgentDraft {
  startOnboarding?: boolean;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  harnessPreference?: HarnessPreference;
  voiceId?: string;
  hue?: number;
}

export interface ResearchParticipant {
  subject: string;
  email?: string;
  batchCount: number;
  byteLength: number;
  lastCreatedAt: string;
}

export interface ResearchInvite {
  email: string;
  invitedAt: string;
  status: 'invited' | 'active' | 'failed';
}

export interface ResearchBatchSummary {
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

export type ApprovalDecision = 'approve' | 'approve_task' | 'reject';

export interface RendererApi {
  onOpenConversation?(listener: () => void): () => void;
  scotty?: import('../shared/scotty').ScottySettingsApi;
  phoneRemote?: import('../shared/phone-remote').PhoneRemoteApi;
  assistantLibrary(
    input: import('../shared/assistant-library').AssistantLibraryCommand,
  ): Promise<import('../shared/assistant-library').AssistantLibraryView>;
  getSnapshot(): Promise<RendererSnapshot>;
  subscribe(
    listener: (snapshot: RendererSnapshot) => void,
    onError?: ((message: string) => void) | undefined,
  ): () => void;
  selectAgent(agentId: string): Promise<void>;
  selectThread(threadId: string): Promise<void>;
  createThread(agentId: string): Promise<string>;
  renameThread(threadId: string, title: string): Promise<void>;
  saveDraft(threadId: string, content: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  createAgent(draft: AgentDraft): Promise<string>;
  updateAgent(agentId: string, draft: AgentDraft): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  setAgentPinned(agentId: string, pinned: boolean): Promise<void>;
  setAgentNotifications(agentId: string, enabled: boolean): Promise<void>;
  duplicateAgent(agentId: string): Promise<string>;
  pickWorkspace(): Promise<string | undefined>;
  configureThread(threadId: string, model: string, reasoningEffort?: string): Promise<void>;
  archiveThread(threadId: string): Promise<void>;
  unarchiveThread(threadId: string): Promise<void>;
  setThreadUnread(threadId: string, unread: boolean): Promise<void>;
  forkThread(threadId: string, isolated: boolean, title?: string): Promise<string>;
  handoffThread(
    threadId: string,
    destination: 'primary' | 'new_worktree',
    title?: string,
  ): Promise<string>;
  cleanupWorktree(threadId: string): Promise<void>;
  searchThreads(query: string): Promise<TranscriptSearchResult[]>;
  setGoal(threadId: string, text: string): Promise<void>;
  pauseGoal(threadId: string): Promise<void>;
  resumeGoal(threadId: string): Promise<void>;
  clearGoal(threadId: string): Promise<void>;
  pickAttachments(threadId: string): Promise<RendererAttachment[]>;
  dropAttachments(threadId: string, files: File[]): Promise<RendererAttachment[]>;
  /** Pasted screenshots, copied files and long pasted text, attached like a dropped file. */
  pasteAttachments(threadId: string, files: File[]): Promise<RendererAttachment[]>;
  previewAttachment(threadId: string, attachmentId: string): Promise<AttachmentPreview>;
  openAttachment(threadId: string, attachmentId: string): Promise<void>;
  revealAttachment(threadId: string, attachmentId: string): Promise<void>;
  sendMessage(
    threadId: string,
    content: string,
    attachmentIds?: readonly string[],
  ): Promise<void>;
  readChanges(threadId: string): Promise<WorkspaceDiff>;
  stageChanges(threadId: string, paths: string[]): Promise<WorkspaceDiff>;
  restoreChanges(threadId: string, paths: string[]): Promise<WorkspaceDiff>;
  listWorkspaceSnapshots(threadId: string): Promise<WorkspaceSnapshot[]>;
  createWorkspaceSnapshot(threadId: string): Promise<WorkspaceSnapshot[]>;
  restoreWorkspaceSnapshot(
    threadId: string,
    snapshotId: string,
  ): Promise<{ snapshots: WorkspaceSnapshot[]; diff: WorkspaceDiff }>;
  deleteWorkspaceSnapshot(threadId: string, snapshotId: string): Promise<WorkspaceSnapshot[]>;
  runTerminal(threadId: string, command: string): Promise<TerminalResult>;
  startBackgroundTerminal(threadId: string, command: string): Promise<BackgroundTerminal>;
  listBackgroundTerminals(threadId: string): Promise<BackgroundTerminal[]>;
  writeBackgroundTerminal(
    threadId: string,
    terminalId: string,
    input: string,
  ): Promise<BackgroundTerminal>;
  stopBackgroundTerminal(threadId: string, terminalId: string): Promise<BackgroundTerminal>;
  startReview(
    threadId: string,
    target:
      | { type: 'uncommitted_changes' }
      | { type: 'base_branch'; branch: string }
      | { type: 'custom'; instructions: string },
  ): Promise<void>;
  createSchedule(
    threadId: string,
    prompt: string,
    cadence: ThreadSchedule['cadence'],
    nextRunAt: string,
    maxRuns?: number,
  ): Promise<void>;
  setScheduleEnabled(scheduleId: string, enabled: boolean): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
  runScheduleNow(scheduleId: string): Promise<void>;
  cancelTurn(threadId: string): Promise<void>;
  removeQueuedMessage(threadId: string, messageId: string): Promise<void>;
  /** Adds a queued message to the running task ("Send now"). */
  steerQueuedMessage(threadId: string, messageId: string): Promise<void>;
  respondToApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  retryThread(threadId: string): Promise<void>;
  /** Replaces the last exchange: new text edits the last message, none asks it again. */
  redoLastMessage(threadId: string, text?: string): Promise<void>;
  setCapturePaused(paused: boolean): Promise<void>;
  declineResearchConsent(): Promise<void>;
  openProviderSetup(provider: ProviderId): Promise<void>;
  cancelProviderSetup(provider: ProviderId): Promise<void>;
  refreshProvider(provider: ProviderId): Promise<void>;
  connectGoogleApps(): Promise<void>;
  connectSelectedApps(apps: ('google' | 'slack')[]): Promise<void>;
  upgradeGoogleApps(): Promise<void>;
  connectApp(app: AppConnection['id']): Promise<void>;
  setAppEnabled(app: AppConnection['id'], enabled: boolean): Promise<void>;
  disconnectApp(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
  startCloudSignIn(email: string): Promise<void>;
  completeCloudSignIn(code: string): Promise<void>;
  beginAdminMfa(): Promise<{ secretCode: string }>;
  completeAdminMfa(code: string): Promise<void>;
  signOutCloud(): Promise<void>;
  deleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<void>;
  attachBrowser(windowId?: number): Promise<void>;
  connectBrowserAndContinue(
    threadId: string,
    userMessageId: string,
    windowId?: number,
  ): Promise<void>;
  openBrowserSite(url: string): Promise<void>;
  detachBrowser(): Promise<void>;
  refreshComputerPermissions(): Promise<void>;
  requestComputerPermissions(permission?: 'accessibility' | 'screenRecording'): Promise<void>;
  requestAutomationPermission(
    app: import('../shared/mac-permissions').AutomationApp,
  ): Promise<void>;
  setComputerAccessMode(
    mode: 'mac' | 'connected',
    background?: boolean,
    backgroundFallback?: 'pause' | 'foreground',
  ): Promise<void>;
  setComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  setTrajectoryLog(enabled: boolean): Promise<void>;
  revealTrajectories(): Promise<void>;
  openMessages(): Promise<void>;
  configurePushToTalk(
    enabled: boolean,
    agentId?: string,
    requestAccessibility?: boolean,
    speakReplies?: boolean,
  ): Promise<void>;
  acquireVoiceCapture(): Promise<string>;
  releaseVoiceCapture(leaseId: string): Promise<void>;
  configureVoice(): Promise<void>;
  refreshVoices(): Promise<void>;
  selectVoice(voiceId: string): Promise<void>;
  disconnectVoice(): Promise<void>;
  setOnboarding(
    step: OnboardingStep,
    permissionSetup?: { includeApps: boolean; active: boolean },
  ): Promise<void>;
  restartForOnboarding(): Promise<void>;
  setupMessages(): Promise<void>;
  setAppearance(appearance: 'calm' | 'expressive'): Promise<void>;
  setCompletionSound(enabled: boolean): Promise<void>;
  setOpenAtLogin(enabled: boolean): Promise<void>;
  setDeveloperTools(enabled: boolean): Promise<void>;
  composeFeedback(
    message: string,
    threadId: string | undefined,
    includeDiagnostics: boolean,
  ): Promise<void>;
  checkForUpdates(): Promise<void>;
  openUpdateDownload(): Promise<void>;
  transcribeVoice(audioBase64: string, mimeType: string): Promise<string>;
  startRealtimeVoice(): Promise<string>;
  appendRealtimeVoice(sessionId: string, audioBase64: string): Promise<void>;
  stopRealtimeVoice(sessionId: string, commit: boolean): Promise<string>;
  speakText(
    text: string,
    voiceId?: string,
  ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' }>;
  exportResearchData(): Promise<void>;
  deleteResearchData(): Promise<void>;
  listResearchInvites(): Promise<{ invites: ResearchInvite[]; limit: number }>;
  createResearchInvite(email: string): Promise<ResearchInvite>;
  listResearchParticipants(): Promise<ResearchParticipant[]>;
  listResearchBatches(subject: string): Promise<ResearchBatchSummary[]>;
  readResearchBatch(subject: string, batchId: string): Promise<unknown>;
}
