import type { ActivityEvent, ThreadDetail, ThreadEvent } from '../../types';

/** What in this thread is waiting on the person, if anything, and how to say so briefly. */
export function waitingOnPerson(
  thread: ThreadDetail,
): { key: string; label: string } | undefined {
  const approvals = thread.events.filter(
    (event) => event.type === 'approval' && event.status === 'pending',
  );
  if (approvals.length)
    return {
      key: `approval:${approvals.map(({ id }) => id).join(',')}`,
      label:
        approvals.length === 1 ? '1 approval waiting' : `${approvals.length} approvals waiting`,
    };
  const question =
    thread.status === 'waiting'
      ? thread.events.findLast(
          (event) => event.type === 'question' && event.status === 'pending',
        )
      : undefined;
  if (question) return { key: `question:${question.id}`, label: '1 question waiting' };
  if (thread.error) return { key: `error:${thread.error}`, label: 'Task needs attention' };
  return undefined;
}

/** Where find stands: “2 of 5”, “No matches”, or a prompt before anything is typed. */
export function findCountLabel(query: string, index: number, total: number): string {
  if (!query.trim()) return 'Type to find';
  if (!total) return 'No matches';
  return `${Math.min(index, total - 1) + 1} of ${total}`;
}

export function eventSearchText(event: ThreadEvent): string {
  if (event.type === 'message') {
    return `${event.content} ${(event.attachments ?? []).map(({ name }) => name).join(' ')}`.toLocaleLowerCase();
  }
  if (event.type === 'activity') return event.title.toLocaleLowerCase();
  if (event.type === 'notice') return `${event.title} ${event.detail}`.toLocaleLowerCase();
  if (event.type === 'question') return event.prompt.toLocaleLowerCase();
  return `${event.request.title} ${'summary' in event.request ? event.request.summary : ''}`.toLocaleLowerCase();
}

export type ConversationBlock =
  | { kind: 'event'; event: ThreadEvent; index: number }
  | { kind: 'work'; id: string; events: ActivityEvent[]; start: number; end: number };

/** Consecutive tool steps render as one work group; everything else renders as is. */
export function conversationBlocks(events: readonly ThreadEvent[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  events.forEach((event, index) => {
    const previous = blocks.at(-1);
    if (event.type !== 'activity') blocks.push({ kind: 'event', event, index });
    else if (previous?.kind === 'work' && previous.end === index - 1) {
      previous.events.push(event);
      previous.end = index;
    } else
      blocks.push({ kind: 'work', id: event.id, events: [event], start: index, end: index });
  });
  return blocks;
}

export function eventTime(event: ThreadEvent | undefined): string | undefined {
  return event && 'timestamp' in event ? event.timestamp : undefined;
}

export function workGroupIdFor(
  events: readonly ThreadEvent[],
  eventId: string,
): string | undefined {
  for (const block of conversationBlocks(events))
    if (block.kind === 'work' && block.events.some(({ id }) => id === eventId)) return block.id;
  return undefined;
}
