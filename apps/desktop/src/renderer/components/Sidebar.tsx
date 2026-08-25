import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CaretDown,
  CaretRight,
  DotsThree,
  GearSix,
  MagnifyingGlass,
  NotePencil,
  PencilSimple,
  Plus,
  SidebarSimple,
  Trash,
  Archive,
  GitFork,
} from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import type { AgentSummary, ThreadSummary } from '../types';
import styles from '../ui.module.css';
import { AgentForm } from './AgentForm';
import { StatusMark } from './StatusMark';
import { SiaMark } from './SiaMark';

interface SidebarProps {
  agents: AgentSummary[];
  selectedAgentId?: string | undefined;
  selectedThreadId?: string | undefined;
  collapsed: boolean;
  onToggle(): void;
  onSelectAgent(agentId: string): void;
  onSelectThread(threadId: string): void;
  onCreateThread(agentId: string): void;
  onRenameThread(threadId: string, title: string): Promise<void>;
  onDeleteThread(threadId: string): Promise<void>;
  onCleanupWorktree?(threadId: string): Promise<void>;
  onForkThread?(threadId: string, isolated: boolean, title?: string): Promise<void>;
  onArchiveThread?(threadId: string): Promise<void>;
  onCreateAgent(): void;
  onEditAgent(agent: AgentSummary): void;
  onOpenActivity?(): void;
  onOpenArchived?(): void;
  onOpenSettings(): void;
  onOpenQuickSwitcher?(): void;
}

