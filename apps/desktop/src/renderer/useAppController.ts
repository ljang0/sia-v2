import { useEffect, useMemo, useState } from 'react';
import { createBridgeRendererApi } from './bridgeAdapter';
import type { SettingsSection } from './components/Settings';
import type { AgentSummary, RendererApi, RendererSnapshot } from './types';

const BRIDGE_ERROR =
  'Sia could not load its secure desktop bridge. Quit and reopen Sia; if this continues, reinstall the app.';
type ActivityTarget = 'activity' | 'archived' | 'search' | 'scheduled';
/** How long the "Conversation archived" notice keeps its Undo button while not in use. */
export const ARCHIVE_UNDO_MS = 8000;

interface ActionIssue {
  message: string;
  supportId: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export function useAppController(suppliedApi?: RendererApi | undefined) {
  const api = useMemo(() => suppliedApi ?? resolveApi(), [suppliedApi]);
  const [snapshot, setSnapshot] = useState<RendererSnapshot>();
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string>();
  const [actionIssue, setActionIssue] = useState<ActionIssue>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityTarget, setActivityTarget] = useState<ActivityTarget>('activity');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('providers');
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSummary>();
  const [startupNoticeDismissed, setStartupNoticeDismissed] = useState(false);
  const [attachments, setAttachments] = useState<import('./types').RendererAttachment[]>([]);
  const [archivedThread, setArchivedThread] = useState<{ id: string; reselect: boolean }>();

  useEffect(() => {
    let mounted = true;
    const unsubscribe = api.subscribe(
      (next) => {
        if (!mounted) return;
        setSnapshot(next);
        setLoading(false);
      },
      (message) => mounted && setFatalError(message),
    );
    void api
      .getSnapshot()
      .then((next) => mounted && setSnapshot(next))
      .catch((cause: unknown) =>
        mounted ? setFatalError(messageFor(cause, 'Sia could not start.')) : undefined,
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [api]);

  const execute = async (action: () => Promise<unknown>, propagate: boolean) => {
    try {
      await action();
      setActionIssue(undefined);
    } catch (cause) {
      const message = messageFor(cause, 'That action could not be completed.');
      const now = new Date().toISOString();
      setActionIssue((current) =>
        current?.message === message
          ? { ...current, count: current.count + 1, lastSeenAt: now }
          : {
              message,
              supportId: supportIdFor(message),
              count: 1,
              firstSeenAt: now,
              lastSeenAt: now,
            },
      );
      if (propagate) throw cause instanceof Error ? cause : new Error(message);
    }
  };

  const retry = () => {
    setLoading(true);
    void api
      .getSnapshot()
      .then((next) => {
        setSnapshot(next);
        setFatalError(undefined);
      })
      .catch((cause: unknown) => setFatalError(messageFor(cause, 'Sia could not start.')))
      .finally(() => setLoading(false));
  };

  const openSettings = (section: SettingsSection = 'providers') => {
    setInspectorOpen(false);
    setActivityOpen(false);
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  useEffect(() => {
    setAttachments([]);
  }, [snapshot?.selectedThreadId]);

  const archiveThread = async (threadId: string) => {
    const reselect = snapshot?.selectedThreadId === threadId;
    await execute(() => api.archiveThread(threadId), true);
    setArchivedThread({ id: threadId, reselect });
  };

  const undoArchive = () => {
    const target = archivedThread;
    setArchivedThread(undefined);
    if (!target) return;
    void execute(async () => {
      await api.unarchiveThread(target.id);
      if (target.reselect) await api.selectThread(target.id);
    }, false);
  };

  return {
    api,
    snapshot,
    loading,
    fatalError,
    actionError: actionIssue?.message,
    actionIssue,
    sidebarCollapsed,
    inspectorOpen,
    settingsOpen,
    activityOpen,
    activityTarget,
    settingsSection,
    agentDialogOpen,
    editingAgent,
    startupNoticeDismissed,
    attachments,
    archivedThreadId: archivedThread?.id,
    archiveThread,
    undoArchive,
    dismissArchived: () => setArchivedThread(undefined),
    run: (action: () => Promise<unknown>) => execute(action, false),
    attempt: (action: () => Promise<unknown>) => execute(action, true),
    retry,
    clearActionError: () => setActionIssue(undefined),
    dismissStartupNotice: () => setStartupNoticeDismissed(true),
    toggleSidebar: () => setSidebarCollapsed((value) => !value),
    toggleInspector: () => setInspectorOpen((value) => !value),
    closeInspector: () => setInspectorOpen(false),
    openSettings,
    closeSettings: () => setSettingsOpen(false),
    openActivity: (target: ActivityTarget = 'activity') => {
      setInspectorOpen(false);
      setSettingsOpen(false);
      setActivityTarget(target);
      setActivityOpen(true);
    },
    closeActivity: () => setActivityOpen(false),
    openNewAgent: () => {
      setEditingAgent(undefined);
      setAgentDialogOpen(true);
    },
    openEditAgent: (agent: AgentSummary) => {
      setEditingAgent(agent);
      setAgentDialogOpen(true);
    },
    setAgentDialogOpen,
    pickAttachments: async (threadId: string) => {
      const picked = await api.pickAttachments(threadId);
      setAttachments((current) => {
        const next = new Map(current.map((attachment) => [attachment.id, attachment]));
        picked.forEach((attachment) => next.set(attachment.id, attachment));
        return [...next.values()];
      });
    },
    dropAttachments: async (threadId: string, files: File[]) => {
      const dropped = await api.dropAttachments(threadId, files);
      setAttachments((current) => {
        const next = new Map(current.map((attachment) => [attachment.id, attachment]));
        dropped.forEach((attachment) => next.set(attachment.id, attachment));
        return [...next.values()];
      });
    },
    pasteAttachments: async (threadId: string, files: File[]) => {
      const pasted = await api.pasteAttachments(threadId, files);
      setAttachments((current) => {
        const next = new Map(current.map((attachment) => [attachment.id, attachment]));
        pasted.forEach((attachment) => next.set(attachment.id, attachment));
        return [...next.values()];
      });
    },
    removeAttachment: (attachmentId: string) =>
      setAttachments((current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      ),
    clearAttachments: () => setAttachments([]),
  };
}

/** The desktop bridge, or an API that reports a missing bridge on every call. */
export function resolveApi(): RendererApi {
  if (typeof window !== 'undefined' && 'sia' in window && window.sia) {
    return createBridgeRendererApi(window.sia);
  }
  return new Proxy({} as RendererApi, {
    get: (_target, property) => {
      if (property === 'subscribe') return () => () => undefined;
      return async () => {
        throw new Error(BRIDGE_ERROR);
      };
    },
  });
}

function messageFor(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function supportIdFor(message: string) {
  const cloudRequest = [...message.matchAll(/\brequest\s+([A-Za-z0-9-]{6,})\b/gi)].at(-1)?.[1];
  return cloudRequest ?? `local-${Date.now().toString(36)}`;
}
