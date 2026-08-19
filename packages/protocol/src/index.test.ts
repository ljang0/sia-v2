import { describe, expect, it } from 'vitest';
import {
  agentRevisionSnapshotSchema,
  agentSchema,
  parseThreadEvent,
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
    expect(threadEventEnvelopeSchema.safeParse({ ...event, provider: 'unknown' }).success).toBe(
      false,
    );
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
