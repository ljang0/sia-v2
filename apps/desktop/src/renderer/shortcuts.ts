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

/** The conversation ⌘1–⌘9 opens: the nth one listed in the sidebar. */
export function conversationForShortcut(
  agents: readonly AgentSummary[],
  digit: number,
): string | undefined {
  return sidebarAgentOrder(agents).flatMap(({ threads }) => sidebarThreadOrder(threads))[
    digit - 1
  ]?.id;
}

export const KEYBOARD_SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: '⌘N', label: 'New conversation' },
  { keys: '⌘K', label: 'Search conversations and actions' },
  { keys: '⌘1–9', label: 'Open a conversation from the sidebar' },
  { keys: '⌘F', label: 'Find in this conversation' },
  { keys: 'Esc', label: 'Stop the running task' },
  { keys: '↩', label: 'Send' },
  { keys: '⇧↩', label: 'New line' },
  { keys: '↑', label: 'Bring back a message you sent (in an empty message box)' },
  { keys: '⌘B', label: 'Show or hide the sidebar' },
  { keys: '⌘,', label: 'Settings' },
  { keys: '⌘E', label: 'Ask Sia from any app' },
  { keys: '⌘/', label: 'Keyboard shortcuts' },
];
