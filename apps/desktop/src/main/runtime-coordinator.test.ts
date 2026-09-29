import { describe, expect, it, vi } from 'vitest';
import { ActionGateway, LocalLeaseCoordinator } from '@sia/action-gateway';
import type {
  ProviderAdapter,
  ProviderSessionOptions,
  ThreadEventEnvelope,
} from '@sia/protocol';

import {
  RuntimeCoordinator,
  composeSessionInstructions,
  macRequestClock,
} from './runtime-coordinator.js';
import type { RuntimeThreadConfig } from './runtime-coordinator.js';

describe('Use my Mac native execution', () => {
  it('prepares the provider before reserving the GUI and captures context only after ownership', async () => {
    const leases = new LocalLeaseCoordinator();
    const busy = await leases.startTurn({ threadId: 'busy', turnId: 'busy-turn' });
    await busy.acquire({ kind: 'global_focus', id: 'foreground' });
    const lease = await leases.startTurn({ threadId: 'ready', turnId: 'ready-turn' });
    const created = vi.fn(async (options: ProviderSessionOptions) => ({
      id: 'session-ready',
      nativeId: 'native-ready',
      provider: 'meta' as const,
      threadId: options.threadId,
    }));
    const sent = vi.fn();
    const macContext = vi.fn(async () => 'Fresh screen context');
    const adapter: ProviderAdapter = {
      id: 'meta',
      productionEnabled: true,
      probe: async () => ({ available: true, supported: true }),
      account: async () => ({ state: 'authenticated', billing: 'included' }),
      createSession: created,
      async *sendTurn(session, input) {
        sent(input.text);
        yield {
          id: 'complete',
          threadId: session.threadId,
          turnId: input.turnId,
          provider: 'meta',
          sequence: 0,
          timestamp: new Date().toISOString(),
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
          invoke: async () => ({ outcome: 'verified', summary: 'done' }),
        },
      }),
      {
        macContext,
        harnessAdapters: [{ provider: 'meta', harnessId: 'codex_app_server', adapter }],
      },
    );
    const stream = runtime
      .runTurn({
        thread: {
          id: 'ready',
          provider: 'meta',
          model: 'included',
          workspace: '/tmp/ready',
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
        },
        text: 'Inspect the screen',
        turnId: 'ready-turn',
        lease,
      })
      [Symbol.asyncIterator]();
    const first = stream.next();
    try {
      await vi.waitFor(() => expect(created).toHaveBeenCalledTimes(1));
      expect(sent).not.toHaveBeenCalled();
      expect(macContext).not.toHaveBeenCalled();
      busy.release();
      expect((await first).value?.type).toBe('completion');
      expect(sent).toHaveBeenCalledWith(expect.stringContaining('Fresh screen context'));
      expect(lease.holds({ kind: 'global_focus', id: 'foreground' })).toBe(true);
      await stream.next();
    } finally {
      busy.release();
      lease.release();
      await runtime.dispose();
    }
  });

  it('grounds relative dates in the Mac timezone, including across UTC midnight', () => {
    const clock = macRequestClock(new Date('2026-09-15T02:00:00Z'), 'America/New_York');
    expect(clock).toContain('Monday, September 14, 2026');
    expect(clock).toContain('America/New_York');
  });
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
        if (['mac', 'mac-background'].includes(created.at(-1)?.nativeTools ?? '')) {
          expect(input.text).toContain('Current request time:');
          expect(input.outputSchema).toMatchObject({
            required: expect.arrayContaining(['response', 'success']),
          });
          if (created.at(-1)?.nativeTools === 'mac')
            expect(input.text).toContain('Screen geometry');
          else expect(input.text).not.toContain('Screen geometry');
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
          id: 'progress',
          threadId: session.threadId,
          turnId: input.turnId,
          sequence: 0,
          timestamp: new Date().toISOString(),
          provider: 'meta',
          type: 'message',
          payload: {
            messageId: 'progress',
            role: 'assistant',
            delta: false,
            phase: 'commentary',
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  type: 'action',
                  response: '',
                  success: true,
                  steps: ['Checking the document.'],
                }),
              },
            ],
          },
        };
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
    const onMacResult = vi.fn();
    const run = async () => {
      const events: ThreadEventEnvelope[] = [];
      for await (const e of runtime.runTurn({
        thread,
        turnId: 'turn',
        text: 'Make a document',
        onMacResult,
      }))
        events.push(e);
      return events;
    };
    try {
      const events = await run();
      expect(onMacResult).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, response: 'The document is ready.' }),
      );
      expect(onMacResult).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(events)).toContain('Checking the document.');
      expect(JSON.stringify(events)).not.toContain('\\"success\\":true');
      expect(passes).toBe(1);
      expect(created[0]).toMatchObject({
        nativeTools: 'mac',
        nativeApproval: 'auto',
        baseInstructions: expect.stringContaining('PERCEIVE → ACT → VERIFY'),
      });
      expect(created[0]?.tools.map((tool) => tool.name)).not.toContain('computer_list');
      expect(created[0]?.baseInstructions).toContain('after EVERY state-changing step');
      expect(created[0]?.baseInstructions).toContain('MOC.md');
      expect(created[0]?.baseInstructions).not.toContain('Prefer a dictionary readback');
      expect(backend.invoke).not.toHaveBeenCalled();
      thread.macBackgroundControl = true;
      await run();
      expect(created[1]?.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'computer_list',
          'computer_snapshot',
          'computer_action',
          'skill_save',
          'skill_run',
          'computer_read_file',
          'computer_write_file',
          'memory_vault',
        ]),
      );
      expect(created[1]?.baseInstructions).toContain('EXPERIMENTAL WINDOW CONTROL');
      expect(created[1]?.nativeTools).toBe('mac-background');
      expect(created[1]?.baseInstructions).not.toContain('screencapture');
      // Foreground uses the pinned Notch recipe; the window driver has its own
      // tool-specific guidance. Do not stack that second recipe onto Notch.
      expect(created[0]?.baseInstructions).not.toContain('INVESTIGATE THE WHOLE REQUEST');
      expect(created[0]?.baseInstructions).not.toContain('CANVAS COURSE RESEARCH');
      expect(created[0]?.baseInstructions).toContain('matching saved skills');
      expect(created[0]?.baseInstructions).toContain('UI-only or no-API');
      for (const session of created.slice(1, 2)) {
        expect(session.baseInstructions).toContain('INVESTIGATE THE WHOLE REQUEST');
        expect(session.baseInstructions).toContain('CANVAS COURSE RESEARCH');
        expect(session.baseInstructions).toContain('Open EACH in-scope course');
        expect(session.baseInstructions).toContain('incomplete coverage');
        expect(session.baseInstructions).toContain('Courses/All Courses');
        expect(session.baseInstructions).toContain('"Through Canvas" is a source limit');
        expect(session.baseInstructions).toContain('Do not generate site: queries');
        expect(session.baseInstructions).toContain(
          'never let a public page establish current enrollment',
        );
      }
      expect(JSON.stringify(events)).toContain('The document is ready.');
      expect(JSON.stringify(events)).not.toContain('success');
      expect(backend.invoke).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: 'computer_list',
          arguments: {},
          context: expect.objectContaining({ backgroundOnly: true }),
        }),
      );
      thread.computerTrust = 'ask';
      await run();
      expect(created[2]?.nativeApproval).toBe('ask');
      thread.macBackgroundFallback = 'foreground';
      await run();
      expect(created[3]?.nativeTools).toBe('mac-background');
      expect(backend.invoke).toHaveBeenLastCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ backgroundOnly: false }),
        }),
      );
      thread.computerAccessMode = 'connected';
      await run();
      expect(created[4]?.nativeTools).toBeUndefined();
      expect(created[4]?.baseInstructions).toBeUndefined();
      expect(created[4]?.tools.map((t) => t.name)).toContain('browser_tabs');
      expect(created[4]?.tools.map((t) => t.name)).not.toContain('memory_vault');
      expect(created[4]?.tools.map((t) => t.name)).not.toContain('computer_task_complete');
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
    }).rejects.toThrow(
      'This model is no longer available in Sia. Choose Codex or a model included with Sia.',
    );
    await runtime.dispose();
  });

  it('lets the host revoke session-bound capabilities when sessions are reset', async () => {
    const onSessionsReset = vi.fn();
    const runtime = new RuntimeCoordinator(
      new ActionGateway({
        backend: { invoke: async () => ({ outcome: 'refused', summary: 'not used' }) },
      }),
      { onSessionsReset },
    );
    await runtime.resetSessions();
    expect(onSessionsReset).toHaveBeenCalledOnce();
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

it.each([false, true])(
  'isolates library review tools from native execution (Notch vault: %s)',
  async (notchReview) => {
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
          notchReview,
          ...(notchReview ? { notchVault: '/tmp/.sia-mac/test' } : {}),
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
      expect(options.tools.map((tool) => tool.name).sort()).toEqual(
        notchReview ? ['memory_vault'] : ['assistant_library', 'memory_suggest'],
      );
      if (notchReview) {
        expect(options.baseInstructions).toContain('PROMOTE');
        expect(options.baseInstructions).toContain('no shell, GUI, account or network tools');
      }
    } finally {
      await runtime.dispose();
    }
  },
);
