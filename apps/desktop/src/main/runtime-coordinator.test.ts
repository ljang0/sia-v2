import { describe, expect, it } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';

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
});
