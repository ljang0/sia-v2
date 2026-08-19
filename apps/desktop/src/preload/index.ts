import { contextBridge, ipcRenderer } from 'electron';

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
  return ipcRenderer.invoke(INVOKE_CHANNEL, envelope) as Promise<BridgeResultMap[M]>;
};

const api: DesktopBridgeApi = {
  bootstrap: () => invoke('bootstrap', undefined),
  agents: {
    save: (input) => invoke('agents.save', input),
    delete: (agentId) => invoke('agents.delete', { agentId }),
  },
  threads: {
    create: (input) => invoke('threads.create', input),
    select: (threadId) => invoke('threads.select', { threadId }),
    rename: (threadId, title) => invoke('threads.rename', { threadId, title }),
    config: (input) => invoke('threads.config', input),
    archive: (threadId) => invoke('threads.archive', { threadId }),
    unarchive: (threadId) => invoke('threads.unarchive', { threadId }),
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
    cancel: (threadId) => invoke('threads.cancel', { threadId }),
  },
  worktrees: {
    cleanup: (threadId) =>
      invoke('worktrees.cleanup', { threadId, confirmation: 'REMOVE WORKTREE' }),
  },
  attachments: {
    pick: (threadId) => invoke('attachments.pick', { threadId }),
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
    setCompletionSound: (enabled) => invoke('settings.setCompletionSound', { enabled }),
  },
  computer: {
    permissions: () => invoke('computer.permissions', undefined),
    requestPermissions: () => invoke('computer.requestPermissions', undefined),
    openMessages: () => invoke('computer.openMessages', undefined),
  },
  browser: {
    attach: (windowId) => invoke('browser.attach', windowId === undefined ? {} : { windowId }),
    open: (url) => invoke('browser.open', { url }),
    detach: () => invoke('browser.detach', undefined),
  },
  voice: {
    configure: (apiKey) => invoke('voice.configure', { apiKey }),
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
    startAll: () => invoke('connections.startAll', undefined),
    start: (connectionId) => invoke('connections.start', { connectionId }),
    disconnect: (connectionId) => invoke('connections.disconnect', { connectionId }),
  },
  auth: {
    start: (email) => invoke('auth.start', { email }),
    complete: (code) => invoke('auth.complete', { code }),
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
