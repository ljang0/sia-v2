import { randomUUID } from 'node:crypto';
import type { DesktopSnapshot } from '../shared/bridge.js';
import type { LauncherState } from '../shared/launcher.js';
import { activityLabel } from '../shared/activity-label.js';

/** Only main can bind a target. A stale panel cannot reply to or stop a replacement task. */
export class LauncherSession {
  #binding: { threadId: string; sessionId: string; userId?: string } | undefined;
  bind(threadId: string): void {
    this.#binding = { threadId, sessionId: randomUUID() };
  }
  clear(): void {
    this.#binding = undefined;
  }
  target(sessionId: string, snapshot: DesktopSnapshot): string {
    const state = this.view(snapshot);
    if (!state.task || state.task.sessionId !== sessionId || !this.#binding)
      throw new Error('This panel has changed. Review the current request and try again.');
    return this.#binding.threadId;
  }
  view(snapshot: DesktopSnapshot): LauncherState {
    const result: LauncherState = {
      agents: snapshot.agents.map(({ id, name }) => ({ id, name })),
      ...(snapshot.activeAgentId ? { agentId: snapshot.activeAgentId } : {}),
    };
    const binding = this.#binding;
    const thread =
      binding &&
      snapshot.threads.find((item) => item.id === binding.threadId && !item.archivedAt);
    if (!binding || !thread || !result.agents.some((agent) => agent.id === thread.agentId)) {
      this.clear();
      return result;
    }
    const items = snapshot.timeline.filter((item) => item.threadId === thread.id);
    const user = items.filter((item) => item.kind === 'user').at(-1);
    if (user && binding.userId !== user.id) {
      binding.userId = user.id;
      binding.sessionId = randomUUID();
    }
    const current = items.filter(
      (item) =>
        user && item.sequence > user.sequence && (!user.turnId || item.turnId === user.turnId),
    );
    const busy = thread.status === 'running' || thread.status === 'queued';
    const activity = current
      .filter((item) => item.kind === 'activity' && item.status === 'running')
      .at(-1);
    const response = current
      .filter((item) => item.kind === 'assistant')
      .map((item) => item.text ?? '')
      .join('\n\n');
    result.task = {
      sessionId: binding.sessionId,
      agentId: thread.agentId,
      title: thread.title.slice(0, 120),
      status: busy
        ? 'running'
        : thread.status === 'waiting'
          ? 'waiting'
          : thread.status === 'failed'
            ? 'error'
            : 'idle',
      progress:
        thread.status === 'waiting'
          ? 'Sia needs your approval or answer'
          : thread.status === 'failed'
            ? 'This request needs attention'
            : busy
              ? thread.status === 'queued'
                ? 'Waiting to start'
                : activity
                  ? activityLabel(activity.toolName, activity.activity?.kind)
                  : 'Thinking…'
              : 'Ready for a follow-up',
      response: response.slice(-24000),
      truncated: response.length > 24000,
    };
    return result;
  }
}
