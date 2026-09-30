import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import type { TimelineItemView, TurnChangesView } from '../shared/bridge.js';
import {
  onlyMoved,
  reversibleFileChange,
  type RecordedFileChange,
} from '../shared/turn-changes.js';

/**
 * Undo and redo for the files one reply changed.
 *
 * Codex reports every file it edits with `apply_patch` as a `fileChange` item: an added file's
 * content, a deleted file's content, or the edit's line diff. Those items are stored with the
 * thread, so each reply already carries a complete record of what it did to files; no copy of
 * the folder is taken. Undo plays that record backwards and redo plays it forwards, and both
 * refuse unless every file still matches exactly, so an edit made since is never overwritten.
 * Commands the model ran in a shell are not recorded this way and cannot be undone here.
 */

const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Places under the home folder Sia never writes to, whatever the record says. */
const PROTECTED_HOME_PATHS = ['.ssh', '.gnupg', join('Library', 'Keychains')];

export interface TurnChangeScope {
  /** The thread's folder; relative paths resolve here. */
  workspace: string;
  /** The person's home folder. Use my Mac edits land anywhere under it. */
  home: string;
}

interface Hunk {
  oldStart: number;
  newStart: number;
  oldLines: string[];
  newLines: string[];
  oldMissingNewline: boolean;
  newMissingNewline: boolean;
}

type FileOperation =
  | { kind: 'add'; path: string; content: string }
  | { kind: 'delete'; path: string; content: string }
  | { kind: 'update'; path: string; movePath?: string; hunks: Hunk[] };

/**
 * The file changes of the reply that `eventId` belongs to: every completed file change between
 * the person's message before it and their next message, oldest first.
 */
export function turnFileChanges(
  timeline: readonly TimelineItemView[],
  threadId: string,
  eventId: string,
): RecordedFileChange[] | undefined {
  const items = timeline
    .filter(
      (item) =>
        item.threadId === threadId && !(item.kind === 'user' && item.status === 'pending'),
    )
    .sort((left, right) => left.sequence - right.sequence);
  const index = items.findIndex((item) => item.id === eventId);
  if (index < 0) return undefined;
  const start = items.findLastIndex(
    (item, position) => position <= index && item.kind === 'user',
  );
  const next = items.findIndex((item, position) => position > index && item.kind === 'user');
  return items
    .slice(start + 1, next < 0 ? undefined : next)
    .flatMap((item) =>
      item.kind === 'activity' &&
      item.status === 'complete' &&
      item.activity?.kind === 'file_change'
        ? item.activity.files
        : [],
    );
}

/** Where the reply's files stand now, and whether undo or redo is safe. */
export async function readTurnChanges(
  changes: readonly RecordedFileChange[],
  scope: TurnChangeScope,
): Promise<TurnChangesView> {
  const plan = await planTurnChanges(changes, scope);
  if ('state' in plan) return plan;
  const undo = await simulate(plan.operations, 'undo', plan.read);
  if (!undo.blocked.length) return { state: 'ready', files: plan.files, blocked: [] };
  const redo = await simulate(plan.operations, 'redo', plan.read);
  if (!redo.blocked.length) return { state: 'undone', files: plan.files, blocked: [] };
  return {
    state: 'changed',
    files: plan.files,
    blocked: undo.blocked.map((path) => displayPath(path, scope)),
  };
}

/** Puts the reply's files back (undo) or brings its changes back (redo), all or nothing. */
export async function applyTurnChanges(
  changes: readonly RecordedFileChange[],
  scope: TurnChangeScope,
  direction: 'undo' | 'redo',
): Promise<TurnChangesView> {
  const plan = await planTurnChanges(changes, scope);
  if ('state' in plan) return plan;
  const result = await simulate(plan.operations, direction, plan.read);
  if (result.blocked.length) {
    const current = await readTurnChanges(changes, scope);
    // Already where the person wants it: nothing to write.
    if (current.state === (direction === 'undo' ? 'undone' : 'ready')) return current;
    throw new Error(
      direction === 'undo'
        ? 'Some files changed after this reply, so Sia left them as they are.'
        : 'Some files changed after the undo, so Sia left them as they are.',
    );
  }
  const written: Array<{ path: string; previous: string | null }> = [];
  try {
    for (const [path, content] of result.writes) {
      const previous = await plan.read(path);
      if (previous === content) continue;
      await writeSafely(path, content, scope);
      written.push({ path, previous });
    }
  } catch (cause) {
    // Put back what this attempt already wrote, so a failure never leaves half a reply undone.
    for (const { path, previous } of written.reverse()) {
      await writeSafely(path, previous, scope).catch(() => undefined);
    }
    throw new Error('Sia could not put these files back. Nothing was changed.', { cause });
  }
  return {
    state: direction === 'undo' ? 'undone' : 'ready',
    files: plan.files,
    blocked: [],
  };
}

