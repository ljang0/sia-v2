import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const STALL_TIMEOUT_MS = 2 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 45 * 60_000;

/** The fixed, integrity-pinned archive may take several minutes on a slow connection. */
export async function downloadCodexArchive(
  release: { url: string; integrity: string },
  archive: string,
  download: typeof fetch,
  onProgress?: (message: string) => void,
): Promise<void> {
  const abort = new AbortController();
  const stalled = () =>
    abort.abort(
      new Error('The Codex download stopped responding. Check your connection and try again.'),
    );
  let idleTimer = setTimeout(stalled, STALL_TIMEOUT_MS);
  const deadline = setTimeout(
    () =>
      abort.abort(
        new Error('The Codex download took too long. Check your connection and try again.'),
      ),
    DOWNLOAD_TIMEOUT_MS,
  );
  try {
    const response = await download(release.url, {
      redirect: 'error',
      credentials: 'omit',
      signal: abort.signal,
    });
    if (!response.ok || !response.body) throw new Error('Codex download failed. Try again.');
    const length = Number(response.headers.get('content-length'));
    const total = Number.isSafeInteger(length) && length > 0 ? length : undefined;
    if (total && total > MAX_ARCHIVE_BYTES)
      throw new Error('Codex download exceeded its size limit.');
    const file = await open(archive, 'wx', 0o600);
    const hash = createHash('sha512');
    let bytes = 0;
    let displayedMB = -1;
    try {
      for await (const chunk of response.body) {
        abort.signal.throwIfAborted();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(stalled, STALL_TIMEOUT_MS);
        bytes += chunk.byteLength;
        if (bytes > MAX_ARCHIVE_BYTES)
          throw new Error('Codex download exceeded its size limit.');
        hash.update(chunk);
        await file.writeFile(chunk);
        const megabytes = Math.floor(bytes / 1_000_000);
        if (megabytes !== displayedMB) {
          displayedMB = megabytes;
          onProgress?.(
            `Downloading Codex… ${megabytes} MB${total ? ` of ${Math.ceil(total / 1_000_000)} MB` : ''}.`,
          );
        }
      }
    } finally {
      await file.close();
    }
    abort.signal.throwIfAborted();
    if (hash.digest('base64') !== release.integrity)
      throw new Error('Codex download could not be verified. Try again.');
  } catch (error) {
    if (abort.signal.aborted) throw abort.signal.reason;
    throw error;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(deadline);
  }
}
