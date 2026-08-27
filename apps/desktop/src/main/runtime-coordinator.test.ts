import { describe, expect, it, vi } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import type { ProviderAdapter, ProviderSessionOptions } from '@sia/protocol';

import { RuntimeCoordinator, composeSessionInstructions } from './runtime-coordinator.js';

describe('RuntimeCoordinator', () => {
  it('restores bounded user and assistant context when a provider process is recreated', () => {
    const value = composeSessionInstructions('Be concise.', [
      { id: 'user-1', role: 'user', text: 'Remember the blue folder.' },
      { id: 'assistant-1', role: 'assistant', text: 'I will use the blue folder.' },
    ]);
    expect(value).toContain('Be concise.');
    expect(value).toContain('USER:\nRemember the blue folder.');
    expect(value).toContain('ASSISTANT:\nI will use the blue folder.');
    expect(value).toContain('<restored_conversation>');
  });

  it('keeps Meta credentials and unpinned ACP providers outside local provider startup', async () => {
    const runtime = new RuntimeCoordinator(
      new ActionGateway({
        backend: {
          invoke: async () => ({ outcome: 'refused', summary: 'not used' }),
        },
      }),
    );

    await expect(async () => {
      for await (const _event of runtime.runTurn({
        thread: {
          id: 'thread-meta',
          provider: 'meta',
          model: 'meta',
          workspace: '/tmp',
          instructions: '',
        },
        turnId: 'turn',
        text: 'hello',
      })) {
        // no-op
      }
    }).rejects.toThrow('cloud relay');
    await expect(async () => {
      for await (const _event of runtime.runTurn({
        thread: {
          id: 'thread-gemini',
          provider: 'gemini',
          model: 'gemini',
          workspace: '/tmp',
          instructions: '',
        },
        turnId: 'turn',
        text: 'hello',
      })) {
        // no-op
      }
    }).rejects.toThrow('disabled');
    await runtime.dispose();
  });

  it('fails closed before starting an unverified beta harness', async () => {
    const runtime = new RuntimeCoordinator(
      new ActionGateway({
        backend: {
          invoke: async () => ({ outcome: 'refused', summary: 'not used' }),
        },
      }),
    );

    await expect(async () => {
      for await (const _event of runtime.runTurn({
        thread: {
          id: 'thread-opencode',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          resolvedExecutionTarget: {
            provider: 'codex',
            model: 'gpt-5.6-sol',
            harnessId: 'opencode_acp',
            harnessModelId: 'gpt-5.6-sol',
            credentialSource: 'provider_subscription',
            resolutionSource: 'user',
          },
          workspace: '/tmp',
          instructions: '',
        },
        turnId: 'turn',
        text: 'hello',
      })) {
        // no-op
      }
    }).rejects.toThrow('conformance and security checks');
    await runtime.dispose();
  });

  it('dispatches an admitted model route through one registered harness adapter', async () => {
    const createSession = vi.fn(async (options: ProviderSessionOptions) => ({
      id: options.threadId,
      provider: 'codex' as const,
      harnessId: 'example_lab_harness',
      ...(options.resolvedExecutionTarget
        ? { resolvedExecutionTarget: options.resolvedExecutionTarget }
        : {}),
      nativeId: 'lab-native-session',
      threadId: options.threadId,
    }));
    const adapter: ProviderAdapter = {
      id: 'codex',
      productionEnabled: true,
      probe: async () => ({ available: true, supported: true, version: '1.0.0' }),
      account: async () => ({ state: 'authenticated', billing: 'subscription' }),
      createSession,
      async *sendTurn(session, input) {
        yield {
          id: 'event-1',
          threadId: session.threadId,
          turnId: input.turnId,
          sequence: 0,
          timestamp: '2026-08-26T00:00:00.000Z',
          provider: 'codex',
          type: 'completion',
          payload: { status: 'completed' },
        };
      },
      cancelTurn: async () => undefined,
      respondToRequest: async () => undefined,
      dispose: async () => undefined,
    };
    const runtime = new RuntimeCoordinator(
      new ActionGateway({
        backend: {
          invoke: async () => ({ outcome: 'refused', summary: 'not used' }),
        },
      }),
      {
        harnessAdapters: [{ provider: 'codex', harnessId: 'example_lab_harness', adapter }],
      },
    );

    const events = [];
    for await (const event of runtime.runTurn({
      thread: {
        id: 'thread-lab',
        provider: 'codex',
        model: 'example/spark',
        resolvedExecutionTarget: {
          provider: 'codex',
          model: 'example/spark',
          harnessId: 'example_lab_harness',
          harnessModelId: 'lab-native-spark',
          credentialSource: 'provider_subscription',
          resolutionSource: 'backend_default',
        },
        workspace: '/tmp',
        instructions: 'Be concise.',
      },
      turnId: 'turn-1',
      text: 'hello',
    })) {
      events.push(event);
    }

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'lab-native-spark',
        resolvedExecutionTarget: expect.objectContaining({
          harnessId: 'example_lab_harness',
        }),
      }),
      undefined,
    );
    expect(events).toEqual([
      expect.objectContaining({
        harnessId: 'example_lab_harness',
        model: 'example/spark',
      }),
    ]);
    await runtime.dispose();
  });
});
