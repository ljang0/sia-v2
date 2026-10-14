import { describe, expect, it } from 'vitest';
import { executionLabel, modelChoices } from './agentModels';
import { demoSnapshot } from './demo/snapshot';
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

describe('sponsored lab models', () => {
  const included: ProviderSetup = {
    id: 'meta',
    name: 'Included model',
    plan: 'Included with Sia',
    model: 'arena/claude',
    description: '',
    status: 'ready',
    billedBy: '',
    models: [
      {
        id: 'arena/claude',
        label: 'Claude',
        description: '',
        reasoningEfforts: [],
        lab: { id: 'arena', name: 'Arena' },
      },
      {
        id: 'house/spark',
        label: 'Spark',
        description: '',
        reasoningEfforts: [],
        lab: { id: 'meta', name: 'Included model' },
      },
    ],
  };

  it('names the funding lab in the picker and composer, not the generic provider', () => {
    expect(modelChoices([included]).map(({ label }) => label)).toEqual([
      'Claude · Arena',
      'Spark · Included',
    ]);
    expect(executionLabel([included], 'meta', 'arena/claude')).toBe(
      'Included with Sia · Arena',
    );
    expect(executionLabel([included], 'meta', 'house/spark')).toBe('Included with Sia');
  });
});
