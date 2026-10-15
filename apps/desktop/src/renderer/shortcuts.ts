import { UNTITLED_THREAD_TITLE } from '../shared/plain-text';
import type { AgentSummary, ThreadSummary } from './types';

/** Sidebar order: pinned agents first, then by name. */
export function sidebarAgentOrder<T extends Pick<AgentSummary, 'name' | 'pinned'>>(
  agents: readonly T[],
): T[] {
  return [...agents].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * An agent's conversations as the sidebar lists them: pinned first, each part keeping the
 * incoming (most recent first) order. Returns the same array when nothing moves.
 */
export function sidebarThreadOrder<T extends Pick<ThreadSummary, 'pinned'>>(
  threads: readonly T[],
): readonly T[] {
  const pinned = threads.filter((thread) => thread.pinned);
  if (pinned.length === 0 || pinned.length === threads.length) return threads;
  return [...pinned, ...threads.filter((thread) => !thread.pinned)];
}

type ListedThread = Pick<
  ThreadSummary,
  'id' | 'title' | 'status' | 'preview' | 'draft' | 'pinned'
>;

/** A conversation nobody has written in yet: no message, draft, pin, or work under way. */
export function isUntouchedThread(thread: Omit<ListedThread, 'id'>): boolean {
  return (
    thread.title === UNTITLED_THREAD_TITLE &&
    thread.status === 'idle' &&
    !thread.preview &&
    !thread.draft?.trim() &&
    !thread.pinned
  );
}

/**
 * The conversations the sidebar lists, in order. An untouched conversation shows only while it
 * is open, so leaving one never leaves an empty "New conversation" row behind.
 */
export function listedThreads<T extends ListedThread>(
  threads: readonly T[],
  selectedThreadId?: string,
): readonly T[] {
  const listed = threads.some((thread) => isUntouchedThread(thread))
    ? threads.filter((thread) => thread.id === selectedThreadId || !isUntouchedThread(thread))
    : threads;
  return sidebarThreadOrder(listed);
}

/** The conversation ⌘1–⌘9 opens: the nth one listed in the sidebar. */
export function conversationForShortcut(
  agents: readonly AgentSummary[],
  digit: number,
  selectedThreadId?: string,
): string | undefined {
  return sidebarAgentOrder(agents).flatMap(({ threads }) =>
    listedThreads(threads, selectedThreadId),
  )[digit - 1]?.id;
}

export const KEYBOARD_SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: '⌘N', label: 'New conversation' },
  { keys: '⌘K', label: 'Search conversations and actions' },
  { keys: '⌘1–9', label: 'Open a conversation from the sidebar' },
  { keys: '⌘F', label: 'Find in this conversation' },
  { keys: 'Esc', label: 'Stop the running task' },
  { keys: '⌃Esc', label: 'Stop Sia using your screen, from any app' },
  { keys: '↩', label: 'Send' },
  { keys: '⇧↩', label: 'New line' },
  { keys: '↑', label: 'Bring back a message you sent (in an empty message box)' },
  { keys: '⌘B', label: 'Show or hide the sidebar' },
  { keys: '⌘,', label: 'Settings' },
  { keys: '⌘E', label: 'Ask Sia from any app' },
  { keys: '⌘/', label: 'Keyboard shortcuts' },
];
