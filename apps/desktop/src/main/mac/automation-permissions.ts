import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  automationAppSchema,
  automationStatusSchema,
  type AutomationApp,
  type AutomationPermissions,
} from '../../shared/mac-permissions.js';
const exec = promisify(execFile);
const resultSchema = z.object({
  calendar: automationStatusSchema,
  reminders: automationStatusSchema,
  finder: automationStatusSchema,
  messages: automationStatusSchema,
  system_events: automationStatusSchema.optional(),
  safari: automationStatusSchema.optional(),
  chrome: automationStatusSchema.optional(),
});

export class AutomationPermissionService {
  private readonly fakePermissions: AutomationPermissions = {
    system_events: 'needs_permission',
    safari: 'needs_permission',
    chrome: 'needs_permission',
    calendar: 'needs_permission',
    reminders: 'needs_permission',
    finder: 'needs_permission',
    messages: 'needs_permission',
  };
  constructor(
    private readonly options: {
      helperPath: string;
      fake?: boolean;
      platform?: NodeJS.Platform;
      run?: (file: string, args: string[]) => Promise<string>;
      openSettings(): Promise<void>;
    },
  ) {}

  async check(request?: AutomationApp): Promise<AutomationPermissions> {
    if (request !== undefined) automationAppSchema.parse(request);
    const fallback = (status: 'ready' | 'unavailable' | 'error') =>
      resultSchema.parse(
        Object.fromEntries(automationAppSchema.options.map((app) => [app, status])),
      );
    if (this.options.fake) {
      if (request) this.fakePermissions[request] = 'ready';
      return { ...this.fakePermissions };
    }
    if ((this.options.platform ?? process.platform) !== 'darwin')
      return fallback('unavailable');
    const run =
      this.options.run ??
      (async (file: string, args: string[]) => {
        const { stdout } = await exec(file, args, {
          timeout: request ? 120_000 : 10_000,
          maxBuffer: 8192,
          env: { PATH: '/usr/bin:/bin' },
        });
        return stdout;
      });
    try {
      const result = resultSchema.parse(
        JSON.parse(
          await run(
            this.options.helperPath,
            request ? ['--automation-request', request] : ['--automation-check'],
          ),
        ),
      );
      if (request && result[request] === 'denied') await this.options.openSettings();
      return result;
    } catch {
      // Native stderr may include system paths. Publish only bounded status values.
      return fallback('error');
    }
  }
}
