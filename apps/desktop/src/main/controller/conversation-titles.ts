import type { ThreadView, TimelineItemView } from '../../shared/bridge.js';
import { conversationTitle, UNTITLED_THREAD_TITLE } from '../../shared/plain-text.js';
import type { ControllerContext } from './context.js';

type TitleContext = Pick<ControllerContext, 'commit' | 'remoteAccessAllowed'> & {
  state: Pick<ControllerContext['state'], 'threads' | 'timeline'>;
  deps: Pick<ControllerContext['deps'], 'fakeServices'>;
  runtime?: Pick<NonNullable<ControllerContext['runtime']>, 'generateThreadTitle'> | undefined;
  providers: Pick<ControllerContext['providers'], 'requireReadyProvider'>;
};

function firstRequest(threadId: string, timeline: TimelineItemView[]) {
  return timeline
    .filter((item) => item.threadId === threadId && item.kind === 'user')
    .sort((a, b) => a.sequence - b.sequence)[0];
}

function canSummarize(thread: ThreadView, first: TimelineItemView | undefined) {
  if (
    thread.archivedAt ||
    !first?.text ||
    thread.titleSource === 'ai' ||
    thread.titleSource === 'custom'
  )
    return false;
  if (thread.titleSource === 'message') return true;
  // Older versions saved these automatic titles without recording their source. Preserve every
  // other legacy name, including named schedules, forks, and manually renamed conversations.
  const legacyWords = first.text.trim().replace(/\s+/g, ' ').split(' ').slice(0, 7).join(' ');
  const legacyTitle = legacyWords.length > 52 ? `${legacyWords.slice(0, 49)}...` : legacyWords;
  return [
    UNTITLED_THREAD_TITLE,
    conversationTitle(first.text),
    first.text.slice(0, 80),
    `Text: ${first.text.slice(0, 70)}`,
    legacyTitle,
  ].includes(thread.title);
}

/** Names chats one at a time, separately from task execution and the encrypted transcript. */
export class ConversationTitles {
  private readonly pending = new Set<string>();
  private readonly queue: string[] = [];
  private draining = false;

  constructor(private readonly ctx: TitleContext) {}

  refresh(): void {
    for (const thread of this.ctx.state.threads) this.request(thread.id);
  }

  request(threadId: string): void {
    if (
      this.ctx.deps.fakeServices ||
      !this.ctx.remoteAccessAllowed() ||
      !this.ctx.runtime ||
      this.pending.has(threadId)
    )
      return;
    const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
    if (!thread || !canSummarize(thread, firstRequest(threadId, this.ctx.state.timeline)))
      return;
    this.pending.add(threadId);
    this.queue.push(threadId);
    void this.drain();
  }

  /** Called after the user task queue drains. Optional naming must not compete with real work. */
  resume(): void {
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        if (
          this.ctx.state.threads.some((thread) =>
            ['running', 'queued', 'waiting'].includes(thread.status),
          )
        )
          return;
        const threadId = this.queue.shift()!;
        try {
          const state = this.ctx.state;
          const thread = state.threads.find(({ id }) => id === threadId);
          const first = firstRequest(threadId, state.timeline);
          const runtime = this.ctx.runtime;
          if (
            !thread ||
            !first?.text ||
            !runtime ||
            !this.ctx.remoteAccessAllowed() ||
            !canSummarize(thread, first)
          )
            continue;
          this.ctx.providers.requireReadyProvider(thread.provider, thread.model);
          const previousTitle = thread.title;
          const request = first.text;
          const title = await runtime.generateThreadTitle(
            {
              id: thread.id,
              provider: thread.provider,
              model: thread.model,
              ...(thread.resolvedExecutionTarget
                ? { resolvedExecutionTarget: thread.resolvedExecutionTarget }
                : {}),
              workspace: thread.workspace,
              instructions: '',
            },
            request,
          );
          const current = this.ctx.state.threads.find(({ id }) => id === threadId);
          const currentFirst = firstRequest(threadId, this.ctx.state.timeline);
          // A late result cannot undo a rename, deleted/edited first request, sign-out, or account
          // switch. Updating a label is not task activity and must not reorder the sidebar.
          if (
            !title ||
            !this.ctx.remoteAccessAllowed() ||
            state !== this.ctx.state ||
            !current ||
            current.title !== previousTitle ||
            !canSummarize(current, currentFirst) ||
            currentFirst?.id !== first.id ||
            currentFirst.text !== request
          )
            continue;
          current.title = title;
          current.titleSource = 'ai';
          this.ctx.commit();
        } catch {
          // Keep the immediate request preview when naming is unavailable. Retry on a later visit.
        } finally {
          this.pending.delete(threadId);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
