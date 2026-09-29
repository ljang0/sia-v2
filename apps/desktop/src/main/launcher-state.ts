import { randomUUID } from 'node:crypto';
import type { LauncherState } from '../shared/launcher.js';
import { activityLabel } from '../shared/activity-label.js';
import { latestTaskTurn, type TaskSnapshot } from './latest-task-turn.js';

/** Only main can bind a target. A stale panel cannot reply to or stop a replacement task. */
export class LauncherSession {
  #binding: { threadId: string; sessionId: string; userId?: string } | undefined;
  bind(threadId: string): void {
    this.#binding = { threadId, sessionId: randomUUID() };
  }
  clear(): void {
    this.#binding = undefined;
  }
  target(sessionId: string, snapshot: TaskSnapshot): string {
    const state = this.view(snapshot);
    if (!state.task || state.task.sessionId !== sessionId || !this.#binding)
      throw new Error('This panel has changed. Review the current request and try again.');
    return this.#binding.threadId;
  }
  view(snapshot: TaskSnapshot): LauncherState {
    const result: LauncherState = {
      appearance: snapshot.preferences?.appearance ?? 'expressive',
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
    const { user, activity, response } = latestTaskTurn(items);
    if (user && binding.userId !== user.id) {
      binding.userId = user.id;
      binding.sessionId = randomUUID();
    }
    const busy = thread.status === 'running' || thread.status === 'queued';
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
