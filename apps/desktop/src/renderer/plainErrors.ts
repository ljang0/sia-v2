export interface PlainError {
  kind: 'usage' | 'sign-in' | 'network';
  title: string;
  message: string;
}

const USAGE =
  /\b(?:usage|rate)[ _-]?limit|\b429\b|too many requests|quota|insufficient[_ ]quota|limit (?:reached|exceeded)|out of credits/i;
const SIGN_IN =
  /\b401\b|\bunauthori[sz]ed\b|not (?:signed|logged) in|sign[ -]?in (?:again|required|expired)|log ?in (?:again|required)|login required|authentication (?:failed|required|expired)|(?:access|refresh|auth) token (?:expired|invalid|revoked|is invalid)|token (?:has )?expired|invalid[_ ]grant|session (?:has )?expired|credentials? (?:expired|invalid|missing)/i;
const NETWORK =
  /\b(?:ENOTFOUND|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)\b|fetch failed|network (?:error|request failed|is unreachable|connection)|stream (?:disconnected|closed|error)|connection (?:reset|refused|closed|error|lost|timed out)|socket hang up|getaddrinfo|could not resolve host|internet connection|request timed out/i;

/**
 * Turns the transport, sign-in, and usage-limit failures providers report into one plain
 * sentence with what to do next. Anything else returns undefined, and the caller shows the
 * original text. The original text stays available as a secondary detail either way.
 */
export function plainError(raw: string | undefined | null): PlainError | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (USAGE.test(raw)) {
    return {
      kind: 'usage',
      title: 'Usage limit reached',
      message:
        'Your plan’s usage limit has been reached for now. Try again later, or check your plan in Settings → AI.',
    };
  }
  if (SIGN_IN.test(raw)) {
    return {
      kind: 'sign-in',
      title: 'Sign in again',
      message:
        'Sia needs you to sign in to your plan again. Open Settings → AI, sign in, then try again.',
    };
  }
  if (NETWORK.test(raw)) {
    return {
      kind: 'network',
      title: 'Connection problem',
      message: 'Sia couldn’t reach the internet. Check your connection, then try again.',
    };
  }
  return undefined;
}
