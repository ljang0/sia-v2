import { describe, expect, it, vi } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import type {
  ProviderAdapter,
  ProviderSessionOptions,
  ThreadEventEnvelope,
} from '@sia/protocol';

import { RuntimeCoordinator, composeSessionInstructions } from './runtime-coordinator.js';
import type { RuntimeThreadConfig } from './runtime-coordinator.js';

describe('Use my Mac native execution', () => {
  it('uses the Notch prompt and native tools, restores connected tools, and recreates sessions when trust changes', async () => {
    const created: ProviderSessionOptions[] = [];
    const backend = {
      invoke: vi.fn(async () => ({ outcome: 'verified' as const, summary: 'done' })),
    };
    let passes = 0;
    const adapter: ProviderAdapter = {
      id: 'meta',
      productionEnabled: true,
      probe: async () => ({ available: true, supported: true }),
      account: async () => ({ state: 'authenticated', billing: 'included' }),
      createSession: async (options) => {
        created.push(options);
        return {
          id: `session-${created.length}`,
          nativeId: `native-${created.length}`,
          threadId: options.threadId,
          provider: 'meta',
        };
      },
      async *sendTurn(session, input) {
        passes++;
        if (created.at(-1)?.nativeTools === 'mac') {
          expect(input.outputSchema).toMatchObject({
            required: expect.arrayContaining(['response', 'success']),
          });
          expect(input.text).toContain('Screen geometry');
          for (const name of [
            'browser_tabs',
            'mac_automation',
            'computer_task_complete',
            'skill_run',
          ])
            expect(await runtime.invokeCapability(session.nativeId, name, {})).toMatchObject({
              outcome: 'refused',
            });
          expect(
            await runtime.invokeCapability(session.nativeId, 'computer_list', {}),
          ).toMatchObject({
            outcome: created.at(-1)?.tools.some((tool) => tool.name === 'computer_list')
              ? 'verified'
              : 'refused',
          });
        }
        yield {
          id: 'answer',
          threadId: session.threadId,
          turnId: input.turnId,
          sequence: 1,
          timestamp: new Date().toISOString(),
          provider: 'meta',
          type: 'message',
          payload: {
            messageId: 'answer',
            role: 'assistant',
            delta: false,
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  type: 'action',
                  steps: [],
                  response: 'The document is ready.',
                  success: true,
                }),
              },
            ],
          },
        };
        yield {
          id: 'done',
          threadId: session.threadId,
          turnId: input.turnId,
          sequence: 2,
          timestamp: new Date().toISOString(),
          provider: 'meta',
          type: 'completion',
          payload: { status: 'completed' },
        };
      },
      cancelTurn: async () => undefined,
      respondToRequest: async () => undefined,
      dispose: async () => undefined,
    };
    const runtime = new RuntimeCoordinator(new ActionGateway({ backend }), {
      macContext: async () => 'Screen geometry',
      harnessAdapters: [{ provider: 'meta', harnessId: 'codex_app_server', adapter }],
    });
    const thread: RuntimeThreadConfig = {
      id: 'mac',
      provider: 'meta',
      model: 'included',
      workspace: '/tmp',
      instructions: '',
      computerAccessMode: 'mac',
      computerTrust: 'auto',
      resolvedExecutionTarget: {
        provider: 'meta',
        model: 'included',
        harnessId: 'codex_app_server',
        harnessModelId: 'included',
        credentialSource: 'sia_managed',
        resolutionSource: 'backend_default',
      },
    };
    const run = async () => {
      const events: ThreadEventEnvelope[] = [];
      for await (const e of runtime.runTurn({
        thread,
        turnId: 'turn',
        text: 'Make a document',
      }))
        events.push(e);
      return events;
    };
    try {
      const events = await run();
      expect(passes).toBe(1);
      expect(created[0]).toMatchObject({
        nativeTools: 'mac',
        nativeApproval: 'auto',
        baseInstructions: expect.stringContaining('PERCEIVE → ACT → VERIFY'),
      });
      expect(created[0]?.tools.map((tool) => tool.name)).not.toContain('computer_list');
      expect(created[0]?.baseInstructions).toContain('NORMAL APP WORKFLOW');
      expect(backend.invoke).not.toHaveBeenCalled();
      thread.macBackgroundControl = true;
      await run();
      expect(created[1]?.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['computer_list', 'computer_snapshot', 'computer_action']),
      );
      expect(created[1]?.baseInstructions).toContain('EXPERIMENTAL WINDOW CONTROL');
      expect(JSON.stringify(events)).toContain('The document is ready.');
      expect(JSON.stringify(events)).not.toContain('success');
      expect(backend.invoke).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'computer_list', arguments: {} }),
      );
      thread.computerTrust = 'ask';
      await run();
      expect(created[2]?.nativeApproval).toBe('ask');
      thread.computerAccessMode = 'connected';
      await run();
      expect(created[3]?.nativeTools).toBeUndefined();
      expect(created[3]?.baseInstructions).toBeUndefined();
      expect(created[3]?.tools.map((t) => t.name)).toContain('browser_tabs');
      expect(created[3]?.tools.map((t) => t.name)).not.toContain('computer_task_complete');
    } finally {
      await runtime.dispose();
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
