// Display-only sanitation. Native selectors and exact page identities remain host-owned.
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi;
const PRIVATE_LINK_KEY =
  /(?:^|[^a-z0-9])(?:api[-_]?key|access[-_]?token|auth|authorization|code|credentials?|jwt|key|password|passwd|passcode|pwd|refresh[-_]?token|secret|session|signature|sig|token)(?:$|[^a-z0-9])/i;
const COMPACT_PRIVATE_KEYS = new Set([
  'apikey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'sessionid',
  'samlrequest',
  'samlresponse',
]);

export function linkContainsCredentials(value: string, depth = 0): boolean {
  try {
    const url = new URL(value);
    return (
      Boolean(url.username || url.password) ||
      [...url.searchParams.keys()].some(
        (key) =>
          PRIVATE_LINK_KEY.test(key) ||
          COMPACT_PRIVATE_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase()),
      ) ||
      (depth < 2 &&
        [...url.searchParams.values()].some(
          (nested) =>
            /^[a-z][a-z0-9+.-]*:\/\//i.test(nested) &&
            linkContainsCredentials(nested, depth + 1),
        )) ||
      PRIVATE_LINK_KEY.test(decodeURIComponent(url.hash.slice(1)))
    );
  } catch {
    // A malformed escape must not defeat the private-link check.
    return /(?:[?&#]|%26)(?:pwd|password|token|secret|signature)(?:=|%3d)/i.test(value);
  }
}

/** Omit the whole access-bearing link, including any duplicate/nested parameter values. */
export function redactObservationLinks(value: string): string {
  return value.replace(URL_IN_TEXT, (url) =>
    linkContainsCredentials(url) ? '[private link omitted]' : url,
  );
}

/** Only inspect display fields, not opaque refs, native actions or invisible link targets. */
export function observationHasPrivateLinks(value: string | undefined): boolean {
  return value !== undefined && redactObservationLinks(value) !== value;
}

export function observationRecordHasPrivateLinks(record: Record<string, unknown>): boolean {
  return [
    'title',
    'label',
    'name',
    'aria_label',
    'ariaLabel',
    'value',
    'text',
    'description',
  ].some((key) => typeof record[key] === 'string' && observationHasPrivateLinks(record[key]));
}
