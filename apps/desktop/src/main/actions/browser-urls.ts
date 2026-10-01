import { collectTabRecords, findString, firstString } from './driver-records.js';

const SENSITIVE_BROWSER_HOST =
  /(?:^|\.)(?:accounts\.google\.com|login\.microsoftonline\.com|appleid\.apple\.com|id\.apple\.com|auth0\.com|okta\.com|1password\.com|bitwarden\.com|lastpass\.com|dashlane\.com|keepersecurity\.com)$/i;
const SENSITIVE_BROWSER_PATH =
  /(?:^|\/)(?:login|log-in|signin|sign-in|signup|sign-up|oauth|authorize|authorization|auth|mfa|2fa|webauthn|passkey|password|reset|reset-password|magic|magic-link|tokens?|access[-_]?tokens?|personal[-_]?access[-_]?tokens?|api[-_]?keys?|credentials?|secrets?|security)(?:\/|$)/i;
const SENSITIVE_BROWSER_QUERY_KEY =
  /(?:^|[^a-z0-9])(?:api[-_]?key|access[-_]?token|auth|authorization|code|credentials?|jwt|key|password|refresh[-_]?token|secret|session|signature|sig|token)(?:$|[^a-z0-9])/i;

export function browserUrlLooksSensitive(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      Boolean(url.username || url.password) ||
      SENSITIVE_BROWSER_HOST.test(url.hostname) ||
      SENSITIVE_BROWSER_PATH.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) => SENSITIVE_BROWSER_QUERY_KEY.test(key)) ||
      SENSITIVE_BROWSER_QUERY_KEY.test(url.hash.slice(1))
    );
  } catch {
    return true;
  }
}

/** Model-visible browser locations reveal only the origin; private URLs stay host-only. */
export function modelVisibleBrowserUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function browserRouteWasReplaced(error: unknown): boolean {
  return (
    error instanceof Error &&
    /\b(?:browser_route_unavailable|browser_binding_stale|browser_tab_not_found|browser_ref_stale)\b/.test(
      error.message,
    )
  );
}

export function originFromRecord(record: Record<string, unknown>): string | undefined {
  const url = safeHttpUrl(firstString(record, ['url']));
  const urlOrigin = url ? new URL(url).origin : undefined;
  const explicit = firstString(record, ['origin']);
  if (explicit) {
    try {
      const explicitOrigin = new URL(explicit).origin;
      return urlOrigin && urlOrigin !== explicitOrigin ? undefined : explicitOrigin;
    } catch {
      return undefined;
    }
  }
  return urlOrigin;
}

export function findBrowserLocation(
  value: unknown,
  targetId: string,
  tabId: string,
): { readonly origin: string; readonly url: string } | undefined {
  const record = collectTabRecords(value).find(
    (candidate) =>
      firstString(candidate, ['target_id', 'targetId']) === targetId &&
      firstString(candidate, ['tab_id', 'tabId']) === tabId,
  );
  if (record) {
    const url = safeHttpUrl(firstString(record, ['url']));
    const origin = originFromRecord(record);
    if (url && origin) return { url, origin };
  }
  // A targeted semantic_v2 response can omit the already-bound target/tab ids
  // while still returning the exact page URL. The caller compares this origin
  // with the previously granted binding before minting any snapshot refs.
  const targetedUrl = safeHttpUrl(findString(value, ['url']));
  return targetedUrl ? { url: targetedUrl, origin: new URL(targetedUrl).origin } : undefined;
}

export function declaredOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Compare observed page identity without treating query order or an anchor as navigation. */
export function samePageUrl(observed: string, expected: string): boolean {
  try {
    const canonical = (value: string) => {
      const url = new URL(value);
      url.hash = '';
      url.searchParams.sort();
      return url.href;
    };
    return canonical(observed) === canonical(expected);
  } catch {
    return false;
  }
}
