import { mapDesktopSnapshot } from './desktopSnapshot';
import type { DesktopBridgeApi, DesktopSnapshot, DesktopStreamPatch } from '../shared/bridge';
import { RESEARCH_CONSENT_VERSION } from '../shared/bridge';
import type { RendererApi, RendererSnapshot, ThreadEvent } from './types';

export function createBridgeRendererApi(bridge: DesktopBridgeApi): RendererApi {
  let latest: RendererSnapshot | undefined;
  let latestDesktop: DesktopSnapshot | undefined;
  let selectedAgentOverride: string | undefined;
  const listeners = new Set<(snapshot: RendererSnapshot) => void>();

  let latestOverride: string | undefined;

  const publish = (desktop: DesktopSnapshot) => {
    // A call's result is often the very snapshot that was just pushed (see the preload); it
    // changes nothing, so the window does not render it again.
    if (latest && desktop === latestDesktop && latestOverride === selectedAgentOverride)
      return latest;
    latestDesktop = desktop;
    const previous = latest?.activeThread;
    latest = mapDesktopSnapshot(desktop);
    if (latest.activeThread && previous?.id === latest.activeThread.id)
      latest.activeThread.events = reuseUnchangedEvents(
        previous.events,
        latest.activeThread.events,
      );
    if (
      selectedAgentOverride &&
      latest.agents.some((agent) => agent.id === selectedAgentOverride)
    ) {
      latest.selectedAgentId = selectedAgentOverride;
      if (latest.activeThread?.agentId !== selectedAgentOverride) {
        latest.selectedThreadId = undefined;
        latest.activeThread = undefined;
      }
    } else {
      selectedAgentOverride = undefined;
    }
    latestOverride = selectedAgentOverride;
    // Each mapped snapshot is fresh and never mutated afterwards, so listeners share it.
    // Copying it per listener cost more than the mapping itself on long histories.
    const snapshot = latest;
    listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  };

  // A streamed reply arrives as a patch to the last snapshot. A patch for another thread, or
  // one older than the snapshot in hand, is already covered by that snapshot.
  const applyStream = (patch: DesktopStreamPatch) => {
    const base = latestDesktop;
    if (
      !base ||
      patch.revision <= base.revision ||
      patch.activeThreadId !== base.activeThreadId
    )
      return;
    const changed = new Map(patch.timeline.map((item) => [item.id, item]));
    const timeline = base.timeline.map((item) => {
      const next = changed.get(item.id);
      if (!next) return item;
      changed.delete(item.id);
      return next;
    });
    if (changed.size) {
      timeline.push(...changed.values());
      timeline.sort((left, right) => left.sequence - right.sequence);
    }
    const threads = new Map(patch.threads.map((thread) => [thread.id, thread]));
    publish({
      ...base,
      revision: patch.revision,
      threads: base.threads.map((thread) => threads.get(thread.id) ?? thread),
      previews: { ...base.previews, ...patch.previews },
      timeline,
    });
  };

  const publishLocal = (update: (snapshot: RendererSnapshot) => void) => {
    if (!latest) return;
    const snapshot = { ...latest };
    update(snapshot);
    latest = snapshot;
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    onOpenConversation(listener) {
      return bridge.subscribe((event) => {
        if (event.type === 'open-conversation') listener();
      });
    },
    scotty: (input) => bridge.scotty(input),
    phoneRemote: (input) => bridge.phoneRemote(input),
    async getSnapshot() {
      return publish(await bridge.bootstrap());
    },
    subscribe(listener, onError) {
      listeners.add(listener);
      const unsubscribe = bridge.subscribe((event) => {
        if (event.type === 'snapshot') publish(event.snapshot);
        else if (event.type === 'stream') applyStream(event.patch);
        else if (event.type === 'fatal') onError?.(event.error.message);
      });
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
    async selectAgent(agentId) {
      selectedAgentOverride = agentId;
      publishLocal((snapshot) => {
        snapshot.selectedAgentId = agentId;
        const selectedThreadBelongsToAgent = snapshot.agents
          .find((agent) => agent.id === agentId)
          ?.threads.some((thread) => thread.id === snapshot.selectedThreadId);
        if (!selectedThreadBelongsToAgent) {
          snapshot.selectedThreadId = undefined;
          snapshot.activeThread = undefined;
        }
      });
    },
    async selectThread(threadId) {
      const desktop = await bridge.threads.select(threadId);
      selectedAgentOverride = undefined;
      publish(desktop);
    },
    async createThread(agentId) {
      const result = await bridge.threads.create({ agentId });
      selectedAgentOverride = undefined;
      publish(result.snapshot);
      return result.threadId;
    },
    async renameThread(threadId, title) {
      publish(await bridge.threads.rename(threadId, title));
    },
    async saveDraft(threadId, content) {
      // Saving a draft sends no snapshot back, so the Draft marker and preview update here;
      // the next snapshot from the main process carries the same draft.
      await bridge.threads.setDraft(threadId, content);
      const draft = content || undefined;
      publishLocal((snapshot) => {
        snapshot.agents = snapshot.agents.map((agent) =>
          agent.threads.some((thread) => thread.id === threadId)
            ? {
                ...agent,
                threads: agent.threads.map((thread) =>
                  thread.id === threadId ? { ...thread, draft } : thread,
                ),
              }
            : agent,
        );
        if (snapshot.activeThread?.id === threadId)
          snapshot.activeThread = { ...snapshot.activeThread, draft };
      });
    },
    async deleteThread(threadId) {
      publish(await bridge.threads.delete(threadId));
    },
    async configureThread(threadId, model, reasoningEffort) {
      publish(
        await bridge.threads.config({
          threadId,
          model,
          ...(reasoningEffort ? { reasoningEffort } : {}),
        }),
      );
    },
    async archiveThread(threadId) {
      publish(await bridge.threads.archive(threadId));
    },
    async unarchiveThread(threadId) {
      publish(await bridge.threads.unarchive(threadId));
    },
    async setThreadUnread(threadId, unread) {
      publish(await bridge.threads.setUnread(threadId, unread));
    },
    async setThreadPinned(threadId, pinned) {
      publish(await bridge.threads.setPinned(threadId, pinned));
    },
    async forkThread(threadId, isolated, title) {
      const result = await bridge.threads.fork(threadId, isolated, title);
      selectedAgentOverride = undefined;
      publish(result.snapshot);
      return result.threadId;
    },
    async handoffThread(threadId, destination, title) {
      const result = await bridge.threads.handoff(threadId, destination, title);
      selectedAgentOverride = undefined;
      publish(result.snapshot);
      return result.threadId;
    },
    async cleanupWorktree(threadId) {
      publish(await bridge.worktrees.cleanup(threadId));
    },
    async searchThreads(query) {
      const result = await bridge.threads.search(query);
      return structuredClone(result.results);
    },
    async setGoal(threadId, text) {
      publish(await bridge.threads.setGoal(threadId, text));
    },
    async pauseGoal(threadId) {
      publish(await bridge.threads.pauseGoal(threadId));
    },
    async resumeGoal(threadId) {
      publish(await bridge.threads.resumeGoal(threadId));
    },
    async clearGoal(threadId) {
      publish(await bridge.threads.clearGoal(threadId));
    },
    async createAgent(draft) {
      const result = await bridge.agents.save(draft);
      selectedAgentOverride = undefined;
      publish(result.snapshot);
      return result.agentId;
    },
    async updateAgent(agentId, draft) {
      const result = await bridge.agents.save({ id: agentId, ...draft });
      publish(result.snapshot);
    },
    async deleteAgent(agentId) {
      publish(await bridge.agents.delete(agentId));
    },
    async setAgentPinned(agentId, pinned) {
      publish(await bridge.agents.setPinned(agentId, pinned));
    },
    async setAgentNotifications(agentId, enabled) {
      publish(await bridge.agents.setNotifications(agentId, enabled));
    },
    async duplicateAgent(agentId) {
      const result = await bridge.agents.duplicate(agentId);
      selectedAgentOverride = undefined;
      publish(result.snapshot);
      return result.agentId;
    },
    async pickWorkspace() {
      const result = await bridge.settings.openDirectory();
      return result.path ?? undefined;
    },
    async pickAttachments(threadId) {
      const result = await bridge.attachments.pick(threadId);
      return structuredClone(result.attachments);
    },
    async dropAttachments(threadId, files) {
      const result = await bridge.attachments.drop(threadId, files);
      return structuredClone(result.attachments);
    },
    async pasteAttachments(threadId, files) {
      const result = await bridge.attachments.paste(threadId, files);
      return structuredClone(result.attachments);
    },
    async previewAttachment(threadId, attachmentId) {
      return structuredClone(await bridge.attachments.preview(threadId, attachmentId));
    },
    async openAttachment(threadId, attachmentId) {
      await bridge.attachments.open(threadId, attachmentId);
    },
    async revealAttachment(threadId, attachmentId) {
      await bridge.attachments.reveal(threadId, attachmentId);
    },
    async sendMessage(threadId, content, attachmentIds) {
      const result = await bridge.threads.send({
        threadId,
        text: content,
        ...(attachmentIds?.length ? { attachmentIds: [...attachmentIds] } : {}),
      });
      publish(result.snapshot);
    },
    async readChanges(threadId) {
      return structuredClone(await bridge.changes.read(threadId));
    },
    async stageChanges(threadId, paths) {
      return structuredClone(await bridge.changes.stage(threadId, paths));
    },
    async restoreChanges(threadId, paths) {
      return structuredClone(await bridge.changes.restore(threadId, paths));
    },
    async listWorkspaceSnapshots(threadId) {
      const result = await bridge.changes.listSnapshots(threadId);
      return structuredClone(result.snapshots);
    },
    async createWorkspaceSnapshot(threadId) {
      const result = await bridge.changes.createSnapshot(threadId);
      return structuredClone(result.snapshots);
    },
    async restoreWorkspaceSnapshot(threadId, snapshotId) {
      return structuredClone(await bridge.changes.restoreSnapshot(threadId, snapshotId));
    },
    async deleteWorkspaceSnapshot(threadId, snapshotId) {
      const result = await bridge.changes.deleteSnapshot(threadId, snapshotId);
      return structuredClone(result.snapshots);
    },
    async readTurnChanges(threadId, eventId) {
      return structuredClone(await bridge.changes.readTurn(threadId, eventId));
    },
    async applyTurnChanges(threadId, eventId, direction) {
      return structuredClone(await bridge.changes.applyTurn(threadId, eventId, direction));
    },
    async runTerminal(threadId, command) {
      return structuredClone(await bridge.terminal.run(threadId, command));
    },
    async startBackgroundTerminal(threadId, command) {
      return structuredClone(await bridge.terminal.start(threadId, command));
    },
    async listBackgroundTerminals(threadId) {
      const result = await bridge.terminal.list(threadId);
      return structuredClone(result.sessions);
    },
    async writeBackgroundTerminal(threadId, terminalId, input) {
      return structuredClone(await bridge.terminal.write(threadId, terminalId, input));
    },
    async stopBackgroundTerminal(threadId, terminalId) {
      return structuredClone(await bridge.terminal.stop(threadId, terminalId));
    },
    async startReview(threadId, target) {
      const result = await bridge.reviews.start({ threadId, target });
      publish(result.snapshot);
    },
    async createSchedule(threadId, prompt, cadence, nextRunAt, maxRuns, rule) {
      publish(
        await bridge.schedules.create({
          threadId,
          prompt,
          cadence,
          ...definedScheduleFields({ ...rule }),
          nextRunAt,
          ...(maxRuns === undefined ? {} : { maxRuns }),
        }),
      );
    },
    async updateSchedule(scheduleId, changes) {
      publish(await bridge.schedules.update({ scheduleId, ...definedScheduleFields(changes) }));
    },
    async setScheduleEnabled(scheduleId, enabled) {
      publish(await bridge.schedules.setEnabled(scheduleId, enabled));
    },
    async deleteSchedule(scheduleId) {
      publish(await bridge.schedules.delete(scheduleId));
    },
    async runScheduleNow(scheduleId) {
      const result = await bridge.schedules.runNow(scheduleId);
      publish(result.snapshot);
    },
    async cancelTurn(threadId) {
      publish(await bridge.threads.cancel(threadId));
    },
    async removeQueuedMessage(threadId, messageId) {
      publish(await bridge.threads.unqueue(threadId, messageId));
    },
    async steerQueuedMessage(threadId, messageId) {
      publish(await bridge.threads.steer(threadId, messageId));
    },
    async respondToApproval(approvalId, decision) {
      publish(
        await bridge.approvals.resolve({
          approvalId,
          decision: decision === 'reject' ? 'deny' : decision,
        }),
      );
    },
    async retryThread(threadId) {
      const result = await bridge.threads.retry(threadId);
      publish(result.snapshot);
    },
    async redoLastMessage(threadId, text) {
      publish((await bridge.threads.redo(threadId, text)).snapshot);
    },
    async setCapturePaused(paused) {
      publish(
        await bridge.research.setCapture(
          !paused,
          !paused && !latest?.research.consented ? RESEARCH_CONSENT_VERSION : undefined,
        ),
      );
    },
    async declineResearchConsent() {
      publish(await bridge.research.setCapture(false, RESEARCH_CONSENT_VERSION));
    },
    async openProviderSetup(provider) {
      const result = await bridge.providers.login(provider);
      publish(result.snapshot);
    },
    async cancelProviderSetup(provider) {
      publish(await bridge.providers.cancelLogin(provider));
    },
    async saveApiKey(input) {
      publish(await bridge.providers.setApiKey(input));
    },
    async clearApiKey() {
      publish(await bridge.providers.clearApiKey());
    },
    async refreshProvider(provider) {
      publish(await bridge.providers.probe(provider));
    },
    async connectGoogleApps() {
      const result = await bridge.connections.startGoogle();
      publish(result.snapshot);
    },
    async connectSelectedApps(apps) {
      publish((await bridge.connections.startSelected(apps)).snapshot);
    },
    async upgradeGoogleApps() {
      const result = await bridge.connections.upgradeGoogle();
      publish(result.snapshot);
    },
    async connectApp(app) {
      const result = await bridge.connections.start(app);
      publish(result.snapshot);
    },
    async setAppEnabled(app, enabled) {
      publish(await bridge.connections.setEnabled(app, enabled));
    },
    async disconnectApp(app, expectedConnectionId) {
      publish(await bridge.connections.disconnect(app, expectedConnectionId));
    },
    async startCloudSignIn(email) {
      publish(await bridge.auth.start(email));
    },
    async completeCloudSignIn(code) {
      publish(await bridge.auth.complete(code));
    },
    async beginAdminMfa() {
      return await bridge.auth.mfaBegin();
    },
    async completeAdminMfa(code) {
      publish(await bridge.auth.mfaComplete(code));
    },
    async assistantLibrary(input) {
      return bridge.assistantLibrary(input);
    },
    async signOutCloud() {
      publish(await bridge.auth.signOut());
    },
    async deleteCloudAccount(confirmation) {
      publish(await bridge.auth.deleteAccount(confirmation));
    },
    async connectBrowserAndContinue(threadId, userMessageId, windowId) {
      publish(
        await bridge.browser.connectAndContinue({
          threadId,
          userMessageId,
          ...(windowId === undefined ? {} : { windowId }),
        }),
      );
    },
    async attachBrowser(windowId) {
      publish(await bridge.browser.attach(windowId));
    },
    async openBrowserSite(url) {
      publish(await bridge.browser.open(url));
    },
    async detachBrowser() {
      publish(await bridge.browser.detach());
    },
    async setComputerAccessMode(mode, background, backgroundFallback) {
      publish(await bridge.computer.setAccessMode(mode, background, backgroundFallback));
    },
    async setComputerTrust(trust) {
      publish(await bridge.computer.setTrust(trust));
    },
    async setTrajectoryLog(enabled) {
      publish(await bridge.computer.setTrajectoryLog(enabled));
    },
    async revealTrajectories() {
      publish(await bridge.computer.revealTrajectories());
    },
    async refreshComputerPermissions() {
      publish(await bridge.computer.permissions());
    },
    async requestAutomationPermission(app) {
      publish(await bridge.computer.requestAutomation(app));
    },
    async requestComputerPermissions(permission) {
      publish(await bridge.computer.requestPermissions(permission));
    },
    async openMessages() {
      publish(await bridge.computer.openMessages());
    },
    async configurePushToTalk(enabled, agentId, requestAccessibility, speakReplies) {
      publish(
        await bridge.voice.configurePushToTalk(
          enabled,
          agentId,
          requestAccessibility,
          speakReplies,
        ),
      );
    },
    async acquireVoiceCapture() {
      return (await bridge.voice.acquireCapture()).leaseId;
    },
    async releaseVoiceCapture(leaseId) {
      await bridge.voice.releaseCapture(leaseId);
    },
    async configureVoice() {
      publish(await bridge.voice.configure());
    },
    async refreshVoices() {
      publish(await bridge.voice.refresh());
    },
    async selectVoice(voiceId) {
      publish(await bridge.voice.select(voiceId));
    },
    async disconnectVoice() {
      publish(await bridge.voice.disconnect());
    },
    async restartForOnboarding() {
      publish(await bridge.settings.restartForOnboarding());
    },
    async setupMessages() {
      publish(await bridge.computer.setupMessages());
    },
    async setOnboarding(step, permissionSetup) {
      publish(await bridge.settings.setOnboarding(step, permissionSetup));
    },
    async setAppearance(appearance) {
      publish(await bridge.settings.setAppearance(appearance));
    },
    async setTheme(theme) {
      publish(await bridge.settings.setTheme(theme));
    },
    async setTextSize(textSize) {
      publish(await bridge.settings.setTextSize(textSize));
    },
    async setCompletionSound(enabled) {
      publish(await bridge.settings.setCompletionSound(enabled));
    },
    async setOpenAtLogin(enabled) {
      publish(await bridge.settings.setOpenAtLogin(enabled));
    },
    async setDeveloperTools(enabled) {
      publish(await bridge.settings.setDeveloperTools(enabled));
    },
    async composeFeedback(message, threadId, includeDiagnostics) {
      await bridge.feedback.compose(message, threadId, includeDiagnostics);
    },
    async checkForUpdates() {
      await bridge.updates.check();
      publish(await bridge.bootstrap());
    },
    async openUpdateDownload() {
      await bridge.updates.openDownload();
    },
    async transcribeVoice(audioBase64, mimeType) {
      return (await bridge.voice.transcribe(audioBase64, mimeType)).text;
    },
    async startRealtimeVoice() {
      return (await bridge.voice.startRealtime()).sessionId;
    },
    async appendRealtimeVoice(sessionId, audioBase64) {
      await bridge.voice.appendRealtime(sessionId, audioBase64);
    },
    async stopRealtimeVoice(sessionId, commit) {
      return (await bridge.voice.stopRealtime(sessionId, commit)).text;
    },
    async speakText(text, voiceId) {
      return await bridge.voice.speak(text, voiceId);
    },
    async exportResearchData() {
      await bridge.research.export();
    },
    async deleteResearchData() {
      publish(await bridge.research.delete());
    },
    async listResearchInvites() {
      return await bridge.research.listAdminInvites();
    },
    async createResearchInvite(email) {
      return (await bridge.research.createAdminInvite(email)).invite;
    },
    async listResearchParticipants() {
      return (await bridge.research.listAdminParticipants()).participants;
    },
    async listResearchBatches(subject) {
      return (await bridge.research.listAdminBatches(subject)).batches;
    },
    async readResearchBatch(subject, batchId) {
      return (await bridge.research.readAdminBatch(subject, batchId)).batch;
    },
  };
}

/**
 * Keeps the previous object for every event whose content is unchanged, and the previous array
 * when nothing changed, so memoized transcript rows skip work while one reply streams.
 */
function reuseUnchangedEvents(
  previous: readonly ThreadEvent[],
  next: ThreadEvent[],
): ThreadEvent[] {
  const byId = new Map(previous.map((event) => [event.id, event]));
  const events = next.map((event) => {
    const earlier = byId.get(event.id);
    return earlier && sameData(earlier, event) ? earlier : event;
  });
  return events.length === previous.length &&
    events.every((event, index) => event === previous[index])
    ? (previous as ThreadEvent[])
    : events;
}

function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || !left || !right) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      sameData((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

/** The bridge's strict schemas reject explicit undefined, so only present fields cross it. */
function definedScheduleFields<T extends object>(
  fields: T,
): { [K in keyof T]-?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]-?: Exclude<T[K], undefined> };
}
