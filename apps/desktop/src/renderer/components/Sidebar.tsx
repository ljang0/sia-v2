import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChatCircle,
  DotsThree,
  GearSix,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Plus,
  SidebarSimple,
  Trash,
  Archive,
  Bell,
  BellSlash,
  Copy,
  PushPin,
  Pulse,
  CalendarDots,
} from '@phosphor-icons/react';
import {
  memo,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AgentSummary, ThreadSummary } from '../types';
import styles from '../ui.module.css';
import { focusComposer } from '../composerFocus';
import { sidebarAgentOrder, sidebarThreadOrder } from '../shortcuts';
import { AgentForm } from './AgentForm';
import navigation from './navigation.module.css';
import { TaskPreviewButton } from './TaskPreviewButton';
import { SiaLogo } from './SiaLogo';
import { MotionList } from './MotionList';
import { NavigationGroup } from './NavigationGroup';
import { threadDisplayTitle } from '../threadTitle';

interface SidebarProps {
  agents: AgentSummary[];
  selectedAgentId?: string | undefined;
  selectedThreadId?: string | undefined;
  collapsed: boolean;
  activePage?: 'conversation' | 'activity' | 'scheduled' | 'settings';
  onToggle(): void;
  onSelectAgent(agentId: string): void;
  onSelectThread(threadId: string): void;
  onCreateThread(agentId: string): void;
  onRenameThread(threadId: string, title: string): Promise<void>;
  onDeleteThread(threadId: string): Promise<void>;
  onCleanupWorktree?(threadId: string): Promise<void>;
  onForkThread?(threadId: string, isolated: boolean, title?: string): Promise<void>;
  /** Offers a separate Git worktree when duplicating (Settings → Developer tools). */
  worktreeForks?: boolean | undefined;
  onArchiveThread?(threadId: string): Promise<void>;
  onCreateAgent(): void;
  onEditAgent(agent: AgentSummary): void;
  onSetAgentPinned?(agentId: string, pinned: boolean): Promise<void>;
  onSetAgentNotifications?(agentId: string, enabled: boolean): Promise<void>;
  onDuplicateAgent?(agentId: string): Promise<void>;
  onSetThreadUnread?(threadId: string, unread: boolean): Promise<void>;
  onSetThreadPinned?(threadId: string, pinned: boolean): Promise<void>;
  onOpenActivity?(): void;
  /** Every schedule across agents; absent when schedules are turned off. */
  onOpenScheduled?: (() => void) | undefined;
  onOpenSettings(): void;
  onOpenQuickSwitcher?(): void;
}

