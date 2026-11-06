import { constants } from 'node:fs';
import { lstat, open, readdir, realpath, type FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { workspaceOpenTarget } from './workspace-open-target.js';
import type { WorkspaceFileMove } from '../mac/workspace-file-move.js';
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
  /^[^./\\\x00-\x1f][^/\\\x00-\x1f]*\.(txt|md|csv|tsv|json|ics)$/i.test(name) &&
  !/(?:credential|token|secret|password|keychain|(?:^|[._ -])(?:auth|keys?)(?:[._ -]|$))/i.test(
    name,
  ) &&
  (/\.ics$/i.test(name) || !/(?:^|[._ -])session(?:[._ -]|$)/i.test(name));

function ordinaryPath(name: string, file = true): boolean {
  const parts = name.split('/');
  return (
    Buffer.byteLength(name) <= 1800 &&
    parts.length <= 10 &&
    parts.every(
      (part, index) =>
        part.length > 0 &&
        Buffer.byteLength(part) <= 180 &&
        !part.startsWith('.') &&
        !/[\\:\x00-\x1f\x7f]/.test(part) &&
        !/credential|token|secret|password|keychain|(?:^|[._ -])(?:auth|keys?)(?:[._ -]|$)/i.test(
          part,
        ) &&
        (file && index === parts.length - 1
          ? eligible(part)
          : !/(?:^|[._ -])session(?:[._ -]|$)|\.(?:app|bundle|framework|plugin|scptd|workflow)$/i.test(
              part,
            )),
    )
  );
}

// Reserve all affected names before awaiting other operations; acquiring them
// one at a time would deadlock opposite-direction moves.
async function locked<T>(paths: string[], operation: () => Promise<T>): Promise<T> {
  const previous = paths.map((path) => writes.get(path));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  for (const path of paths) writes.set(path, pending);
  try {
    await Promise.all(previous);
    return await operation();
  } finally {
    release();
    for (const path of paths) if (writes.get(path) === pending) writes.delete(path);
  }
}

/** Only the host-pinned workspace's ordinary data files. No model path grants. */
export async function workspaceFileAction(
  request: ValidatedActionInvocation,
  move?: WorkspaceFileMove,
): Promise<ActionExecutionResult> {
  request.context.signal?.throwIfAborted();
  const root = await realpath(request.context.workspace);
  if (request.name === 'computer_move_file') {
    const args = parseActionArguments('computer_move_file', request.arguments);
    if (!ordinaryPath(args.source) || !ordinaryPath(args.destination))
      throw new Error('Use ordinary relative workspace data-file paths.');
    if (!move) throw new Error('File moves are unavailable on this installation.');
    return locked([join(root, args.source), join(root, args.destination)], async () => {
      request.context.signal?.throwIfAborted();
      return move({ workspace: root, ...args }, request.context.signal);
    });
  }
  if (request.name === 'computer_list_files') {
    const { directory } = parseActionArguments('computer_list_files', request.arguments);
    if (directory && !ordinaryPath(directory, false))
      throw new Error('Use an ordinary relative workspace directory.');
    const folder = await workspaceOpenTarget(root, directory || '.', 'com.apple.finder');
    const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const files: string[] = [],
      directories: string[] = [];
    const details: { name: string; bytes: number; sha256: string }[] = [];
    for (const entry of entries.slice(0, 500)) {
      request.context.signal?.throwIfAborted();
      const name = directory ? directory + '/' + entry.name : entry.name;
      if (entry.isDirectory() && ordinaryPath(name, false)) {
        if (await workspaceOpenTarget(root, name, 'com.apple.finder').catch(() => undefined))
          directories.push(name);
      } else if (entry.isFile() && ordinaryPath(name)) {
        const path = join(root, name);
        await locked([path], async () => {
          const file = await open(
            path,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          ).catch(() => undefined);
          if (!file) return;
          try {
            const current = await readStable(file).catch(() => undefined);
            if (!current) return;
            files.push(name);
            details.push({
              name,
              bytes: current.content.length,
              sha256: sha256(current.content),
            });
          } finally {
            await file.close();
          }
        });
      }
    }
    return {
      outcome: 'verified',
      summary:
        'Listed ordinary workspace data files and subfolders; links and unsupported files are excluded.',
      data: {
        workspace: root,
        directory: directory || '.',
        files,
        directories,
        file_details: details,
        truncated: entries.length > 500,
      },
    };
  }
  const writing = request.name === 'computer_write_file';
  const args = writing
    ? parseActionArguments('computer_write_file', request.arguments)
    : parseActionArguments('computer_read_file', request.arguments);
  if (!ordinaryPath(args.name))
    throw new Error('This filename is not an ordinary workspace data file.');
  const parent = await workspaceOpenTarget(root, dirname(args.name), 'com.apple.finder');
  const path = join(parent, basename(args.name));
  const text = 'text' in args && typeof args.text === 'string' ? args.text : undefined;
  const expected = 'expected_sha256' in args ? args.expected_sha256 : undefined;
  if (text !== undefined && (Buffer.byteLength(text) > MAX_BYTES || text.includes('\0')))
    throw new Error('Use UTF-8 text of at most 256 KB.');
  return locked([path], async () => {
    let file: FileHandle | undefined;
    try {
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
      await file?.close();
    }
  });
}
