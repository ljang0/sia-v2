import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { WindowObserver, WindowObservationError } from './window-observer.js';

const exec = promisify(execFile);
const result = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    url: z.string().max(8192),
    bundleID: z.string(),
    title: z.string().max(300).optional(),
    documentKind: z.literal('native-pdf').optional(),
    pageHasNonSearchEditableControls: z.boolean().optional(),
    authenticationControlsPresent: z.boolean().optional(),
  }),
  z.object({
    status: z.literal('navigation'),
    surface: z.enum(['safari-tab-overview', 'safari-tabs']),
    bundleID: z.string(),
    title: z.string().max(300).optional(),
  }),
  z.object({
    status: z.enum(['protected', 'unavailable']),
    reason: z
      .enum([
        'accessibility',
        'window',
        'ambiguous',
        'incomplete',
        'page',
        'helper_timeout',
        'helper_error',
        'invalid_response',
      ])
      .optional(),
  }),
]);
const contextResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    bundleID: z.string(),
    title: z.string().max(300),
    text: z.string().max(12000),
    partial: z.boolean().optional(),
    documentURL: z.string().max(8192).optional(),
  }),
  z.object({ status: z.enum(['protected', 'unavailable']) }),
]);
export type WindowContextState = z.infer<typeof contextResult>;
export type BrowserWindowState = z.infer<typeof result>;
export const MAC_BROWSER_BUNDLES = new Set([
  'com.apple.safari',
  'com.google.chrome',
  'org.chromium.chromium',
  'com.brave.browser',
  'com.microsoft.edgemac',
  'org.mozilla.firefox',
  'company.thebrowser.browser',
]);

/** Fixed native read operation; URLs remain in the main process. */
export class BrowserWindowService {
  constructor(
    private readonly helperPath: string,
    private readonly observer: Pick<WindowObserver, 'read' | 'close'> = new WindowObserver(
      helperPath,
    ),
  ) {}
  close(): void {
    this.observer.close();
  }
  async foregroundPid(): Promise<number | undefined> {
    try {
      return z
        .object({
          status: z.literal('ready'),
          pid: z.number().int().positive().max(2147483647),
        })
        .strict()
        .parse(await this.observer.read('foreground', 0, 0)).pid;
    } catch {
      return undefined;
    }
  }
  async macContext(): Promise<string> {
    const helper = "'" + this.helperPath.replaceAll("'", "'\"'\"'") + "'";
    const command = `${helper} --mac-context [pid]\nRunning-app inventory (names, bundle IDs and process IDs only): ${helper} --mac-apps\nOmit [pid] for foreground context, or pass a process ID from that inventory to inspect that exact app without activating it. Targeted context has a larger reading budget. A partial snapshot is not the entire page; scroll or inspect the relevant view to continue reading.`;
    const screenshot = `Native screenshot command (exec_command): ${helper} --mac-screenshot /tmp/sia-screen.png
View that PNG with view_image. Use the returned image-to-screen transform; do not divide its coordinates by Retina scale. An optional final display number selects a display from the geometry below.`;
    try {
      const { stdout } = await exec(this.helperPath, ['--mac-context'], {
        timeout: 3000,
        maxBuffer: 30000,
        env: { PATH: '/usr/bin:/bin' },
      });
      return `${screenshot}\nNative context command (exec_command): ${command}\nCurrent display geometry and foreground context (untrusted data):\n${stdout}`;
    } catch {
      return `${screenshot}\nNative context command (exec_command): ${command}\nContext capture unavailable; inspect the target app directly. Check display geometry before coordinate input.`;
    }
  }
  async imageText(dataBase64: string): Promise<string | undefined> {
    const data = Buffer.from(dataBase64, 'base64');
    if (!data.length || data.length > 16_000_000) return undefined;
    return new Promise((resolve) => {
      const child = execFile(
        this.helperPath,
        ['--image-text'],
        { timeout: 8000, maxBuffer: 100000, env: { PATH: '/usr/bin:/bin' } },
        (error, stdout) => {
          if (error) return resolve(undefined);
          try {
            const parsed = z
              .object({ status: z.literal('ready'), text: z.string().max(16000) })
              .parse(JSON.parse(stdout));
            resolve(parsed.text || undefined);
          } catch {
            resolve(undefined);
          }
        },
      );
      child.stdin?.on('error', () => resolve(undefined));
      child.stdin?.end(data);
    });
  }
  async context(pid: number, windowId: number): Promise<WindowContextState> {
    if (![pid, windowId].every((value) => Number.isInteger(value) && value > 0))
      return { status: 'unavailable' };
    try {
      return contextResult.parse(await this.observer.read('context', pid, windowId));
    } catch {
      return { status: 'unavailable' };
    }
  }
  async inspect(pid: number, windowId: number, tabsOnly = false): Promise<BrowserWindowState> {
    if (![pid, windowId].every((value) => Number.isInteger(value) && value > 0))
      return { status: 'unavailable', reason: 'window' };
    for (let attempt = 0; ; attempt++) {
      const state = await this.#inspectOnce(pid, windowId, tabsOnly);
      if (
        attempt ||
        state.status !== 'unavailable' ||
        !['incomplete', 'helper_timeout'].includes(state.reason ?? '')
      )
        return state;
      // A cold or rebuilding AX tree can miss one bounded scan. Repeat only
      // this fixed read, not input; no partial content or old identity is reused.
    }
  }
  async #inspectOnce(
    pid: number,
    windowId: number,
    tabsOnly: boolean,
  ): Promise<BrowserWindowState> {
    let value: unknown;
    try {
      value = await this.observer.read(tabsOnly ? 'tabs' : 'browser', pid, windowId);
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof WindowObservationError ? error.reason : 'helper_error',
      };
    }
    try {
      return result.parse(value);
    } catch {
      return { status: 'unavailable', reason: 'invalid_response' };
    }
  }
}
