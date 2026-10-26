import { describe, expect, it, vi } from 'vitest';
import type { ThreadView } from '../../shared/bridge.js';
import { ConversationTitles } from './conversation-titles.js';

function fixture(titleSource?: ThreadView['titleSource']) {
  const thread: ThreadView = {
    id: 'thread',
    agentId: 'agent',
    title: 'Can you find my CMU professors?',
    ...(titleSource ? { titleSource } : {}),
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-title-fixture',
    agentRevision: 'revision',
    instructionsSnapshot: 'Private instructions',
    agentNameSnapshot: 'Sia',
    status: 'idle',
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '2026-10-22T12:00:00Z',
  };
  const generate = vi.fn(async () => 'CMU professor lookup');
  const ctx: ConstructorParameters<typeof ConversationTitles>[0] = {
    deps: { fakeServices: false },
    state: {
      threads: [thread],
      timeline: [
        {
          id: 'first',
          threadId: thread.id,
          turnId: 'turn',
          sequence: 1,
          kind: 'user',
          text: thread.title,
          timestamp: thread.createdAt,
          status: 'complete',
        },
      ],
    },
    runtime: { generateThreadTitle: generate },
    providers: { requireReadyProvider: vi.fn() },
    commitBackgroundState: vi.fn(),
    remoteAccessAllowed: vi.fn(() => true),
  };
  return { thread, ctx, generate, titles: new ConversationTitles(ctx) };
}

describe('automatic conversation titles', () => {
  it.each(['running', 'queued', 'waiting'] as const)(
    'defers optional naming while a task is %s',
    async (status) => {
      const { thread, titles, generate } = fixture('message');
      thread.status = status;
      titles.request(thread.id);
      expect(generate).not.toHaveBeenCalled();
      thread.status = 'idle';
      titles.resume();
      await vi.waitFor(() => expect(thread.titleSource).toBe('ai'));
      expect(generate).toHaveBeenCalledOnce();
    },
  );
  it('upgrades the old seven-word format saved by earlier versions', async () => {
    const { thread, ctx, titles } = fixture();
    thread.title = 'Can you tell me my most recent';
    ctx.state.timeline[0]!.text = 'Can you tell me my most recent unread Gmail please';
    titles.refresh();
    await vi.waitFor(() => expect(thread.titleSource).toBe('ai'));
  });

  it('summarizes legacy request titles, without changing recency or transcript', async () => {
    const { thread, ctx, generate, titles } = fixture();
    const timeline = structuredClone(ctx.state.timeline);
    titles.refresh();
    titles.request(thread.id);
    await vi.waitFor(() => expect(thread.titleSource).toBe('ai'));
    expect(thread.title).toBe('CMU professor lookup');
    expect(thread.updatedAt).toBe('2026-10-22T12:00:00Z');
    expect(ctx.state.timeline).toEqual(timeline);
    expect(generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'codex', model: 'gpt-5.6-sol', instructions: '' }),
      timeline[0]!.text,
    );
    titles.refresh();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each(['custom', 'ai'] as const)(
    'preserves %s names even if they match the first request',
    async (source) => {
      const { titles, generate } = fixture(source);
      titles.refresh();
      expect(generate).not.toHaveBeenCalled();
    },
  );

  it('preserves named schedules and legacy manual names', () => {
    const { thread, titles, generate } = fixture();
    thread.title = 'Morning check-in';
    titles.refresh();
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(['rename', 'edit', 'delete', 'lock', 'account'] as const)(
    'discards a late result after %s',
    async (change) => {
      const { thread, ctx, generate, titles } = fixture('message');
      let finish!: (value: string) => void;
      generate.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      titles.request(thread.id);
      if (change === 'rename') {
        thread.titleSource = 'custom';
        thread.title = 'My own name';
      }
      if (change === 'edit') ctx.state.timeline[0]!.text = 'A different request';
      if (change === 'delete') ctx.state.threads = [];
      if (change === 'lock') vi.mocked(ctx.remoteAccessAllowed).mockReturnValue(false);
      if (change === 'account') ctx.state = structuredClone(ctx.state);
      finish('CMU professor lookup');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ctx.commitBackgroundState).not.toHaveBeenCalled();
      expect(thread.titleSource).not.toBe('ai');
    },
  );

  it('serializes naming jobs and keeps model failures out of task state', async () => {
    const { thread, ctx, generate, titles } = fixture('message');
    ctx.state.threads.push({ ...thread, id: 'second' });
    ctx.state.timeline.push({
      ...ctx.state.timeline[0]!,
      id: 'second-message',
      threadId: 'second',
    });
    let fail!: (cause: Error) => void;
    generate.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    titles.refresh();
    expect(generate).toHaveBeenCalledTimes(1);
    fail(new Error('Offline'));
    await vi.waitFor(() => expect(ctx.state.threads[1]!.titleSource).toBe('ai'));
    expect(thread.titleSource).toBe('message');
    expect(thread.status).toBe('idle');
    expect(ctx.state.timeline).toHaveLength(2);
  });

  it('does not use a provider in fake services, while locked, or for archived work', () => {
    const { thread, ctx, generate, titles } = fixture('message');
    ctx.deps = { fakeServices: true };
    titles.refresh();
    ctx.deps = { fakeServices: false };
    vi.mocked(ctx.remoteAccessAllowed).mockReturnValue(false);
    titles.refresh();
    vi.mocked(ctx.remoteAccessAllowed).mockReturnValue(true);
    thread.archivedAt = thread.updatedAt;
    titles.refresh();
    expect(generate).not.toHaveBeenCalled();
  });
});
