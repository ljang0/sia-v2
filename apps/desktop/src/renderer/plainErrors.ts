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
export function plainError(
  raw: string | undefined | null,
  context: { usageResetsAt?: string | undefined; now?: Date } = {},
): PlainError | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  if (USAGE.test(raw)) {
    const resets = context.usageResetsAt
      ? formatUsageReset(context.usageResetsAt, context.now)
      : undefined;
    return {
      kind: 'usage',
      title: 'Usage limit reached',
      message: resets
        ? `Your plan’s usage limit has been reached. It resets ${resets}. Try again then, or check your plan in Settings → AI.`
        : 'Your plan’s usage limit has been reached for now. Try again later, or check your plan in Settings → AI.',
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

/** Share of a plan usage window at which Sia warns before the limit stops work. */
const USAGE_WARNING_PERCENT = 80;

/**
 * When a usage window resets, in words: "at 3:05 PM" today, "tomorrow at 9:00 AM", or
 * "Tue at 9:00 AM" within the week. Undefined for a time already past or unreadable.
 */
function formatUsageReset(resetsAt: string, now = new Date()): string | undefined {
  const at = new Date(resetsAt);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) return undefined;
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days === 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days < 7) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} at ${time}`;
  return `on ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** "63% left · resets at 3:05 PM" for Settings → AI. */
export function usageLeftText(
  limits: { usedPercent: number; resetsAt?: string | undefined },
  now = new Date(),
): string {
  const left = Math.max(0, Math.round(100 - limits.usedPercent));
  const resets = limits.resetsAt ? formatUsageReset(limits.resetsAt, now) : undefined;
  return resets ? `${left}% left · resets ${resets}` : `${left}% left`;
}

/** The composer warning once most of the plan's usage window is gone; undefined before. */
export function usageWarningText(
  limits: { usedPercent: number; resetsAt?: string | undefined } | undefined,
  now = new Date(),
): string | undefined {
  if (!limits || limits.usedPercent < USAGE_WARNING_PERCENT) return undefined;
  const resets = limits.resetsAt ? formatUsageReset(limits.resetsAt, now) : undefined;
  const when = resets ? ` It resets ${resets}.` : '';
  return limits.usedPercent >= 100
    ? `You’ve reached your plan’s usage limit.${when}`
    : `You’ve used ${Math.round(limits.usedPercent)}% of your plan’s usage limit.${when}`;
}

/** The message a failed call carries, or a plain fallback when it has none. */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
