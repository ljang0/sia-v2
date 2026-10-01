import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ChromeDebugStatusOptions {
  /** Chrome user-data directory; defaults to the stable-channel macOS location. */
  readonly userDataDirectory?: string;
  readonly platform?: NodeJS.Platform;
}

/**
 * Reports whether Chrome's own persistent remote-debugging toggle (the checkbox at
 * chrome://inspect/#remote-debugging) is on for the default profile. Read-only: Sia never edits
 * Chrome's Local State. Attachment otherwise relies on Chrome's own per-attach prompt, which the
 * user approves in Chrome.
 */
export async function chromeRemoteDebuggingStatus(
  options: ChromeDebugStatusOptions = {},
): Promise<'enabled' | 'off' | 'unavailable'> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') return 'unavailable';
  const userData =
    options.userDataDirectory ??
    join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  try {
    const parsed = JSON.parse(await readFile(join(userData, 'Local State'), 'utf8')) as Record<
      string,
      unknown
    >;
    const devtools = parsed.devtools as Record<string, unknown> | undefined;
    const remote = devtools?.remote_debugging as Record<string, unknown> | undefined;
    return remote?.['user-enabled'] === true ? 'enabled' : 'off';
  } catch {
    return 'unavailable';
  }
}
