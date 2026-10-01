import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { isSensitiveLocalPath } from '@sia/action-gateway';

const MAX_BROWSER_UPLOAD_BYTES = 100_000_000;
const BROWSER_UPLOAD_RETENTION_MS = 10 * 60_000;
const BROWSER_VAULT_NAME = /^sia-browser-(?:upload|download)-[A-Za-z0-9]{6,}$/;

/** Removes only old, private Sia transfer vaults left behind by an unclean exit. */
export async function sweepStaleBrowserVaults(
  root = tmpdir(),
  now = Date.now(),
): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !BROWSER_VAULT_NAME.test(entry.name)) continue;
    const candidate = join(root, entry.name);
    try {
      const metadata = await lstat(candidate);
      const currentUid = process.getuid?.();
      if (
        metadata.isSymbolicLink() ||
        !metadata.isDirectory() ||
        (currentUid !== undefined && metadata.uid !== currentUid) ||
        (metadata.mode & 0o077) !== 0 ||
        now - metadata.mtimeMs < BROWSER_UPLOAD_RETENTION_MS
      ) {
        continue;
      }
      await rm(candidate, { recursive: true, force: false });
    } catch {
      // Startup cleanup is best effort and never broadens beyond the validated child.
    }
  }
}

/**
 * Copies approved upload files into a private temporary vault, so the browser only ever
 * receives bytes the person approved, never a path that could change afterwards.
 */
export async function stageBrowserUploadFiles(
  paths: readonly string[],
): Promise<{ directory: string; files: string[] }> {
  const directory = await mkdtemp(join(tmpdir(), 'sia-browser-upload-'));
  await chmod(directory, 0o700);
  const files: string[] = [];
  try {
    for (const [index, path] of paths.entries()) {
      if (!isAbsolute(path) || isSensitiveLocalPath(path)) {
        throw new Error('Browser uploads require a non-sensitive absolute file path.');
      }
      const resolved = await realpath(path);
      if (resolved !== path || isSensitiveLocalPath(resolved)) {
        throw new Error('Browser uploads do not follow symbolic links or aliases.');
      }
      const source = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const sourceInfo = await source.stat();
        if (!sourceInfo.isFile() || sourceInfo.size > MAX_BROWSER_UPLOAD_BYTES) {
          throw new Error('Browser uploads require regular files no larger than 100 MB.');
        }
        const fileDirectory = join(directory, String(index));
        await mkdir(fileDirectory, { mode: 0o700 });
        const destination = join(fileDirectory, basename(resolved));
        const approvedBytes = Buffer.alloc(sourceInfo.size);
        const readResult = await source.read(approvedBytes, 0, approvedBytes.length, 0);
        if (readResult.bytesRead !== sourceInfo.size) {
          approvedBytes.fill(0);
          throw new Error('The approved upload changed while it was staged.');
        }
        await writeFile(destination, approvedBytes, { flag: 'wx', mode: 0o600 });
        approvedBytes.fill(0);
        files.push(destination);
      } finally {
        await source.close();
      }
    }
    return { directory, files };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Keeps staged upload vaults alive briefly for the page to read, then deletes them. */
export class BrowserUploadVaults {
  readonly #directories = new Map<string, ReturnType<typeof setTimeout>>();

  retain(directory: string): void {
    const timeout = setTimeout(() => {
      this.#directories.delete(directory);
      void rm(directory, { recursive: true, force: true });
    }, BROWSER_UPLOAD_RETENTION_MS);
    timeout.unref();
    this.#directories.set(directory, timeout);
  }

  removeAll(): void {
    for (const [directory, timeout] of this.#directories) {
      clearTimeout(timeout);
      void rm(directory, { recursive: true, force: true });
    }
    this.#directories.clear();
  }
}
