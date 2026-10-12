import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CloudClient } from '../cloud/cloud-client.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import type { probeProviders } from '../providers/provider-probe.js';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import type { DesktopController } from './desktop-controller.js';
import { createHarness, deterministicProviderProbe } from './test-support.js';

describe('DesktopController', () => {
  it.each([false, true])(
    'runs and restores an explicitly changed model with its matching execution route (stale saved model: %s)',
    async (staleSavedModel) => {
      const turns: RuntimeTurnInput[] = [];
      const runtime = {
        async *runTurn(input: RuntimeTurnInput) {
          turns.push(input);
          if (input.thread.resolvedExecutionTarget?.model !== input.thread.model) {
            throw new Error('Mismatched model route');
          }
          yield {
            id: randomUUID(),
            threadId: input.thread.id,
            turnId: input.turnId,
            provider: 'codex' as const,
            sequence: 1,
            timestamp: new Date().toISOString(),
            type: 'completion' as const,
            payload: { status: 'completed' as const },
          };
        },
        dispose: vi.fn(async () => undefined),
      };
      const providerProbe = async (only?: Parameters<typeof probeProviders>[0]) =>
        (await deterministicProviderProbe(only)).map((provider) =>
          provider.id === 'codex'
            ? {
                ...provider,
                models: ['gpt-5.6-sol', 'gpt-5.6-terra'].map((id) => ({
                  id,
                  label: id,
                  description: '',
                  reasoningEfforts: ['medium'],
                })),
              }
            : provider,
        );
      const first = await createHarness({ fakeServices: false, runtime, providerProbe });
      const { agentId } = await first.controller.invoke('agents.save', {
        name: 'Model replacement',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await first.controller.invoke('threads.create', { agentId });
      const saved = first.repository.get<{ threads: Array<{ id: string; model: string }> }>(
        'desktop',
        'state',
      )!;
      if (staleSavedModel) {
        saved.threads.find(({ id }) => id === threadId)!.model = 'gpt-5.6-terra';
      }
      const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
      repository.put('desktop', 'state', saved);
      await first.controller.shutdown();
      const { controller } = await createHarness({
        fakeServices: false,
        runtime,
        providerProbe,
        repository,
      });
      try {
        await controller.invoke('threads.config', {
          threadId,
          model: 'gpt-5.6-terra',
          reasoningEffort: 'medium',
        });
        await controller.invoke('threads.send', { threadId, text: 'Read the test document.' });
        await vi.waitFor(() =>
          expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
            'idle',
          ),
        );
        expect(turns).toHaveLength(1);
        expect(turns[0]?.thread.resolvedExecutionTarget).toMatchObject({
          provider: 'codex',
          model: 'gpt-5.6-terra',
          harnessId: 'codex_app_server',
          harnessModelId: 'gpt-5.6-terra',
          credentialSource: 'provider_subscription',
        });
        const persisted = repository.get<{ threads: unknown[] }>('desktop', 'state')!;
        expect(persisted.threads).toContainEqual(
          expect.objectContaining({
            id: threadId,
            model: 'gpt-5.6-terra',
            resolvedExecutionTarget: turns[0]?.thread.resolvedExecutionTarget,
          }),
        );
      } finally {
        await controller.shutdown();
      }
    },
  );

  it('uses the offered reasoning default after reset while preserving an explicit choice', async () => {
    const turns: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        turns.push(input);
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      providerProbe: async (only) =>
        (await deterministicProviderProbe(only)).map((provider) =>
          provider.id === 'codex'
            ? {
                ...provider,
                models: [
                  {
                    id: 'gpt-5.6-sol',
                    label: 'GPT-5.6-Sol',
                    description: '',
                    reasoningEfforts: ['low', 'medium'],
                    defaultReasoningEffort: 'medium',
                  },
                ],
              }
            : provider,
        ),
    });
    try {
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Reasoning validation',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      for (const choice of ['low', '']) {
        await controller.invoke('threads.config', {
          threadId,
          model: 'gpt-5.6-sol',
          reasoningEffort: choice,
        });
        await controller.invoke('threads.send', { threadId, text: 'Read the test document.' });
        await vi.waitFor(() =>
          expect(
            controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
          ).toBe('idle'),
        );
      }
      expect(turns.map((turn) => turn.reasoningEffort)).toEqual(['low', 'medium']);
    } finally {
      await controller.shutdown();
    }
  });

  it('saves your own API key write-only and pins new threads to its Codex route', async () => {
    const key = 'sk-test-0123456789abcdefghijklmnop';
    let saved: { model: string; host: string } | undefined;
    const save = vi.fn(async (input: { baseUrl?: string; model: string; apiKey: string }) => {
      saved = { model: input.model, host: new URL(input.baseUrl!).host };
    });
    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe: deterministicProviderProbe,
      byok: { summary: () => saved, save, clear: () => (saved = undefined) },
    });
    try {
      expect(controller.snapshot().providers.find(({ id }) => id === 'byok')).toMatchObject({
        status: 'needs_login',
      });
      const snapshot = await controller.invoke('providers.setApiKey', {
        baseUrl: 'https://lab.example/v1',
        model: 'lab/spark',
        apiKey: key,
      });
      expect(save).toHaveBeenCalledOnce();
      expect(JSON.stringify(snapshot)).not.toContain(key);
      expect(snapshot.providers.find(({ id }) => id === 'byok')).toMatchObject({
        status: 'ready',
        model: 'lab/spark',
        account: 'lab.example',
      });
      const created = await controller.invoke('agents.save', {
        name: 'Own model',
        instructions: '',
        provider: 'byok',
        model: 'lab/spark',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: created.agentId,
      });
      expect(
        controller.snapshot().threads.find(({ id }) => id === threadId)
          ?.resolvedExecutionTarget,
      ).toMatchObject({
        provider: 'byok',
        model: 'lab/spark',
        harnessId: 'codex_app_server',
        credentialSource: 'user_byok',
      });
      await controller.invoke('providers.clearApiKey', undefined);
      expect(controller.snapshot().providers.find(({ id }) => id === 'byok')?.status).toBe(
        'needs_login',
      );
    } finally {
      await controller.shutdown();
    }
  });

  it('routes a signed lab harness model only to its own harness, leaving Codex the default', async () => {
    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe: deterministicProviderProbe,
      labHarnesses: [
        {
          id: 'example_lab',
          name: 'Example Lab',
          disclosure: 'Prompts go to Example Lab.',
          models: [{ id: 'example/spark', label: 'Spark' }],
        },
      ],
    });
    try {
      const providers = controller.snapshot().providers;
      expect(providers.find(({ id }) => id === 'lab')).toMatchObject({
        status: 'ready',
        label: 'Lab harness: Example Lab',
        models: [{ id: 'example/spark' }],
      });
      const created = await controller.invoke('agents.save', {
        name: 'Lab tester',
        instructions: '',
        provider: 'lab',
        model: 'example/spark',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: created.agentId,
      });
      expect(
        controller.snapshot().threads.find(({ id }) => id === threadId)
          ?.resolvedExecutionTarget,
      ).toMatchObject({ provider: 'lab', harnessId: 'example_lab', model: 'example/spark' });
    } finally {
      await controller.shutdown();
    }
  });

  it('keeps compatibility providers off new agents and threads but preserves pinned threads', async () => {
    const turns: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        turns.push(input);
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: input.thread.provider,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
    };
    const providerProbe = async (only?: Parameters<typeof probeProviders>[0]) =>
      (await deterministicProviderProbe(only)).map((provider) =>
        provider.id === 'claude'
          ? { ...provider, status: 'ready' as const, version: '2.1.238' }
          : provider,
      );
    const first = await createHarness({ fakeServices: false, providerProbe });
    await expect(
      first.controller.invoke('agents.save', {
        name: 'Claude agent',
        instructions: '',
        provider: 'claude',
        model: 'sonnet',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow('not available for new conversations');
    const { agentId } = await first.controller.invoke('agents.save', {
      name: 'Pinned agent',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const threadId = first.controller
      .snapshot()
      .threads.find((thread) => thread.agentId === agentId)!.id;
    await expect(
      first.controller.invoke('agents.save', {
        id: agentId,
        name: 'Pinned agent',
        instructions: '',
        provider: 'claude',
        model: 'sonnet',
      }),
    ).rejects.toThrow('not available for new conversations');

    // Simulate state saved by an earlier build that allowed a Claude agent.
    const state = first.repository.get<{
      agents: Array<Record<string, unknown>>;
      threads: Array<Record<string, unknown>>;
    }>('desktop', 'state')!;
    const claudeTarget = {
      provider: 'claude',
      model: 'sonnet',
      harnessId: 'claude_code',
      harnessModelId: 'sonnet',
      credentialSource: 'provider_subscription',
      resolutionSource: 'legacy_default',
    };
    for (const agent of state.agents)
      Object.assign(agent, { provider: 'claude', model: 'sonnet' });
    for (const thread of state.threads)
      Object.assign(thread, {
        provider: 'claude',
        model: 'sonnet',
        harnessId: 'claude_code',
        resolvedExecutionTarget: claudeTarget,
      });
    first.repository.put('desktop', 'state', state);

    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe,
      repository: first.repository,
      runtime,
    });
    try {
      await expect(
        controller.invoke('threads.create', { agentId, title: 'Another' }),
      ).rejects.toThrow('not available for new conversations');
      await expect(controller.invoke('agents.duplicate', { agentId })).rejects.toThrow(
        'not available for new conversations',
      );
      await controller.invoke('agents.save', {
        id: agentId,
        name: 'Renamed',
        instructions: '',
        model: 'sonnet',
      });
      // Use my Mac is Codex-only; a retained Claude thread runs in connected mode.
      await controller.invoke('computer.setAccessMode', { mode: 'connected' });
      await controller.invoke('threads.send', { threadId, text: 'Continue.' });
      await vi.waitFor(() => expect(turns).toHaveLength(1));
      expect(turns[0]?.thread).toMatchObject({ provider: 'claude', model: 'sonnet' });
    } finally {
      await controller.shutdown();
    }
  });

  it('keeps the latest provider usage event once per turn', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        for (const [sequence, inputTokens] of [120, 180].entries()) {
          yield {
            id: crypto.randomUUID(),
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex' as const,
            sequence,
            timestamp: new Date(Date.now() + sequence).toISOString(),
            type: 'usage' as const,
            payload: { inputTokens, outputTokens: 40, cachedInputTokens: 20 },
          };
        }
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 3,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Usage room',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = thread.threadId;
    await controller.invoke('threads.send', {
      threadId: thread.threadId,
      text: 'Measure this.',
    });

    await vi.waitFor(() =>
      expect(controller.snapshot().providerUsage).toEqual([
        expect.objectContaining({
          provider: 'codex',
          requests: 1,
          inputTokens: 180,
          outputTokens: 40,
          cachedInputTokens: 20,
        }),
      ]),
    );
    await controller.shutdown();
  });

  it('shows the plan usage window on the provider without dropping turn token usage', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: '2026-09-29T12:00:00.000Z',
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'usage' as const,
          payload: { inputTokens: 40, outputTokens: 5, providerReported: true },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'usage' as const,
          payload: {
            limits: {
              usedPercent: 83,
              resetsAt: '2026-09-29T15:00:00.000Z',
              windowMinutes: 300,
            },
            providerReported: true,
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
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
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
    await controller.invoke('threads.send', { threadId, text: 'Check mail' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')?.limits).toEqual({
      usedPercent: 83,
      resetsAt: '2026-09-29T15:00:00.000Z',
      windowMinutes: 300,
      updatedAt: '2026-09-29T12:00:00.000Z',
    });
    expect(
      controller.snapshot().providerUsage?.find(({ provider }) => provider === 'codex'),
    ).toMatchObject({ inputTokens: 40, outputTokens: 5 });
    await controller.shutdown();
  });

  it('uses deterministic fake Codex readiness without reopening sign-in', async () => {
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({ openExternal });
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')).toMatchObject({
      status: 'ready',
      version: '0.147.0',
      account: 'Deterministic test runtime',
    });
    await controller.invoke('providers.login', { providerId: 'codex' });
    expect(openExternal).not.toHaveBeenCalled();
    await expect(controller.invoke('providers.login', { providerId: 'meta' })).rejects.toThrow(
      'configured Sia cloud',
    );
    await expect(controller.invoke('providers.login', { providerId: 'grok' })).rejects.toThrow(
      'Not available yet',
    );
    await controller.shutdown();
  });

  it('installs Codex once, blocks new turns, and restarts without claiming authentication', async () => {
    let finish!: () => void;
    const installCodex = vi.fn(
      (onProgress: (message: string) => void) =>
        new Promise<void>((resolve) => {
          onProgress('Downloading Codex… 5 MB of 116 MB.');
          finish = resolve;
        }),
    );
    const restartApp = vi.fn();
    const openExternal = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      openExternal,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? { ...provider, status: 'needs_install' as const }
            : provider,
        ),
    });
    try {
      await controller.invoke('settings.setDeveloperTools', { enabled: true });
      const pending = controller.invoke('providers.login', { providerId: 'codex' });
      await vi.waitFor(() => expect(installCodex).toHaveBeenCalledOnce());
      expect(controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup).toEqual({
        phase: 'installing',
        message: 'Downloading Codex… 5 MB of 116 MB.',
      });
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('in progress');
      await expect(
        controller.invoke('threads.send', { threadId: 'none', text: 'Do work' }),
      ).rejects.toThrow('in progress');
      await expect(controller.invoke('voice.capture.acquire', undefined)).rejects.toThrow(
        'in progress',
      );
      await expect(
        controller.invoke('terminal.start', { threadId: 'none', command: 'sleep 30' }),
      ).rejects.toThrow('in progress');
      await expect(
        controller.invoke('terminal.run', { threadId: 'none', command: 'sleep 30' }),
      ).rejects.toThrow('in progress');
      expect(restartApp).not.toHaveBeenCalled();
      finish();
      const result = await pending;
      expect(restartApp).toHaveBeenCalledOnce();
      expect(openExternal).not.toHaveBeenCalled();
      expect(result.snapshot.providers.find(({ id }) => id === 'codex')?.status).toBe(
        'needs_install',
      );
      await expect(controller.invoke('threads.retry', { threadId: 'none' })).rejects.toThrow(
        'in progress',
      );
    } finally {
      await controller.shutdown();
    }
  });

  it('does not install or restart while a user background terminal is running', async () => {
    let busy = true;
    const installCodex = vi.fn(async () => undefined);
    const restartApp = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      workspaceOperations: { hasRunningTerminals: () => busy } as never,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? { ...provider, status: 'needs_install' as const }
            : provider,
        ),
    });
    try {
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('terminal process');
      expect(installCodex).not.toHaveBeenCalled();
      expect(restartApp).not.toHaveBeenCalled();
      busy = false;
      await controller.invoke('providers.login', { providerId: 'codex' });
      expect(restartApp).toHaveBeenCalledOnce();
    } finally {
      await controller.shutdown();
    }
  });

  it('allows a failed Codex download to be retried without restarting early', async () => {
    const installCodex = vi
      .fn()
      .mockRejectedValueOnce(new Error('Download failed'))
      .mockResolvedValue(undefined);
    const restartApp = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex' ? { ...provider, status: 'incompatible' as const } : provider,
        ),
    });
    try {
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('Download failed');
      expect(restartApp).not.toHaveBeenCalled();
      await controller.invoke('providers.login', { providerId: 'codex' });
      expect(installCodex).toHaveBeenCalledTimes(2);
      expect(restartApp).toHaveBeenCalledOnce();
    } finally {
      await controller.shutdown();
    }
  });

  it('opens and completes the managed Codex ChatGPT login before marking it connected', async () => {
    let signedIn = false;
    const providerProbe = vi.fn(async (providerId?: Parameters<typeof probeProviders>[0]) =>
      (await deterministicProviderProbe(providerId)).map((provider) => {
        if (provider.id !== 'codex') return provider;
        const { account: _account, ...withoutAccount } = provider;
        return signedIn
          ? { ...provider, status: 'ready' as const, account: 'Connected to ChatGPT' }
          : { ...withoutAccount, status: 'needs_login' as const };
      }),
    );
    const openExternal = vi.fn(async () => undefined);
    const runtime = {
      startCodexChatGptLogin: vi.fn(async () => ({
        loginId: 'login-1',
        authUrl: 'https://auth.openai.com/authorize?client_id=sia-test',
      })),
      waitForCodexChatGptLogin: vi.fn(async () => {
        signedIn = true;
      }),
      cancelCodexChatGptLogin: vi.fn(async () => undefined),
      listModels: vi.fn(async () => []),
      resetSessions: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe,
      openExternal,
      runtime,
    });

    const result = await controller.invoke('providers.login', { providerId: 'codex' });

    expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(
      'https://auth.openai.com/authorize?client_id=sia-test',
    );
    expect(runtime.waitForCodexChatGptLogin).toHaveBeenCalledWith(
      'login-1',
      expect.any(AbortSignal),
    );
    expect(result.snapshot.providers.find(({ id }) => id === 'codex')).toMatchObject({
      status: 'ready',
      account: 'Connected to ChatGPT',
    });
    expect(runtime.cancelCodexChatGptLogin).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('cancels a waiting ChatGPT sign-in into a plain Try again state', async () => {
    const providerProbe = async (providerId?: Parameters<typeof probeProviders>[0]) =>
      (await deterministicProviderProbe(providerId)).map((provider) =>
        provider.id === 'codex' ? { ...provider, status: 'needs_login' as const } : provider,
      );
    const runtime = {
      startCodexChatGptLogin: vi.fn(async () => ({
        loginId: 'stalled-login',
        authUrl: 'https://auth.openai.com/authorize?client_id=sia-test',
      })),
      waitForCodexChatGptLogin: vi.fn(
        (_loginId: string, signal?: AbortSignal) =>
          new Promise<void>((_resolve, reject) =>
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
          ),
      ),
      cancelCodexChatGptLogin: vi.fn(async () => undefined),
      listModels: vi.fn(async () => []),
      resetSessions: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe,
      openExternal: vi.fn(async () => undefined),
      runtime,
    });
    const login = controller.invoke('providers.login', { providerId: 'codex' });
    await vi.waitFor(() => expect(runtime.waitForCodexChatGptLogin).toHaveBeenCalledOnce());
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup?.phase).toBe(
      'signing-in',
    );
    await controller.invoke('providers.cancelLogin', { providerId: 'codex' });
    await expect(login).resolves.toMatchObject({ opened: false });
    expect(runtime.cancelCodexChatGptLogin).toHaveBeenCalledWith('stalled-login');
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup).toEqual({
      phase: 'error',
      message: 'ChatGPT sign-in was cancelled. Choose Try again to start over.',
    });
    // Try again starts a fresh sign-in; nothing is left in progress.
    runtime.waitForCodexChatGptLogin.mockImplementationOnce(async () => undefined);
    await controller.invoke('providers.login', { providerId: 'codex' }).catch(() => undefined);
    expect(runtime.startCodexChatGptLogin).toHaveBeenCalledTimes(2);
    await controller.shutdown();
  });

  it.each(['needs_install', 'incompatible'] as const)(
    'continues %s setup through restart and browser sign-in with no second setup click',
    async (initialStatus) => {
      let installed = false;
      let signedIn = false;
      let finishLogin!: () => void;
      const providerProbe = async (id?: Parameters<typeof probeProviders>[0]) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? {
                ...provider,
                status: signedIn
                  ? ('ready' as const)
                  : installed
                    ? ('needs_login' as const)
                    : initialStatus,
              }
            : provider,
        );
      const openExternal = vi.fn(async () => undefined);
      const runtime = {
        startCodexChatGptLogin: vi.fn(async () => ({
          loginId: 'setup-login',
          authUrl: 'https://auth.openai.com/authorize?client_id=fixture',
        })),
        waitForCodexChatGptLogin: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finishLogin = () => {
                signedIn = true;
                resolve();
              };
            }),
        ),
        cancelCodexChatGptLogin: vi.fn(async () => undefined),
        listModels: vi.fn(async () => []),
        dispose: vi.fn(async () => undefined),
      };
      const first = await createHarness({
        fakeServices: false,
        providerProbe,
        installCodex: async () => {
          installed = true;
        },
        restartApp: vi.fn(),
        openExternal,
      });
      const result = await first.controller.invoke('providers.login', { providerId: 'codex' });
      expect(result.snapshot.providers.find(({ id }) => id === 'codex')?.setup?.phase).toBe(
        'restarting',
      );
      expect(openExternal).not.toHaveBeenCalled();
      // Reopen persisted records in a fresh repository, as a real process restart does.
      const savedState = first.repository.get('desktop', 'state');
      const continuation = first.repository.get('setup', 'codex-login');
      await first.controller.shutdown();
      const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
      repository.put('desktop', 'state', savedState);
      repository.put('setup', 'codex-login', continuation);
      const restored = await createHarness({
        fakeServices: false,
        repository,
        providerProbe,
        runtime,
        openExternal,
      });
      const pending = restored.controller.resumeCodexSetup();
      await vi.waitFor(() => expect(runtime.waitForCodexChatGptLogin).toHaveBeenCalledOnce());
      const waiting = restored.controller.snapshot();
      expect(waiting.providers.find(({ id }) => id === 'codex')?.setup?.phase).toBe(
        'signing-in',
      );
      expect(JSON.stringify(waiting)).not.toContain('auth.openai.com/authorize');
      expect(restored.repository.get('setup', 'codex-login')).toBeUndefined();
      await restored.controller.resumeCodexSetup();
      await expect(
        restored.controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('in progress');
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
      finishLogin();
      await pending;
      expect(
        restored.controller.snapshot().providers.find(({ id }) => id === 'codex'),
      ).toMatchObject({ status: 'ready' });
      expect(
        restored.controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup,
      ).toBeUndefined();
      expect(openExternal).toHaveBeenCalledExactlyOnceWith(
        'https://auth.openai.com/authorize?client_id=fixture',
      );
      await restored.controller.resumeCodexSetup();
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
      await restored.controller.shutdown();
    },
  );

  it.each(['ordinary', 'expired', 'connected', 'failed'] as const)(
    'does not reopen browser sign-in after %s setup',
    async (scenario) => {
      const openExternal = vi.fn(async () => undefined);
      const runtime = {
        startCodexChatGptLogin: vi.fn(async () => ({
          loginId: 'setup-login',
          authUrl: 'https://auth.openai.com/authorize?client_id=fixture',
        })),
        waitForCodexChatGptLogin: vi.fn(async () => {
          throw new Error('Sign-in cancelled');
        }),
        cancelCodexChatGptLogin: vi.fn(async () => undefined),
        listModels: vi.fn(async () => []),
        dispose: vi.fn(async () => undefined),
      };
      const { controller, repository } = await createHarness({
        fakeServices: false,
        openExternal,
        runtime,
        providerProbe: async (id) =>
          (await deterministicProviderProbe(id)).map((provider) =>
            provider.id === 'codex' && scenario !== 'connected'
              ? { ...provider, status: 'needs_login' as const }
              : provider,
          ),
      });
      if (scenario !== 'ordinary')
        repository.put('setup', 'codex-login', {
          expiresAt: Date.now() + (scenario === 'expired' ? -1 : 60_000),
        });
      await controller.resumeCodexSetup();
      await controller.resumeCodexSetup();
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledTimes(
        scenario === 'failed' ? 1 : 0,
      );
      expect(repository.get('setup', 'codex-login')).toBeUndefined();
      if (scenario === 'failed') {
        expect(runtime.cancelCodexChatGptLogin).toHaveBeenCalledWith('setup-login');
        expect(
          controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup?.phase,
        ).toBe('error');
        await expect(
          controller.invoke('providers.login', { providerId: 'codex' }),
        ).rejects.toThrow('cancelled');
        expect(runtime.startCodexChatGptLogin).toHaveBeenCalledTimes(2);
      }
      await controller.shutdown();
    },
  );

  it('keeps Meta fail-closed without an authenticated relay capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud: new CloudClient('https://api.example.test', {
        read: async () => undefined,
      }),
      identity,
    });
    expect(controller.snapshot()).toMatchObject({
      agents: [],
      threads: [],
      providers: [],
      cloud: { auth: 'signed_out' },
    });
    await controller.invoke('auth.complete', { code: '123456' });
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'unavailable',
    });
    await controller.invoke('auth.signOut', undefined);
    expect(controller.snapshot()).toMatchObject({
      agents: [],
      threads: [],
      providers: [],
      cloud: { auth: 'signed_out' },
    });
    await controller.shutdown();
  });

  it('marks Meta ready only after an authenticated live capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const refreshSession = vi.fn(async () => ({
      state: 'signed_in' as const,
      email: 'person@example.com',
    }));
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      refreshSession,
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/v1/session')) {
        return Response.json({
          admin: false,
          features: {
            researchUploads: true,
            researchArchive: false,
            connectors: true,
            schedules: true,
          },
        });
      }
      if (url.endsWith('/v1/meta/capabilities')) {
        return Response.json({
          available: true,
          models: ['super_nova_ext'],
          streaming: true,
          tools: true,
        });
      }
      if (url.endsWith('/v1/catalog')) {
        return Response.json({
          schemaVersion: 1,
          providers: [
            {
              id: 'meta',
              name: 'Muse Spark',
              kind: 'hosted',
              credentialMode: 'managed',
              available: true,
              defaultModel: 'super_nova_ext',
              models: [
                {
                  id: 'super_nova_ext',
                  name: 'Muse Spark',
                  apiProtocols: ['openai_chat_completions'],
                },
              ],
              capabilities: { streaming: true, tools: true },
              execution: {
                defaultHarnessId: 'sia_direct',
                routes: [
                  {
                    model: 'super_nova_ext',
                    harnessId: 'sia_direct',
                    harnessModelId: 'super_nova_ext',
                    credentialSource: 'sia_managed',
                    apiProtocol: 'openai_chat_completions',
                  },
                ],
              },
              limits: { dailyRequests: 100, dailyTokens: 250_000, maxOutputTokens: 4_096 },
            },
          ],
        });
      }
      throw new Error(`Unexpected cloud request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { controller } = await createHarness({
        fakeServices: false,
        defaultWorkspaceRoot: '/tmp/Sia/Agents',
        createDirectory: async () => undefined,
        cloud: new CloudClient('https://api.example.test', {
          read: async () => 'test-id-token',
        }),
        identity,
      });

      await controller.invoke('auth.complete', { code: '123456' });

      expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
        status: 'ready',
        model: 'super_nova_ext',
      });
      const created = await controller.invoke('agents.save', {
        name: 'Included model tester',
        instructions: '',
        provider: 'meta',
        model: 'super_nova_ext',
      });
      expect(
        created.snapshot.threads.find(({ id }) => id === created.snapshot.activeThreadId),
      ).toMatchObject({
        resolvedExecutionTarget: {
          harnessId: 'sia_direct',
          resolutionSource: 'backend_default',
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/v1/meta/capabilities'),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer test-id-token' }),
        }),
      );
      await controller.invoke('providers.probe', { providerId: 'meta' });
      expect(refreshSession).toHaveBeenCalledOnce();
      await controller.shutdown();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
