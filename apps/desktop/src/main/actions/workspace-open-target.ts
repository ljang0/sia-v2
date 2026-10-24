import { lstat, realpath } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isSensitiveLocalPath } from '@sia/action-gateway';

const formats: Readonly<Record<string, ReadonlySet<string>>> = {
  'com.apple.TextEdit': new Set(['.txt', '.md', '.csv', '.tsv', '.json']),
  'com.apple.Preview': new Set(['.pdf', '.png', '.jpg', '.jpeg']),
};

/** Opens existing task documents; this is not an arbitrary URL, argv or shell grant. */
export async function workspaceOpenTarget(
  workspace: string,
  requested: string,
  application: string,
): Promise<string> {
  if (!requested || /[\x00-\x1f\\]/.test(requested) || /^[a-z][a-z0-9+.-]*:/i.test(requested))
    throw new Error('Use an ordinary document or folder path in the working folder.');
  const root = await realpath(workspace);
  const target = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
  const local = relative(root, target);
  if (local === '..' || local.startsWith('..' + sep) || isAbsolute(local))
    throw new Error('Only documents inside this task’s working folder can be opened.');
  if (
    isSensitiveLocalPath(target) ||
    local
      .split(sep)
      .some(
        (part) =>
          part.startsWith('.') ||
          /credential|password|secret|token|keychain|(?:^|[._ -])(?:auth|session|keys?)(?:[._ -]|$)/i.test(
            part,
          ),
      )
  )
    throw new Error('Hidden and credential-related paths cannot be opened.');
  let current = root;
  for (const part of local.split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error('Links cannot be used to open working-folder documents.');
  }
  if ((await realpath(target)) !== target)
    throw new Error('The document no longer matches its working-folder path.');
  const entry = await lstat(target);
  if (entry.isDirectory()) {
    if (
      application !== 'com.apple.finder' ||
      /\.(?:app|bundle|framework|plugin|scptd|workflow)$/i.test(target)
    )
      throw new Error('Ordinary working-folder directories can only be opened in Finder.');
  } else if (
    !entry.isFile() ||
    entry.nlink !== 1 ||
    !formats[application]?.has(extname(target).toLowerCase())
  ) {
    throw new Error('Choose a text document for TextEdit or a PDF/image for Preview.');
  }
  return target;
}
