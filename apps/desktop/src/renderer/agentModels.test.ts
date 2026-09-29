import { describe, expect, it } from 'vitest';
import { executionLabel } from './agentModels';
import { demoSnapshot } from './demo';
import type { ProviderSetup } from './types';

describe('executionLabel', () => {
  it('names the plan, not the harness, for a ChatGPT-plan thread', () => {
    expect(executionLabel(demoSnapshot.providers, 'codex', 'gpt-5.6-sol')).toBe('ChatGPT plan');
    expect(executionLabel(demoSnapshot.providers, 'meta', 'super_nova_ext')).toBe(
      'Included with Sia',
    );
  });

  it('falls back to the model, then the provider name, when the catalog has no plan', () => {
    const provider: ProviderSetup = {
      id: 'grok',
      name: 'Grok',
      model: 'grok-code-fast',
      description: '',
      status: 'ready',
      billedBy: '',
      models: [
        {
          id: 'grok-code-fast',
          label: 'Grok Code Fast',
          description: '',
          reasoningEfforts: [],
        },
      ],
    };
    expect(executionLabel([provider], 'grok', 'grok-code-fast')).toBe('Grok Code Fast');
    expect(executionLabel([provider], 'grok', 'other')).toBe('Grok');
    expect(executionLabel([], 'grok', 'other')).toBeUndefined();
  });
});
