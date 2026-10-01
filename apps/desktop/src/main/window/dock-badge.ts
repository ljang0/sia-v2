import type { ThreadView } from '../../shared/bridge.js';

/**
 * The Dock badge counts conversations that want the person: a reply they have not read, or a
 * task paused until they allow a step or answer a question. Each conversation counts once.
 */
export function dockBadgeText(
  threads: readonly Pick<ThreadView, 'unread' | 'status' | 'archivedAt'>[],
): string {
  const count = threads.filter(
    (thread) => !thread.archivedAt && (thread.unread || thread.status === 'waiting'),
  ).length;
  if (!count) return '';
  return count > 99 ? '99+' : String(count);
}