export function Sidebar({
  agents,
  selectedAgentId,
  selectedThreadId,
  collapsed,
  activePage = 'conversation',
  onToggle,
  onSelectAgent,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  onCleanupWorktree,
  onForkThread,
  worktreeForks = false,
  onArchiveThread,
  onCreateAgent,
  onEditAgent,
  onSetAgentPinned,
  onSetAgentNotifications,
  onDuplicateAgent,
  onSetThreadUnread,
  onSetThreadPinned,
  onOpenActivity,
  onOpenScheduled,
  onOpenSettings,
  onOpenQuickSwitcher,
}: SidebarProps) {
  const [closedAgents, setClosedAgents] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const taskList = useRef<HTMLDivElement>(null);
  const threadAgentId = agents.find((agent) =>
    agent.threads.some((thread) => thread.id === selectedThreadId),
  )?.id;
  useEffect(() => {
    if (!threadAgentId) return;
    setClosedAgents((current) => {
      if (!current.has(threadAgentId)) return current;
      const next = new Set(current);
      next.delete(threadAgentId);
      return next;
    });
  }, [selectedThreadId, threadAgentId]);
  const revealSelection = () => {
    const list = taskList.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (
      !list ||
      !selected ||
      selected.closest('[inert]') ||
      activePage !== 'conversation' ||
      collapsed
    )
      return;
    const row = selected.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    // Scroll only this pane: scrollIntoView can move Electron's hidden root viewport too.
    if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom + 12;
    else if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top + 12;
  };
  useLayoutEffect(revealSelection, [
    selectedThreadId,
    activePage,
    collapsed,
    query,
    closedAgents,
  ]);
  const { moreAbove, moreBelow } = useScrollEdges(taskList);

  const [editingThread, setEditingThread] = useState<ThreadSummary>();
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingThread, setDeletingThread] = useState<ThreadSummary>();
  // The delete dialog keeps showing its thread while it animates closed.
  const lastDeletingThread = useRef(deletingThread);
  if (deletingThread) lastDeletingThread.current = deletingThread;
  const shownDeletingThread = deletingThread ?? lastDeletingThread.current;
  const [pendingThreadAction, setPendingThreadAction] = useState(false);
  const [forkingThread, setForkingThread] = useState<ThreadSummary>();
  const [forkTitle, setForkTitle] = useState('');
  const [forkIsolated, setForkIsolated] = useState(false);
  // Thread dialogs open from a menu item that unmounts, so remember the row's menu button.
  const dialogOpener = useRef<HTMLElement | null>(null);
  const restoreDialogFocus = (event: Event) => {
    event.preventDefault();
    const opener = dialogOpener.current;
    dialogOpener.current = null;
    if (opener?.isConnected) opener.focus();
    else focusComposer();
  };
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const commitRename = (thread: ThreadSummary) => {
    const title = editingTitle.trim();
    if (pendingThreadAction) return;
    if (!title || title === thread.title) {
      setEditingThread(undefined);
      return;
    }
    setPendingThreadAction(true);
    void onRenameThread(thread.id, title).then(
      () => {
        setEditingThread(undefined);
        setPendingThreadAction(false);
      },
      () => setPendingThreadAction(false),
    );
  };

  const orderedAgents = useMemo(() => {
    const normalizedQuery = collapsed ? '' : query.trim().toLocaleLowerCase();
    return sidebarAgentOrder(
      agents
        .map((agent) => {
          const threads = sidebarThreadOrder(agent.threads).map((thread) =>
            thread.title === threadDisplayTitle(thread.title)
              ? thread
              : { ...thread, title: threadDisplayTitle(thread.title) },
          );
          return {
            ...agent,
            threads:
              normalizedQuery && !agent.name.toLocaleLowerCase().includes(normalizedQuery)
                ? threads.filter((thread) =>
                    thread.title.toLocaleLowerCase().includes(normalizedQuery),
                  )
                : threads,
          };
        })
        .filter(
          (agent) =>
            !normalizedQuery ||
            agent.name.toLocaleLowerCase().includes(normalizedQuery) ||
            agent.threads.length > 0,
        ),
    );
  }, [agents, collapsed, query]);

  if (collapsed) {
    return (
      <aside
        className={`${styles.sidebarCollapsed} ${navigation.rail}`}
        aria-label="Agent navigation"
        data-companion-sidebar
      >
        <div className={styles.sidebarCollapsedTitlebar} aria-hidden="true" />
        <button
          className={`${styles.iconButton} ${styles.shellIconButton}`}
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
        {selectedAgent && (
          <button
            className={`${styles.iconButton} ${styles.shellIconButton}`}
            type="button"
            onClick={() => onCreateThread(selectedAgent.id)}
            aria-label="New conversation"
            title="New conversation · ⌘N"
          >
            <NotePencil size={18} />
          </button>
        )}
        {onOpenQuickSwitcher && (
          <button
            className={`${styles.iconButton} ${styles.shellIconButton}`}
            type="button"
            onClick={onOpenQuickSwitcher}
            aria-label="Search conversations"
            title="Search · ⌘K"
          >
            <MagnifyingGlass size={18} />
          </button>
        )}
        <div className={styles.collapsedAgents}>
          {orderedAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={`${styles.agentAvatar} ${
                agent.id === selectedAgentId ? styles.agentAvatarSelected : ''
              }`}
              data-presence={agentPresence(agent)}
              data-identity={agent.hue}
              onClick={() => onSelectAgent(agent.id)}
              aria-label={agent.name}
              title={agent.name}
            >
              <AgentForm identity={agent.hue} state={agentPresence(agent)} size="small" />
            </button>
          ))}
        </div>
        <button
          className={`${styles.iconButton} ${styles.shellIconButton}`}
          type="button"
          onClick={onCreateAgent}
          aria-label="Create agent"
          title="New agent"
        >
          <Plus size={18} />
        </button>
        {onOpenActivity && (
          <button
            className={`${styles.iconButton} ${styles.shellIconButton}`}
            type="button"
            onClick={onOpenActivity}
            aria-label="Activity"
            aria-current={activePage === 'activity' ? 'page' : undefined}
            title="Activity"
          >
            <Pulse size={18} />
          </button>
        )}
        {onOpenScheduled && (
          <button
            className={`${styles.iconButton} ${styles.shellIconButton}`}
            type="button"
            onClick={onOpenScheduled}
            aria-label="Scheduled"
            aria-current={activePage === 'scheduled' ? 'page' : undefined}
            title="Scheduled"
          >
            <CalendarDots size={18} />
          </button>
        )}
        <button
          className={`${styles.iconButton} ${styles.shellIconButton}`}
          type="button"
          aria-current={activePage === 'settings' ? 'page' : undefined}
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <GearSix size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`${styles.sidebar} ${navigation.navigation}`}
      aria-label="Agent navigation"
      data-companion-sidebar
    >
      <div className={styles.sidebarTitlebar}>
        <div className={`${styles.wordmark} ${navigation.brand}`} role="img" aria-label="Sia">
          <SiaLogo />
        </div>
        <button
          className={`${styles.iconButton} ${styles.shellIconButton}`}
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={navigation.primaryActions}>
        {selectedAgent && (
          <button
            className={navigation.newTask}
            aria-label="New conversation"
            aria-keyshortcuts="Meta+N"
            type="button"
            onClick={() => onCreateThread(selectedAgent.id)}
          >
            <NotePencil size={18} aria-hidden="true" />
            <span>New conversation</span>
            <kbd>⌘N</kbd>
          </button>
        )}
        <label className={navigation.search}>
          <MagnifyingGlass size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a conversation"
            aria-label="Find a conversation"
          />
        </label>
      </div>
      <div
        className={`${styles.sidebarSectionHeader} ${navigation.sectionHeader}`}
        data-scrolled={moreAbove || undefined}
      >
        <span>{agents.length === 1 ? 'Conversations' : 'Your agents'}</span>
        <button
          className={`${styles.iconButtonSmall} ${styles.shellIconButton}`}
          type="button"
          onClick={onCreateAgent}
          aria-label="Create agent"
          title="New agent"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={taskList}
        className={`${styles.sidebarScroll} ${navigation.scroll}`}
        data-more-below={moreBelow || undefined}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'grid-template-rows') revealSelection();
        }}
      >
        <div className={navigation.groups}>
          {orderedAgents.length === 0 ? (
            <p className={navigation.emptyAgents}>
              <strong>No agents yet</strong>
              Create one with + to start a conversation.
            </p>
          ) : null}
          {orderedAgents.map((agent) => {
            const expanded = Boolean(query.trim()) || !closedAgents.has(agent.id);
            const selected = agent.id === selectedAgentId;
            const needsYou = agent.threads.filter(
              ({ status }) => status === 'waiting' || status === 'error',
            ).length;
            return (
              <NavigationGroup
                key={agent.id}
                identity={agent.hue}
                label={agent.name}
                selected={selected}
                open={expanded}
                attention={needsYou}
                icon={
                  <span data-presence={agentPresence(agent)}>
                    <AgentForm identity={agent.hue} state={agentPresence(agent)} size="small" />
                  </span>
                }
                onToggle={() => {
                  if (query.trim()) return;
                  setClosedAgents((current) => {
                    const next = new Set(current);
                    if (expanded) next.add(agent.id);
                    else next.delete(agent.id);
                    return next;
                  });
                }}
                actions={
                  <>
                    <button
                      type="button"
                      className={styles.agentEditButton}
                      onClick={() => onCreateThread(agent.id)}
                      aria-label={`Start a conversation with ${agent.name}`}
                      title="New conversation"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                    <AgentMenu
                      agent={agent}
                      onOpen={() => onSelectAgent(agent.id)}
                      onEdit={() => onEditAgent(agent)}
                      onSetPinned={
                        onSetAgentPinned
                          ? () => void onSetAgentPinned(agent.id, !agent.pinned)
                          : undefined
                      }
                      onSetNotifications={
                        onSetAgentNotifications
                          ? () =>
                              void onSetAgentNotifications(
                                agent.id,
                                !agent.notificationsEnabled,
                              )
                          : undefined
                      }
                      onDuplicate={
                        onDuplicateAgent ? () => void onDuplicateAgent(agent.id) : undefined
                      }
                    />
                  </>
                }
              >
                <div className={navigation.tasks}>
                  <MotionList
                    items={agent.threads}
                    className={navigation.taskList}
                    instant={Boolean(query.trim())}
                  >
                    {(thread) =>
                      editingThread?.id === thread.id ? (
                        <form
                          className={styles.threadRenameForm}
                          onSubmit={(event) => {
                            event.preventDefault();
                            commitRename(thread);
                          }}
                        >
                          <input
                            autoFocus
                            value={editingTitle}
                            maxLength={120}
                            aria-label={`Rename ${thread.title}`}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={(event) => {
                              // Clicking away saves, as in Finder; the Save button submits itself.
                              if (
                                event.currentTarget.dataset.cancelled ||
                                event.currentTarget.form?.contains(event.relatedTarget)
                              )
                                return;
                              commitRename(thread);
                            }}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return;
                              event.currentTarget.dataset.cancelled = 'true';
                              setEditingThread(undefined);
                            }}
                          />
                          <button
                            type="submit"
                            className={styles.threadRenameSave}
                            disabled={!editingTitle.trim() || pendingThreadAction}
                          >
                            Save
                          </button>
                        </form>
                      ) : (
                        <div
                          className={`${styles.threadRow} ${navigation.task} ${
                            thread.id === selectedThreadId && activePage === 'conversation'
                              ? styles.threadRowSelected
                              : ''
                          }`}
                        >
                          <TaskPreviewButton
                            thread={thread}
                            selected={
                              thread.id === selectedThreadId && activePage === 'conversation'
                            }
                            className={styles.threadSelectButton}
                            onSelect={() => onSelectThread(thread.id)}
                          >
                            <ThreadLabel thread={thread} />
                          </TaskPreviewButton>
                          <ThreadMenu
                            thread={thread}
                            onFork={
                              onForkThread
                                ? (opener) => {
                                    dialogOpener.current = opener;
                                    setForkingThread(thread);
                                    setForkTitle(`${thread.title} (copy)`);
                                    setForkIsolated(false);
                                  }
                                : undefined
                            }
                            onArchive={
                              onArchiveThread
                                ? () => void onArchiveThread(thread.id)
                                : undefined
                            }
                            onSetUnread={
                              onSetThreadUnread
                                ? () => void onSetThreadUnread(thread.id, !thread.unread)
                                : undefined
                            }
                            onSetPinned={
                              onSetThreadPinned
                                ? () => void onSetThreadPinned(thread.id, !thread.pinned)
                                : undefined
                            }
                            onRename={() => {
                              setEditingThread(thread);
                              setEditingTitle(thread.title);
                            }}
                            onDelete={(opener) => {
                              dialogOpener.current = opener;
                              setDeletingThread(thread);
                            }}
                          />
                        </div>
                      )
                    }
                  </MotionList>
                  {agent.threads.length || query ? null : (
                    <button
                      className={styles.newThreadInline}
                      type="button"
                      onClick={() => onCreateThread(agent.id)}
                    >
                      Start a conversation
                    </button>
                  )}
                </div>
              </NavigationGroup>
            );
          })}
          {query && orderedAgents.length === 0 ? (
            <p className={styles.threadSearchEmpty}>
              No conversation titles match. Press ⌘K to search inside conversations.
            </p>
          ) : null}
        </div>
      </div>

      <div className={`${styles.sidebarFooter} ${navigation.footer}`}>
        {onOpenQuickSwitcher ? (
          <button className={styles.settingsButton} type="button" onClick={onOpenQuickSwitcher}>
            <MagnifyingGlass size={17} aria-hidden="true" />
            <span>Search everything</span>
            <kbd className={styles.navShortcut}>⌘K</kbd>
          </button>
        ) : null}
        {onOpenActivity ? (
          <button
            className={styles.settingsButton}
            type="button"
            onClick={onOpenActivity}
            data-testid="activity-center-toggle"
            aria-current={activePage === 'activity' ? 'page' : undefined}
          >
            <Pulse size={17} aria-hidden="true" />
            <span>Activity</span>
          </button>
        ) : null}
        {onOpenScheduled ? (
          <button
            className={styles.settingsButton}
            type="button"
            onClick={onOpenScheduled}
            data-testid="scheduled-open"
            aria-current={activePage === 'scheduled' ? 'page' : undefined}
          >
            <CalendarDots size={17} aria-hidden="true" />
            <span>Scheduled</span>
          </button>
        ) : null}
        <button
          className={styles.settingsButton}
          type="button"
          onClick={onOpenSettings}
          aria-current={activePage === 'settings' ? 'page' : undefined}
        >
          <GearSix size={17} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>

      <AlertDialog.Root
        open={Boolean(deletingThread)}
        onOpenChange={(open) => !open && !pendingThreadAction && setDeletingThread(undefined)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogOverlay} />
          <AlertDialog.Content
            className={styles.alertDialogContent}
            onCloseAutoFocus={restoreDialogFocus}
          >
            <AlertDialog.Title>Delete this conversation?</AlertDialog.Title>
            <AlertDialog.Description>
              “{shownDeletingThread?.title}” and its messages will be permanently removed from
              Sia. Files on your Mac stay as they are
              {shownDeletingThread?.worktree?.kind === 'linked'
                ? ', including its separate working copy.'
                : '.'}
            </AlertDialog.Description>
            <div className={styles.dialogActions}>
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={pendingThreadAction}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={pendingThreadAction}
                onClick={() => {
                  if (!deletingThread) return;
                  setPendingThreadAction(true);
                  void onDeleteThread(deletingThread.id).then(
                    () => {
                      setDeletingThread(undefined);
                      setPendingThreadAction(false);
                    },
                    () => setPendingThreadAction(false),
                  );
                }}
              >
                {pendingThreadAction ? 'Deleting…' : 'Delete conversation'}
              </button>
              {deletingThread?.worktree?.kind === 'linked' && onCleanupWorktree ? (
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={pendingThreadAction}
                  onClick={() => {
                    setPendingThreadAction(true);
                    void onCleanupWorktree(deletingThread.id).then(
                      () => {
                        setDeletingThread(undefined);
                        setPendingThreadAction(false);
                      },
                      () => setPendingThreadAction(false),
                    );
                  }}
                >
                  Remove clean worktree
                </button>
              ) : null}
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Dialog.Root
        open={Boolean(forkingThread)}
        onOpenChange={(open) => !open && !pendingThreadAction && setForkingThread(undefined)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content
            className={styles.alertDialogContent}
            onCloseAutoFocus={restoreDialogFocus}
          >
            <Dialog.Title>Duplicate conversation</Dialog.Title>
            <Dialog.Description>
              Make a copy you can take in a new direction. The original stays as it is.
            </Dialog.Description>
            <label className={styles.localField}>
              <span>Name</span>
              <input
                value={forkTitle}
                onChange={(event) => setForkTitle(event.target.value)}
                maxLength={120}
              />
            </label>
            {worktreeForks ? (
              <label className={styles.forkIsolationOption}>
                <input
                  type="checkbox"
                  checked={forkIsolated}
                  onChange={(event) => setForkIsolated(event.target.checked)}
                  data-testid="fork-isolation-checkbox"
                />
                <span>
                  <strong>Isolated Git worktree</strong>
                  <small>Recommended for parallel coding tasks.</small>
                </span>
              </label>
            ) : null}
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <button type="button" className={styles.secondaryButton}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!forkTitle.trim() || pendingThreadAction}
                onClick={() => {
                  if (!forkingThread || !onForkThread) return;
                  setPendingThreadAction(true);
                  void onForkThread(
                    forkingThread.id,
                    worktreeForks && forkIsolated,
                    forkTitle.trim(),
                  ).then(
                    () => {
                      setForkingThread(undefined);
                      setPendingThreadAction(false);
                    },
                    () => setPendingThreadAction(false),
                  );
                }}
              >
                Duplicate
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