async function planTurnChanges(
  changes: readonly RecordedFileChange[],
  scope: TurnChangeScope,
): Promise<
  | TurnChangesView
  | {
      operations: FileOperation[];
      files: TurnChangesView['files'];
      read(path: string): Promise<string | null>;
    }
> {
  if (!changes.length) return { state: 'unavailable', files: [], blocked: [] };
  const operations: FileOperation[] = [];
  const files = new Map<string, TurnChangesView['files'][number]>();
  const blocked = new Set<string>();
  for (const change of changes) {
    const path = await safePath(change.path, scope);
    const movePath = change.movePath ? await safePath(change.movePath, scope) : undefined;
    const shown = displayPath(change.movePath ?? change.path, scope);
    if (!path || (change.movePath && !movePath) || !reversibleFileChange(change)) {
      blocked.add(shown);
      continue;
    }
    const operation = fileOperation(change, path, movePath);
    if (!operation) {
      blocked.add(shown);
      continue;
    }
    operations.push(operation);
    const key = movePath ?? path;
    const previous = files.get(key);
    files.set(key, {
      path: shown,
      change: previous?.change === 'added' ? 'added' : fileChangeWord(change.change),
    });
  }
  if (blocked.size) {
    return { state: 'unavailable', files: [...files.values()], blocked: [...blocked] };
  }
  const cache = new Map<string, Promise<string | null>>();
  return {
    operations,
    files: [...files.values()],
    read: (path) => {
      let pending = cache.get(path);
      if (!pending) {
        pending = readText(path);
        cache.set(path, pending);
      }
      return pending;
    },
  };
}

function fileOperation(
  change: RecordedFileChange,
  path: string,
  movePath: string | undefined,
): FileOperation | undefined {
  if (change.change === 'add') {
    const diff = change.diff ?? '';
    // Older builds sent an added file as a diff against nothing.
    const hunks = diff.startsWith('@@ ') ? parseUnifiedDiff(diff) : undefined;
    const content =
      hunks && hunks.every((hunk) => !hunk.oldLines.length)
        ? joinLines(
            hunks.flatMap((hunk) => hunk.newLines),
            !hunks.at(-1)?.newMissingNewline,
          )
        : diff;
    return { kind: 'add', path, content };
  }
  if (change.change === 'delete') return { kind: 'delete', path, content: change.diff ?? '' };
  if (change.change === 'rename' && movePath && onlyMoved(change.diff)) {
    return { kind: 'update', path, movePath, hunks: [] };
  }
  const hunks = parseUnifiedDiff(change.diff ?? '');
  if (!hunks) return undefined;
  return { kind: 'update', path, ...(movePath ? { movePath } : {}), hunks };
}

function fileChangeWord(change: string): TurnChangesView['files'][number]['change'] {
  if (change === 'add') return 'added';
  if (change === 'delete') return 'deleted';
  if (change === 'rename') return 'renamed';
  return 'edited';
}

/**
 * Plays the operations backwards (undo) or forwards (redo) against the files as they are now.
 * Every step checks the file holds exactly what the step expects; a file that does not is
 * blocked, and nothing is written unless no file is.
 */
