import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as Dialog from '@radix-ui/react-dialog';
import {
  GearSix,
  MagnifyingGlass,
  NotePencil,
  Plus,
  SidebarSimple,
  Pulse,
  CalendarDots,
} from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AgentSummary, ThreadSummary } from '../types';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import styles from './Sidebar.module.css';
import { focusComposer } from '../composerFocus';
import { sidebarAgentOrder, sidebarThreadOrder } from '../shortcuts';
import { AgentForm } from './AgentForm';
import navigation from './navigation.module.css';
import { TaskPreviewButton } from './TaskPreviewButton';
import { SiaLogo } from './SiaLogo';
import { MotionList } from './MotionList';
import { NavigationGroup } from './NavigationGroup';
import { threadDisplayTitle } from '../threadTitle';
import { AgentMenu, ThreadMenu } from './sidebar/SidebarMenus';
import { ThreadLabel } from './sidebar/ThreadLabel';
import { useScrollEdges } from './sidebar/useScrollEdges';

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
          className={`${buttons.iconButton} ${styles.shellIconButton}`}
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
        {selectedAgent && (
          <button
            className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
            className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
          className={`${buttons.iconButton} ${styles.shellIconButton}`}
          type="button"
          onClick={onCreateAgent}
          aria-label="Create agent"
          title="New agent"
        >
          <Plus size={18} />
        </button>
        {onOpenActivity && (
          <button
            className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
            className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
          className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
          className={`${buttons.iconButton} ${styles.shellIconButton}`}
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
          className={`${buttons.iconButtonSmall} ${styles.shellIconButton}`}
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
          <AlertDialog.Overlay className={dialogs.dialogOverlay} />
          <AlertDialog.Content
            className={dialogs.alertDialogContent}
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
            <div className={dialogs.dialogActions}>
              <AlertDialog.Cancel asChild>
                <button
                  type="button"
                  className={buttons.secondaryButton}
                  disabled={pendingThreadAction}
                >
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <button
                type="button"
                className={buttons.dangerButton}
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
                  className={buttons.dangerButton}
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
          <Dialog.Overlay className={dialogs.dialogOverlay} />
          <Dialog.Content
            className={dialogs.alertDialogContent}
            onCloseAutoFocus={restoreDialogFocus}
          >
            <Dialog.Title>Duplicate conversation</Dialog.Title>
            <Dialog.Description>
              Make a copy you can take in a new direction. The original stays as it is.
            </Dialog.Description>
            <label className={dialogs.localField}>
              <span>Name</span>
              <input
                value={forkTitle}
                onChange={(event) => setForkTitle(event.target.value)}
                maxLength={120}
              />
            </label>
            {worktreeForks ? (
              <label className={dialogs.forkIsolationOption}>
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
            <div className={dialogs.dialogActions}>
              <Dialog.Close asChild>
                <button type="button" className={buttons.secondaryButton}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                className={buttons.primaryButton}
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

function agentPresence(agent: AgentSummary): 'idle' | 'working' | 'waiting' | 'error' {
  if (agent.threads.some(({ status }) => status === 'running' || status === 'queued')) {
    return 'working';
  }
  if (agent.threads.some(({ status }) => status === 'waiting')) return 'waiting';
  if (agent.threads.some(({ status }) => status === 'error')) return 'error';
  return 'idle';
}
