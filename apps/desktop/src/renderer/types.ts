export type ProviderId = 'codex' | 'meta' | 'grok' | 'gemini' | 'claude';

export type ThreadStatus = 'idle' | 'running' | 'queued' | 'waiting' | 'error';

export type CaptureState = 'recording' | 'paused' | 'sync-pending' | 'blocked';

export type ProviderStatus =
  'ready' | 'needs-install' | 'needs-login' | 'incompatible' | 'unavailable' | 'disabled';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface AgentSummary {
  id: string;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  voiceId?: string;
  initials: string;
  /** Resolved hue slot 0-3 (explicit choice or stable id-derived default). */
  hue: number;
  threads: ThreadSummary[];
}

export interface ThreadSummary {
  id: string;
  agentId: string;
  title: string;
  updatedAt: string;
  status: ThreadStatus;
  queueReason?: string | undefined;
  archivedAt?: string | undefined;
  sourceThreadId?: string | undefined;
  unread?: boolean | undefined;
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
  id: string;
  type: 'activity';
  kind: 'command' | 'browser' | 'computer' | 'connector' | 'plan';
  title: string;
  detail?: string | undefined;
  status: 'running' | 'complete' | 'error' | 'queued';
  timestamp: string;
  presentation?: ActivityPresentation;
}

export type ActivityPresentation =
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
      files: Array<{ path: string; change: string; diff?: string | undefined }>;
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

export interface ForegroundApproval {
  id: string;
  kind: 'foreground';
  title: string;
  reason: string;
  appName: string;
  target: string;
  restoresFocusTo: string;
}

export interface ConnectorApproval {
  id: string;
  kind: 'connector';
  title: string;
  app: 'Gmail' | 'Google Drive' | 'Google Docs' | 'Google Sheets' | 'Google Slides' | 'Slack';
  account: string;
  action: string;
  destination: string;
  preview: string;
  expiresAt: string;
}

export interface ActionApproval {
  id: string;
  kind: 'action';
  title: string;
  category: 'Tool' | 'Browser' | 'File';
  summary: string;
  target: string;
  dataLeaving?: string | undefined;
  dataLabel?: string | undefined;
  reversible: boolean;
}

export type ApprovalRequest = ForegroundApproval | ConnectorApproval | ActionApproval;

export interface ApprovalEvent {
  id: string;
  type: 'approval';
  request: ApprovalRequest;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  timestamp: string;
}

export interface NoticeEvent {
  id: string;
  type: 'notice';
  tone: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  actionLabel?: string | undefined;
}

export interface QuestionEvent {
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

export interface WorkspaceChange {
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

export interface ThreadSchedule {
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
  lastRun?: {
    id: string;
    startedAt: string;
    finishedAt?: string;
    outcome: 'started' | 'completed' | 'failed' | 'cancelled';
  };
}

export interface TranscriptSearchResult {
  threadId: string;
  threadTitle: string;
  archived: boolean;
  matches: Array<{ itemId: string; excerpt: string; timestamp: string }>;
}

export interface BrowserTab {
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
  status: 'disconnected' | 'connected';
  selectedVoiceId?: string | undefined;
  selectedVoiceName?: string | undefined;
  voices: Array<{ id: string; name: string; category?: string | undefined }>;
  detail?: string | undefined;
}

export interface ComputerWindow {
  id: string;
  appName: string;
  title: string;
  granted: boolean;
  state: 'visible' | 'occluded' | 'minimized';
}

export interface ComputerInspectorState {
  accessibility: 'allowed' | 'denied' | 'not-requested';
  screenRecording: 'allowed' | 'denied' | 'not-requested';
  windows: ComputerWindow[];
  /** 'auto' runs eligible actions without in-app approval. */
  trust: 'auto' | 'ask';
  messagesAccess?: 'ready' | 'needs_full_disk_access' | 'unavailable' | undefined;
  chromeConnection?: 'enabled' | 'off' | 'unavailable' | undefined;
  trajectoryLog: boolean;
  trajectoryDirectory?: string | undefined;
}

export interface ProviderSetup {
  id: ProviderId;
  name: string;
  model: string;
  description: string;
  status: ProviderStatus;
  account?: string | undefined;
  version?: string | undefined;
  billedBy: string;
  restriction?: string | undefined;
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
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
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

export type ApprovalDecision = 'approve' | 'reject';

export interface RendererApi {
  getSnapshot(): Promise<RendererSnapshot>;
  subscribe(
    listener: (snapshot: RendererSnapshot) => void,
    onError?: ((message: string) => void) | undefined,
  ): () => void;
  selectAgent(agentId: string): Promise<void>;
  selectThread(threadId: string): Promise<void>;
  createThread(agentId: string): Promise<string>;
  renameThread(threadId: string, title: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  createAgent(draft: AgentDraft): Promise<string>;
  updateAgent(agentId: string, draft: AgentDraft): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  pickWorkspace(): Promise<string | undefined>;
  configureThread(threadId: string, model: string, reasoningEffort?: string): Promise<void>;
  archiveThread(threadId: string): Promise<void>;
  unarchiveThread(threadId: string): Promise<void>;
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
  respondToApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  retryThread(threadId: string): Promise<void>;
  setCapturePaused(paused: boolean): Promise<void>;
  declineResearchConsent(): Promise<void>;
  openProviderSetup(provider: ProviderId): Promise<void>;
  refreshProvider(provider: ProviderId): Promise<void>;
  connectAllApps(): Promise<void>;
  connectGoogleApps(): Promise<void>;
  upgradeGoogleApps(): Promise<void>;
  connectSelectedApps(apps: AppConnection['id'][]): Promise<void>;
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
  openBrowserSite(url: string): Promise<void>;
  detachBrowser(): Promise<void>;
  requestComputerPermissions(): Promise<void>;
  setComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  unlockComputer(): Promise<void>;
  setTrajectoryLog(enabled: boolean): Promise<void>;
  revealTrajectories(): Promise<void>;
  openMessages(): Promise<void>;
  configureVoice(apiKey: string): Promise<void>;
  refreshVoices(): Promise<void>;
  selectVoice(voiceId: string): Promise<void>;
  disconnectVoice(): Promise<void>;
  setCompletionSound(enabled: boolean): Promise<void>;
  transcribeVoice(audioBase64: string, mimeType: string): Promise<string>;
  startRealtimeVoice(): Promise<string>;
  appendRealtimeVoice(sessionId: string, audioBase64: string): Promise<void>;
  stopRealtimeVoice(sessionId: string, commit: boolean): Promise<string>;
  speakText(
    text: string,
    voiceId?: string,
  ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }>;
  exportResearchData(): Promise<void>;
  deleteResearchData(): Promise<void>;
  listResearchInvites(): Promise<{ invites: ResearchInvite[]; limit: number }>;
  createResearchInvite(email: string): Promise<ResearchInvite>;
  listResearchParticipants(): Promise<ResearchParticipant[]>;
  listResearchBatches(subject: string): Promise<ResearchBatchSummary[]>;
  readResearchBatch(subject: string, batchId: string): Promise<unknown>;
}
