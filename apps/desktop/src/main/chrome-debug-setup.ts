import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ChromeDebugSetupResult = 'already' | 'enabled' | 'chrome_running' | 'unavailable';

export interface ChromeDebugSetupOptions {
  /** Chrome user-data directory; defaults to the stable-channel macOS location. */
  readonly userDataDirectory?: string;
  readonly isChromeRunning?: () => Promise<boolean>;
  readonly platform?: NodeJS.Platform;
}

/**
 * Turns on Chrome's own persistent remote-debugging toggle (the checkbox at
 * chrome://inspect/#remote-debugging, stored as `devtools.remote_debugging.user-enabled` in the
 * profile's Local State) so trusted local mode can attach to the signed-in browser without a
 * per-session consent prompt. Chrome reads the file at launch and rewrites it on exit, so the
 * key is only written while Chrome is not running; when Chrome is already open the existing
 * prompt-based attachment route stays in charge and this reports `chrome_running`.
 */
export async function ensureChromeRemoteDebuggingEnabled(
  options: ChromeDebugSetupOptions = {},
): Promise<ChromeDebugSetupResult> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') return 'unavailable';
  const userData =
    options.userDataDirectory ??
    join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  const localStatePath = join(userData, 'Local State');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readFile(localStatePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return 'unavailable';
  }
  const devtools =
    typeof parsed.devtools === 'object' && parsed.devtools !== null
      ? (parsed.devtools as Record<string, unknown>)
      : {};
  const remote =
    typeof devtools.remote_debugging === 'object' && devtools.remote_debugging !== null
      ? (devtools.remote_debugging as Record<string, unknown>)
      : {};
  if (remote['user-enabled'] === true) return 'already';
  const running = await (options.isChromeRunning ?? defaultIsChromeRunning)();
  if (running) return 'chrome_running';
  parsed.devtools = { ...devtools, remote_debugging: { ...remote, 'user-enabled': true } };
  try {
    await writeFile(localStatePath, JSON.stringify(parsed), 'utf8');
  } catch {
    return 'unavailable';
  }
  return 'enabled';
}

async function defaultIsChromeRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', 'Google Chrome']);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Whether Chrome's persistent remote-debugging toggle is already on for the default profile. */
export async function chromeRemoteDebuggingStatus(
  options: ChromeDebugSetupOptions = {},
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