/** Whether a scroll container has content hidden above or below its fold. */
function useScrollEdges(ref: RefObject<HTMLElement | null>): {
  moreAbove: boolean;
  moreBelow: boolean;
} {
  const [moreAbove, setMoreAbove] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => {
      setMoreAbove(element.scrollTop > 1);
      setMoreBelow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref]);
  return { moreAbove, moreBelow };
}

/** Snapshots rebuild every thread object, so compare only what the label shows. */
const ThreadLabel = memo(
  ThreadLabelContent,
  ({ thread: a }, { thread: b }) =>
    a.title === b.title &&
    a.status === b.status &&
    a.unread === b.unread &&
    a.pinned === b.pinned &&
    Boolean(a.draft?.trim()) === Boolean(b.draft?.trim()),
);

function ThreadLabelContent({ thread }: { thread: ThreadSummary }) {
  const draft = Boolean(thread.draft?.trim());
  const state = threadStateLabel(thread);
  const signal = threadSignal(thread);
  return (
    <span
      className={styles.threadCopy}
      data-thread-draft={draft || undefined}
      data-thread-unread={thread.unread || undefined}
    >
      <span className={`${styles.threadTitle} ${navigation.taskTitle}`} title={thread.title}>
        {thread.pinned ? (
          <PushPin
            className={navigation.taskPin}
            size={11}
            weight="fill"
            aria-hidden="true"
            data-testid="thread-pinned"
          />
        ) : null}
        {thread.title}
      </span>
      {draft || state ? (
        <span className={navigation.taskMeta} data-signal={signal}>
          {draft ? <strong>Draft</strong> : null}
          {state ? <span>{state}</span> : null}
        </span>
      ) : null}
      {signal ? (
        <i className={navigation.taskSignal} data-signal={signal} aria-hidden="true" />
      ) : null}
    </span>
  );
}

