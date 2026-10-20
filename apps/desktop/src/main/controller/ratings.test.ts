import { describe, expect, it, vi } from 'vitest';
import type { CloudClient } from '../cloud/cloud-client.js';
import type { DesktopController } from './desktop-controller.js';
import { createHarness } from './test-support.js';

async function finishedPracticeTask(controller: DesktopController) {
  const created = await controller.invoke('agents.save', {
    name: 'Personal',
    instructions: '',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-workspace',
  });
  const { threadId } = await controller.invoke('threads.create', { agentId: created.agentId });
  const { turnId } = await controller.invoke('threads.send', {
    threadId,
    text: 'Book the dentist',
  });
  await vi.waitFor(() =>
    expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
      'idle',
    ),
  );
  return { threadId, turnId };
}

const signedIn = {
  initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
  status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
  startEmailSignIn: async () => ({ state: 'signed_in' as const }),
  completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
  signOut: async () => ({ state: 'signed_out' as const }),
} satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

describe('task ratings', () => {
  it('rates a finished task with the route captured from the turn, and re-rating replaces it', async () => {
    const { controller, repository } = await createHarness({ appVersion: '9.9.9-test' });
    try {
      const { threadId, turnId } = await finishedPracticeTask(controller);
      expect(controller.snapshot().ratings?.[turnId]).toEqual({});

      let snapshot = await controller.invoke('ratings.submit', {
        threadId,
        turnId,
        rating: 'good',
      });
      expect(snapshot.ratings?.[turnId]).toEqual({ rating: 'good' });

      snapshot = await controller.invoke('ratings.submit', {
        threadId,
        turnId,
        rating: 'bad',
        reasons: ['got_stuck', 'too_slow'],
        comment: '  Opened the wrong site  ',
      });
      expect(snapshot.ratings?.[turnId]).toEqual({
        rating: 'bad',
        reasons: ['got_stuck', 'too_slow'],
        commented: true,
      });
      const stored = repository.list<{ record: Record<string, unknown>; synced: boolean }>(
        'ratings',
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!.synced).toBe(false);
      expect(stored[0]!.record).toMatchObject({
        schemaVersion: 1,
        threadId,
        turnId,
        rating: 'bad',
        comment: 'Opened the wrong site',
        route: {
          provider: 'codex',
          lab: { id: 'codex', name: 'Codex' },
          model: 'gpt-5.6-sol',
          harnessId: 'codex_app_server',
        },
        task: { outcome: 'completed', stepCount: 0, usedComputer: false, usedBrowser: false },
        appVersion: '9.9.9-test',
      });
      // No prompt or reply text is stored with the rating.
      const serialized = JSON.stringify(stored[0]);
      expect(serialized).not.toContain('Book the dentist');
      expect(serialized).not.toContain('practice reply');
    } finally {
      await controller.shutdown();
    }
  });

  it('rejects ratings for unknown turns, other threads, and mismatched reasons', async () => {
    const { controller } = await createHarness();
    try {
      const { threadId, turnId } = await finishedPracticeTask(controller);
      const other = await finishedPracticeTask(controller);
      await expect(
        controller.invoke('ratings.submit', {
          threadId,
          turnId: crypto.randomUUID(),
          rating: 'good',
        }),
      ).rejects.toThrow('Only a finished task');
      await expect(
        controller.invoke('ratings.submit', {
          threadId: other.threadId,
          turnId,
          rating: 'good',
        }),
      ).rejects.toThrow('Only a finished task');
      await expect(
        controller.invoke('ratings.submit', {
          threadId,
          turnId,
          rating: 'good',
          reasons: ['got_stuck'],
        }),
      ).rejects.toThrow('match your rating');
      // A running task is not rateable until it finishes.
      const { turnId: running } = await controller.invoke('threads.send', {
        threadId,
        text: 'Another task',
      });
      expect(controller.snapshot().ratings?.[running]).toBeUndefined();
      await expect(
        controller.invoke('ratings.submit', { threadId, turnId: running, rating: 'good' }),
      ).rejects.toThrow('Only a finished task');
    } finally {
      await controller.shutdown();
    }
  });

  it('syncs ratings to the cloud with retry and sends only the latest rating', async () => {
    const submitTaskRating = vi
      .fn<(record: { rating: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        admin: false,
        participant: false,
        features: {
          researchUploads: false,
          researchArchive: false,
          connectors: false,
          schedules: false,
        },
      }),
      submitTaskRating,
    } as unknown as CloudClient;
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'call-1',
            name: 'computer_snapshot',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'message' as const,
          payload: {
            role: 'assistant' as const,
            messageId: 'reply',
            parts: [{ kind: 'text' as const, text: 'Done.' }],
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 3,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      cloud,
      identity: signedIn,
      fakeServices: false,
      runtime,
    });
    try {
      const created = await controller.invoke('agents.save', {
        name: 'Personal',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: created.agentId,
      });
      runtimeThreadId = threadId;
      const { turnId } = await controller.invoke('threads.send', { threadId, text: 'Look' });
      await vi.waitFor(() => expect(controller.snapshot().ratings?.[turnId]).toEqual({}));

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await controller.invoke('ratings.submit', { threadId, turnId, rating: 'good' });
      await vi.waitFor(() => expect(submitTaskRating).toHaveBeenCalledTimes(1));
      await controller.invoke('ratings.submit', {
        threadId,
        turnId,
        rating: 'bad',
        reasons: ['wrong_result'],
      });
      await vi.advanceTimersByTimeAsync(16_000);
      vi.useRealTimers();
      await vi.waitFor(() =>
        expect(
          repository.list<{ synced: boolean }>('ratings').every(({ synced }) => synced),
        ).toBe(true),
      );
      expect(submitTaskRating).toHaveBeenCalledTimes(2);
      expect(submitTaskRating.mock.calls[1]![0]).toMatchObject({
        rating: 'bad',
        reasons: ['wrong_result'],
        task: { stepCount: 1, usedComputer: true, usedBrowser: false, outcome: 'completed' },
      });
      const sent = JSON.stringify(submitTaskRating.mock.calls);
      expect(sent).not.toContain('Look');
      expect(sent).not.toContain('Done.');
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });
});
