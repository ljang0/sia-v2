import type { ThreadDetail } from './types';

export function completedReplyId(thread: ThreadDetail): string | undefined {
  if (thread.status !== 'idle' || thread.error) return;
  const start = thread.events.findLastIndex(
    (event) => event.type === 'message' && event.role === 'user',
  );
  const turn = thread.events.slice(start + 1);
  if (
    turn.some(
      (event) =>
        (event.type === 'notice' &&
          (event.title === 'Task cancelled' || event.tone === 'error')) ||
        ((event.type === 'approval' || event.type === 'question') &&
          event.status === 'pending'),
    )
  )
    return;
  const reply = turn.findLast(
    (event) => event.type === 'message' && event.role === 'assistant',
  );
  return reply?.type === 'message' && reply.content.trim() ? reply.id : undefined;
}
