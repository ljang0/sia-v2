import { describe, expect, it } from 'vitest';
import {
  agentRevisionSnapshotSchema,
  agentSchema,
  harnessPreferenceSchema,
  hostedCatalogSchema,
  modelRouteSchema,
  parseThreadEvent,
  resolvedExecutionTargetSchema,
  threadEventEnvelopeSchema,
  toolDescriptorSchema,
} from './index.js';

const now = '2026-08-13T00:00:00.000Z';

describe('protocol schemas', () => {
  it('validates an agent and immutable thread snapshot', () => {
    const agent = agentSchema.parse({
      id: 'agent-1',
      name: 'Personal',
      instructions: 'Be precise.',
      defaultProvider: 'codex',
      defaultModel: 'gpt-5',
      defaultWorkspace: '/tmp/project',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    expect(agent.description).toBe('');
    expect(agent.harnessPreference).toBeUndefined();

    const snapshot = agentRevisionSnapshotSchema.parse({
      id: 'revision-1',
      agentId: agent.id,
      revision: 1,
      name: agent.name,
      instructions: agent.instructions,
      provider: agent.defaultProvider,
      model: agent.defaultModel,
      workspace: agent.defaultWorkspace,
      capturedAt: now,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.resolvedExecutionTarget).toBeUndefined();
  });

  it('validates harness preferences, model routes, and pinned execution targets', () => {
    expect(
      harnessPreferenceSchema.parse({ mode: 'explicit', harnessId: 'opencode_acp' }),
    ).toEqual({ mode: 'explicit', harnessId: 'opencode_acp' });

    const route = modelRouteSchema.parse({
      provider: 'meta',
      model: 'muse-spark',
      harnessId: 'opencode_acp',
      harnessModelId: 'sia/muse-spark',
      credentialSource: 'sia_managed',
    });
    const target = resolvedExecutionTargetSchema.parse({
      ...route,
      resolutionSource: 'user',
    });
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(target)).toBe(true);

    const snapshot = {
      id: 'revision-1',
      agentId: 'agent-1',
      revision: 1,
      name: 'Personal',
      instructions: 'Be precise.',
      provider: 'meta',
      model: 'muse-spark',
      resolvedExecutionTarget: target,
      workspace: '/tmp/project',
      capturedAt: now,
    };
    expect(agentRevisionSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      agentRevisionSnapshotSchema.safeParse({ ...snapshot, harnessId: 'opencode_acp' }).success,
    ).toBe(true);
    expect(
      agentRevisionSnapshotSchema.safeParse({ ...snapshot, harnessId: 'pi_rpc' }).success,
    ).toBe(false);
    expect(
      agentRevisionSnapshotSchema.safeParse({ ...snapshot, model: 'different-model' }).success,
    ).toBe(false);
    expect(modelRouteSchema.safeParse({ ...route, harnessId: 'lab_harness' }).success).toBe(
      true,
    );
    expect(modelRouteSchema.safeParse({ ...route, harnessId: '../command' }).success).toBe(
      false,
    );
  });

  it('validates catalog-driven labs and model/harness protocol pairs', () => {
    const catalog = {
      schemaVersion: 1,
      providers: [
        {
          id: 'example-lab',
          name: 'Example Lab',
          kind: 'hosted',
          credentialMode: 'managed',
          available: true,
          defaultModel: 'example-lab/spark',
          models: [
            {
              id: 'example-lab/spark',
              name: 'Spark',
              apiProtocols: ['openai_responses', 'openai_chat_completions'],
            },
          ],
          capabilities: { streaming: true, tools: true },
          execution: {
            defaultHarnessId: 'sia_direct',
            routes: [
              {
                model: 'example-lab/spark',
                harnessId: 'sia_direct',
                harnessModelId: 'spark',
                credentialSource: 'sia_managed',
                apiProtocol: 'openai_chat_completions',
              },
              {
                model: 'example-lab/spark',
                harnessId: 'example_lab_harness',
                harnessModelId: 'spark',
                credentialSource: 'sia_managed',
                apiProtocol: 'openai_responses',
              },
            ],
          },
          limits: { dailyRequests: 100, dailyTokens: 250_000, maxOutputTokens: 4_096 },
        },
      ],
    } as const;

    expect(hostedCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(
      hostedCatalogSchema.safeParse({
        ...catalog,
        providers: [
          {
            ...catalog.providers[0],
            execution: {
              ...catalog.providers[0].execution,
              routes: [
                {
                  ...catalog.providers[0].execution.routes[0],
                  apiProtocol: 'anthropic_messages',
                },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('discriminates and validates normalized events', () => {
    const event = parseThreadEvent({
      id: 'event-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 0,
      timestamp: now,
      provider: 'grok',
      type: 'message',
      payload: {
        messageId: 'message-1',
        role: 'assistant',
        parts: [{ kind: 'text', text: 'Hello' }],
      },
    });
    expect(event.type).toBe('message');
    expect(event.harnessId).toBeUndefined();
    expect(threadEventEnvelopeSchema.safeParse({ ...event, provider: 'unknown' }).success).toBe(
      false,
    );

    const attributed = parseThreadEvent({
      ...event,
      id: 'event-2',
      harnessId: 'legacy_acp',
      model: 'grok-code-fast-1',
    });
    expect(attributed).toMatchObject({
      provider: 'grok',
      harnessId: 'legacy_acp',
      model: 'grok-code-fast-1',
    });
  });

  it('rejects non-snake-case tool names', () => {
    const result = toolDescriptorSchema.safeParse({
      name: 'browser.executeJavaScript',
      description: 'Unsafe',
      inputSchema: { type: 'object' },
      annotations: { readOnly: false, requiresApproval: false },
    });
    expect(result.success).toBe(false);
  });
});