/** The dot at a row's end: what, if anything, the conversation wants from the person. */
function threadSignal(
  thread: ThreadSummary,
): 'working' | 'needs-you' | 'problem' | 'unread' | undefined {
  if (thread.status === 'running' || thread.status === 'queued') return 'working';
  if (thread.status === 'waiting') return 'needs-you';
  if (thread.status === 'error') return 'problem';
  return thread.unread ? 'unread' : undefined;
}

function threadStateLabel(thread: ThreadSummary) {
  if (thread.status === 'running') return 'Working';
  if (thread.status === 'waiting') return 'Waiting for you';
  if (thread.status === 'queued') return 'Queued';
  if (thread.status === 'error') return 'Needs attention';
  if (thread.unread) return 'Unread';
  return undefined;
}

function agentPresence(agent: AgentSummary): 'idle' | 'working' | 'waiting' | 'error' {
  if (agent.threads.some(({ status }) => status === 'running' || status === 'queued')) {
    return 'working';
  }
  if (agent.threads.some(({ status }) => status === 'waiting')) return 'waiting';
  if (agent.threads.some(({ status }) => status === 'error')) return 'error';
  return 'idle';
}

function ThreadMenu({
  thread,
  onRename,
  onDelete,
  onFork,
  onArchive,
  onSetUnread,
  onSetPinned,
}: {
  thread: ThreadSummary;
  onRename(): void;
  onDelete(opener: HTMLElement | null): void;
  onFork?: ((opener: HTMLElement | null) => void) | undefined;
  onArchive?: (() => void) | undefined;
  onSetUnread?: (() => void) | undefined;
  onSetPinned?: (() => void) | undefined;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const busy =
    thread.status === 'running' || thread.status === 'queued' || thread.status === 'waiting';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className={styles.threadMenuButton}
          aria-label={`Conversation actions for ${thread.title}`}
          data-testid="thread-actions"
        >
          <DotsThree size={16} weight="bold" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.threadMenuContent} sideOffset={4} align="start">
          {onSetPinned ? (
            <DropdownMenu.Item
              className={styles.threadMenuItem}
              onSelect={onSetPinned}
              data-testid="thread-pin"
            >
              <PushPin size={14} aria-hidden="true" />
              {thread.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onRename}>
            <PencilSimple size={14} aria-hidden="true" />
            Rename
          </DropdownMenu.Item>
          {onFork ? (
            <DropdownMenu.Item
              className={styles.threadMenuItem}
              onSelect={() => onFork(trigger.current)}
              data-testid="thread-fork"
              disabled={busy}
              title={busy ? 'Stop or finish the current task before duplicating.' : undefined}
            >
              <Copy size={14} aria-hidden="true" />
              Duplicate
            </DropdownMenu.Item>
          ) : null}
          {onArchive ? (
            <DropdownMenu.Item
              className={styles.threadMenuItem}
              onSelect={onArchive}
              data-testid="thread-archive"
              disabled={
                thread.status === 'running' ||
                thread.status === 'queued' ||
                thread.status === 'waiting'
              }
            >
              <Archive size={14} aria-hidden="true" />
              Archive
            </DropdownMenu.Item>
          ) : null}
          {onSetUnread ? (
            <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onSetUnread}>
              {thread.unread ? (
                <BellSlash size={14} aria-hidden="true" />
              ) : (
                <Bell size={14} aria-hidden="true" />
              )}
              Mark {thread.unread ? 'read' : 'unread'}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            className={`${styles.threadMenuItem} ${styles.threadMenuDanger}`}
            disabled={busy}
            title={busy ? deleteBlockedReason(thread) : undefined}
            onSelect={() => onDelete(trigger.current)}
          >
            <Trash size={14} aria-hidden="true" />
            <span className={styles.threadMenuItemText}>
              Delete
              {busy ? <small>{deleteBlockedReason(thread)}</small> : null}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Why Delete is unavailable, in words that say what to do about it. */
function deleteBlockedReason(thread: ThreadSummary): string {
  return thread.status === 'waiting'
    ? 'Answer or stop the task first'
    : 'Stop or finish the task first';
}

function AgentMenu({
  agent,
  onOpen,
  onEdit,
  onSetPinned,
  onSetNotifications,
  onDuplicate,
}: {
  agent: AgentSummary;
  onOpen(): void;
  onEdit(): void;
  onSetPinned?: (() => void) | undefined;
  onSetNotifications?: (() => void) | undefined;
  onDuplicate?: (() => void) | undefined;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.agentEditButton}
          aria-label={`Agent actions for ${agent.name}`}
        >
          <DotsThree size={15} weight="bold" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.threadMenuContent} sideOffset={4} align="end">
          <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onOpen}>
            <ChatCircle size={14} aria-hidden="true" />
            Open agent
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onEdit}>
            <NotePencil size={14} aria-hidden="true" />
            Edit agent
          </DropdownMenu.Item>
          {onSetPinned ? (
            <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onSetPinned}>
              <PushPin size={14} aria-hidden="true" />
              {agent.pinned ? 'Unpin agent' : 'Pin agent'}
            </DropdownMenu.Item>
          ) : null}
          {onSetNotifications ? (
            <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onSetNotifications}>
              {agent.notificationsEnabled ? (
                <BellSlash size={14} aria-hidden="true" />
              ) : (
                <Bell size={14} aria-hidden="true" />
              )}
              {agent.notificationsEnabled ? 'Mute notifications' : 'Enable notifications'}
            </DropdownMenu.Item>
          ) : null}
          {onDuplicate ? (
            <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onDuplicate}>
              <Copy size={14} aria-hidden="true" />
              Duplicate agent
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
