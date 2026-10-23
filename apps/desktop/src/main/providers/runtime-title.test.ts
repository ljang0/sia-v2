import { describe, expect, it, vi } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import type { ProviderAdapter, ProviderSessionOptions } from '@sia/protocol';
import { RuntimeCoordinator, type RuntimeThreadConfig } from './runtime-coordinator.js';

const thread: RuntimeThreadConfig = {
  id: 'real-conversation',
  provider: 'meta',
  model: 'included',
  workspace: '/tmp/sia-title-test',
  instructions: 'Private agent instructions',
  notchVault: '/private/memory',
  computerAccessMode: 'mac',
  priorMessages: [{ id: 'private-history', role: 'user', text: 'Private older message' }],
  resolvedExecutionTarget: {
    provider: 'meta',
    model: 'included',
    harnessId: 'codex_app_server',
    harnessModelId: 'included-alias',
    credentialSource: 'sia_managed',
    resolutionSource: 'backend_default',
  },
};

function harness(options: { output?: string; failed?: boolean; waitForAbort?: boolean } = {}) {
  const createSession = vi.fn(async (input: ProviderSessionOptions) => ({
    id: input.threadId,
    nativeId: `native-${input.threadId}`,
    provider: 'meta' as const,
    threadId: input.threadId,
  }));
  const closeSession = vi.fn(async () => undefined);
  const sent = vi.fn();
  const toolAttempt = vi.fn();
  const backend = {
    invoke: vi.fn(async () => ({ outcome: 'verified' as const, summary: 'done' })),
  };
  const adapter: ProviderAdapter = {
    id: 'meta',
    productionEnabled: true,
    probe: async () => ({ available: true, supported: true }),
    account: async () => ({ state: 'authenticated', billing: 'included' }),
    createSession,
    closeSession,
    async *sendTurn(session, input, signal) {
      sent(input);
      toolAttempt(await runtime.invokeCapability(session.nativeId, 'computer_list', {}));
      if (options.waitForAbort)
        await new Promise<void>((resolve) => {
          signal!.addEventListener('abort', () => resolve(), { once: true });
        });
      const base = {
        threadId: session.threadId,
        turnId: input.turnId,
        timestamp: new Date().toISOString(),
        provider: 'meta' as const,
      };
      const output = options.output ?? '{"title":"CMU professor lookup"}';
      for (const [index, text] of [output.slice(0, 10), output.slice(10)].entries()) {
        yield {
          ...base,
          id: `message-${index}`,
          sequence: index,
          type: 'message' as const,
          payload: {
            messageId: 'title',
            role: 'assistant' as const,
            delta: true,
            parts: [{ kind: 'text' as const, text }],
          },
        };
      }
      yield {
        ...base,
        id: 'done',
        sequence: 2,
        type: 'completion' as const,
        payload: { status: options.failed ? ('failed' as const) : ('completed' as const) },
      };
    },
    cancelTurn: async () => undefined,
    respondToRequest: async () => undefined,
    dispose: async () => undefined,
  };
  const runtime = new RuntimeCoordinator(new ActionGateway({ backend }), {
    harnessAdapters: [{ provider: 'meta', harnessId: 'codex_app_server', adapter }],
  });
  return { runtime, backend, createSession, closeSession, sent, toolAttempt };
}

describe('isolated AI conversation naming', () => {
  it('uses the pinned route with no tools, memory or history, assembles deltas and releases its session', async () => {
    const h = harness();
    try {
      expect(
        await h.runtime.generateThreadTitle(thread, 'Find my professors on CMU Canvas'),
      ).toBe('CMU professor lookup');
      const session = h.createSession.mock.calls[0]![0];
      expect(session).toMatchObject({
        model: 'included-alias',
        resolvedExecutionTarget: thread.resolvedExecutionTarget,
        nativeTools: 'disabled',
        tools: [],
      });
      expect(session.threadId).not.toBe(thread.id);
      expect(session.history).toBeUndefined();
      expect(session.instructions).not.toContain('Private');
      expect(session.baseInstructions).toBeUndefined();
      expect(h.sent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'included-alias',
          text: JSON.stringify({ firstMessage: 'Find my professors on CMU Canvas' }),
          outputSchema: expect.objectContaining({ required: ['title'] }),
        }),
      );
      expect(
        await h.runtime.invokeCapability(session.threadId, 'computer_list', {}),
      ).toMatchObject({ outcome: 'refused' });
      expect(h.backend.invoke).not.toHaveBeenCalled();
      expect(h.toolAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'refused' }),
      );
      expect(h.closeSession).toHaveBeenCalledOnce();
    } finally {
      await h.runtime.dispose();
    }
  });

  it.each([{ output: '{"title":"A title which is far too long"}' }, { failed: true }])(
    'rejects invalid or failed generation and releases resources: %j',
    async (options) => {
      const h = harness(options);
      try {
        expect(await h.runtime.generateThreadTitle(thread, 'Find professors')).toBeUndefined();
        expect(h.closeSession).toHaveBeenCalledOnce();
      } finally {
        await h.runtime.dispose();
      }
    },
  );

  it('cancels naming at an account/session reset', async () => {
    const h = harness({ waitForAbort: true });
    const result = h.runtime.generateThreadTitle(thread, 'Find professors');
    await vi.waitFor(() => expect(h.sent).toHaveBeenCalledOnce());
    await h.runtime.resetSessions();
    expect(await result).toBeUndefined();
    await h.runtime.dispose();
  });
});
