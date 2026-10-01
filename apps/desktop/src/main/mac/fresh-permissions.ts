import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { CorePermissionStatus } from './cua-service.js';

const exec = promisify(execFile);
const statusSchema = z
  .object({ accessibility: z.boolean(), screenRecording: z.boolean() })
  .strict();

/**
 * Reads Accessibility and Screen Recording from a new child process. The child inherits Sia as
 * its responsible app, so a "yes" here while the running app still reads "no" means macOS is
 * waiting for Sia to reopen. Results are reused briefly so status polling stays cheap.
 */
export function freshPermissionProbe(options: {
  executable: string;
  entryPath: string;
  run?: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<string>;
  now?: () => number;
  maxAgeMs?: number;
}): () => Promise<CorePermissionStatus | undefined> {
  const run =
    options.run ??
    (async (file: string, args: string[], env: NodeJS.ProcessEnv) =>
      (await exec(file, args, { env, timeout: 5_000, maxBuffer: 1024 })).stdout);
  const now = options.now ?? Date.now;
  const maxAgeMs = options.maxAgeMs ?? 3_000;
  let cached: { at: number; value: CorePermissionStatus | undefined } | undefined;
  let inFlight: Promise<CorePermissionStatus | undefined> | undefined;
  return async () => {
    if (cached && now() - cached.at < maxAgeMs) return cached.value;
    inFlight ??= (async () => {
      let value: CorePermissionStatus | undefined;
      try {
        value = statusSchema.parse(
          JSON.parse(
            await run(options.executable, [options.entryPath], {
              ELECTRON_RUN_AS_NODE: '1',
              PATH: '/usr/bin:/bin',
            }),
          ),
        );
      } catch {
        // Unknown is safe: setup keeps its manual "Relaunch Sia" link.
        value = undefined;
      }
      cached = { at: now(), value };
      return value;
    })().finally(() => {
      inFlight = undefined;
    });
    return await inFlight;
  };
}