export function Sidebar({
  agents,
  selectedAgentId,
  selectedThreadId,
  collapsed,
  onToggle,
  onSelectAgent,
  onSelectThread,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  onCleanupWorktree,
  onForkThread,
  onArchiveThread,
  onCreateAgent,
  onEditAgent,
  onOpenActivity,
  onOpenArchived,
  onOpenSettings,
  onOpenQuickSwitcher,
}: SidebarProps) {
  const [closedAgents, setClosedAgents] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [editingThread, setEditingThread] = useState<ThreadSummary>();
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingThread, setDeletingThread] = useState<ThreadSummary>();
  const [pendingThreadAction, setPendingThreadAction] = useState(false);
  const [forkingThread, setForkingThread] = useState<ThreadSummary>();
  const [forkTitle, setForkTitle] = useState('');
  const [forkIsolated, setForkIsolated] = useState(false);
  const showSearch = agents.reduce((total, agent) => total + agent.threads.length, 0) >= 6;

  const orderedAgents = useMemo(() => {
    const normalizedQuery = collapsed ? '' : query.trim().toLocaleLowerCase();
    return [...agents]
      .map((agent) => ({
        ...agent,
        threads:
          normalizedQuery && !agent.name.toLocaleLowerCase().includes(normalizedQuery)
            ? agent.threads.filter((thread) =>
                thread.title.toLocaleLowerCase().includes(normalizedQuery),
              )
            : agent.threads,
      }))
      .filter(
        (agent) =>
          !normalizedQuery ||
          agent.name.toLocaleLowerCase().includes(normalizedQuery) ||
          agent.threads.length > 0,
      )
      .sort((a, b) => {
        if (a.id === selectedAgentId) return -1;
        if (b.id === selectedAgentId) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [agents, collapsed, query, selectedAgentId]);

  if (collapsed) {
    return (
      <aside
        className={styles.sidebarCollapsed}
        aria-label="Agent navigation"
        data-companion-sidebar
      >
        <div className={styles.sidebarCollapsedTitlebar} aria-hidden="true" />
        <button
          className={styles.iconButton}
          type="button"
          onClick={onToggle}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
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
          className={styles.iconButton}
          type="button"
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
    <aside className={styles.sidebar} aria-label="Agent navigation" data-companion-sidebar>
      <div className={styles.sidebarTitlebar}>
        <div className={styles.wordmark}>
          <SiaMark className={styles.wordmarkSymbol} />
          <span>Sia</span>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.sidebarScroll}>
        <div className={styles.sidebarSectionHeader}>
          <span>Agents</span>
          <button
            className={styles.iconButtonSmall}
            type="button"
            onClick={onCreateAgent}
            aria-label="Create agent"
            title="New agent"
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>

        {showSearch ? (
          <label className={styles.threadSearch}>
            <MagnifyingGlass size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a thread"
              aria-label="Find a thread"
            />
          </label>
        ) : null}

        <div className={styles.agentList}>
          {orderedAgents.map((agent) => {
            const expanded = !closedAgents.has(agent.id);
            const selected = agent.id === selectedAgentId;
            return (
              <section
                className={`${styles.agentGroup} ${selected ? styles.agentGroupSelected : ''}`}
                data-identity={agent.hue}
                key={agent.id}
              >
                <div
                  className={`${styles.agentRow} ${selected ? styles.agentRowSelected : ''}`}
                >
                  <button
                    type="button"
                    className={styles.disclosureButton}
                    onClick={() => {
                      setClosedAgents((current) => {
                        const next = new Set(current);
                        if (next.has(agent.id)) next.delete(agent.id);
                        else next.add(agent.id);
                        return next;
                      });
                    }}
                    aria-label={expanded ? `Collapse ${agent.name}` : `Expand ${agent.name}`}
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <CaretDown size={13} aria-hidden="true" />
                    ) : (
                      <CaretRight size={13} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.agentNameButton}
                    onClick={() => onSelectAgent(agent.id)}
                  >
                    <span
                      className={styles.agentAvatar}
                      data-presence={agentPresence(agent)}
                      data-identity={agent.hue}
                    >
                      <AgentForm
                        identity={agent.hue}
                        state={agentPresence(agent)}
                        size="small"
                      />
                    </span>
                    <span className={styles.agentName}>{agent.name}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.agentEditButton}
                    onClick={() => onEditAgent(agent)}
                    aria-label={`Edit ${agent.name}`}
                    title="Edit agent"
                  >
                    <NotePencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.agentEditButton}
                    onClick={() => onCreateThread(agent.id)}
                    aria-label={`Start a thread with ${agent.name}`}
                    title="New thread"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>

                {expanded ? (
                  <div className={styles.threadList}>
                    {agent.threads.length ? (
                      agent.threads.map((thread) =>
                        editingThread?.id === thread.id ? (
                          <form
                            className={styles.threadRenameForm}
                            key={thread.id}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const title = editingTitle.trim();
                              if (!title || pendingThreadAction) return;
                              setPendingThreadAction(true);
                              void onRenameThread(thread.id, title).then(
                                () => {
                                  setEditingThread(undefined);
                                  setPendingThreadAction(false);
                                },
                                () => setPendingThreadAction(false),
                              );
                            }}
                          >
                            <input
                              autoFocus
                              value={editingTitle}
                              maxLength={120}
                              aria-label={`Rename ${thread.title}`}
                              onChange={(event) => setEditingTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') setEditingThread(undefined);
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
                            key={thread.id}
                            className={`${styles.threadRow} ${
                              thread.id === selectedThreadId ? styles.threadRowSelected : ''
                            }`}
                          >
                            <button
                              type="button"
                              className={styles.threadSelectButton}
                              onClick={() => onSelectThread(thread.id)}
                              aria-label={thread.title}
                            >
                              <ThreadLabel thread={thread} />
                              {thread.status !== 'idle' ? (
                                <StatusMark status={thread.status} />
                              ) : thread.unread ? (
                                <span className={styles.threadUnreadDot} aria-label="Unread" />
                              ) : null}
                            </button>
                            <ThreadMenu
                              thread={thread}
                              onFork={
                                onForkThread
                                  ? () => {
                                      setForkingThread(thread);
                                      setForkTitle(`${thread.title} fork`);
                                      setForkIsolated(false);
                                    }
                                  : undefined
                              }
                              onArchive={
                                onArchiveThread
                                  ? () => void onArchiveThread(thread.id)
                                  : undefined
                              }
                              onRename={() => {
                                setEditingThread(thread);
                                setEditingTitle(thread.title);
                              }}
                              onDelete={() => setDeletingThread(thread)}
                            />
                          </div>
                        ),
                      )
                    ) : query ? null : (
                      <button
                        className={styles.newThreadInline}
                        type="button"
                        onClick={() => onCreateThread(agent.id)}
                      >
                        Start the first thread
                      </button>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
          {query && orderedAgents.length === 0 ? (
            <p className={styles.threadSearchEmpty}>No matching threads</p>
          ) : null}
        </div>
      </div>

      <div className={styles.sidebarFooter}>
        {onOpenQuickSwitcher ? (
          <button className={styles.settingsButton} type="button" onClick={onOpenQuickSwitcher}>
            <MagnifyingGlass size={17} aria-hidden="true" />
            <span>Jump to</span>
            <kbd className={styles.navShortcut}>⌘K</kbd>
          </button>
        ) : null}
        {onOpenActivity ? (
          <>
            <button
              className={styles.settingsButton}
              type="button"
              onClick={onOpenActivity}
              data-testid="activity-center-toggle"
            >
              <span className={styles.activityNavMark} aria-hidden="true" />
              <span>Activity</span>
            </button>
            {onOpenArchived ? (
              <button
                className={styles.settingsButton}
                type="button"
                onClick={onOpenArchived}
                data-testid="archived-threads-toggle"
              >
                <Archive size={17} aria-hidden="true" />
                <span>Archived</span>
              </button>
            ) : null}
          </>
        ) : null}
        <button className={styles.settingsButton} type="button" onClick={onOpenSettings}>
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
          <AlertDialog.Content className={styles.alertDialogContent}>
            <AlertDialog.Title>Delete this thread?</AlertDialog.Title>
            <AlertDialog.Description>
              This permanently removes “{deletingThread?.title}” and its local transcript. It
              does not change workspace files
              {deletingThread?.worktree?.kind === 'linked'
                ? ' or remove its linked worktree.'
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
                {pendingThreadAction ? 'Deleting...' : 'Delete thread'}
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
          <Dialog.Content className={styles.alertDialogContent}>
            <Dialog.Title>Fork this thread</Dialog.Title>
            <Dialog.Description>
              Copy the local transcript. Use an isolated Git worktree to run in parallel without
              sharing workspace writes.
            </Dialog.Description>
            <label className={styles.localField}>
              <span>Fork title</span>
              <input
                value={forkTitle}
                onChange={(event) => setForkTitle(event.target.value)}
                maxLength={120}
              />
            </label>
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
                  void onForkThread(forkingThread.id, forkIsolated, forkTitle.trim()).then(
                    () => {
                      setForkingThread(undefined);
                      setPendingThreadAction(false);
                    },
                    () => setPendingThreadAction(false),
                  );
                }}
              >
                Create fork
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

function ThreadLabel({ thread }: { thread: ThreadSummary }) {
  const draft = compactPreview(thread.draft);
  const state = threadStateLabel(thread);
  return (
    <span className={styles.threadCopy} data-thread-draft={draft ? 'true' : undefined}>
      <span className={styles.threadTitle}>{thread.title}</span>
      <span className={styles.threadMeta}>
        {draft ? (
          <>
            <strong>Draft</strong>
            <span className={styles.threadDraftPreview}>{draft}</span>
          </>
        ) : state ? (
          <span>{state}</span>
        ) : null}
        <time dateTime={thread.updatedAt}>{relativeTime(thread.updatedAt)}</time>
      </span>
    </span>
  );
}

function threadStateLabel(thread: ThreadSummary) {
  if (thread.status === 'running') return 'Working';
  if (thread.status === 'waiting') return 'Waiting for you';
  if (thread.status === 'queued') return 'Queued';
  if (thread.status === 'error') return 'Needs attention';
  if (thread.unread) return 'Unread';
  return undefined;
}

function compactPreview(value?: string) {
  const compact = value?.trim().replace(/\s+/g, ' ');
  if (!compact) return undefined;
  return compact.length > 44 ? `${compact.slice(0, 41)}…` : compact;
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
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

function ThreadMenu({
  thread,
  onRename,
  onDelete,
  onFork,
  onArchive,
}: {
  thread: ThreadSummary;
  onRename(): void;
  onDelete(): void;
  onFork?: (() => void) | undefined;
  onArchive?: (() => void) | undefined;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.threadMenuButton}
          aria-label={`Thread actions for ${thread.title}`}
          data-testid="thread-actions"
        >
          <DotsThree size={16} weight="bold" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.threadMenuContent} sideOffset={4} align="start">
          <DropdownMenu.Item className={styles.threadMenuItem} onSelect={onRename}>
            <PencilSimple size={14} aria-hidden="true" />
            Rename
          </DropdownMenu.Item>
          {onFork ? (
            <DropdownMenu.Item
              className={styles.threadMenuItem}
              onSelect={onFork}
              data-testid="thread-fork"
            >
              <GitFork size={14} aria-hidden="true" />
              Fork
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
          <DropdownMenu.Item
            className={`${styles.threadMenuItem} ${styles.threadMenuDanger}`}
            disabled={
              thread.status === 'running' ||
              thread.status === 'queued' ||
              thread.status === 'waiting'
            }
            onSelect={onDelete}
          >
            <Trash size={14} aria-hidden="true" />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
