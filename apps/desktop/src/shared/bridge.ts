export type ProviderId = 'codex' | 'meta' | 'grok' | 'gemini' | 'claude';

export type ProviderStatus =
  'ready' | 'needs_install' | 'needs_login' | 'incompatible' | 'disabled' | 'unavailable';

export interface ProviderView {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  model: string;
  version?: string;
  account?: string;
  detail: string;
  billing: string;
  restriction?: string;
  models?: ProviderModelView[];
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
  /** Optional ElevenLabs voice used for this agent's read-aloud control. */
  voiceId?: string;
  /** Hue slot (0-3) that tints this agent's room; unset falls back to a stable id-derived slot. */
  hue?: number;
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
  agentRevision: string;
  /** Immutable agent instructions captured when this thread was created. */
  instructionsSnapshot: string;
  agentNameSnapshot: string;
  status: ThreadStatus;
  queueReason?: string;
  archivedAt?: string;
  sourceThreadId?: string;
  unread?: boolean;
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
  matches: Array<{ itemId: string; excerpt: string; timestamp: string }>;
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
  lastRun?: {
    id: string;
    startedAt: string;
    finishedAt?: string;
    outcome: 'started' | 'completed' | 'failed' | 'cancelled';
  };
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
  expiresAt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}

export type ConnectionId = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';

export interface ConnectionView {
  id: ConnectionId;
  label: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Opaque Sia-cloud connection id; never an OAuth credential. */
  connectionId?: string;
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
  detail?: string;
}

