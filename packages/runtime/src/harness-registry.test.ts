import { describe, expect, it } from 'vitest';
import type { HostedCatalogRoute } from '@sia/protocol';
import {
  admitHostedRoutes,
  HarnessRegistry,
  type HarnessDefinition,
} from './harness-registry.js';

const routes: readonly HostedCatalogRoute[] = [
  {
    model: 'example/spark',
    harnessId: 'sia_direct',
    harnessModelId: 'spark',
    credentialSource: 'sia_managed',
    apiProtocol: 'openai_chat_completions',
  },
  {
    model: 'example/spark',
    harnessId: 'codex_app_server',
    harnessModelId: 'spark',
    credentialSource: 'sia_managed',
    apiProtocol: 'openai_responses',
  },
  {
    model: 'example/spark',
    harnessId: 'codex_app_server',
    harnessModelId: 'spark',
    credentialSource: 'provider_api',
    apiProtocol: 'openai_chat_completions',
  },
  {
    model: 'example/spark',
    harnessId: 'opencode_acp',
    harnessModelId: 'example/spark',
    credentialSource: 'provider_api',
    apiProtocol: 'openai_chat_completions',
  },
];

describe('harness registry', () => {
  it('admits only release-enabled protocol and credential combinations', () => {
    const admitted = admitHostedRoutes({
      provider: 'meta',
      defaultHarnessId: 'sia_direct',
      routes,
    });

    expect(admitted.allowedRoutes.map(({ harnessId }) => harnessId)).toEqual([
      'sia_direct',
      'codex_app_server',
    ]);
    expect(admitted.backendDefault?.harnessId).toBe('sia_direct');
    expect(admitted.rejectedRoutes.map(({ harnessId }) => harnessId)).toEqual([
      'codex_app_server',
      'opencode_acp',
    ]);
  });

  it('admits only the Codex app server and Sia-managed harnesses for release', () => {
    expect(
      new HarnessRegistry()
        .list()
        .filter(({ productionEnabled }) => productionEnabled)
        .map(({ id }) => id),
    ).toEqual(['codex_app_server', 'sia_direct']);
  });

  it('makes a lab harness one explicit registration without widening built-ins', () => {
    const labHarness: HarnessDefinition = {
      id: 'example_lab_harness',
      name: 'Example Lab harness',
      modelProtocols: ['openai_responses'],
      credentialSources: ['sia_managed'],
      productionEnabled: true,
    };
    const registry = new HarnessRegistry([...new HarnessRegistry().list(), labHarness]);
    const admitted = admitHostedRoutes({
      provider: 'meta',
      defaultHarnessId: labHarness.id,
      registry,
      routes: [
        {
          model: 'example/spark',
          harnessId: labHarness.id,
          harnessModelId: 'spark',
          credentialSource: 'sia_managed',
          apiProtocol: 'openai_responses',
        },
      ],
    });

    expect(admitted).toMatchObject({
      allowedRoutes: [{ harnessId: 'example_lab_harness' }],
      backendDefault: { harnessId: 'example_lab_harness' },
      rejectedRoutes: [],
    });
  });

  it('falls back to the Codex baseline when a lab default harness is not admitted', () => {
    const admitted = admitHostedRoutes({
      provider: 'meta',
      defaultHarnessId: 'unadmitted_lab_harness',
      routes: [
        {
          model: 'lab/spark',
          harnessId: 'codex_app_server',
          harnessModelId: 'lab/spark',
          credentialSource: 'sia_managed',
          apiProtocol: 'openai_responses',
        },
        {
          model: 'lab/spark',
          harnessId: 'unadmitted_lab_harness',
          harnessModelId: 'spark',
          credentialSource: 'sia_managed',
          apiProtocol: 'openai_responses',
        },
      ],
    });

    expect(admitted.backendDefault).toBeUndefined();
    expect(admitted.defaultRoutes).toEqual([
      expect.objectContaining({ model: 'lab/spark', harnessId: 'codex_app_server' }),
    ]);
  });

  it.each(['opencode_acp', 'pi_rpc'] as const)(
    'recognizes %s as protocol-compatible with a Codex subscription before release admission',
    (harnessId) => {
      const route: HostedCatalogRoute = {
        model: 'gpt-5.6-sol',
        harnessId,
        harnessModelId: `openai/gpt-5.6-sol`,
        credentialSource: 'provider_subscription',
        apiProtocol: 'openai_responses',
      };
      const registry = new HarnessRegistry();

      expect(registry.accepts(route, false)).toBe(true);
      expect(registry.accepts(route, true)).toBe(false);
    },
  );
});
