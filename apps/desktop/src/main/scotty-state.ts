import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DesktopController } from './controller.js';
import type { DesktopSnapshot } from '../shared/bridge.js';
import type {
  ScottySettings,
  ScottyState,
  ScottyStatus,
  ScottyTask,
} from '../shared/scotty.js';
import { activityLabel } from '../shared/activity-label.js';
import { latestTaskTurn } from './latest-task-turn.js';

export const scottyCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.enum(['status', 'show', 'hide', 'resetPosition']) }).strict(),
  z
    .object({ operation: z.literal('size'), size: z.enum(['small', 'medium', 'large']) })
    .strict(),
  z.object({ operation: z.literal('motion'), enabled: z.boolean() }).strict(),
]);
export const scottyAction = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('new'),
      agentId: z.string().uuid(),
      text: z.string().trim().min(1).max(8000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('reply'),
      token: z.string().uuid(),
      text: z.string().trim().min(1).max(8000),
    })
    .strict(),
  z.object({ kind: z.enum(['open', 'cancel', 'read']), token: z.string().uuid() }).strict(),
  z
    .object({
      kind: z.literal('approve'),
      token: z.string().uuid(),
      approvalId: z.string().uuid(),
      decision: z.enum(['approve', 'deny']),
    })
    .strict(),
]);
const priority: Record<ScottyStatus, number> = {
  input: 0,
  blocked: 1,
  ready: 2,
  working: 3,
  idle: 4,
};

