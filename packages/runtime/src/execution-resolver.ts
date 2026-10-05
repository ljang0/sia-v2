import type {
  CredentialSource,
  ExecutionResolutionSource,
  HarnessId,
  HarnessPreference,
  ModelRoute,
  ProviderId,
  ResolvedExecutionTarget,
} from '@sia/protocol';
import { HarnessRegistry } from './harness-registry.js';

const BUILTIN_HARNESSES = new HarnessRegistry();

export interface HarnessReadiness {
  readonly available: boolean;
  readonly supported: boolean;
  readonly reason?: string;
}

export interface ResolveExecutionTargetInput {
  readonly provider: ProviderId;
  readonly model: string;
  /** Missing on legacy agents and therefore equivalent to auto. */
  readonly preference?: HarnessPreference;
  /** A target already pinned into an existing thread. Never silently replaced. */
  readonly existingTarget?: ResolvedExecutionTarget;
  /** Authenticated service default for this exact provider/model entitlement. */
  readonly backendDefault?: ModelRoute;
  /** Override used by migrations/tests; otherwise the built-in legacy mapping is used. */
  readonly legacyDefault?: ModelRoute;
  /**
   * Complete release-policy allowlist for this resolution. If omitted, only the
   * built-in legacy route is allowed, and only when its harness is release-admitted
   * (or it is an existing thread's pinned target). Merely receiving a backend route
   * does not make it trusted.
   */
  readonly allowedRoutes?: readonly ModelRoute[];
  /** Narrows routes when the same provider/model exists under multiple accounts. */
  readonly credentialSource?: CredentialSource;
  /** Missing entries mean readiness has not been constrained by the caller. */
  readonly harnessReadiness?: Readonly<Partial<Record<HarnessId, HarnessReadiness>>>;
}

export type ExecutionResolutionFailureCode =
  | 'invalid_context'
  | 'target_mismatch'
  | 'incompatible_route'
  | 'incompatible_harness'
  | 'ambiguous_route'
  | 'harness_unavailable'
  | 'no_route';

export type ExecutionResolutionResult =
  | { readonly ok: true; readonly target: ResolvedExecutionTarget }
  | {
      readonly ok: false;
      readonly code: ExecutionResolutionFailureCode;
      readonly message: string;
      readonly harnessId?: HarnessId;
      readonly reason?: string;
    };

interface LegacyRouteDefaults {
  readonly harnessId: HarnessId;
  readonly credentialSource: CredentialSource;
}

export const LEGACY_ROUTE_DEFAULTS: Readonly<Record<ProviderId, LegacyRouteDefaults>> = {
  codex: { harnessId: 'codex_app_server', credentialSource: 'provider_subscription' },
  claude: { harnessId: 'claude_code', credentialSource: 'provider_subscription' },
  grok: { harnessId: 'legacy_acp', credentialSource: 'provider_subscription' },
  gemini: { harnessId: 'legacy_acp', credentialSource: 'provider_api' },
  meta: { harnessId: 'sia_direct', credentialSource: 'sia_managed' },
  byok: { harnessId: 'codex_app_server', credentialSource: 'user_byok' },
};

/** Produces the concrete route represented by a legacy provider/model pair. */
export function legacyModelRoute(provider: ProviderId, model: string): ModelRoute {
  const canonicalModel = model.trim();
  if (canonicalModel.length === 0)
    throw new RangeError('A non-empty canonical model id is required');
  const defaults = LEGACY_ROUTE_DEFAULTS[provider];
  return Object.freeze({
    provider,
    model: canonicalModel,
    harnessId: defaults.harnessId,
    harnessModelId: canonicalModel,
    credentialSource: defaults.credentialSource,
  });
}

/**
 * Resolves one immutable execution target using:
 * pinned thread > explicit user preference > backend default > legacy default.
 * Every candidate must also be present in allowedRoutes and pass readiness.
 */
