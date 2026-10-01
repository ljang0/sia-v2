import type { DesktopSnapshot, TimelineItemView } from '../../shared/bridge.js';

/**
 * What Scotty and the command launcher read: task metadata plus each thread's latest turn.
 * Their timeline holds only items from each thread's last request onward.
 */
export type TaskSnapshot = Pick<
  DesktopSnapshot,
  'revision' | 'agents' | 'threads' | 'timeline' | 'approvals' | 'activeAgentId' | 'preferences'
> & {
  /** Working Use my Mac tasks by thread: on the person's screen or in the background. */
  screenControl?: Record<string, 'foreground' | 'background'>;
};

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
