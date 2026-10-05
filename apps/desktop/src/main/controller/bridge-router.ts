import type { BridgeMethod, BridgeRequestMap, BridgeResultMap } from '../../shared/bridge.js';
import type { ControllerContext } from './context.js';

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

/** The parts of the controller context BridgeRouter uses. */
type BridgeRouterContext = Pick<
  ControllerContext,
  | 'account'
  | 'agents'
  | 'approvals'
  | 'assistant'
  | 'attachments'
  | 'browser'
  | 'computerAccess'
  | 'connections'
  | 'deps'
  | 'phoneRemote'
  | 'messagesRelay'
  | 'providers'
  | 'releaseAccessLocked'
  | 'rendererCall'
  | 'researchOutbox'
  | 'resultSnapshot'
  | 'schedules'
  | 'scotty'
  | 'settings'
  | 'speech'
  | 'support'
  | 'threads'
  | 'turns'
  | 'workspace'
>;

/**
 * Routes typed bridge requests to the collaborator that owns each method, after the sign-in and
 * release-access guards.
 */
export class BridgeRouter {
  /** One canonical route per renderer bridge method. */
  private readonly handlers: BridgeHandlers = {
    bootstrap: () => this.ctx.resultSnapshot(),
    'scotty.configure': (input) => this.configureScotty(input),
    'phone.remote': (input) => this.phoneRemoteCommand(input),
    'messages.relay': (input) => this.messagesRelayCommand(input),
    'agents.save': (input) => this.ctx.agents.saveAgent(input),
    'assistant.library': (input) => this.ctx.assistant.assistantLibraryCommand(input),
    'agents.delete': ({ agentId }) => this.ctx.agents.deleteAgent(agentId),
    'agents.setPinned': (input) => this.ctx.agents.setAgentPinned(input),
    'agents.setNotifications': (input) => this.ctx.agents.setAgentNotifications(input),
    'agents.duplicate': ({ agentId }) => this.ctx.agents.duplicateAgent(agentId),
    'threads.create': (input) => this.ctx.threads.openNewThread(input),
    'threads.select': ({ threadId }) => this.ctx.threads.selectThread(threadId),
    'threads.rename': (input) => this.ctx.threads.renameThread(input),
    'threads.draft': (input) => this.ctx.threads.setThreadDraft(input),
    'threads.config': (input) => this.ctx.threads.configureThread(input),
    'threads.archive': ({ threadId }) => this.ctx.threads.archiveThread(threadId),
    'threads.unarchive': ({ threadId }) => this.ctx.threads.unarchiveThread(threadId),
    'threads.setUnread': (input) => this.ctx.threads.setThreadUnread(input),
    'threads.setPinned': (input) => this.ctx.threads.setThreadPinned(input),
    'threads.fork': (input) => this.ctx.threads.forkThread(input),
    'threads.handoff': (input) => this.ctx.threads.handoffThread(input),
    'worktrees.cleanup': (input) => this.ctx.threads.cleanupWorktree(input),
    'threads.search': ({ query }) => this.ctx.threads.searchThreads(query),
    'threads.goal.set': (input) => this.ctx.threads.setGoal(input),
    'threads.goal.pause': ({ threadId }) => this.ctx.threads.pauseGoal(threadId),
    'threads.goal.resume': ({ threadId }) => this.ctx.threads.resumeGoal(threadId),
    'threads.goal.clear': ({ threadId }) => this.ctx.threads.clearGoal(threadId),
    'threads.delete': ({ threadId }) => this.ctx.threads.deleteThread(threadId),
    'threads.send': (input) => this.ctx.turns.sendTurn(input),
    'threads.retry': ({ threadId }) => this.ctx.turns.retryTurn(threadId),
    'threads.redo': (input) => this.ctx.turns.redoLastTurn(input),
    'threads.unqueue': ({ threadId, messageId }) =>
      this.ctx.turns.unqueueMessage(threadId, messageId),
    'threads.cancel': ({ threadId }) => this.ctx.turns.cancelTurn(threadId),
    'threads.steer': ({ threadId, messageId }) =>
      this.ctx.turns.steerQueuedMessage(threadId, messageId),
    'attachments.pick': ({ threadId }) => this.ctx.attachments.pickAttachments(threadId),
    'attachments.drop': ({ threadId, paths }) =>
      this.ctx.attachments.grantAttachments(threadId, paths),
    'attachments.paste': (input) => this.ctx.attachments.pasteAttachment(input),
    'attachments.preview': (input) => this.ctx.attachments.previewAttachment(input),
    'attachments.open': (input) => this.ctx.attachments.openAttachment(input),
    'attachments.reveal': (input) => this.ctx.attachments.revealAttachment(input),
    'changes.read': ({ threadId }) => this.ctx.workspace.readChanges(threadId),
    'changes.stage': (input) => this.ctx.workspace.stageChanges(input),
    'changes.restore': (input) => this.ctx.workspace.restoreChanges(input),
    'changes.snapshots.list': ({ threadId }) =>
      this.ctx.workspace.listWorkspaceSnapshots(threadId),
    'changes.snapshots.create': ({ threadId }) =>
      this.ctx.workspace.createWorkspaceSnapshot(threadId),
    'changes.snapshots.restore': (input) => this.ctx.workspace.restoreWorkspaceSnapshot(input),
    'changes.snapshots.delete': (input) => this.ctx.workspace.deleteWorkspaceSnapshot(input),
    'changes.turn.read': (input) => this.ctx.workspace.readTurnChanges(input),
    'changes.turn.apply': (input) => this.ctx.workspace.applyTurnChanges(input),
    'terminal.run': (input) => this.ctx.workspace.runTerminal(input),
    'terminal.start': (input) => this.ctx.workspace.startBackgroundTerminal(input),
    'terminal.list': ({ threadId }) => this.ctx.workspace.listBackgroundTerminals(threadId),
    'terminal.write': (input) => this.ctx.workspace.writeBackgroundTerminal(input),
    'terminal.stop': (input) => this.ctx.workspace.stopBackgroundTerminal(input),
    'reviews.start': (input) => this.ctx.workspace.startReview(input),
    'schedules.create': (input) => this.ctx.schedules.createSchedule(input),
    'schedules.update': (input) => this.ctx.schedules.updateSchedule(input),
    'schedules.setEnabled': (input) => this.ctx.schedules.setScheduleEnabled(input),
    'schedules.delete': ({ scheduleId }) => this.ctx.schedules.deleteSchedule(scheduleId),
    'schedules.runNow': ({ scheduleId }) => this.ctx.schedules.runScheduleNow(scheduleId),
    'approvals.resolve': (input) => this.ctx.approvals.resolveApproval(input),
    'providers.probe': ({ providerId }) => this.ctx.providers.probeProviders(providerId),
    'providers.login': ({ providerId }) => this.ctx.providers.providerLogin(providerId),
    'providers.cancelLogin': () => this.ctx.providers.cancelProviderLogin(),
    'settings.openDirectory': async () => ({
      path: await this.ctx.workspace.grantChosenDirectory(),
    }),
    'settings.setOnboarding': (input) => this.ctx.settings.setOnboarding(input),
    'settings.restartForOnboarding': () => this.ctx.settings.restartForOnboarding(),
    'computer.setupMessages': () => this.ctx.computerAccess.setupMessages(),
    'settings.setAppearance': ({ appearance }) => this.ctx.settings.setAppearance(appearance),
    'settings.setTheme': ({ theme }) => this.ctx.settings.setTheme(theme),
    'settings.setTextSize': ({ textSize }) => this.ctx.settings.setTextSize(textSize),
    'settings.setCompletionSound': ({ enabled }) =>
      this.ctx.settings.setCompletionSound(enabled),
    'settings.setOpenAtLogin': ({ enabled }) => this.ctx.settings.setOpenAtLogin(enabled),
    'settings.setDeveloperTools': ({ enabled }) => this.ctx.settings.setDeveloperTools(enabled),
    'feedback.compose': (input) => this.ctx.support.composeFeedbackMessage(input),
    'updates.check': () => this.ctx.support.checkForUpdates(),
    'updates.openDownload': () => this.ctx.support.openUpdateDownload(),
    'computer.permissions': () => this.ctx.computerAccess.refreshComputer(false),
    'computer.requestPermissions': (input) =>
      this.ctx.computerAccess.refreshComputer(true, input?.permission),
    'computer.requestAutomation': ({ app }) => this.ctx.computerAccess.requestAutomation(app),
    'computer.openMessages': () => this.ctx.computerAccess.openMessagesApp(),
    'computer.setAccessMode': (input) => this.ctx.computerAccess.setAccessMode(input),
    'computer.setTrust': ({ trust }) => this.ctx.computerAccess.setComputerTrust(trust),
    'computer.setTrajectoryLog': ({ enabled }) =>
      this.ctx.computerAccess.setTrajectoryLog(enabled),
    'computer.revealTrajectories': () => this.ctx.computerAccess.revealTrajectories(),
    'browser.connectAndContinue': (input) => this.ctx.browser.connectBrowserAndContinue(input),
    'browser.attach': (input) => this.ctx.browser.attachBrowser(input),
    'browser.open': ({ url }) => this.ctx.browser.openBrowserUrl(url),
    'browser.detach': () => this.ctx.browser.detachBrowser(),
    'voice.pushToTalk.configure': (input) => this.ctx.speech.configurePushToTalk(input),
    'voice.pushToTalk.cancel': () => this.ctx.speech.cancelPushToTalk(),
    'voice.capture.acquire': () => this.ctx.speech.acquireRendererCapture(),
    'voice.capture.release': ({ leaseId }) => this.ctx.speech.releaseRendererCapture(leaseId),
    'voice.configure': () => this.ctx.speech.configureVoice(),
    'voice.refresh': () => this.ctx.speech.refreshVoice(),
    'voice.select': ({ voiceId }) => this.ctx.speech.selectVoice(voiceId),
    'voice.disconnect': () => this.ctx.speech.disconnectVoice(),
    'voice.transcribe': (input) => this.ctx.speech.transcribe(input),
    'voice.realtime.start': () => this.ctx.speech.startRealtime(),
    'voice.realtime.append': (input) => this.ctx.speech.appendRealtime(input),
    'voice.realtime.stop': (input) => this.ctx.speech.stopRealtime(input),
    'voice.speak': (input) => this.ctx.speech.speak(input),
    'connections.startGoogle': () => this.ctx.connections.startGoogleConnections(),
    'connections.startSelected': ({ apps }) =>
      this.ctx.connections.startSelectedConnections(apps),
    'connections.upgradeGoogle': () => this.ctx.connections.upgradeGoogleConnections(),
    'connections.start': ({ connectionId }) =>
      this.ctx.connections.startAppConnection(connectionId),
    'connections.setEnabled': (input) => this.ctx.connections.setConnectionEnabled(input),
    'connections.disconnect': (input) => this.ctx.connections.disconnectConnection(input),
    'auth.start': ({ email }) => this.ctx.account.startSignIn(email),
    'auth.complete': ({ code }) => this.ctx.account.completeSignIn(code),
    'auth.mfaBegin': () => this.ctx.account.beginMfaEnrollment(),
    'auth.mfaComplete': ({ code }) => this.ctx.account.completeMfaEnrollment(code),
    'auth.signOut': () => this.ctx.account.signOut(),
    'auth.deleteAccount': ({ confirmation }) =>
      this.ctx.account.deleteCloudAccount(confirmation),
    'research.setCapture': (input) => this.ctx.researchOutbox.setCapture(input),
    'research.export': () => this.ctx.researchOutbox.exportResearch(),
    'research.delete': ({ confirmation }) =>
      this.ctx.researchOutbox.deleteResearch(confirmation),
    'research.admin.invites': () => this.ctx.deps.cloud.listAdminInvites(),
    'research.admin.invite': ({ email }) => this.ctx.deps.cloud.createAdminInvite(email),
    'research.admin.participants': () => this.ctx.deps.cloud.listAdminResearchParticipants(),
    'research.admin.batches': ({ subject }) =>
      this.ctx.deps.cloud.listAdminResearchBatches(subject),
    'research.admin.readBatch': ({ subject, batchId }) =>
      this.ctx.deps.cloud.readAdminResearchBatch(subject, batchId),
  };