async function simulate(
  operations: readonly FileOperation[],
  direction: 'undo' | 'redo',
  read: (path: string) => Promise<string | null>,
): Promise<{ writes: Map<string, string | null>; blocked: string[] }> {
  const writes = new Map<string, string | null>();
  const blocked = new Set<string>();
  const current = async (path: string) => (writes.has(path) ? writes.get(path)! : read(path));
  const block = (...paths: Array<string | undefined>) => {
    for (const path of paths) if (path) blocked.add(path);
  };
  const ordered = direction === 'undo' ? [...operations].reverse() : operations;
  for (const operation of ordered) {
    const touched = [
      operation.path,
      operation.kind === 'update' ? operation.movePath : undefined,
    ];
    if (touched.some((path) => path && blocked.has(path))) {
      block(...touched);
      continue;
    }
    if (operation.kind === 'add' || operation.kind === 'delete') {
      const present = operation.kind === 'add' ? direction === 'undo' : direction === 'redo';
      const content = await current(operation.path);
      if (present ? content !== operation.content : content !== null) {
        block(operation.path);
        continue;
      }
      writes.set(operation.path, present ? null : operation.content);
      continue;
    }
    const from = direction === 'undo' ? (operation.movePath ?? operation.path) : operation.path;
    const to = direction === 'undo' ? operation.path : (operation.movePath ?? operation.path);
    const content = await current(from);
    const next =
      content === null ? undefined : applyHunks(content, operation.hunks, direction === 'undo');
    if (next === undefined || (from !== to && (await current(to)) !== null)) {
      block(operation.path, operation.movePath);
      continue;
    }
    if (from !== to) writes.set(from, null);
    writes.set(to, next);
  }
  return { writes, blocked: [...blocked] };
}

/** Parses `@@` hunks; any header before them (`---`, `+++`) and notes after are ignored. */
export function parseUnifiedDiff(diff: string): Hunk[] | undefined {
  const lines = diff.split('\n');
  const hunks: Hunk[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index]!);
    index += 1;
    if (!header) continue;
    const oldCount = header[2] === undefined ? 1 : Number(header[2]);
    const newCount = header[4] === undefined ? 1 : Number(header[4]);
    const hunk: Hunk = {
      oldStart: Number(header[1]),
      newStart: Number(header[3]),
      oldLines: [],
      newLines: [],
      oldMissingNewline: false,
      newMissingNewline: false,
    };
    let last = ' ';
    const marker = () => {
      while (lines[index]?.startsWith('\\')) {
        if (last !== '+') hunk.oldMissingNewline = true;
        if (last !== '-') hunk.newMissingNewline = true;
        index += 1;
      }
    };
    while (hunk.oldLines.length < oldCount || hunk.newLines.length < newCount) {
      const line = lines[index];
      if (line === undefined) return undefined;
      const sign = line[0] ?? ' ';
      const text = line.slice(1);
      if (sign === ' ') {
        hunk.oldLines.push(text);
        hunk.newLines.push(text);
      } else if (sign === '-') hunk.oldLines.push(text);
      else if (sign === '+') hunk.newLines.push(text);
      else return undefined;
      last = sign;
      index += 1;
      marker();
    }
    if (hunk.oldLines.length !== oldCount || hunk.newLines.length !== newCount)
      return undefined;
    hunks.push(hunk);
  }
  return hunks.length ? hunks : undefined;
}

/**
 * Applies hunks exactly (no fuzz). Each hunk must match at its recorded line, or at the nearest
 * exact match after the previous hunk; otherwise the file has changed and nothing is applied.
 */
export function applyHunks(
  content: string,
  hunks: readonly Hunk[],
  reverse: boolean,
): string | undefined {
  const { lines, trailingNewline } = splitLines(content);
  const result: string[] = [];
  let cursor = 0;
  let offset = 0;
  let endsWithNewline = trailingNewline;
  for (const hunk of hunks) {
    const from = reverse ? hunk.newLines : hunk.oldLines;
    const to = reverse ? hunk.oldLines : hunk.newLines;
    const fromStart = reverse ? hunk.newStart : hunk.oldStart;
    const fromMissingNewline = reverse ? hunk.newMissingNewline : hunk.oldMissingNewline;
    const toMissingNewline = reverse ? hunk.oldMissingNewline : hunk.newMissingNewline;
    const expected = Math.max(cursor, (from.length ? fromStart - 1 : fromStart) + offset);
    const position = findLines(lines, from, expected, cursor);
    if (position === undefined) return undefined;
    const reachesEnd = position + from.length === lines.length;
    if (from.length && reachesEnd && fromMissingNewline === trailingNewline) return undefined;
    if (!reachesEnd && fromMissingNewline) return undefined;
    result.push(...lines.slice(cursor, position), ...to);
    cursor = position + from.length;
    offset = position - (from.length ? fromStart - 1 : fromStart);
    if (reachesEnd) endsWithNewline = !toMissingNewline;
  }
  result.push(...lines.slice(cursor));
  return joinLines(result, endsWithNewline);
}

