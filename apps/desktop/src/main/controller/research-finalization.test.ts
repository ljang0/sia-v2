import { describe, expect, it, vi } from 'vitest';
import { createHarness, type ResearchBatchView } from './test-support.js';

describe('research capture finalization', () => {
  it.each(['completed', 'failed', 'cancelled', 'throws'] as const)(
    'keeps late provider usage in one %s episode until the runner drains',
    async (outcome) => {
      let runtimeThreadId = '';
      const terminal = Promise.withResolvers<void>();
      const drain = Promise.withResolvers<void>();
      const terminalApplied = Promise.withResolvers<void>();
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
            type: 'message' as const,
            payload: {
              messageId: 'partial',
              role: 'assistant' as const,
              parts: [{ kind: 'text' as const, text: 'Work in progress' }],
              delta: true,
            },
          };
          await terminal.promise;
          if (outcome === 'throws') {
            yield {
              ...base,
              id: crypto.randomUUID(),
              sequence: 2,
              type: 'error' as const,
              payload: { code: 'test_failure', message: 'Provider failed' },
            };
          } else {
            yield {
              ...base,
              id: crypto.randomUUID(),
              sequence: 2,
              type: 'completion' as const,
              payload: { status: outcome },
            };
          }
          terminalApplied.resolve();
          await drain.promise;
          yield {
            ...base,
            id: crypto.randomUUID(),
            sequence: 3,
            type: 'usage' as const,
            payload: { inputTokens: 72, outputTokens: 19 },
          };
          if (outcome === 'throws') throw new Error('Provider stream failed');
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
      try {
        await controller.invoke('computer.setAccessMode', { mode: 'connected' });
        await controller.invoke('research.setCapture', {
          enabled: true,
          consentVersion: 'alpha-research-v3-raw',
        });
        const agent = await controller.invoke('agents.save', {
          name: 'Capture lifecycle',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
        });
        const { threadId } = await controller.invoke('threads.create', {
          agentId: agent.agentId,
        });
        runtimeThreadId = threadId;
        const { turnId } = await controller.invoke('threads.send', {
          threadId,
          text: 'Keep the complete task record',
        });
        const events = () =>
          repository
            .list<ResearchBatchView>('research')
            .flatMap(({ events }) => events)
            .filter(({ payload }) => payload.turnId === turnId);
        await vi.waitFor(() =>
          expect(
            controller.snapshot().timeline.some((item) => item.text === 'Work in progress'),
          ).toBe(true),
        );
        if (outcome === 'cancelled') {
          await controller.invoke('threads.cancel', { threadId });
          expect(
            controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
          ).toBe('idle');
          // Stop must acknowledge promptly without prematurely sealing the archive.
          expect(events()).toHaveLength(0);
        }
        terminal.resolve();
        await terminalApplied.promise;
        expect(events()).toHaveLength(0);
        drain.resolve();
        await vi.waitFor(() =>
          expect(
            events().filter(({ payload }) => payload.eventType === 'turn.capture_finished'),
          ).toHaveLength(1),
        );
        const captured = events();
        expect(
          captured.filter(({ payload }) => payload.eventType === 'provider.usage'),
        ).toHaveLength(1);
        expect(
          captured.find(({ payload }) => payload.eventType === 'provider.usage')?.payload.data,
        ).toMatchObject({ payload: { inputTokens: 72, outputTokens: 19 } });
        expect(
          captured.find(({ payload }) => payload.eventType === 'turn.capture_finished')?.payload
            .data,
        ).toMatchObject({
          outcome: outcome === 'completed' ? 'completed' : 'discarded',
          evidence: { configuredComputerControlMode: 'vision' },
        });
        expect(JSON.stringify(captured)).toContain('Keep the complete task record');
      } finally {
        terminal.resolve();
        drain.resolve();
        await controller.shutdown();
      }
    },
  );
});