export function resolveExecutionTarget(
  input: ResolveExecutionTargetInput,
): ExecutionResolutionResult {
  const model = input.model.trim();
  if (model.length === 0) {
    return failure('invalid_context', 'A non-empty canonical model id is required');
  }

  const legacyDefault = input.legacyDefault ?? legacyModelRoute(input.provider, model);
  // Without an explicit allowlist, a new resolution may only use a release-admitted harness.
  // A target already pinned into an existing thread keeps its legacy route.
  const allowedRoutes =
    input.allowedRoutes ??
    (input.existingTarget || BUILTIN_HARNESSES.get(legacyDefault.harnessId)?.productionEnabled
      ? [legacyDefault]
      : []);
  if (input.existingTarget) {
    const mismatch = contextMismatch(
      input.existingTarget,
      input.provider,
      model,
      input.credentialSource,
    );
    if (mismatch) return mismatch;
    return resolveCandidate(
      input.existingTarget,
      input.existingTarget.resolutionSource,
      allowedRoutes,
      input.harnessReadiness,
    );
  }

  const contextCredential =
    input.credentialSource ??
    credentialForContext(input.backendDefault, input.provider, model) ??
    credentialForContext(legacyDefault, input.provider, model);

  const preference = input.preference ?? { mode: 'automatic' };
  if (preference.mode === 'explicit') {
    const candidates = uniqueRoutes(
      allowedRoutes.filter(
        (route) =>
          route.provider === input.provider &&
          route.model === model &&
          route.harnessId === preference.harnessId &&
          (!contextCredential || route.credentialSource === contextCredential),
      ),
    );
    if (candidates.length === 0) {
      return failure(
        'incompatible_harness',
        `${preference.harnessId} is not allowed for ${input.provider}/${model}`,
        preference.harnessId,
      );
    }
    if (candidates.length > 1) {
      return failure(
        'ambiguous_route',
        `${preference.harnessId} has multiple credential or model routes for ${input.provider}/${model}`,
        preference.harnessId,
      );
    }
    return resolveCandidate(candidates[0]!, 'user', allowedRoutes, input.harnessReadiness);
  }

  if (input.backendDefault) {
    const mismatch = contextMismatch(
      input.backendDefault,
      input.provider,
      model,
      input.credentialSource,
    );
    if (mismatch) return mismatch;
    return resolveCandidate(
      input.backendDefault,
      'backend_default',
      allowedRoutes,
      input.harnessReadiness,
    );
  }

  const mismatch = contextMismatch(
    legacyDefault,
    input.provider,
    model,
    input.credentialSource,
  );
  if (mismatch) return mismatch;
  return resolveCandidate(
    legacyDefault,
    'legacy_default',
    allowedRoutes,
    input.harnessReadiness,
  );
}

function resolveCandidate(
  route: ModelRoute,
  resolutionSource: ExecutionResolutionSource,
  allowedRoutes: readonly ModelRoute[],
  readinessByHarness: ResolveExecutionTargetInput['harnessReadiness'],
): ExecutionResolutionResult {
  if (!allowedRoutes.some((allowed) => routesEqual(allowed, route))) {
    return failure(
      'incompatible_route',
      `${route.harnessId} is not allowlisted for ${route.provider}/${route.model}`,
      route.harnessId,
    );
  }

  const readiness = readinessByHarness?.[route.harnessId];
  if (readiness && (!readiness.available || !readiness.supported)) {
    return failure(
      'harness_unavailable',
      `${route.harnessId} is not ready for execution`,
      route.harnessId,
      readiness.reason,
    );
  }

  return {
    ok: true,
    target: Object.freeze({ ...route, resolutionSource }),
  };
}

function contextMismatch(
  route: ModelRoute,
  provider: ProviderId,
  model: string,
  credentialSource?: CredentialSource,
): (ExecutionResolutionResult & { readonly ok: false }) | undefined {
  if (route.provider !== provider || route.model !== model) {
    return failure(
      'target_mismatch',
      `Route ${route.provider}/${route.model} does not match ${provider}/${model}`,
      route.harnessId,
    );
  }
  if (credentialSource && route.credentialSource !== credentialSource) {
    return failure(
      'target_mismatch',
      `Route credential ${route.credentialSource} does not match ${credentialSource}`,
      route.harnessId,
    );
  }
  return undefined;
}

function credentialForContext(
  route: ModelRoute | undefined,
  provider: ProviderId,
  model: string,
): CredentialSource | undefined {
  return route?.provider === provider && route.model === model
    ? route.credentialSource
    : undefined;
}

function routesEqual(left: ModelRoute, right: ModelRoute): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    left.harnessId === right.harnessId &&
    left.harnessModelId === right.harnessModelId &&
    left.credentialSource === right.credentialSource
  );
}

function uniqueRoutes(routes: readonly ModelRoute[]): readonly ModelRoute[] {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = [
      route.provider,
      route.model,
      route.harnessId,
      route.harnessModelId,
      route.credentialSource,
    ].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function failure(
  code: ExecutionResolutionFailureCode,
  message: string,
  harnessId?: HarnessId,
  reason?: string,
): ExecutionResolutionResult & { readonly ok: false } {
  return {
    ok: false,
    code,
    message,
    ...(harnessId ? { harnessId } : {}),
    ...(reason ? { reason } : {}),
  };
}
