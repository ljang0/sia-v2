import type { AgentSummary } from './types';

/** Sidebar order: pinned agents first, then by name. */
export function sidebarAgentOrder<T extends Pick<AgentSummary, 'name' | 'pinned'>>(
  agents: readonly T[],
): T[] {
  return [...agents].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The conversation ⌘1–⌘9 opens: the nth one listed in the sidebar. */
export function conversationForShortcut(
  agents: readonly AgentSummary[],
  digit: number,
): string | undefined {
  return sidebarAgentOrder(agents).flatMap(({ threads }) => threads)[digit - 1]?.id;
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
