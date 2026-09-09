import { describe, expect, it, vi } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import type {
  ProviderAdapter,
  ProviderSessionOptions,
  ThreadEventEnvelope,
} from '@sia/protocol';

import { RuntimeCoordinator, composeSessionInstructions } from './runtime-coordinator.js';
import type { RuntimeThreadConfig } from './runtime-coordinator.js';

describe('Use my Mac execution isolation', () => {
  function harness(verify: boolean) {
    let passes = 0;
    const createSession = vi.fn(async (options: ProviderSessionOptions) => ({
      id: `session-${createSession.mock.calls.length}`,
      nativeId: `native-${createSession.mock.calls.length}`,
      threadId: options.threadId,
      provider: 'meta' as const,
    }));
    const backend = {
      invoke: vi.fn(async () => ({
        outcome: 'verified' as const,
        summary: 'Evidence accepted',
      })),
    };
    const adapter: ProviderAdapter = {
      id: 'meta',
      productionEnabled: true,
      probe: async () => ({ available: true, supported: true }),
      account: async () => ({ state: 'authenticated', billing: 'included' }),
      createSession,
      async *sendTurn(session, input) {
        passes++;
        const options = createSession.mock.calls.at(-1)![0];
        const denied = await runtime.invokeCapability(session.nativeId, 'browser_tabs', {});
        if (options.nativeTools === 'disabled')
          expect(denied).toMatchObject({ outcome: 'refused' });
        await runtime.invokeCapability(session.nativeId, 'computer_list', {});
        if (verify && passes > 1 && options.nativeTools === 'disabled') {
          expect(input.text).toContain('Continue the original task');
          await runtime.invokeCapability(session.nativeId, 'computer_task_complete', {
            items: [
              {
                requirement: 'Read document',
                status: 'blocked',
                reason: 'The document is unavailable.',
              },
            ],
          });
        }
        const base = {
          id: `message-${passes}`,
          threadId: session.threadId,
          turnId: input.turnId,
          sequence: 0,
          timestamp: '2026-09-09T00:00:00Z',
          provider: 'meta' as const,
        };
        yield {
          ...base,
          type: 'message',
          payload: {
            messageId: `message-${passes}`,
            role: 'assistant',
            parts: [
              {
                kind: 'text',
                text: passes === 1 ? 'Unchecked answer' : 'Document is unavailable',
              },
            ],
            delta: false,
          },
        };
        yield {
          ...base,
          id: `done-${passes}`,
          sequence: 1,
          type: 'completion',
          payload: { status: 'completed' },
        };
      },
      cancelTurn: async () => undefined,
      respondToRequest: async () => undefined,
      dispose: async () => undefined,
    };
    const runtime = new RuntimeCoordinator(new ActionGateway({ backend }), {
      harnessAdapters: [{ provider: 'meta', harnessId: 'codex_app_server', adapter }],
    });
    const thread: RuntimeThreadConfig = {
      id: 'mac-task',
      provider: 'meta',
      model: 'included',
      workspace: '/tmp',
      instructions: '',
      computerAccessMode: 'mac',
      resolvedExecutionTarget: {
        provider: 'meta',
        model: 'included',
        harnessId: 'codex_app_server',
        harnessModelId: 'included',
        credentialSource: 'sia_managed',
        resolutionSource: 'backend_default',
      },
    };
    const events: ThreadEventEnvelope[] = [];
    const run = async () => {
      for await (const event of runtime.runTurn({
        thread,
        turnId: 'turn',
        text: 'Read my document',
      }))
        events.push(event);
    };
    return { runtime, createSession, backend, thread, events, run, passes: () => passes };
  }

  it('withholds an unchecked answer, continues verification, and restores connected tools when the mode changes', async () => {
    const h = harness(true);
    try {
      await h.run();
      expect(h.passes()).toBe(2);
      expect(JSON.stringify(h.events)).not.toContain('Unchecked answer');
      expect(JSON.stringify(h.events)).toContain('Document is unavailable');
      const mac = h.createSession.mock.calls[0]![0];
      expect(mac.nativeTools).toBe('disabled');
      expect(mac.tools.map(({ name }) => name)).toContain('computer_task_complete');
      expect(mac.tools.some(({ name }) => /^(browser_|mail_|drive_|slack_)/.test(name))).toBe(
        false,
      );
      expect(h.backend.invoke.mock.calls.length).toBe(3);
      h.thread.computerAccessMode = 'connected';
      await h.run();
      const connected = h.createSession.mock.calls[1]![0];
      expect(connected.nativeTools).toBeUndefined();
      expect(connected.tools.map(({ name }) => name)).toContain('browser_tabs');
      expect(connected.tools.map(({ name }) => name)).not.toContain('computer_task_complete');
    } finally {
      await h.runtime.dispose();
    }
  });

  it('stops after two verification continuations and never emits the unchecked final', async () => {
    const h = harness(false);
    try {
      await expect(h.run()).rejects.toThrow('unverified final answer was withheld');
      expect(h.passes()).toBe(3);
      expect(h.events).toEqual([]);
    } finally {
      await h.runtime.dispose();
    }
  });
});

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

it('passes only library tools and the native-execution restriction to the pinned Codex harness', async () => {
  const createSession = vi.fn(async (options: ProviderSessionOptions) => ({
    id: options.threadId,
    threadId: options.threadId,
    provider: 'meta' as const,
    nativeId: 'review-native',
  }));
  const adapter: ProviderAdapter = {
    id: 'meta',
    productionEnabled: true,
    probe: async () => ({ available: true, supported: true, version: '1.0.0' }),
    account: async () => ({ state: 'authenticated', billing: 'included' }),
    createSession,
    async *sendTurn(session, input) {
      yield {
        id: 'done',
        threadId: session.threadId,
        turnId: input.turnId,
        sequence: 0,
        timestamp: '2026-09-06T00:00:00Z',
        provider: 'meta',
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
      backend: { invoke: async () => ({ outcome: 'refused', summary: 'unused' }) },
    }),
    { harnessAdapters: [{ provider: 'meta', harnessId: 'codex_app_server', adapter }] },
  );
  try {
    for await (const _event of runtime.runTurn({
      thread: {
        id: 'review',
        provider: 'meta',
        model: 'included',
        workspace: '/tmp',
        instructions: 'Review evidence',
        nativeTools: 'disabled',
        resolvedExecutionTarget: {
          provider: 'meta',
          model: 'included',
          harnessId: 'codex_app_server',
          harnessModelId: 'included',
          credentialSource: 'sia_managed',
          resolutionSource: 'backend_default',
        },
      },
      turnId: 'turn',
      text: 'Review the library',
    })) {
      /* consume */
    }
    const options = createSession.mock.calls[0]![0];
    expect(options.nativeTools).toBe('disabled');
    expect(options.tools.map((tool) => tool.name).sort()).toEqual([
      'assistant_library',
      'memory_suggest',
    ]);
  } finally {
    await runtime.dispose();
  }
});
