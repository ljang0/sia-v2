import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const consolidationNotes = ['journal.md', 'failures.log'] as const;
const revision = z.string().regex(/^(?:[a-f0-9]{64})?$/);
const schema = z.object({
  version: z.literal(1),
  startedAt: z.number().finite().nonnegative(),
  revisions: z.object({ 'journal.md': revision, 'failures.log': revision }),
});
export type ConsolidationState = z.infer<typeof schema>;

/** Host-only checkpoint: timestamps and hashes, never note contents. Empty markers from
 * older releases fall back to the original timestamp schedule until the next review. */
export function readConsolidationState(root: string): ConsolidationState | undefined {
  let fd: number | undefined;
  try {
    fd = openSync(
      join(root, '.last-consolidation'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.size > 4096) return;
    const result = schema.safeParse(JSON.parse(readFileSync(fd, 'utf8')));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function writeConsolidationState(root: string, state: ConsolidationState): void {
  const path = join(root, '.last-consolidation');
  // Replace the directory entry, never follow an existing link or truncate a linked file.
  rmSync(path, { force: true });
  writeFileSync(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
}
