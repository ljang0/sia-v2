import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const exec = promisify(execFile);
const result = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), url: z.string().max(8192), bundleID: z.string() }),
  z.object({
    status: z.enum(['protected', 'unavailable']),
    reason: z.enum(['accessibility', 'window', 'ambiguous', 'incomplete', 'page']).optional(),
  }),
]);
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
  constructor(private readonly helperPath: string) {}
  async inspect(pid: number, windowId: number): Promise<BrowserWindowState> {
    if (![pid, windowId].every((value) => Number.isInteger(value) && value > 0))
      return { status: 'unavailable' };
    try {
      const { stdout } = await exec(
        this.helperPath,
        ['--browser-window', String(pid), String(windowId)],
        { timeout: 5000, maxBuffer: 16384, env: { PATH: '/usr/bin:/bin' } },
      );
      return result.parse(JSON.parse(stdout));
    } catch {
      return { status: 'unavailable' };
    }
  }
}