  constructor(private readonly ctx: BridgeRouterContext) {}

  async invoke<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    if (
      method !== 'bootstrap' &&
      method !== 'voice.capture.release' &&
      method !== 'providers.cancelLogin'
    )
      this.ctx.providers.requireCodexSetupIdle();
    if (this.ctx.account.accountDeletionInProgress && method !== 'bootstrap') {
      throw new Error('Sia account deletion is in progress. Wait for it to finish.');
    }
    if (this.ctx.account.signOutInProgress && method !== 'bootstrap') {
      throw new Error('Sia sign-out is in progress. Wait for it to finish.');
    }
    if (this.ctx.releaseAccessLocked() && !SIGN_IN_BRIDGE_METHODS.has(method)) {
      throw new Error('Sign in to Sia to continue.');
    }
    const handler = this.handlers[method] as BridgeHandler<M> | undefined;
    if (!handler) throw new Error(`Unknown desktop method: ${String(method)}`);
    return await handler(input);
  }

  /** Runs a renderer bridge call so that any snapshot it returns is the renderer's scoped view. */
  invokeForRenderer<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    return this.ctx.rendererCall.run(true, () => this.invoke(method, input));
  }

  private async configureScotty(
    input: BridgeRequestMap['scotty.configure'],
  ): Promise<BridgeResultMap['scotty.configure']> {
    if (!this.ctx.scotty) throw new Error('Scotty is unavailable in this build.');
    return await this.ctx.scotty(input);
  }

  private async phoneRemoteCommand(
    input: BridgeRequestMap['phone.remote'],
  ): Promise<BridgeResultMap['phone.remote']> {
    if (!this.ctx.phoneRemote) throw new Error('Phone remote is unavailable in this build.');
    return await this.ctx.phoneRemote(input);
  }

  private async messagesRelayCommand(
    input: BridgeRequestMap['messages.relay'],
  ): Promise<BridgeResultMap['messages.relay']> {
    if (!this.ctx.messagesRelay) throw new Error('Texting Sia is unavailable in this build.');
    return await this.ctx.messagesRelay(input);
  }
}
