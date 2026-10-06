import type { TextSize, ThemePreference } from './display.js';
import type { ConnectionId } from './bridge/connections.js';
import type {
  CreateScheduleInput,
  CreateThreadInput,
  ResolveApprovalInput,
  SaveAgentInput,
  SendTurnInput,
  StartReviewInput,
  UpdateScheduleInput,
  UpdateThreadConfigInput,
} from './bridge/inputs.js';
import type { ProviderId } from './bridge/providers.js';
import type {
  AdminInviteView,
  AdminResearchBatchView,
  AdminResearchParticipantView,
} from './bridge/research.js';
import type {
  DesktopSnapshot,
  DesktopStreamPatch,
  OnboardingProgress,
  OnboardingStep,
  UpdateView,
} from './bridge/snapshot.js';
import type {
  AttachmentPreviewView,
  AttachmentView,
  ThreadSearchResultView,
} from './bridge/threads.js';
import type {
  BackgroundTerminalView,
  TerminalResultView,
  TurnChangesView,
  WorkspaceDiffView,
  WorkspaceSnapshotView,
} from './bridge/workspace.js';

// The typed IPC contract between the renderer and the main process. The view and input types
// live in ./bridge/ by domain; this module re-exports them with the request and result maps.
export * from './bridge/approvals.js';
export * from './bridge/computer.js';
export * from './bridge/connections.js';
export * from './bridge/inputs.js';
export * from './bridge/providers.js';
export * from './bridge/research.js';
export * from './bridge/schedules.js';
export * from './bridge/snapshot.js';
export * from './bridge/threads.js';
export * from './bridge/workspace.js';

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
  'schedules.update': UpdateScheduleInput;
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
  'schedules.update': DesktopSnapshot;
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

/**
 * A bridge result whose snapshot is identical to the one just pushed to the window carries this
 * marker instead of a second copy; the preload puts the pushed snapshot back in its place.
 */
export interface PushedSnapshotMarker {
  pushedSnapshotRevision: number;
}

export type DesktopPushEvent =
  | { type: 'open-conversation' }
  | { type: 'snapshot'; snapshot: DesktopSnapshot }
  | { type: 'stream'; patch: DesktopStreamPatch }
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
    update(input: UpdateScheduleInput): Promise<DesktopSnapshot>;
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
