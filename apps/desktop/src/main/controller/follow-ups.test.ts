import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import { createHarness } from './test-support.js';

describe('follow-up messages while a turn runs', () => {
  function followUpRuntime() {
    const turns: RuntimeTurnInput[] = [];
    const release = new Map<string, () => void>();
    const runtime = {
      async *runTurn(input: RuntimeTurnInput, signal?: AbortSignal) {
        turns.push(input);
        const event = {
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...event,
          id: randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: `reply-${input.turnId}`,
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: `Reply ${turns.length}` }],
            delta: false,
          },
        };
        await new Promise<void>((resolve) => {
          release.set(input.turnId, resolve);
          // A stopped native turn takes a moment to wind down, like Codex cleanup does.
          signal?.addEventListener('abort', () => setTimeout(resolve, 60), { once: true });
        });
        yield {
          ...event,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: {
            status: signal?.aborted ? ('cancelled' as const) : ('completed' as const),
          },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    return { runtime, turns, release };
  }

  async function startThread(runtime: unknown, pastedAttachmentRoot?: string) {
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
      ...(pastedAttachmentRoot ? { pastedAttachmentRoot } : {}),
    });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Follow-ups',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const thread = () => controller.snapshot().threads.find(({ id }) => id === threadId)!;
    const users = () =>
      controller
        .snapshot()
        .timeline.filter((item) => item.threadId === threadId && item.kind === 'user')
        .sort((left, right) => left.sequence - right.sequence);
    return { controller, repository, threadId, thread, users };
  }

  it('queues a message sent while the turn runs and starts it when the turn ends', async () => {
    const { runtime, turns, release } = followUpRuntime();
    const { controller, threadId, thread, users } = await startThread(runtime);
    try {
      const first = await controller.invoke('threads.send', {
        threadId,
        text: 'Draft the plan',
      });
      await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));

      const second = await controller.invoke('threads.send', {
        threadId,
        text: 'Also add dates',
      });
      expect(thread().status).toBe('running');
      expect(users().map(({ text, status }) => ({ text, status }))).toEqual([
        { text: 'Draft the plan', status: 'complete' },
        { text: 'Also add dates', status: 'pending' },
      ]);
      expect(turns).toHaveLength(1);

      release.get(first.turnId)!();
      await vi.waitFor(() => expect(release.has(second.turnId)).toBe(true));
      expect(thread().status).toBe('running');
      expect(turns.map(({ turnId }) => turnId)).toEqual([first.turnId, second.turnId]);
      expect(turns[1]!.text).toContain('Also add dates');
      // The first turn's reply is context for the follow-up; the follow-up is not repeated.
      expect(turns[1]!.thread.priorMessages?.map(({ text }) => text)).toEqual([
        'Draft the plan',
        'Reply 1',
      ]);
      // It joins the transcript after the reply it followed, exactly once.
      const ordered = controller
        .snapshot()
        .timeline.filter(
          (item) =>
            item.threadId === threadId && (item.kind === 'user' || item.kind === 'assistant'),
        )
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ text }) => text);
      expect(ordered).toEqual(['Draft the plan', 'Reply 1', 'Also add dates', 'Reply 2']);
      expect(users().every(({ status }) => status === 'complete')).toBe(true);

      release.get(second.turnId)!();
      await vi.waitFor(() => expect(thread().status).toBe('idle'));
      expect(turns).toHaveLength(2);
      expect(users()).toHaveLength(2);
    } finally {
      await controller.shutdown();
    }
  });

  it('queues a message sent right after Stop and starts it once the stopped turn winds down', async () => {
    const { runtime, turns, release } = followUpRuntime();
    const { controller, threadId, thread, users } = await startThread(runtime);
    try {
      const first = await controller.invoke('threads.send', { threadId, text: 'Book a table' });
      await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));
      await controller.invoke('threads.cancel', { threadId });
      expect(thread().status).toBe('idle');

      const next = await controller.invoke('threads.send', {
        threadId,
        text: 'Try 7pm instead',
      });
      expect(thread()).toMatchObject({
        status: 'queued',
        queueReason: 'Finishing the stopped task.',
      });
      expect(users().at(-1)).toMatchObject({ text: 'Try 7pm instead', status: 'pending' });

      await vi.waitFor(() => expect(release.has(next.turnId)).toBe(true));
      expect(thread().status).toBe('running');
      expect(turns.map(({ turnId }) => turnId)).toEqual([first.turnId, next.turnId]);
      release.get(next.turnId)!();
      await vi.waitFor(() => expect(thread().status).toBe('idle'));
      expect(users().map(({ text, status }) => ({ text, status }))).toEqual([
        { text: 'Book a table', status: 'complete' },
        { text: 'Try 7pm instead', status: 'complete' },
      ]);
    } finally {
      await controller.shutdown();
    }
  });

  it('removes a queued follow-up before it starts, and Stop drops the rest', async () => {
    const { runtime, turns, release } = followUpRuntime();
    const { controller, threadId, thread, users } = await startThread(runtime);
    try {
      const first = await controller.invoke('threads.send', { threadId, text: 'Summarize' });
      await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));
      await controller.invoke('threads.send', { threadId, text: 'Shorter please' });
      await controller.invoke('threads.send', { threadId, text: 'And in French' });
      const shorter = users().find(({ text }) => text === 'Shorter please')!;

      await controller.invoke('threads.unqueue', { threadId, messageId: shorter.id });
      expect(users().map(({ text }) => text)).toEqual(['Summarize', 'And in French']);
      await expect(
        controller.invoke('threads.unqueue', { threadId, messageId: shorter.id }),
      ).rejects.toThrow('already started or was removed');

      await controller.invoke('threads.cancel', { threadId });
      expect(users().map(({ text }) => text)).toEqual(['Summarize']);
      expect(controller.snapshot().timeline.at(-1)).toMatchObject({
        title: 'Task cancelled',
        text: expect.stringContaining('Your queued message was not sent.'),
      });
      await vi.waitFor(() => expect(controller.snapshot().timeline.length).toBeGreaterThan(0));
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(turns).toHaveLength(1);
      expect(thread().status).toBe('idle');
    } finally {
      await controller.shutdown();
    }
  });

  it('Try again and Edit replace the last exchange and start from the conversation before it', async () => {
    const { runtime, turns, release } = followUpRuntime();
    const releaseSession = vi.fn(async () => undefined);
    const { controller, threadId, thread } = await startThread({ ...runtime, releaseSession });
    const transcript = () =>
      controller
        .snapshot()
        .timeline.filter(
          (item) =>
            item.threadId === threadId && (item.kind === 'user' || item.kind === 'assistant'),
        )
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ text }) => text);
    const finish = async (count: number) => {
      await vi.waitFor(() => expect(turns).toHaveLength(count));
      await vi.waitFor(() => expect(release.has(turns.at(-1)!.turnId)).toBe(true));
      release.get(turns.at(-1)!.turnId)!();
      await vi.waitFor(() => expect(thread().status).toBe('idle'));
    };
    try {
      await controller.invoke('threads.send', { threadId, text: 'Plan a trip' });
      await expect(controller.invoke('threads.redo', { threadId })).rejects.toThrow(
        'Wait for Sia to finish',
      );
      await finish(1);
      await controller.invoke('threads.send', { threadId, text: 'Somewhere warm' });
      await finish(2);
      expect(transcript()).toEqual(['Plan a trip', 'Reply 1', 'Somewhere warm', 'Reply 2']);

      await controller.invoke('threads.redo', { threadId });
      expect(releaseSession).toHaveBeenCalledWith(threadId);
      await finish(3);
      expect(transcript()).toEqual(['Plan a trip', 'Reply 1', 'Somewhere warm', 'Reply 3']);
      // The replaced reply is not part of what the provider sees.
      expect(turns[2]!.text).toContain('Somewhere warm');
      expect(turns[2]!.thread.priorMessages?.map(({ text }) => text)).toEqual([
        'Plan a trip',
        'Reply 1',
      ]);

      await controller.invoke('threads.redo', { threadId, text: 'Somewhere cold' });
      await finish(4);
      expect(transcript()).toEqual(['Plan a trip', 'Reply 1', 'Somewhere cold', 'Reply 4']);
    } finally {
      await controller.shutdown();
    }
  });

  it('attaches a pasted screenshot to a follow-up sent while the turn runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-pasted-'));
    const { runtime, turns, release } = followUpRuntime();
    const { controller, threadId, users } = await startThread(runtime, root);
    try {
      const first = await controller.invoke('threads.send', { threadId, text: 'Tidy my desk' });
      await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
      const { attachments } = await controller.invoke('attachments.paste', {
        threadId,
        name: 'image.png',
        mimeType: 'image/png',
        data: png,
      });
      expect(attachments).toEqual([
        expect.objectContaining({ name: 'Pasted image.png', kind: 'image', bytes: png.length }),
      ]);
      await expect(
        controller.invoke('attachments.paste', {
          threadId,
          mimeType: 'image/png',
          data: new TextEncoder().encode('not really a png'),
        }),
      ).rejects.toThrow('could not be read');

      await controller.invoke('threads.send', {
        threadId,
        text: 'Like this one',
        attachmentIds: [attachments[0]!.id],
      });
      expect(users().at(-1)).toMatchObject({
        status: 'pending',
        attachments: [expect.objectContaining({ name: 'Pasted image.png' })],
      });
      release.get(first.turnId)!();
      await vi.waitFor(() => expect(turns).toHaveLength(2));
      const [attached] = turns[1]!.attachments ?? [];
      expect(attached).toMatchObject({ kind: 'image', name: 'Pasted image.png' });
      expect(attached!.path.startsWith(root)).toBe(true);
      release.get(turns[1]!.turnId)?.();
    } finally {
      await controller.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('sends a queued follow-up into the running turn, and keeps it queued when that fails', async () => {
    const { runtime, turns, release } = followUpRuntime();
    const steer = vi.fn(async () => undefined);
    const { controller, threadId, thread, users } = await startThread({ ...runtime, steer });
    try {
      const first = await controller.invoke('threads.send', { threadId, text: 'Plan a trip' });
      await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));
      await controller.invoke('threads.send', { threadId, text: 'Make it Portugal' });
      await controller.invoke('threads.send', { threadId, text: 'Under $2k' });
      const portugal = users().find(({ text }) => text === 'Make it Portugal')!;

      await controller.invoke('threads.steer', { threadId, messageId: portugal.id });
      expect(steer).toHaveBeenCalledWith(threadId, first.turnId, { text: 'Make it Portugal' });
      // It joins the running turn after what the agent already said; the other stays queued.
      const ordered = controller
        .snapshot()
        .timeline.filter(
          (item) =>
            item.threadId === threadId && (item.kind === 'user' || item.kind === 'assistant'),
        )
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ text, status, turnId }) => ({ text, status, turnId }));
      expect(ordered.filter(({ status }) => status !== 'pending')).toEqual([
        { text: 'Plan a trip', status: 'complete', turnId: first.turnId },
        { text: 'Reply 1', status: 'complete', turnId: first.turnId },
        { text: 'Make it Portugal', status: 'complete', turnId: first.turnId },
      ]);
      expect(ordered.filter(({ status }) => status === 'pending')).toMatchObject([
        { text: 'Under $2k' },
      ]);
      await expect(
        controller.invoke('threads.steer', { threadId, messageId: portugal.id }),
      ).rejects.toThrow('already started or was removed');

      steer.mockRejectedValueOnce(new Error('Turn mismatch.'));
      const budget = users().find(({ text }) => text === 'Under $2k')!;
      await expect(
        controller.invoke('threads.steer', { threadId, messageId: budget.id }),
      ).rejects.toThrow('it will be sent next');
      expect(users().find(({ id }) => id === budget.id)).toMatchObject({ status: 'pending' });

      release.get(first.turnId)!();
      await vi.waitFor(() => expect(turns).toHaveLength(2));
      // The steered message never starts a turn of its own.
      expect(turns[1]!.text).toContain('Under $2k');
      await vi.waitFor(() => expect(release.has(turns[1]!.turnId)).toBe(true));
      await expect(
        controller.invoke('threads.steer', { threadId, messageId: budget.id }),
      ).rejects.toThrow('already started or was removed');
      release.get(turns[1]!.turnId)!();
      await vi.waitFor(() => expect(thread().status).toBe('idle'));
    } finally {
      await controller.shutdown();
    }
  });

  it('returns unsent follow-ups to the composer after a relaunch', async () => {
    const { runtime, release } = followUpRuntime();
    const { controller, repository: initial, threadId } = await startThread(runtime);
    const first = await controller.invoke('threads.send', { threadId, text: 'Clean my inbox' });
    await vi.waitFor(() => expect(release.has(first.turnId)).toBe(true));
    await controller.invoke('threads.send', { threadId, text: 'Skip newsletters' });
    // Sia closed while the follow-up was still waiting.
    const persisted = structuredClone(initial.get('desktop', 'state'));
    await controller.shutdown();

    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('desktop', 'state', persisted);
    const restored = await createHarness({ repository });
    try {
      const snapshot = restored.controller.snapshot();
      const thread = snapshot.threads.find(({ id }) => id === threadId)!;
      expect(thread.status).toBe('failed');
      expect(thread.draft).toBe('Skip newsletters');
      expect(
        snapshot.timeline.filter((item) => item.threadId === threadId && item.kind === 'user'),
      ).toEqual([expect.objectContaining({ text: 'Clean my inbox', status: 'complete' })]);
    } finally {
      await restored.controller.shutdown();
    }
  });
});
