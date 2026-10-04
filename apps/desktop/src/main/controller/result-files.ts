import { lstat, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isSensitiveLocalPath } from '@sia/action-gateway';

export interface ResultFileIdentity {
  root: string;
  path: string;
  dev: number;
  ino: number;
}

// Results may be documents, data, or media. A model cannot turn an executable or credential
// path into an Open button. Arbitrary links in Markdown remain HTTPS-only.
const DOCUMENT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.json',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.rtf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.heic',
  '.mp3',
  '.wav',
  '.m4a',
  '.mp4',
  '.mov',
]);

export async function inspectResultFile(
  path: string,
  roots: readonly string[],
): Promise<ResultFileIdentity & { bytes: number }> {
  if (
    !isAbsolute(path) ||
    /[\x00-\x1f]/.test(path) ||
    !DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase()) ||
    isSensitiveLocalPath(path)
  )
    throw new Error('Only ordinary document and media results can be opened here.');
  const canonical = await realpath(path);
  if (isSensitiveLocalPath(canonical))
    throw new Error('Private configuration files cannot be opened as results.');
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > 25 * 1024 * 1024
  )
    throw new Error('Results must be regular files no larger than 25 MB.');
  for (const directory of roots) {
    const root = await realpath(directory).catch(() => undefined);
    if (!root) continue;
    const within = relative(resolve(directory), resolve(path));
    if (
      within &&
      within !== '..' &&
      !within.startsWith(`..${sep}`) &&
      !isAbsolute(within) &&
      canonical === join(root, within) &&
      !within.split(sep).some((part) => part.startsWith('.'))
    )
      return { root, path: canonical, dev: info.dev, ino: info.ino, bytes: info.size };
  }
  throw new Error(
    'Save the result in this conversation’s folder or SiaOutbox to open it here.',
  );
}

export async function verifyResultFile(identity: ResultFileIdentity): Promise<void> {
  const current = await inspectResultFile(identity.path, [identity.root]);
  if (current.dev !== identity.dev || current.ino !== identity.ino)
    throw new Error('This result was replaced. Ask Sia to check it again before opening it.');
}