function findLines(
  lines: readonly string[],
  target: readonly string[],
  expected: number,
  minimum: number,
): number | undefined {
  const matches = (at: number) =>
    at >= minimum &&
    at + target.length <= lines.length &&
    target.every((line, index) => lines[at + index] === line);
  if (!target.length) return expected <= lines.length ? expected : undefined;
  for (let distance = 0; distance <= lines.length; distance += 1) {
    if (matches(expected + distance)) return expected + distance;
    if (distance && matches(expected - distance)) return expected - distance;
  }
  return undefined;
}

function splitLines(content: string): { lines: string[]; trailingNewline: boolean } {
  if (!content) return { lines: [], trailingNewline: true };
  const trailingNewline = content.endsWith('\n');
  const lines = content.split('\n');
  if (trailingNewline) lines.pop();
  return { lines, trailingNewline };
}

function joinLines(lines: readonly string[], trailingNewline: boolean): string {
  if (!lines.length) return '';
  return `${lines.join('\n')}${trailingNewline ? '\n' : ''}`;
}

/**
 * Resolves a recorded path and returns it only when Sia may write there: inside the thread's
 * folder or the home folder, never through a symlink out of them, never into a protected place.
 */
async function safePath(path: string, scope: TurnChangeScope): Promise<string | undefined> {
  const absolute = resolve(scope.workspace, path);
  const roots = await allowedRoots(scope);
  const within = (candidate: string, root: string) => {
    const child = relative(root, candidate);
    return !child || (!child.startsWith('..') && !isAbsolute(child));
  };
  if (!roots.some(({ root }) => within(absolute, root))) return undefined;
  if (absolute.split(sep).includes('.git')) return undefined;
  for (const { root, home: isHome } of roots) {
    if (!isHome || !within(absolute, root)) continue;
    if (
      PROTECTED_HOME_PATHS.some((protectedPath) => within(absolute, join(root, protectedPath)))
    )
      return undefined;
  }
  // The nearest existing folder must resolve inside the same places, so a symlinked folder
  // cannot lead a write somewhere else.
  let ancestor = dirname(absolute);
  for (;;) {
    const real = await realpath(ancestor).catch(() => undefined);
    if (real) {
      if (!roots.some(({ root }) => within(real, root))) return undefined;
      break;
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) return undefined;
    ancestor = parent;
  }
  return absolute;
}

async function allowedRoots(
  scope: TurnChangeScope,
): Promise<Array<{ root: string; home: boolean }>> {
  const roots: Array<{ root: string; home: boolean }> = [];
  for (const [root, home] of [
    [scope.workspace, false],
    [scope.home, true],
  ] as const) {
    if (!root || !isAbsolute(root)) continue;
    roots.push({ root: resolve(root), home });
    const real = await realpath(root).catch(() => undefined);
    if (real && real !== resolve(root)) roots.push({ root: real, home });
  }
  return roots;
}

async function readText(path: string): Promise<string | null> {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!info) return null;
  if (!info.isFile() || info.size > MAX_FILE_BYTES) {
    // Not a plain text file Sia can compare; treat it as changed so nothing is written.
    return `\u0000unreadable:${path}`;
  }
  const bytes = await readFile(path);
  const text = bytes.toString('utf8');
  return Buffer.from(text, 'utf8').equals(bytes) ? text : `\u0000unreadable:${path}`;
}

async function writeSafely(
  path: string,
  content: string | null,
  scope: TurnChangeScope,
): Promise<void> {
  if (!(await safePath(path, scope)))
    throw new Error('This file is outside what Sia may change.');
  const info = await lstat(path).catch(() => undefined);
  if (info && !info.isFile()) throw new Error('Only plain files can be put back.');
  if (content === null) {
    if (info) await rm(path);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  // Write beside the file and swap it in, so the file is never left half written.
  const temporary = join(dirname(path), `.${basename(path)}.sia-${randomUUID()}`);
  try {
    await writeFile(temporary, content, { mode: info ? info.mode & 0o777 : 0o644, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** A path the person recognizes: inside the thread's folder, else from the home folder. */
function displayPath(path: string, scope: TurnChangeScope): string {
  const absolute = resolve(scope.workspace, path);
  const inWorkspace = relative(scope.workspace, absolute);
  if (inWorkspace && !inWorkspace.startsWith('..') && !isAbsolute(inWorkspace)) {
    return inWorkspace;
  }
  const inHome = relative(scope.home, absolute);
  if (scope.home && inHome && !inHome.startsWith('..') && !isAbsolute(inHome)) {
    return `~/${inHome}`;
  }
  return absolute;
}
