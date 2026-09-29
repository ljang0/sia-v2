import { posix } from 'node:path';

/**
 * Folders whose contents hold credentials, sessions, or keys. Matched as consecutive path
 * segments anywhere in an absolute path, ignoring case (macOS volumes are case-insensitive).
 */
const SENSITIVE_DIRECTORIES: readonly (readonly string[])[] = [
  ['.ssh'],
  ['.aws'],
  ['.gnupg'],
  ['.codex'],
  ['.kube'],
  ['.config', 'gh'],
  ['library', 'keychains'],
  ['library', 'cookies'],
];

/** Specific credential files, matched as trailing path segments. */
const SENSITIVE_FILES: readonly (readonly string[])[] = [
  ['.netrc'],
  ['.npmrc'],
  ['.docker', 'config.json'],
  // Chrome and other Chromium profiles.
  ['cookies'],
  ['cookies-journal'],
  ['login data'],
  ['login data-journal'],
  ['login data for account'],
  ['login data for account-journal'],
  // Safari.
  ['cookies.binarycookies'],
  // Firefox profiles.
  ['cookies.sqlite'],
  ['logins.json'],
  ['key4.db'],
];

/** Private keys and dotenv files, including suffixed variants such as `.env.local`. */
const SENSITIVE_FILE_PREFIX = /^(?:id_rsa|id_ed25519|id_ecdsa|id_dsa|\.env)(?:\.|$)/;

/**
 * The single deny-list for files an agent may hand to a website or connector. Callers should
 * pass the resolved (realpath) path as well as the requested one.
 */
export function isSensitiveLocalPath(path: string): boolean {
  const segments = posix
    .normalize(path.normalize('NFC').replaceAll('\\', '/'))
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  const basename = segments.at(-1) ?? '';
  if (SENSITIVE_FILE_PREFIX.test(basename)) return true;
  if (SENSITIVE_FILES.some((file) => endsWith(segments, file))) return true;
  return SENSITIVE_DIRECTORIES.some((directory) => contains(segments, directory));
}

function endsWith(segments: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length > segments.length) return false;
  const offset = segments.length - suffix.length;
  return suffix.every((segment, index) => segments[offset + index] === segment);
}

function contains(segments: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= segments.length; start++) {
    if (run.every((segment, index) => segments[start + index] === segment)) return true;
  }
  return false;
}
