import { agentIdentity } from './agentIdentity';
import type {
  ApprovalView,
  DesktopBridgeApi,
  DesktopSnapshot,
  ProviderStatus as BridgeProviderStatus,
  TimelineItemView,
} from '../shared/bridge';
import { RESEARCH_CONSENT_VERSION } from '../shared/bridge';
import type {
  ActivityEvent,
  AgentSummary,
  ApprovalEvent,
  AppConnection,
  ProviderStatus,
  RendererApi,
  RendererSnapshot,
  ThreadDetail,
  ThreadEvent,
  ThreadStatus,
} from './types';

export function createBridgeRendererApi(bridge: DesktopBridgeApi): RendererApi {
  let latest: RendererSnapshot | undefined;
  let selectedAgentOverride: string | undefined;
  const listeners = new Set<(snapshot: RendererSnapshot) => void>();

  const publish = (desktop: DesktopSnapshot) => {
    latest = mapDesktopSnapshot(desktop);
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
    listeners.forEach((listener) => listener(structuredClone(latest!)));
    return latest;
  };

  const publishLocal = (update: (snapshot: RendererSnapshot) => void) => {
    if (!latest) return;
    update(latest);
    listeners.forEach((listener) => listener(structuredClone(latest!)));
  };

  return {
    async getSnapshot() {
      return structuredClone(publish(await bridge.bootstrap()));
    },
    subscribe(listener, onError) {
      listeners.add(listener);
      const unsubscribe = bridge.subscribe((event) => {
        if (event.type === 'snapshot') publish(event.snapshot);
        else onError?.(event.error.message);
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
    async pickWorkspace() {
      const result = await bridge.settings.openDirectory();
      return result.path ?? undefined;
    },
    async pickAttachments(threadId) {
      const result = await bridge.attachments.pick(threadId);
      return structuredClone(result.attachments);
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
    async createSchedule(threadId, prompt, cadence, nextRunAt) {
      publish(await bridge.schedules.create({ threadId, prompt, cadence, nextRunAt }));
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
    async respondToApproval(approvalId, decision) {
      publish(
        await bridge.approvals.resolve({
          approvalId,
          decision: decision === 'reject' ? 'deny' : 'approve',
        }),
      );
    },
    async retryThread(threadId) {
      const result = await bridge.threads.retry(threadId);
      publish(result.snapshot);
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
    async refreshProvider(provider) {
      publish(await bridge.providers.probe(provider));
    },
    async connectAllApps() {
      const result = await bridge.connections.startAll();
      publish(result.snapshot);
    },
    async connectApp(app) {
      const result = await bridge.connections.start(app);
      publish(result.snapshot);
    },
    async disconnectApp(app) {
      publish(await bridge.connections.disconnect(app));
    },
    async startCloudSignIn(email) {
      publish(await bridge.auth.start(email));
    },
    async completeCloudSignIn(code) {
      publish(await bridge.auth.complete(code));
    },
    async signOutCloud() {
      publish(await bridge.auth.signOut());
    },
    async deleteCloudAccount(confirmation) {
      publish(await bridge.auth.deleteAccount(confirmation));
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
    async setComputerTrust(trust) {
      publish(await bridge.computer.setTrust(trust));
    },
    async setTrajectoryLog(enabled) {
      publish(await bridge.computer.setTrajectoryLog(enabled));
    },
    async revealTrajectories() {
      publish(await bridge.computer.revealTrajectories());
    },
    async requestComputerPermissions() {
      publish(await bridge.computer.requestPermissions());
    },
    async openMessages() {
      publish(await bridge.computer.openMessages());
    },
    async configureVoice(apiKey) {
      publish(await bridge.voice.configure(apiKey));
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
    async setCompletionSound(enabled) {
      publish(await bridge.settings.setCompletionSound(enabled));
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
  };
}

export function mapDesktopSnapshot(source: DesktopSnapshot): RendererSnapshot {
  const threadMap = new Map(source.threads.map((thread) => [thread.id, thread]));
  const agents: AgentSummary[] = source.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    initials: initialsFor(agent.name),
    hue: agent.hue ?? agentIdentity(agent.id),
    instructions: agent.instructions,
    provider: agent.provider,
    model: agent.model,
    workspace: agent.workspace,
    ...(agent.voiceId ? { voiceId: agent.voiceId } : {}),
    threads: agent.threadIds
      .map((threadId) => threadMap.get(threadId))
      .filter((thread): thread is NonNullable<typeof thread> =>
        Boolean(thread && !thread.archivedAt),
      )
      .map((thread) => ({
        id: thread.id,
        agentId: thread.agentId,
        title: thread.title,
        updatedAt: thread.updatedAt,
        status: mapThreadStatus(thread.status),
        queueReason: thread.queueReason,
        archivedAt: thread.archivedAt,
        sourceThreadId: thread.sourceThreadId,
        unread: thread.unread,
        worktree: thread.worktree ? structuredClone(thread.worktree) : undefined,
      })),
  }));

  const currentThread = source.threads.find((thread) => thread.id === source.activeThreadId);
  const timeline = currentThread
    ? source.timeline
        .filter((item) => item.threadId === currentThread.id)
        .sort((a, b) => a.sequence - b.sequence)
        .map((item) => {
          const approval =
            item.kind === 'approval'
              ? source.approvals.find((candidate) => candidate.id === item.approvalId)
              : undefined;
          return approval ? mapApproval(approval, item.timestamp) : mapTimelineItem(item);
        })
    : [];
  const timelineApprovalIds = new Set(
    timeline.filter((event) => event.type === 'approval').map((event) => event.id),
  );
  const pendingApprovals = currentThread
    ? source.approvals
        .filter(
          (approval) =>
            approval.threadId === currentThread.id && !timelineApprovalIds.has(approval.id),
        )
        .map((approval) => mapApproval(approval))
    : [];

  const activeThread: ThreadDetail | undefined = currentThread
    ? {
        id: currentThread.id,
        agentId: currentThread.agentId,
        title: currentThread.title,
        updatedAt: currentThread.updatedAt,
        status: mapThreadStatus(currentThread.status),
        queueReason: currentThread.queueReason,
        provider: currentThread.provider,
        model: currentThread.model,
        reasoningEffort: currentThread.reasoningEffort,
        workspace: currentThread.workspace,
        goal: currentThread.goal ? structuredClone(currentThread.goal) : undefined,
        archivedAt: currentThread.archivedAt,
        sourceThreadId: currentThread.sourceThreadId,
        unread: currentThread.unread,
        worktree: currentThread.worktree ? structuredClone(currentThread.worktree) : undefined,
        events: [...timeline, ...pendingApprovals],
        error:
          currentThread.status === 'failed'
            ? source.timeline.findLast(
                (item) => item.threadId === currentThread.id && item.kind === 'error',
              )?.text
            : undefined,
      }
    : undefined;

  return {
    connection: source.cloud.status === 'online' ? 'online' : 'offline',
    cloudAuth: {
      state:
        source.cloud.auth === 'signed_out'
          ? 'signed-out'
          : source.cloud.auth === 'code_sent'
            ? 'code-sent'
            : source.cloud.auth === 'signed_in'
              ? 'signed-in'
              : 'unconfigured',
      email: source.cloud.account,
    },
    agents,
    selectedAgentId: source.activeAgentId,
    selectedThreadId: source.activeThreadId,
    activeThread,
    providers: source.providers.map((provider) => ({
      id: provider.id,
      name: provider.label,
      model: provider.model,
      description: provider.detail,
      status: mapProviderStatus(provider.status),
      account: provider.account,
      version: provider.version,
      billedBy: provider.billing,
      restriction: provider.restriction,
      models: (provider.models ?? []).map((model) => ({
        id: model.id,
        label: model.label,
        description: model.description,
        reasoningEfforts: [...model.reasoningEfforts],
        defaultReasoningEffort: model.defaultReasoningEffort,
      })),
    })),
    apps: source.connections.map(mapConnection),
    browser: {
      status: source.browser.status,
      profileName: source.browser.profileLabel ?? 'Chrome profile',
      attached: source.browser.status === 'attached',
      availableWindows: (source.browser.availableWindows ?? []).map((window) => ({
        id: window.id,
        label: window.label,
        detail: window.detail,
      })),
      tabs: source.browser.grantedOrigins.map((origin, index) => ({
        id: `origin-${index}`,
        title: origin,
        origin,
        active: index === 0,
        granted: true,
      })),
      snapshotLabel: source.browser.detail,
    },
    computer: {
      accessibility: source.computer.accessibility ? 'allowed' : 'not-requested',
      screenRecording: source.computer.screenRecording ? 'allowed' : 'not-requested',
      windows: [],
      trust: source.computer.trust,
      trajectoryLog: source.computer.trajectoryLog,
      trajectoryDirectory: source.computer.trajectoryDirectory,
    },
    voice: {
      status: source.voice.status,
      selectedVoiceId: source.voice.selectedVoiceId,
      selectedVoiceName: source.voice.selectedVoiceName,
      voices: source.voice.voices.map((voice) => ({ ...voice })),
      detail: source.voice.detail,
    },
    preferences: structuredClone(source.preferences),
    research: {
      consented: source.capture.status !== 'not_consented',
      capture:
        source.capture.status === 'sync_pending'
          ? 'sync-pending'
          : source.capture.status === 'recording'
            ? 'recording'
            : 'paused',
      promptReviewedVersion: source.capture.promptReviewedVersion,
      allowedOrigins: [],
      excludedPaths: [],
      pendingItems: source.capture.pendingCount,
    },
    archivedThreads: source.threads
      .filter((thread) => Boolean(thread.archivedAt))
      .map((thread) => ({
        id: thread.id,
        agentId: thread.agentId,
        title: thread.title,
        updatedAt: thread.updatedAt,
        status: mapThreadStatus(thread.status),
        queueReason: thread.queueReason,
        archivedAt: thread.archivedAt,
        sourceThreadId: thread.sourceThreadId,
        unread: thread.unread,
        worktree: thread.worktree ? structuredClone(thread.worktree) : undefined,
      })),
    schedules: (source.schedules ?? []).map((schedule) => structuredClone(schedule)),
    ...(source.startupNotice ? { startupNotice: structuredClone(source.startupNotice) } : {}),
  };
}

function mapTimelineItem(item: TimelineItemView): ThreadEvent {
  if (item.kind === 'user' || item.kind === 'assistant') {
    return {
      id: item.id,
      type: 'message',
      role: item.kind,
      content: item.text ?? item.detail ?? '',
      timestamp: item.timestamp,
      ...(item.attachments?.length
        ? { attachments: item.attachments.map((attachment) => ({ ...attachment })) }
        : {}),
    };
  }

  if (item.kind === 'approval') {
    return {
      id: item.approvalId ?? item.id,
      type: 'approval',
      status:
        item.status === 'denied'
          ? 'rejected'
          : item.status === 'complete'
            ? 'approved'
            : 'pending',
      timestamp: item.timestamp,
      request: {
        id: item.approvalId ?? item.id,
        kind: 'action',
        title: item.title ?? 'Approve this action',
        category: inferApprovalCategory(item.toolName),
        summary: item.text ?? item.title ?? 'Run the requested action',
        target: item.detail ?? 'Selected target',
        reversible: false,
      },
    };
  }

  if (item.kind === 'question') {
    return {
      id: item.id,
      type: 'question',
      prompt: item.text ?? item.detail ?? 'The provider needs more information.',
      status: item.status === 'complete' ? 'answered' : 'pending',
      timestamp: item.timestamp,
    };
  }

  if (item.kind === 'notice' || item.kind === 'error') {
    return {
      id: item.id,
      type: 'notice',
      tone: item.kind === 'error' ? 'error' : 'info',
      title: item.title ?? (item.kind === 'error' ? 'The turn stopped' : 'Update'),
      detail: item.text ?? item.detail ?? '',
    };
  }

  const status: ActivityEvent['status'] =
    item.status === 'failed'
      ? 'error'
      : item.status === 'complete'
        ? 'complete'
        : item.status === 'pending'
          ? 'queued'
          : 'running';
  return {
    id: item.id,
    type: 'activity',
    kind: inferActivityKind(item.toolName),
    title: item.title ?? item.text ?? 'Working',
    detail: item.detail,
    status,
    timestamp: item.timestamp,
    ...(item.activity ? { presentation: structuredClone(item.activity) } : {}),
  };
}

function mapApproval(
  approval: ApprovalView,
  timestamp = new Date().toISOString(),
): ApprovalEvent {
  const status =
    approval.status === 'denied'
      ? 'rejected'
      : approval.status === 'approved'
        ? 'approved'
        : approval.status;

  if (approval.kind === 'foreground_takeover') {
    return {
      id: approval.id,
      type: 'approval',
      status,
      timestamp,
      request: {
        id: approval.id,
        kind: 'foreground',
        title: approval.title,
        reason: approval.summary,
        appName: approval.target,
        target: approval.dataLeaving ?? approval.summary,
        restoresFocusTo: 'your current app',
      },
    };
  }

  if (approval.kind === 'connector_write') {
    return {
      id: approval.id,
      type: 'approval',
      status,
      timestamp,
      request: {
        id: approval.id,
        kind: 'connector',
        title: approval.title,
        app: inferConnector(approval.title),
        account: approval.account ?? 'Account unspecified',
        action: approval.summary,
        destination: approval.target,
        preview: approval.dataLeaving ?? approval.summary,
        expiresAt: approval.expiresAt,
      },
    };
  }

  return {
    id: approval.id,
    type: 'approval',
    status,
    timestamp,
    request: {
      id: approval.id,
      kind: 'action',
      title: approval.title,
      category:
        approval.kind === 'file_upload'
          ? 'File'
          : approval.kind === 'browser_attach'
            ? 'Browser'
            : 'Tool',
      summary: approval.summary,
      target: approval.target,
      dataLeaving: approval.dataLeaving,
      dataLabel: approval.dataLabel,
      reversible: approval.reversible,
    },
  };
}

function mapThreadStatus(status: DesktopSnapshot['threads'][number]['status']): ThreadStatus {
  return status === 'failed' ? 'error' : status;
}

function mapProviderStatus(status: BridgeProviderStatus): ProviderStatus {
  if (status === 'ready') return 'ready';
  if (status === 'disabled') return 'disabled';
  if (status === 'unavailable') return 'unavailable';
  if (status === 'needs_install') return 'needs-install';
  if (status === 'needs_login') return 'needs-login';
  return 'incompatible';
}

function mapConnection(connection: DesktopSnapshot['connections'][number]): AppConnection {
  const permissions = {
    gmail: ['Search and read mail', 'Create and send approved drafts'],
    drive: ['Find and read selected files', 'Upload and share with approval'],
    slack: ['Search and read messages', 'Post approved messages'],
  }[connection.id];
  return {
    id: connection.id,
    name: connection.label,
    description: connection.detail ?? 'Use this app through Sia with explicit write approval.',
    status: connection.status,
    account: connection.account,
    permissions,
  };
}

function inferConnector(value?: string): 'Gmail' | 'Google Drive' | 'Slack' {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('slack')) return 'Slack';
  if (normalized.includes('drive')) return 'Google Drive';
  return 'Gmail';
}

function inferActivityKind(value?: string): ActivityEvent['kind'] {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('browser')) return 'browser';
  if (normalized.includes('computer')) return 'computer';
  if (
    normalized.includes('mail') ||
    normalized.includes('drive') ||
    normalized.includes('slack')
  ) {
    return 'connector';
  }
  if (normalized.includes('plan')) return 'plan';
  return 'command';
}

function inferApprovalCategory(value?: string): 'Tool' | 'Browser' | 'File' {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('browser')) return 'Browser';
  if (normalized.includes('file') || normalized.includes('upload')) return 'File';
  return 'Tool';
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
