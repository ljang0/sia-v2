import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  BridgeInvokeEnvelope,
  BridgeMethod,
  BridgeRequestMap,
  BridgeResultMap,
  DesktopBridgeApi,
  DesktopPushEvent,
} from '../shared/bridge.js';

const INVOKE_CHANNEL = 'sia:invoke';
const EVENT_CHANNEL = 'sia:event';

const invoke = <M extends BridgeMethod>(
  method: M,
  input: BridgeRequestMap[M],
): Promise<BridgeResultMap[M]> => {
  const envelope: BridgeInvokeEnvelope<M> = { method, input };
  return ipcRenderer.invoke(INVOKE_CHANNEL, envelope).catch((cause: unknown) => {
    if (cause instanceof Error)
      throw new Error(
        cause.message.replace(/^Error invoking remote method 'sia:invoke': (?:Error: )?/, ''),
      );
    throw cause;
  }) as Promise<BridgeResultMap[M]>;
};

const api: DesktopBridgeApi = {
  scotty: (input) => invoke('scotty.configure', input),
  phoneRemote: (input) => invoke('phone.remote', input),
  assistantLibrary: (input) => invoke('assistant.library', input),
  bootstrap: () => invoke('bootstrap', undefined),
  agents: {
    save: (input) => invoke('agents.save', input),
    delete: (agentId) => invoke('agents.delete', { agentId }),
    setPinned: (agentId, pinned) => invoke('agents.setPinned', { agentId, pinned }),
    setNotifications: (agentId, enabled) =>
      invoke('agents.setNotifications', { agentId, enabled }),
    duplicate: (agentId) => invoke('agents.duplicate', { agentId }),
  },
  threads: {
    create: (input) => invoke('threads.create', input),
    select: (threadId) => invoke('threads.select', { threadId }),
    rename: (threadId, title) => invoke('threads.rename', { threadId, title }),
    setDraft: (threadId, text) => invoke('threads.draft', { threadId, text }),
    config: (input) => invoke('threads.config', input),
    archive: (threadId) => invoke('threads.archive', { threadId }),
    unarchive: (threadId) => invoke('threads.unarchive', { threadId }),
    setUnread: (threadId, unread) => invoke('threads.setUnread', { threadId, unread }),
    fork: (threadId, isolated, title) =>
      invoke('threads.fork', {
        threadId,
        isolated,
        ...(title ? { title } : {}),
      }),
    handoff: (threadId, destination, title) =>
      invoke('threads.handoff', {
        threadId,
        destination,
        ...(title ? { title } : {}),
      }),
    search: (query) => invoke('threads.search', { query }),
    setGoal: (threadId, text) => invoke('threads.goal.set', { threadId, text }),
    pauseGoal: (threadId) => invoke('threads.goal.pause', { threadId }),
    resumeGoal: (threadId) => invoke('threads.goal.resume', { threadId }),
    clearGoal: (threadId) => invoke('threads.goal.clear', { threadId }),
    delete: (threadId) => invoke('threads.delete', { threadId }),
    send: (input) => invoke('threads.send', input),
    retry: (threadId) => invoke('threads.retry', { threadId }),
    redo: (threadId, text, attachmentIds) =>
      invoke('threads.redo', {
        threadId,
        ...(text ? { text } : {}),
        ...(attachmentIds?.length ? { attachmentIds: [...attachmentIds] } : {}),
      }),
    cancel: (threadId) => invoke('threads.cancel', { threadId }),
    unqueue: (threadId, messageId) => invoke('threads.unqueue', { threadId, messageId }),
    steer: (threadId, messageId) => invoke('threads.steer', { threadId, messageId }),
  },
  worktrees: {
    cleanup: (threadId) =>
      invoke('worktrees.cleanup', { threadId, confirmation: 'REMOVE WORKTREE' }),
  },
  attachments: {
    pick: (threadId) => invoke('attachments.pick', { threadId }),
    drop: (threadId, files) =>
      invoke('attachments.drop', {
        threadId,
        paths: files
          .map((file) => webUtils.getPathForFile(file))
          .filter(Boolean)
          .slice(0, 20),
      }),
    paste: async (threadId, files) => {
      const attachments: BridgeResultMap['attachments.paste']['attachments'] = [];
      const paths: string[] = [];
      for (const file of files.slice(0, 20)) {
        const path = webUtils.getPathForFile(file);
        if (path) {
          paths.push(path);
          continue;
        }
        const pasted = await invoke('attachments.paste', {
          threadId,
          ...(file.name ? { name: file.name } : {}),
          mimeType: file.type || 'application/octet-stream',
          data: new Uint8Array(await file.arrayBuffer()),
        });
        attachments.push(...pasted.attachments);
      }
      if (paths.length) {
        attachments.push(
          ...(await invoke('attachments.drop', { threadId, paths })).attachments,
        );
      }
      return { attachments };
    },
    preview: (threadId, attachmentId) =>
      invoke('attachments.preview', { threadId, attachmentId }),
    open: (threadId, attachmentId) => invoke('attachments.open', { threadId, attachmentId }),
    reveal: (threadId, attachmentId) =>
      invoke('attachments.reveal', { threadId, attachmentId }),
  },
  changes: {
    read: (threadId) => invoke('changes.read', { threadId }),
    stage: (threadId, paths) => invoke('changes.stage', { threadId, paths }),
    restore: (threadId, paths) =>
      invoke('changes.restore', { threadId, paths, confirmation: 'RESTORE' }),
    listSnapshots: (threadId) => invoke('changes.snapshots.list', { threadId }),
    createSnapshot: (threadId) => invoke('changes.snapshots.create', { threadId }),
    restoreSnapshot: (threadId, snapshotId) =>
      invoke('changes.snapshots.restore', { threadId, snapshotId }),
    deleteSnapshot: (threadId, snapshotId) =>
      invoke('changes.snapshots.delete', {
        threadId,
        snapshotId,
        confirmation: 'DELETE SNAPSHOT',
      }),
  },
  terminal: {
    run: (threadId, command) => invoke('terminal.run', { threadId, command }),
    start: (threadId, command) => invoke('terminal.start', { threadId, command }),
    list: (threadId) => invoke('terminal.list', { threadId }),
    write: (threadId, terminalId, input) =>
      invoke('terminal.write', { threadId, terminalId, input }),
    stop: (threadId, terminalId) => invoke('terminal.stop', { threadId, terminalId }),
  },
  reviews: {
    start: (input) => invoke('reviews.start', input),
  },
  schedules: {
    create: (input) => invoke('schedules.create', input),
    update: (input) => invoke('schedules.update', input),
    setEnabled: (scheduleId, enabled) =>
      invoke('schedules.setEnabled', { scheduleId, enabled }),
    delete: (scheduleId) => invoke('schedules.delete', { scheduleId }),
    runNow: (scheduleId) => invoke('schedules.runNow', { scheduleId }),
  },
  approvals: {
    resolve: (input) => invoke('approvals.resolve', input),
  },
  providers: {
    probe: (providerId) => invoke('providers.probe', providerId ? { providerId } : {}),
    login: (providerId) => invoke('providers.login', { providerId }),
  },
  settings: {
    openDirectory: () => invoke('settings.openDirectory', undefined),
    setOnboarding: (step, permissionSetup) =>
      invoke('settings.setOnboarding', {
        step,
        ...(permissionSetup ? { permissionSetup } : {}),
      }),
    restartForOnboarding: () => invoke('settings.restartForOnboarding', undefined),
    setAppearance: (appearance) => invoke('settings.setAppearance', { appearance }),
    setCompletionSound: (enabled) => invoke('settings.setCompletionSound', { enabled }),
    setOpenAtLogin: (enabled) => invoke('settings.setOpenAtLogin', { enabled }),
    setDeveloperTools: (enabled) => invoke('settings.setDeveloperTools', { enabled }),
  },
  feedback: {
    compose: (message, threadId, includeDiagnostics) =>
      invoke('feedback.compose', {
        message,
        ...(threadId ? { threadId } : {}),
        includeDiagnostics,
      }),
  },
  updates: {
    check: () => invoke('updates.check', undefined),
    openDownload: () => invoke('updates.openDownload', undefined),
  },
  computer: {
    permissions: () => invoke('computer.permissions', undefined),
    requestPermissions: () => invoke('computer.requestPermissions', undefined),
    requestAutomation: (app) => invoke('computer.requestAutomation', { app }),
    openMessages: () => invoke('computer.openMessages', undefined),
    setupMessages: () => invoke('computer.setupMessages', undefined),
    setAccessMode: (mode, background, backgroundFallback) =>
      invoke('computer.setAccessMode', {
        mode,
        ...(background === undefined ? {} : { background }),
        ...(backgroundFallback === undefined ? {} : { backgroundFallback }),
      }),
    setTrust: (trust) => invoke('computer.setTrust', { trust }),
    setTrajectoryLog: (enabled) => invoke('computer.setTrajectoryLog', { enabled }),
    revealTrajectories: () => invoke('computer.revealTrajectories', undefined),
  },
  browser: {
    connectAndContinue: (input) => invoke('browser.connectAndContinue', input),
    attach: (windowId) => invoke('browser.attach', windowId === undefined ? {} : { windowId }),
    open: (url) => invoke('browser.open', { url }),
    detach: () => invoke('browser.detach', undefined),
  },
  voice: {
    configurePushToTalk: (enabled, agentId, requestAccessibility, speakReplies) =>
      invoke('voice.pushToTalk.configure', {
        enabled,
        ...(agentId ? { agentId } : {}),
        ...(requestAccessibility !== undefined ? { requestAccessibility } : {}),
        ...(speakReplies !== undefined ? { speakReplies } : {}),
      }),
    cancelPushToTalk: () => invoke('voice.pushToTalk.cancel', undefined),
    acquireCapture: () => invoke('voice.capture.acquire', undefined),
    releaseCapture: (leaseId) => invoke('voice.capture.release', { leaseId }),
    configure: () => invoke('voice.configure', undefined),
    refresh: () => invoke('voice.refresh', undefined),
    select: (voiceId) => invoke('voice.select', { voiceId }),
    disconnect: () => invoke('voice.disconnect', undefined),
    transcribe: (audioBase64, mimeType) =>
      invoke('voice.transcribe', { audioBase64, mimeType }),
    startRealtime: () => invoke('voice.realtime.start', undefined),
    appendRealtime: (sessionId, audioBase64) =>
      invoke('voice.realtime.append', { sessionId, audioBase64 }),
    stopRealtime: (sessionId, commit) => invoke('voice.realtime.stop', { sessionId, commit }),
    speak: (text, voiceId) =>
      invoke('voice.speak', voiceId === undefined ? { text } : { text, voiceId }),
  },
  connections: {
    startGoogle: () => invoke('connections.startGoogle', undefined),
    startSelected: (apps) => invoke('connections.startSelected', { apps }),
    upgradeGoogle: () => invoke('connections.upgradeGoogle', undefined),
    start: (connectionId) => invoke('connections.start', { connectionId }),
    setEnabled: (connectionId, enabled) =>
      invoke('connections.setEnabled', { connectionId, enabled }),
    disconnect: (connectionId, expectedConnectionId) =>
      invoke(
        'connections.disconnect',
        expectedConnectionId === undefined
          ? { connectionId }
          : { connectionId, expectedConnectionId },
      ),
  },
  auth: {
    start: (email) => invoke('auth.start', { email }),
    complete: (code) => invoke('auth.complete', { code }),
    mfaBegin: () => invoke('auth.mfaBegin', undefined),
    mfaComplete: (code) => invoke('auth.mfaComplete', { code }),
    signOut: () => invoke('auth.signOut', undefined),
    deleteAccount: (confirmation) => invoke('auth.deleteAccount', { confirmation }),
  },
  research: {
    setCapture: (enabled, consentVersion) =>
      invoke('research.setCapture', {
        enabled,
        ...(consentVersion ? { consentVersion } : {}),
      }),
    export: () => invoke('research.export', undefined),
    delete: () => invoke('research.delete', { confirmation: 'DELETE' }),
    listAdminInvites: () => invoke('research.admin.invites', undefined),
    createAdminInvite: (email) => invoke('research.admin.invite', { email }),
    listAdminParticipants: () => invoke('research.admin.participants', undefined),
    listAdminBatches: (subject) => invoke('research.admin.batches', { subject }),
    readAdminBatch: (subject, batchId) =>
      invoke('research.admin.readBatch', { subject, batchId }),
  },
  subscribe: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: DesktopPushEvent): void => {
      listener(value);
    };
    ipcRenderer.on(EVENT_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, wrapped);
  },
};

contextBridge.exposeInMainWorld('sia', Object.freeze(api));
