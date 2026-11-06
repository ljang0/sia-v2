import { describe, expect, it, vi } from 'vitest';
import { createHarness, type ResearchBatchView } from './test-support.js';

describe('recording changes during a task', () => {
  it.each(['pause', 'decline', 'delete'] as const)(
    '%s prevents the interrupted recording from returning after Resume',
    async (choice) => {
      const finish = Promise.withResolvers<void>();
      let runtimeThreadId = '';
      let runs = 0;
      const runtime = {
        async *runTurn(input: { turnId: string }) {
          const first = ++runs === 1;
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
            type: 'message' as const,
            payload: {
              messageId: input.turnId,
              role: 'assistant' as const,
              parts: [{ kind: 'text' as const, text: 'Working before recording changes' }],
            },
          };
          if (first) await finish.promise;
          yield {
            ...base,
            id: crypto.randomUUID(),
            sequence: 2,
            type: 'usage' as const,
            payload: { inputTokens: 12, outputTokens: 8 },
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
        fakeServices: false,
        visionOnly: true,
        runtime,
      });
      const recording = { enabled: true, consentVersion: 'alpha-research-v3-raw' } as const;
      try {
        await controller.invoke('computer.setAccessMode', { mode: 'connected' });
        await controller.invoke('research.setCapture', recording);
        const agent = await controller.invoke('agents.save', {
          name: 'Recording controls',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
        });
        const { threadId } = await controller.invoke('threads.create', {
          agentId: agent.agentId,
        });
        runtimeThreadId = threadId;
        const interrupted = await controller.invoke('threads.send', {
          threadId,
          text: 'This recording will be interrupted.',
        });
        await vi.waitFor(() =>
          expect(
            controller
              .snapshot()
              .timeline.some((item) => item.text === 'Working before recording changes'),
          ).toBe(true),
        );
        if (choice === 'delete') {
          await controller.invoke('research.delete', { confirmation: 'DELETE' });
        } else {
          await controller.invoke('research.setCapture', {
            enabled: false,
            ...(choice === 'decline' ? { consentVersion: recording.consentVersion } : {}),
          });
        }
        await controller.invoke('research.setCapture', recording);
        finish.resolve();
        await vi.waitFor(() =>
          expect(
            controller.snapshot().threads.find((item) => item.id === threadId)?.status,
          ).toBe('idle'),
        );
        const next = await controller.invoke('threads.send', {
          threadId,
          text: 'Record this new task normally.',
        });
        const events = () =>
          repository.list<ResearchBatchView>('research').flatMap((batch) => batch.events);
        await vi.waitFor(() =>
          expect(
            events().some(
              ({ payload }) =>
                payload.turnId === next.turnId && payload.eventType === 'turn.capture_finished',
            ),
          ).toBe(true),
        );
        expect(events().filter(({ payload }) => payload.turnId === interrupted.turnId)).toEqual(
          [],
        );
      } finally {
        finish.resolve();
        await controller.shutdown();
      }
    },
  );
});
