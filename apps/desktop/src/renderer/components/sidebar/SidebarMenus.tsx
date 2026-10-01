import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Archive,
  Bell,
  BellSlash,
  ChatCircle,
  Copy,
  DotsThree,
  NotePencil,
  PencilSimple,
  PushPin,
  Trash,
} from '@phosphor-icons/react';
import { useRef } from 'react';
import type { AgentSummary, ThreadSummary } from '../../types';
import primitives from '../../styles/primitives.module.css';
import styles from '../Sidebar.module.css';

export function ThreadMenu({
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
        <DropdownMenu.Content
          className={primitives.threadMenuContent}
          sideOffset={4}
          align="start"
        >
          {onSetPinned ? (
            <DropdownMenu.Item
              className={primitives.threadMenuItem}
              onSelect={onSetPinned}
              data-testid="thread-pin"
            >
              <PushPin size={14} aria-hidden="true" />
              {thread.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onRename}>
            <PencilSimple size={14} aria-hidden="true" />
            Rename
          </DropdownMenu.Item>
          {onFork ? (
            <DropdownMenu.Item
              className={primitives.threadMenuItem}
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
              className={primitives.threadMenuItem}
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
            <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onSetUnread}>
              {thread.unread ? (
                <BellSlash size={14} aria-hidden="true" />
              ) : (
                <Bell size={14} aria-hidden="true" />
              )}
              Mark {thread.unread ? 'read' : 'unread'}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            className={`${primitives.threadMenuItem} ${styles.threadMenuDanger}`}
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

export function AgentMenu({
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
        <DropdownMenu.Content
          className={primitives.threadMenuContent}
          sideOffset={4}
          align="end"
        >
          <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onOpen}>
            <ChatCircle size={14} aria-hidden="true" />
            Open agent
          </DropdownMenu.Item>
          <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onEdit}>
            <NotePencil size={14} aria-hidden="true" />
            Edit agent
          </DropdownMenu.Item>
          {onSetPinned ? (
            <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onSetPinned}>
              <PushPin size={14} aria-hidden="true" />
              {agent.pinned ? 'Unpin agent' : 'Pin agent'}
            </DropdownMenu.Item>
          ) : null}
          {onSetNotifications ? (
            <DropdownMenu.Item
              className={primitives.threadMenuItem}
              onSelect={onSetNotifications}
            >
              {agent.notificationsEnabled ? (
                <BellSlash size={14} aria-hidden="true" />
              ) : (
                <Bell size={14} aria-hidden="true" />
              )}
              {agent.notificationsEnabled ? 'Mute notifications' : 'Enable notifications'}
            </DropdownMenu.Item>
          ) : null}
          {onDuplicate ? (
            <DropdownMenu.Item className={primitives.threadMenuItem} onSelect={onDuplicate}>
              <Copy size={14} aria-hidden="true" />
              Duplicate agent
            </DropdownMenu.Item>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
