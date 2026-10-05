/** Which provider routes a new or restored thread may pin. */

import { legacyModelRoute } from '@sia/runtime';
import type { HarnessId, ProviderId, ThreadView } from '../../shared/bridge.js';

export function modelRouteKey(provider: ProviderId, model: string): string {
  return `${provider}\u0000${model}`;
}

/** Providers a new agent or thread may choose in this release. Others stay for pinned threads. */
export const RELEASE_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  'codex',
  'meta',
  'byok',
  // Only present in a testing build started with a signed lab harness manifest.
  'lab',
]);

export function requireReleaseProvider(provider: ProviderId): void {
  if (RELEASE_PROVIDERS.has(provider)) return;
  throw new Error(
    'This model is not available for new conversations in this version of Sia. Choose Codex or a model included with Sia. Existing conversations keep working.',
  );
}

export function legacyHarnessForProvider(provider: ProviderId): HarnessId {
  if (provider === 'codex' || provider === 'byok') return 'codex_app_server';
  if (provider === 'claude') return 'claude_code';
  if (provider === 'meta') return 'sia_direct';
  return 'legacy_acp';
}

export function legacyResolvedExecutionTarget(
  thread: Pick<ThreadView, 'provider' | 'model' | 'harnessId'>,
): NonNullable<ThreadView['resolvedExecutionTarget']> {
  const route = legacyModelRoute(thread.provider, thread.model);
  const storedHarness = (thread as { harnessId?: string }).harnessId;
  const harnessId =
    storedHarness === 'sia_default'
      ? 'sia_direct'
      : storedHarness &&
          [
            'codex_app_server',
            'claude_code',
            'legacy_acp',
            'opencode_acp',
            'pi_rpc',
            'sia_direct',
          ].includes(storedHarness)
        ? (storedHarness as NonNullable<ThreadView['harnessId']>)
        : legacyHarnessForProvider(thread.provider);
  return { ...route, harnessId, resolutionSource: 'legacy_default' };
}