export interface ComputerView extends ComputerPermissionsView {
  /** Local Apple Messages readability; sends additionally prompt for Automation once. */
  messagesAccess?: 'ready' | 'needs_full_disk_access' | 'unavailable';
  /** Chrome's persistent remote-debugging toggle for silent attachment. */
  chromeConnection?: 'enabled' | 'off' | 'unavailable';
  /**
   * 'auto' (default): computer and browser actions run without per-action approval and Chrome
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

export interface VoiceView {
  status: 'disconnected' | 'connected';
  selectedVoiceId?: string;
  selectedVoiceName?: string;
  voices: Array<{ id: string; name: string; category?: string }>;
  detail?: string;
}

export interface DesktopSnapshot {
  revision: number;
  agents: AgentView[];
  threads: ThreadView[];
  timeline: TimelineItemView[];
  approvals: ApprovalView[];
  providers: ProviderView[];
  connections: ConnectionView[];
  capture: CaptureView;
  computer: ComputerView;
  browser: BrowserView;
  voice: VoiceView;
  preferences: {
    completionSound: boolean;
  };
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

export interface SaveAgentInput {
  id?: string;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  voiceId?: string;
  hue?: number;
}

export interface CreateThreadInput {
  agentId: string;
  title?: string;
}

export interface SendTurnInput {
  threadId: string;
  text: string;
  attachmentIds?: string[];
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
  decision: 'approve' | 'deny';
}

export interface BridgeRequestMap {
  bootstrap: undefined;
  'agents.save': SaveAgentInput;
  'agents.delete': { agentId: string };
  'threads.create': CreateThreadInput;
  'threads.select': { threadId: string };
  'threads.rename': { threadId: string; title: string };
  'threads.config': UpdateThreadConfigInput;
  'threads.archive': { threadId: string };
  'threads.unarchive': { threadId: string };
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
  'threads.cancel': { threadId: string };
  'attachments.pick': { threadId: string };
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
  'settings.openDirectory': undefined;
  'settings.setCompletionSound': { enabled: boolean };
  'computer.permissions': undefined;
  'computer.requestPermissions': undefined;
  'computer.openMessages': undefined;
  'computer.unlock': undefined;
  'computer.setTrust': { trust: 'auto' | 'ask' };
  'computer.setTrajectoryLog': { enabled: boolean };
  'computer.revealTrajectories': undefined;
  'browser.attach': { windowId?: number };
  'browser.open': { url: string };
  'browser.detach': undefined;
  'voice.configure': { apiKey: string };
  'voice.refresh': undefined;
  'voice.select': { voiceId: string };
  'voice.disconnect': undefined;
  'voice.transcribe': { audioBase64: string; mimeType: string };
  'voice.realtime.start': undefined;
  'voice.realtime.append': { sessionId: string; audioBase64: string };
  'voice.realtime.stop': { sessionId: string; commit: boolean };
  'voice.speak': { text: string; voiceId?: string };
  'connections.startAll': undefined;
  'connections.startGoogle': undefined;
  'connections.startSelected': { connectionIds: ConnectionId[] };
  'connections.start': { connectionId: ConnectionId };
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
  bootstrap: DesktopSnapshot;
  'agents.save': { agentId: string; snapshot: DesktopSnapshot };
  'agents.delete': DesktopSnapshot;
  'threads.create': { threadId: string; snapshot: DesktopSnapshot };
  'threads.select': DesktopSnapshot;
  'threads.rename': DesktopSnapshot;
  'threads.config': DesktopSnapshot;
  'threads.archive': DesktopSnapshot;
  'threads.unarchive': DesktopSnapshot;
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
  'threads.cancel': DesktopSnapshot;
  'attachments.pick': { attachments: AttachmentView[] };
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
  'settings.openDirectory': { path: string | null };
  'settings.setCompletionSound': DesktopSnapshot;
  'computer.permissions': DesktopSnapshot;
  'computer.requestPermissions': DesktopSnapshot;
  'computer.openMessages': DesktopSnapshot;
  'computer.unlock': DesktopSnapshot;
  'computer.setTrust': DesktopSnapshot;
  'computer.setTrajectoryLog': DesktopSnapshot;
  'computer.revealTrajectories': DesktopSnapshot;
  'browser.attach': DesktopSnapshot;
  'browser.open': DesktopSnapshot;
  'browser.detach': DesktopSnapshot;
  'voice.configure': DesktopSnapshot;
  'voice.refresh': DesktopSnapshot;
  'voice.select': DesktopSnapshot;
  'voice.disconnect': DesktopSnapshot;
  'voice.transcribe': { text: string };
  'voice.realtime.start': { sessionId: string };
  'voice.realtime.append': undefined;
  'voice.realtime.stop': { text: string };
  'voice.speak': { audioBase64: string; mimeType: 'audio/mpeg' };
  'connections.startAll': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.startGoogle': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.startSelected': { opened: boolean; snapshot: DesktopSnapshot };
  'connections.start': { opened: boolean; snapshot: DesktopSnapshot };
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
  { type: 'snapshot'; snapshot: DesktopSnapshot } | { type: 'fatal'; error: BridgeErrorShape };

export interface DesktopBridgeApi {
  bootstrap(): Promise<DesktopSnapshot>;
  agents: {
    save(input: SaveAgentInput): Promise<BridgeResultMap['agents.save']>;
    delete(agentId: string): Promise<DesktopSnapshot>;
  };
  threads: {
    create(input: CreateThreadInput): Promise<BridgeResultMap['threads.create']>;
    select(threadId: string): Promise<DesktopSnapshot>;
    rename(threadId: string, title: string): Promise<DesktopSnapshot>;
    config(input: UpdateThreadConfigInput): Promise<DesktopSnapshot>;
    archive(threadId: string): Promise<DesktopSnapshot>;
    unarchive(threadId: string): Promise<DesktopSnapshot>;
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
    cancel(threadId: string): Promise<DesktopSnapshot>;
  };
  worktrees: {
    cleanup(threadId: string): Promise<DesktopSnapshot>;
  };
  attachments: {
    pick(threadId: string): Promise<BridgeResultMap['attachments.pick']>;
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
  };
  settings: {
    openDirectory(): Promise<{ path: string | null }>;
    setCompletionSound(enabled: boolean): Promise<DesktopSnapshot>;
  };
  computer: {
    permissions(): Promise<DesktopSnapshot>;
    requestPermissions(): Promise<DesktopSnapshot>;
    openMessages(): Promise<DesktopSnapshot>;
    unlock(): Promise<DesktopSnapshot>;
    setTrust(trust: 'auto' | 'ask'): Promise<DesktopSnapshot>;
    setTrajectoryLog(enabled: boolean): Promise<DesktopSnapshot>;
    revealTrajectories(): Promise<DesktopSnapshot>;
  };
  browser: {
    attach(windowId?: number): Promise<DesktopSnapshot>;
    open(url: string): Promise<DesktopSnapshot>;
    detach(): Promise<DesktopSnapshot>;
  };
  voice: {
    configure(apiKey: string): Promise<DesktopSnapshot>;
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
    ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }>;
  };
  connections: {
    startAll(): Promise<BridgeResultMap['connections.startAll']>;
    startGoogle(): Promise<BridgeResultMap['connections.startGoogle']>;
    startSelected(
      connectionIds: ConnectionId[],
    ): Promise<BridgeResultMap['connections.startSelected']>;
    start(connectionId: ConnectionId): Promise<BridgeResultMap['connections.start']>;
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
