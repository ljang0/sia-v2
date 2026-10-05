import { describe, expect, it } from 'vitest';
import type { ModelRoute, ResolvedExecutionTarget } from '@sia/protocol';
import { EventFactory } from './events.js';
import {
  legacyModelRoute,
  LEGACY_ROUTE_DEFAULTS,
  resolveExecutionTarget,
} from './execution-resolver.js';

const directRoute: ModelRoute = {
  provider: 'meta',
  model: 'muse-spark',
  harnessId: 'sia_direct',
  harnessModelId: 'muse-spark',
  credentialSource: 'sia_managed',
};

const openCodeRoute: ModelRoute = {
  provider: 'meta',
  model: 'muse-spark',
  harnessId: 'opencode_acp',
  harnessModelId: 'sia/muse-spark',
  credentialSource: 'sia_managed',
};

const piRoute: ModelRoute = {
  provider: 'meta',
  model: 'muse-spark',
  harnessId: 'pi_rpc',
  harnessModelId: 'sia/muse-spark',
  credentialSource: 'sia_managed',
};

const allowedRoutes = [directRoute, openCodeRoute, piRoute] as const;

describe('execution target resolver', () => {
  it('routes an available Astra model through the same Codex subscription harness', () => {
    expect(resolveExecutionTarget({ provider: 'codex', model: 'gpt-6-astra' })).toMatchObject({
      ok: true,
      target: {
        model: 'gpt-6-astra',
        harnessModelId: 'gpt-6-astra',
        harnessId: 'codex_app_server',
        credentialSource: 'provider_subscription',
      },
    });
  });
  it('provides migration-compatible defaults for every legacy provider', () => {
    expect(LEGACY_ROUTE_DEFAULTS).toEqual({
      codex: { harnessId: 'codex_app_server', credentialSource: 'provider_subscription' },
      claude: { harnessId: 'claude_code', credentialSource: 'provider_subscription' },
      grok: { harnessId: 'legacy_acp', credentialSource: 'provider_subscription' },
      gemini: { harnessId: 'legacy_acp', credentialSource: 'provider_api' },
      meta: { harnessId: 'sia_direct', credentialSource: 'sia_managed' },
      byok: { harnessId: 'codex_app_server', credentialSource: 'user_byok' },
      lab: { harnessId: 'legacy_acp', credentialSource: 'provider_api' },
    });
    expect(legacyModelRoute('codex', 'gpt-5')).toEqual({
      provider: 'codex',
      model: 'gpt-5',
      harnessId: 'codex_app_server',
      harnessModelId: 'gpt-5',
      credentialSource: 'provider_subscription',
    });
    expect(legacyModelRoute('codex', '  gpt-5  ').model).toBe('gpt-5');
    expect(() => legacyModelRoute('codex', '   ')).toThrow('non-empty canonical model id');
  });

  it('never admits a non-release harness through the implicit legacy allowlist', () => {
    for (const provider of ['grok', 'gemini', 'claude'] as const) {
      expect(resolveExecutionTarget({ provider, model: 'legacy-model' })).toMatchObject({
        ok: false,
        code: 'incompatible_route',
      });
    }
    expect(resolveExecutionTarget({ provider: 'meta', model: 'muse-spark' })).toMatchObject({
      ok: true,
      target: { harnessId: 'sia_direct' },
    });
  });

  it('keeps a pinned legacy target for an existing thread', () => {
    const existingTarget: ResolvedExecutionTarget = {
      ...legacyModelRoute('claude', 'sonnet'),
      resolutionSource: 'legacy_default',
    };
    expect(
      resolveExecutionTarget({ provider: 'claude', model: 'sonnet', existingTarget }),
    ).toEqual({ ok: true, target: existingTarget });
  });

  it('keeps an existing thread target ahead of all mutable defaults', () => {
    const existingTarget: ResolvedExecutionTarget = {
      ...piRoute,
      resolutionSource: 'user',
    };
    const result = resolveExecutionTarget({
      provider: 'meta',
      model: 'muse-spark',
      existingTarget,
      preference: { mode: 'explicit', harnessId: 'opencode_acp' },
      backendDefault: directRoute,
      allowedRoutes,
    });
    expect(result).toEqual({ ok: true, target: existingTarget });
    expect(result.ok && Object.isFrozen(result.target)).toBe(true);

    const changedBackendCredential: ModelRoute = {
      ...directRoute,
      credentialSource: 'provider_api',
    };
    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'muse-spark',
        existingTarget,
        backendDefault: changedBackendCredential,
        allowedRoutes: [...allowedRoutes, changedBackendCredential],
      }),
    ).toEqual({ ok: true, target: existingTarget });
  });

  it('uses an explicit compatible user harness ahead of a backend default', () => {
    const result = resolveExecutionTarget({
      provider: 'meta',
      model: 'muse-spark',
      preference: { mode: 'explicit', harnessId: 'opencode_acp' },
      backendDefault: directRoute,
      allowedRoutes,
    });
    expect(result).toEqual({
      ok: true,
      target: { ...openCodeRoute, resolutionSource: 'user' },
    });
  });

  it('uses the backend default in auto mode and otherwise falls back to legacy', () => {
    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'muse-spark',
        preference: { mode: 'automatic' },
        backendDefault: openCodeRoute,
        allowedRoutes,
      }),
    ).toEqual({
      ok: true,
      target: { ...openCodeRoute, resolutionSource: 'backend_default' },
    });

    expect(resolveExecutionTarget({ provider: 'codex', model: 'gpt-5' })).toEqual({
      ok: true,
      target: {
        ...legacyModelRoute('codex', 'gpt-5'),
        resolutionSource: 'legacy_default',
      },
    });
  });

  it('fails closed when a backend default is not in the release allowlist', () => {
    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'muse-spark',
        backendDefault: openCodeRoute,
        allowedRoutes: [directRoute],
      }),
    ).toMatchObject({
      ok: false,
      code: 'incompatible_route',
      harnessId: 'opencode_acp',
    });
  });

  it('does not silently fall back when the selected harness is unavailable', () => {
    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'muse-spark',
        preference: { mode: 'explicit', harnessId: 'pi_rpc' },
        backendDefault: directRoute,
        allowedRoutes,
        harnessReadiness: {
          pi_rpc: { available: false, supported: false, reason: 'Pi is not installed' },
        },
      }),
    ).toEqual({
      ok: false,
      code: 'harness_unavailable',
      message: 'pi_rpc is not ready for execution',
      harnessId: 'pi_rpc',
      reason: 'Pi is not installed',
    });
  });

  it('rejects cross-account and ambiguous model routes', () => {
    expect(
      resolveExecutionTarget({
        provider: 'codex',
        model: 'gpt-5',
        credentialSource: 'provider_subscription',
        backendDefault: {
          provider: 'codex',
          model: 'gpt-5',
          harnessId: 'pi_rpc',
          harnessModelId: 'openai/gpt-5',
          credentialSource: 'sia_managed',
        },
        allowedRoutes: [],
      }),
    ).toMatchObject({ ok: false, code: 'target_mismatch' });

    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'muse-spark',
        preference: { mode: 'explicit', harnessId: 'opencode_acp' },
        backendDefault: directRoute,
        allowedRoutes: [
          openCodeRoute,
          { ...openCodeRoute, harnessModelId: 'sia/muse-spark-v2' },
        ],
      }),
    ).toMatchObject({ ok: false, code: 'ambiguous_route' });
  });

  it('rejects pinned targets that no longer match the thread context', () => {
    expect(
      resolveExecutionTarget({
        provider: 'meta',
        model: 'different-model',
        existingTarget: { ...piRoute, resolutionSource: 'user' },
        allowedRoutes,
      }),
    ).toMatchObject({ ok: false, code: 'target_mismatch', harnessId: 'pi_rpc' });
  });
});

describe('event execution attribution', () => {
  it('adds harness and model without changing legacy EventFactory calls', () => {
    const now = () => new Date('2026-08-13T00:00:00.000Z');
    const legacy = new EventFactory('meta', 'thread-1', 'turn-1', now).create('completion', {
      status: 'completed',
    });
    expect(legacy).not.toHaveProperty('harness');

    const attributed = new EventFactory('meta', 'thread-1', 'turn-1', now, {
      harnessId: 'opencode_acp',
      model: 'muse-spark',
    }).create('completion', { status: 'completed' });
    expect(attributed).toMatchObject({
      provider: 'meta',
      harnessId: 'opencode_acp',
      model: 'muse-spark',
    });
  });
});