/** A bounded view of Sia's own task state. Never persists a second transcript or calls a model. */
export class ScottyTasks {
  #bindings = new Map<string, { fingerprint: string; token: string }>();
  #pinned: string | undefined;
  clear(): void {
    this.#bindings.clear();
    this.#pinned = undefined;
  }
  view(snapshot: DesktopSnapshot, settings: ScottySettings, available: boolean): ScottyState {
    const state: ScottyState = {
      revision: snapshot.revision,
      settings: { ...settings },
      available,
      status: 'idle',
      workingCount: 0,
      attentionCount: 0,
      agents: [],
      tasks: [],
      moreTasks: false,
    };
    if (!available) {
      this.clear();
      return state;
    }
    state.agents = snapshot.agents.map(({ id, name }) => ({ id, name }));
    if (snapshot.activeAgentId) state.agentId = snapshot.activeAgentId;
    const threads = snapshot.threads.filter(
      (thread) =>
        !thread.archivedAt && state.agents.some((agent) => agent.id === thread.agentId),
    );
    const activeIds = new Set(threads.map((thread) => thread.id));
    for (const id of this.#bindings.keys()) if (!activeIds.has(id)) this.#bindings.delete(id);
    const itemsByThread = new Map<string, DesktopSnapshot['timeline']>();
    for (const item of snapshot.timeline) {
      if (!activeIds.has(item.threadId)) continue;
      const items = itemsByThread.get(item.threadId) ?? [];
      items.push(item);
      itemsByThread.set(item.threadId, items);
    }
    const tasks = threads
      .map((thread): ScottyTask & { updatedAt: string } => {
        const items = itemsByThread.get(thread.id) ?? [];
        const { user, current, activity, response } = latestTaskTurn(items);
        const approval = snapshot.approvals.find(
          (item) => item.threadId === thread.id && item.status === 'pending',
        );
        const question =
          thread.status === 'waiting' && !approval
            ? current.findLast((item) => item.kind === 'question' && item.status === 'pending')
            : undefined;
        const fingerprint = JSON.stringify([
          user?.id,
          question?.id,
          approval?.id,
          approval?.expiresAt,
        ]);
        let binding = this.#bindings.get(thread.id);
        if (!binding || binding.fingerprint !== fingerprint) {
          binding = { fingerprint, token: randomUUID() };
          this.#bindings.set(thread.id, binding);
        }
        const busy = thread.status === 'running' || thread.status === 'queued';
        const status: ScottyStatus =
          thread.status === 'waiting'
            ? 'input'
            : thread.status === 'failed'
              ? 'blocked'
              : busy
                ? 'working'
                : thread.unread
                  ? 'ready'
                  : 'idle';
        const cancelled = current.some(
          (item) =>
            item.kind === 'notice' &&
            /cancelled/i.test(`${item.title ?? ''} ${item.text ?? ''}`),
        );
        const result: ScottyTask & { updatedAt: string } = {
          id: thread.id,
          token: binding.token,
          agent: state.agents.find((agent) => agent.id === thread.agentId)!.name,
          title: thread.title.slice(0, 120),
          status,
          progress: approval
            ? 'Review an action'
            : question
              ? 'A question for you'
              : status === 'input'
                ? 'Needs your attention'
                : status === 'blocked'
                  ? 'Task needs attention'
                  : busy
                    ? thread.status === 'queued'
                      ? 'Waiting to start'
                      : activity
                        ? activityLabel(activity.toolName, activity.activity?.kind)
                        : 'Thinking…'
                    : cancelled
                      ? 'Cancelled'
                      : status === 'ready'
                        ? 'New result'
                        : 'Ready for a follow-up',
          response: response.slice(-24000),
          truncated: response.length > 24000,
          canReply: !busy && !approval && (thread.status !== 'waiting' || Boolean(question)),
          canStop: busy || thread.status === 'waiting',
          unread: Boolean(thread.unread),
          updatedAt: thread.updatedAt,
        };
        if (question)
          result.question = (question.text ?? 'Sia needs your answer.').slice(0, 24000);
        if (approval) {
          const fields = [
            approval.title,
            approval.summary,
            approval.target,
            approval.account,
            approval.dataLeaving,
          ];
          result.approval = {
            id: approval.id,
            title: approval.title.slice(0, 1000),
            summary: approval.summary.slice(0, 8000),
            // Match the main approval card: native approvals name the Mac, not the harness.
            target: (approval.kind === 'native_tool' ? 'This Mac' : approval.target).slice(
              0,
              8000,
            ),
            ...(approval.account ? { account: approval.account.slice(0, 1000) } : {}),
            ...(approval.dataLeaving
              ? { dataLeaving: approval.dataLeaving.slice(0, 8000) }
              : {}),
            reversible: approval.reversible,
            requiresMainApp:
              fields.some((value) => (value?.length ?? 0) > 8000) ||
              approval.title.length > 1000 ||
              (approval.account?.length ?? 0) > 1000,
          };
        }
        return result;
      })
      .sort(
        (a, b) =>
          priority[a.status] - priority[b.status] || b.updatedAt.localeCompare(a.updatedAt),
      );
    const relevant = tasks.filter(
      (task) => task.status === 'input' || task.status === 'working' || task.unread,
    );
    state.status = relevant[0]?.status ?? 'idle';
    state.workingCount = tasks.filter((task) => task.status === 'working').length;
    state.attentionCount = relevant.filter(
      (task) => task.status === 'input' || task.status === 'blocked',
    ).length;
    const visible = tasks.slice(0, 24);
    const pinned = tasks.find((task) => task.id === this.#pinned);
    if (pinned && !visible.includes(pinned)) visible.splice(23, 1, pinned);
    state.tasks = visible.map(({ updatedAt: _updatedAt, ...task }) => task);
    state.moreTasks = tasks.length > visible.length;
    return state;
  }
  async act(
    raw: unknown,
    controller: Pick<DesktopController, 'snapshot' | 'invoke' | 'remoteAccessAllowed'>,
    settings: ScottySettings,
    openSia: () => void,
    isAvailable: () => boolean = () => true,
  ): Promise<{ threadId: string }> {
    if (!settings.enabled || !controller.remoteAccessAllowed() || !isAvailable())
      throw new Error('Open Sia and sign in to continue.');
    const input = scottyAction.parse(raw);
    const state = this.view(controller.snapshot(), settings, true);
    if (input.kind === 'new') {
      if (!state.agents.some((agent) => agent.id === input.agentId))
        throw new Error('Choose an available Sia agent.');
      const { threadId } = await controller.invoke('threads.create', {
        agentId: input.agentId,
        title: input.text.slice(0, 80),
      });
      if (!controller.remoteAccessAllowed() || !isAvailable())
        throw new Error('Open Sia and sign in to continue.');
      this.#pinned = threadId;
      await controller.invoke('threads.send', { threadId, text: input.text });
      return { threadId };
    }
    const task = state.tasks.find((item) => item.token === input.token);
    if (!task) throw new Error('This task has changed. Review it again before continuing.');
    const threadId = task.id;
    if (input.kind === 'reply') {
      if (!task.canReply)
        throw new Error('Wait for the current action or review its approval first.');
      await controller.invoke('threads.send', { threadId, text: input.text });
    } else if (input.kind === 'cancel') {
      if (!task.canStop) throw new Error('This task has already stopped.');
      await controller.invoke('threads.cancel', { threadId });
    } else if (input.kind === 'approve') {
      const approval = controller
        .snapshot()
        .approvals.find(
          (item) =>
            item.id === input.approvalId &&
            item.threadId === threadId &&
            item.status === 'pending',
        );
      if (
        !approval ||
        task.approval?.id !== approval.id ||
        task.approval.requiresMainApp ||
        (approval.expiresAt !== undefined &&
          (!Number.isFinite(Date.parse(approval.expiresAt)) ||
            Date.parse(approval.expiresAt) <= Date.now()))
      )
        throw new Error('Review the current approval in Sia.');
      await controller.invoke('approvals.resolve', {
        approvalId: approval.id,
        decision: input.decision,
      });
    } else if (input.kind === 'open') {
      await controller.invoke('threads.select', { threadId });
      openSia();
    } else await controller.invoke('threads.setUnread', { threadId, unread: false });
    return { threadId };
  }
}
