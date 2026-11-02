import type { DriverResult } from './cua-results.js';

const tools = new Set([
  'get_browser_state',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_pointer',
  'browser_select',
  'browser_dialog',
]);
const codes = new Set([
  'browser_route_unavailable',
  'browser_requires_setup',
  'browser_binding_ambiguous',
  'browser_binding_stale',
  'browser_wrong_target_refused',
  'browser_tab_required',
  'browser_tab_not_found',
  'browser_endpoint_owner_mismatch',
  'browser_consent_required',
  'browser_consent_revoked',
  'browser_reconnect_exhausted',
  'browser_origin_outside_scope',
]);

/** Host-only stage evidence; never reconstruct this from a model-visible error string. */
export class BrowserAttestationError extends Error {
  constructor(readonly code: string) {
    super(`CUA refused: ${code}`);
    this.name = 'BrowserAttestationError';
  }
}

/** Recover only the native pre-callback attestation code, never its content-bearing detail. */
export function browserAttestationFailure(
  tool: string,
  result: DriverResult,
  progress: { started: number; completed: number },
): BrowserAttestationError | undefined {
  if (
    !tools.has(tool) ||
    result.errorCode !== 'authorization_host_failed' ||
    progress.started !== 0 ||
    progress.completed !== 0
  )
    return;
  try {
    const parsed: unknown = JSON.parse(result.structuredJson ?? result.rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const envelope = parsed as Record<string, unknown>;
    const refusal = envelope.refusal ?? envelope.error;
    if (!refusal || typeof refusal !== 'object' || Array.isArray(refusal)) return;
    const detail = refusal as Record<string, unknown>;
    if (detail.code !== 'authorization_host_failed') return;
    const message = detail.message ?? detail.hint;
    if (typeof message !== 'string') return;
    const match =
      /^confirmation provider failed: \[browser_attestation:([a-z_]+)\](?: |$)/.exec(message);
    if (match?.[1] && codes.has(match[1])) return new BrowserAttestationError(match[1]);
  } catch {
    // Unknown/legacy envelopes retain the generic refusal, with no guessed recovery.
  }
  return undefined;
}
