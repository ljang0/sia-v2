import type { TimelineItemView } from '../shared/bridge.js';

/** Items must belong to one thread and retain timeline order. */
export function latestTaskTurn(items: readonly TimelineItemView[]) {
  const user = items.findLast((item) => item.kind === 'user');
  const current = items.filter(
    (item) =>
      user && item.sequence > user.sequence && (!user.turnId || item.turnId === user.turnId),
  );
  return {
    user,
    current,
    activity: current.findLast((item) => item.kind === 'activity' && item.status === 'running'),
    response: current
      .filter((item) => item.kind === 'assistant')
      .map((item) => item.text ?? '')
      .join('\n\n'),
  };
}
