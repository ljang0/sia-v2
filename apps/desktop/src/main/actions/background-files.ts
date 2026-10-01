import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  parseActionArguments,
  type ActionExecutionResult,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';

const MAX_BYTES = 256 * 1024;
// Serialize Sia writes to the same path so concurrent turns cannot both accept
// the same revision. External edits are checked before writing and at readback.
const writes = new Map<string, Promise<void>>();
const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');

async function readStable(file: FileHandle) {
  const before = await file.stat();
  if (!before.isFile() || before.nlink !== 1 || before.size > MAX_BYTES)
    throw new Error('Only single-link regular text files up to 256 KB can be read.');
  const bytes = Buffer.alloc(MAX_BYTES + 1);
  const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
  const content = bytes.subarray(0, bytesRead);
  const after = await file.stat();
  if (
    bytesRead !== after.size ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  )
    throw new Error('The file changed while reading; read it again before using the result.');
  if (bytesRead > MAX_BYTES || content.includes(0))
    throw new Error('This is not a bounded text file.');
  return { content, text: new TextDecoder('utf-8', { fatal: true }).decode(content), after };
}
const eligible = (name: string) =>
  /^[^./\\\x00-\x1f][^/\\\x00-\x1f]*\.(txt|md|csv|tsv|json)$/i.test(name) &&
  !/(?:credential|token|secret|password|keychain|(?:^|[._ -])(?:auth|session|keys?)(?:[._ -]|$))/i.test(
    name,
  );

/** Only the host-pinned workspace's ordinary top-level data files. No model path grants. */
export async function workspaceFileAction(
  request: ValidatedActionInvocation,
): Promise<ActionExecutionResult> {
  request.context.signal?.throwIfAborted();
  const root = await realpath(request.context.workspace);
  if (request.name === 'computer_list_files') {
    const entries = await readdir(root, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && eligible(entry.name))
      .map((entry) => entry.name)
      .sort();
    const files: string[] = [];
    for (const name of candidates.slice(0, 500)) {
      request.context.signal?.throwIfAborted();
      const entry = await lstat(join(root, name)).catch(() => undefined);
      if (entry?.isFile() && entry.nlink === 1 && entry.size <= MAX_BYTES) files.push(name);
    }
    return {
      outcome: 'verified',
      summary: 'Listed workspace data files; subfolders and links are excluded.',
      data: { workspace: root, files, truncated: candidates.length > 500 },
    };
  }
  const writing = request.name === 'computer_write_file';
  const args = writing
    ? parseActionArguments('computer_write_file', request.arguments)
    : parseActionArguments('computer_read_file', request.arguments);
  if (!eligible(args.name))
    throw new Error('This filename is not an ordinary workspace data file.');
  const path = join(root, args.name);
  const text = 'text' in args && typeof args.text === 'string' ? args.text : undefined;
  const expected = 'expected_sha256' in args ? args.expected_sha256 : undefined;
  if (text !== undefined && (Buffer.byteLength(text) > MAX_BYTES || text.includes('\0')))
    throw new Error('Use UTF-8 text of at most 256 KB.');
  const previous = writes.get(path);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  if (writing) writes.set(path, pending);
  let file: FileHandle | undefined;
  try {
    await previous;
    request.context.signal?.throwIfAborted();
    // Do not truncate until the current file has been read and its revision checked.
    file = await open(
      path,
      constants.O_NOFOLLOW |
        constants.O_NONBLOCK |
        (writing
          ? constants.O_RDWR | (expected ? 0 : constants.O_CREAT | constants.O_EXCL)
          : constants.O_RDONLY),
      0o600,
    );
    const current = await readStable(file);
    if (expected && sha256(current.content) !== expected)
      throw new Error(
        'The file revision changed. Read it again and preserve the current edits.',
      );
    if (text !== undefined) {
      const named = await lstat(path);
      if (
        named.ino !== current.after.ino ||
        named.dev !== current.after.dev ||
        named.nlink !== 1
      )
        throw new Error('The file target changed. Read it again before editing.');
      request.context.signal?.throwIfAborted();
      const content = Buffer.from(text, 'utf8');
      let position = 0;
      while (position < content.length) {
        const { bytesWritten } = await file.write(
          content,
          position,
          content.length - position,
          position,
        );
        if (!bytesWritten)
          throw new Error(
            'The file write stopped before completion. Inspect the file before retrying.',
          );
        position += bytesWritten;
      }
      await file.truncate(content.length);
      await file.sync();
    }
    const { content, text: observed, after } = writing ? await readStable(file) : current;
    const named = await lstat(path);
    if (named.ino !== after.ino || named.dev !== after.dev || named.nlink !== 1)
      throw new Error('The file target changed. Inspect the current file before continuing.');
    if (text !== undefined && observed !== text)
      throw new Error('Saved content could not be verified.');
    return {
      outcome: 'verified',
      summary: writing
        ? `${expected ? 'Updated' : 'Created'} the report and verified its complete content from disk.`
        : 'Read the complete workspace file.',
      data: {
        path,
        name: args.name,
        text: observed,
        bytes: content.length,
        sha256: sha256(content),
      },
    };
  } finally {
    try {
      await file?.close();
    } finally {
      release?.();
      if (writes.get(path) === pending) writes.delete(path);
    }
  }
}
