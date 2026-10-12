import { ActionGateway } from '@sia/action-gateway';
import { describe, expect, it, vi } from 'vitest';
import type { CloudClient } from '../cloud/cloud-client.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import type { DesktopController } from './desktop-controller.js';
import { createController, createHarness, type ResearchBatchView } from './test-support.js';

describe('DesktopController', () => {
  it('requires explicit research consent state and deletes the local research scope', async () => {
    const controller = await createController();
    expect(controller.snapshot().capture.status).toBe('not_consented');

    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture.status).toBe('recording');

    await controller.invoke('research.delete', { confirmation: 'DELETE' });
    expect(controller.snapshot().capture.status).toBe('not_consented');
    await controller.shutdown();
  });

  it('records a reviewed consent decline without enabling research capture', async () => {
    const { controller, repository } = await createHarness();

    await controller.invoke('research.setCapture', {
      enabled: false,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    expect(repository.list('research')).toEqual([]);
    expect(
      repository.get<{
        capture: { status: string; pendingCount: number; promptReviewedVersion?: string };
      }>('desktop', 'state')?.capture,
    ).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    await controller.shutdown();
  });

  it('refuses research capture until explicit consent is supplied', async () => {
    const controller = await createController();
    await expect(controller.invoke('research.setCapture', { enabled: true })).rejects.toThrow(
      'Review and accept',
    );
    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    await controller.shutdown();
  });

  it.each(['untouched', 'declined', 'paused', 'accepted'] as const)(
    'completes signed-in participant tasks with research %s and captures only after opt-in',
    async (choice) => {
      const identity = {
        initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
        status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
        startEmailSignIn: async () => ({
          state: 'signed_in' as const,
          email: 'person@example.com',
        }),
        completeEmailSignIn: async () => ({
          state: 'signed_in' as const,
          email: 'person@example.com',
        }),
        signOut: async () => ({ state: 'signed_out' as const }),
      } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
      const uploadResearchBatch = vi.fn(async () => undefined);
      const cloud = {
        configured: true,
        sessionStatus: async () => ({
          admin: false,
          participant: true,
          features: {
            researchUploads: true,
            researchArchive: false,
            connectors: false,
            schedules: false,
          },
        }),
        uploadResearchBatch,
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
            type: 'message' as const,
            payload: {
              role: 'assistant' as const,
              messageId: 'research-choice-reply',
              parts: [
                { kind: 'text' as const, text: 'Task completed with your research choice.' },
              ],
            },
          };
          yield {
            ...base,
            id: crypto.randomUUID(),
            sequence: 2,
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
        identity,
        fakeServices: false,
        runtime,
      });
      try {
        if (choice !== 'untouched') {
          await controller.invoke('research.setCapture', {
            enabled: choice !== 'declined',
            consentVersion: 'alpha-research-v3-raw',
          });
          if (choice === 'paused') {
            await controller.invoke('research.setCapture', { enabled: false });
          }
        }
        const created = await controller.invoke('agents.save', {
          name: 'Research participant',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
        });
        const { threadId } = await controller.invoke('threads.create', {
          agentId: created.agentId,
        });
        runtimeThreadId = threadId;
        await controller.invoke('threads.send', {
          threadId,
          text: 'Respect my research choice.',
        });
        await vi.waitFor(() => {
          const snapshot = controller.snapshot();
          expect(snapshot.timeline.filter((item) => item.kind === 'error')).toEqual([]);
          expect(snapshot.threads.find((thread) => thread.id === threadId)?.status).toBe(
            'idle',
          );
          expect(snapshot.timeline).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'assistant',
                text: 'Task completed with your research choice.',
              }),
            ]),
          );
        });
        expect(controller.snapshot().cloud.auth).toBe('signed_in');
        if (choice === 'accepted') {
          await vi.waitFor(() => expect(uploadResearchBatch).toHaveBeenCalled());
          expect(repository.list('research').length).toBeGreaterThan(0);
          expect(JSON.stringify(repository.list('research'))).toContain(
            'Respect my research choice.',
          );
        } else {
          expect(repository.list('research')).toEqual([]);
          expect(repository.list('research_sync')).toEqual([]);
          expect(uploadResearchBatch).not.toHaveBeenCalled();
          expect(controller.snapshot().capture.status).toBe(
            choice === 'paused' ? 'paused' : 'not_consented',
          );
        }
      } finally {
        await controller.shutdown();
      }
    },
  );

  it('keeps internal operators out of research capture and leaves hosted Meta usable', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const acceptedAt = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
      connections: [],
      capture: {
        status: 'recording',
        pendingCount: 1,
        consentVersion: 'alpha-research-v3-raw',
        consentAcceptedAt: acceptedAt,
        promptReviewedVersion: 'alpha-research-v3-raw',
      },
      browser: { status: 'detached', grantedOrigins: [] },
      connectionOwners: {},
      schedules: [],
      cloudFeatures: {
        researchUploads: true,
        researchArchive: false,
        connectors: true,
        schedules: true,
      },
      preferences: { completionSound: false },
      usageByTurn: {},
    });
    repository.put('research', 'operator-batch', {
      batchId: 'operator-batch',
      syncEligible: true,
      format: 'raw_v1',
      consent: {
        version: 'alpha-research-v3-raw',
        acceptedAt,
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });
    repository.put('research_sync', 'operator-batch', {
      batchId: 'operator-batch',
      synced: false,
    });
    const uploadResearchBatch = vi.fn(async () => undefined);
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
      capabilities: async () => ({
        available: true,
        models: ['super_nova_ext'],
        streaming: true,
        tools: true,
      }),
      uploadResearchBatch,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'operator@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'operator@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      repository,
    });

    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'operator-batch', syncEligible: false },
    ]);
    expect(uploadResearchBatch).not.toHaveBeenCalled();
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'ready',
      model: 'super_nova_ext',
    });
    await expect(
      controller.invoke('research.setCapture', {
        enabled: true,
        consentVersion: 'alpha-research-v3-raw',
      }),
    ).rejects.toThrow('not enabled for this Sia account');
    await expect(
      controller.invoke('agents.save', {
        name: 'Internal model tester',
        instructions: '',
        provider: 'meta',
        model: 'super_nova_ext',
        workspace: '/tmp/sia-workspace',
      }),
    ).resolves.toMatchObject({ agentId: expect.any(String) });
    await controller.shutdown();
  });

  it('persists a completed local text turn without making it cloud-sync eligible', async () => {
    const { controller, repository } = await createHarness();
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
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
    await controller.invoke('threads.send', { threadId, text: 'Keep this clean turn' });
    await new Promise((resolve) => setTimeout(resolve, 220));

    const batches = repository.list<ResearchBatchView>('research');
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: expect.any(String),
      syncEligible: false,
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: expect.any(String),
        purpose: 'research_evaluation_debugging',
      },
      events: [
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'user', text: 'Keep this clean turn', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'assistant', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
      ],
    });
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });
    await controller.shutdown();
  });

  it('keeps legacy local captures private when cloud is added later', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const now = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
      connections: [
        { id: 'gmail', label: 'Gmail', status: 'disconnected' },
        { id: 'drive', label: 'Google Drive', status: 'disconnected' },
        { id: 'slack', label: 'Slack', status: 'disconnected' },
      ],
      capture: {
        status: 'recording',
        pendingCount: 1,
        consentVersion: 'alpha-research-v2',
        consentAcceptedAt: now,
        promptReviewedVersion: 'alpha-research-v2',
      },
      browser: { status: 'detached', grantedOrigins: [] },
      connectionOwners: {},
      schedules: [],
      preferences: { completionSound: false },
    });
    repository.put('research', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: now,
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });
    repository.put('research_sync', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      synced: false,
    });

    let identityState: 'signed_out' | 'signed_in' = 'signed_out';
    const uploadResearchBatch = vi.fn();
    const cloud = { configured: true, uploadResearchBatch } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: identityState }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => {
        identityState = 'signed_in';
        return { state: identityState, email: 'person@example.com' } as const;
      },
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      repository,
    });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(controller.snapshot().capture).toMatchObject({
      status: 'not_consented',
      pendingCount: 0,
    });

    await controller.invoke('auth.complete', { code: '12345678' });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });
    expect(uploadResearchBatch).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('discards a spoofed Sia-tool event that has no matching gateway invocation', async () => {
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
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'Before the tool' }],
            delta: true,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'tool' as const,
          payload: {
            callId: 'call-1',
            name: 'computer_list',
            phase: 'completed' as const,
            native: false,
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
      fakeServices: false,
      runtime,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
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
    await controller.invoke('threads.send', { threadId, text: 'Use a tool' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );
    expect(repository.list('research')).toHaveLength(0);
    await controller.shutdown();
  });

  it('captures bounded provider-native trajectory metadata without arguments or output', async () => {
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
            callId: 'native-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printenv SECRET_VALUE' },
            result: 'never collect provider output',
            presentation: {
              kind: 'command' as const,
              command: 'printenv SECRET_VALUE',
              output: 'never collect provider output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'The check completed.' }],
            delta: false,
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
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
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

    await controller.invoke('threads.send', { threadId, text: 'Run the safe check' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const serialized = JSON.stringify(repository.list<ResearchBatchView>('research'));
    expect(serialized).toContain('"kind":"trajectory.step"');
    expect(serialized).toContain('"name":"shell_command"');
    expect(serialized).toContain('"presentation":"command"');
    expect(serialized).not.toContain('printenv');
    expect(serialized).not.toContain('never collect provider output');
    await controller.shutdown();
  });

  it('captures organized raw provider events under the v3 research consent', async () => {
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
            callId: 'raw-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printf raw-fixture' },
            result: 'raw command output',
            presentation: {
              kind: 'command' as const,
              command: 'printf raw-fixture',
              output: 'raw command output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Raw research',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Capture this exact turn' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    const batches = repository.list<ResearchBatchView & { format?: string; scope?: unknown }>(
      'research',
    );
    const serialized = JSON.stringify(batches);
    expect(batches.every(({ format }) => format === 'raw_v1')).toBe(true);
    expect(serialized).toContain('provider.tool');
    expect(serialized).toContain('Capture this exact turn');
    expect(serialized).toContain('printf raw-fixture');
    expect(serialized).toContain('raw command output');
    expect(serialized).toContain(threadId);
    await controller.shutdown();
  });

  it('excludes an entire Google Workspace action turn from research capture', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const record = vi.fn();
    const excludeTurn = vi.fn();
    const trajectory = {
      rootDirectory: '/tmp/sia-trajectories',
      record,
      excludeTurn,
    } as unknown as NonNullable<
      ConstructorParameters<typeof DesktopController>[0]['trajectory']
    >;
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
            messageId: 'before-google-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will search the test inbox.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'mail_search',
          arguments: { account_id: 'gmail', query: 'private fixture' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
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
      runtime,
      trajectory,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Found a private fixture',
          data: { message: 'private Google Workspace result' },
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Google policy fixture',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Search my test inbox' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(repository.list('research')).toHaveLength(0);
    expect(excludeTurn).toHaveBeenCalledWith(threadId, expect.any(String));
    expect(
      record.mock.calls
        .map(([event]) => event)
        .some((event) => event.type === 'action_result' && event.name === 'mail_search'),
    ).toBe(false);
    await controller.shutdown();
  });

  it('captures one bounded screenshot only from an explicitly safe computer snapshot', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const image = Buffer.from('bounded screenshot fixture').toString('base64');
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        await gateway.invoke({
          name: 'computer_snapshot',
          arguments: { app_id: 'app-1', window_id: 'window-1' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'snapshot-1',
            name: 'computer_snapshot',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Captured safe fixture',
          images: [{ mimeType: 'image/png', dataBase64: image }],
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
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

    await controller.invoke('threads.send', { threadId, text: 'Inspect the safe fixture' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const events = repository.list<ResearchBatchView>('research')[0]?.events ?? [];
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trajectory.step',
          payload: expect.objectContaining({
            source: 'sia_action',
            type: 'action_result',
            name: 'computer_snapshot',
            outcome: 'verified',
          }),
        }),
        expect.objectContaining({
          kind: 'trajectory.screenshot',
          payload: {
            source: 'sia_action',
            tool: 'computer_snapshot',
            mimeType: 'image/png',
            dataBase64: image,
          },
        }),
      ]),
    );
    await controller.shutdown();
  });

  it('taints research at the action gateway even when provider tool telemetry is absent', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
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
            messageId: 'assistant-before-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will inspect the browser.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'browser_tabs',
          arguments: {},
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
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
      runtime,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({ outcome: 'verified', summary: 'Browser tabs listed' }),
      },
      onInvocation: controller.actionInvocationObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
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

    await controller.invoke('threads.send', { threadId, text: 'List my browser tabs' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(repository.list('research')).toHaveLength(0);
    expect(
      controller
        .snapshot()
        .timeline.some((event) => event.turnId && event.toolName === 'browser_tabs'),
    ).toBe(false);
    await controller.shutdown();
  });
});
