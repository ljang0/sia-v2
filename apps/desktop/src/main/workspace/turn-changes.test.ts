import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TimelineItemView } from '../../shared/bridge.js';
import {
  applyHunks,
  applyTurnChanges,
  parseUnifiedDiff,
  readTurnChanges,
  turnFileChanges,
  type TurnChangeScope,
} from './turn-changes.js';

let root: string;
let scope: TurnChangeScope;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sia-turn-changes-'));
  await mkdir(join(root, 'home', 'Notes'), { recursive: true });
  scope = { workspace: join(root, 'home', 'Notes'), home: join(root, 'home') };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const file = (name: string) => join(scope.workspace, name);
const read = (name: string) => readFile(file(name), 'utf8');

// The shape Codex's apply_patch reports for an edit: `similar` hunks with one line of context.
const tripEdit = {
  path: '',
  change: 'update',
  diff: '@@ -1,3 +1,3 @@\n # Trip\n-Fly Friday\n+Fly Thursday\n Hotel booked\n',
};

describe('turn file changes', () => {
  it('undoes an edit, then redoes it, checking the disk each time', async () => {
    await writeFile(file('trip.md'), '# Trip\nFly Thursday\nHotel booked\n');
    const changes = [{ ...tripEdit, path: file('trip.md') }];

    await expect(readTurnChanges(changes, scope)).resolves.toEqual({
      state: 'ready',
      files: [{ path: 'trip.md', change: 'edited' }],
      blocked: [],
    });
    await expect(applyTurnChanges(changes, scope, 'undo')).resolves.toMatchObject({
      state: 'undone',
    });
    expect(await read('trip.md')).toBe('# Trip\nFly Friday\nHotel booked\n');
    await expect(readTurnChanges(changes, scope)).resolves.toMatchObject({ state: 'undone' });

    await expect(applyTurnChanges(changes, scope, 'redo')).resolves.toMatchObject({
      state: 'ready',
    });
    expect(await read('trip.md')).toBe('# Trip\nFly Thursday\nHotel booked\n');
  });

  it('removes a file the reply added and brings back one it deleted', async () => {
    await writeFile(file('packing.md'), 'socks\n');
    const changes = [
      { path: file('packing.md'), change: 'add', diff: 'socks\n' },
      { path: file('old.md'), change: 'delete', diff: 'old list\n' },
    ];

    await applyTurnChanges(changes, scope, 'undo');
    await expect(stat(file('packing.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await read('old.md')).toBe('old list\n');

    await applyTurnChanges(changes, scope, 'redo');
    expect(await read('packing.md')).toBe('socks\n');
    await expect(stat(file('old.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('moves a renamed file back with its edit, using paths relative to the folder', async () => {
    await writeFile(file('final.md'), 'b\n');
    const changes = [
      {
        path: 'draft.md',
        change: 'rename',
        movePath: 'final.md',
        diff: '@@ -1 +1 @@\n-a\n+b\n\n\nMoved to: final.md',
      },
    ];

    await expect(readTurnChanges(changes, scope)).resolves.toMatchObject({
      state: 'ready',
      files: [{ path: 'final.md', change: 'renamed' }],
    });
    await applyTurnChanges(changes, scope, 'undo');
    expect(await read('draft.md')).toBe('a\n');
    await expect(stat(file('final.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('plays several edits to one file backwards in order', async () => {
    await writeFile(file('list.md'), 'one\nTWO\nthree\nfour!\n');
    const changes = [
      {
        path: file('list.md'),
        change: 'update',
        diff: '@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n',
      },
      {
        path: file('list.md'),
        change: 'update',
        diff: '@@ -3,2 +3,2 @@\n three\n-four\n+four!\n',
      },
    ];

    await expect(readTurnChanges(changes, scope)).resolves.toMatchObject({
      files: [{ path: 'list.md', change: 'edited' }],
    });
    await applyTurnChanges(changes, scope, 'undo');
    expect(await read('list.md')).toBe('one\ntwo\nthree\nfour\n');
  });

  it('refuses when a file was edited after the reply, and writes nothing', async () => {
    await writeFile(file('trip.md'), '# Trip\nFly Saturday\nHotel booked\n');
    await writeFile(file('packing.md'), 'socks\n');
    const changes = [
      { path: file('packing.md'), change: 'add', diff: 'socks\n' },
      { ...tripEdit, path: file('trip.md') },
    ];

    await expect(readTurnChanges(changes, scope)).resolves.toEqual({
      state: 'changed',
      files: [
        { path: 'packing.md', change: 'added' },
        { path: 'trip.md', change: 'edited' },
      ],
      blocked: ['trip.md'],
    });
    await expect(applyTurnChanges(changes, scope, 'undo')).rejects.toThrow(
      'Some files changed after this reply',
    );
    expect(await read('packing.md')).toBe('socks\n');
  });

  it('never writes outside the folder, home, or through a symlink', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sia-outside-'));
    try {
      await writeFile(join(outside, 'x.md'), 'b\n');
      const diff = '@@ -1 +1 @@\n-a\n+b\n';
      await expect(
        readTurnChanges([{ path: join(outside, 'x.md'), change: 'update', diff }], scope),
      ).resolves.toMatchObject({ state: 'unavailable' });

      await symlink(outside, file('link'));
      await expect(
        readTurnChanges([{ path: file('link/x.md'), change: 'update', diff }], scope),
      ).resolves.toMatchObject({ state: 'unavailable' });

      await mkdir(join(scope.home, '.ssh'));
      await writeFile(join(scope.home, '.ssh', 'config'), 'b\n');
      await expect(
        readTurnChanges(
          [{ path: join(scope.home, '.ssh', 'config'), change: 'update', diff }],
          scope,
        ),
      ).resolves.toMatchObject({ state: 'unavailable', blocked: ['~/.ssh/config'] });
      expect(await readFile(join(outside, 'x.md'), 'utf8')).toBe('b\n');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('offers nothing when the record is incomplete', async () => {
    await expect(readTurnChanges([], scope)).resolves.toMatchObject({ state: 'unavailable' });
    await expect(
      readTurnChanges([{ path: file('gone.md'), change: 'delete' }], scope),
    ).resolves.toMatchObject({ state: 'unavailable', blocked: ['gone.md'] });
  });
});

describe('hunks', () => {
  it('keeps a missing final newline', () => {
    const hunks = parseUnifiedDiff(
      '@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n',
    )!;
    expect(applyHunks('a\nc', hunks, true)).toBe('a\nb');
    expect(applyHunks('a\nb', hunks, false)).toBe('a\nc');
    expect(applyHunks('a\nb\n', hunks, false)).toBeUndefined();
  });

  it('finds a hunk that moved, but never applies one that does not match', () => {
    const hunks = parseUnifiedDiff('@@ -2,2 +2,2 @@\n x\n-y\n+z\n')!;
    expect(applyHunks('new\nfirst\nx\ny\n', hunks, false)).toBe('new\nfirst\nx\nz\n');
    expect(applyHunks('first\nx\nq\n', hunks, false)).toBeUndefined();
  });
});

describe('turnFileChanges', () => {
  const item = (
    id: string,
    sequence: number,
    kind: TimelineItemView['kind'],
    extra: Partial<TimelineItemView> = {},
  ): TimelineItemView => ({
    id,
    threadId: 'thread',
    sequence,
    kind,
    timestamp: '2026-09-30T00:00:00.000Z',
    ...extra,
  });
  const change = (path: string, status: TimelineItemView['status'] = 'complete') => ({
    status,
    activity: { kind: 'file_change' as const, files: [{ path, change: 'add', diff: '' }] },
  });

  it('collects the completed changes between two messages from the person', () => {
    const timeline = [
      item('u1', 1, 'user'),
      item('a1', 2, 'activity', change('first.md')),
      item('u2', 3, 'user'),
      item('a2', 4, 'activity', change('second.md')),
      item('a3', 5, 'activity', change('failed.md', 'failed')),
      item('r2', 6, 'assistant'),
      item('q', 7, 'user', { status: 'pending' }),
      item('a4', 8, 'activity', change('third.md')),
      item('u3', 9, 'user'),
    ];
    expect(turnFileChanges(timeline, 'thread', 'r2')?.map(({ path }) => path)).toEqual([
      'second.md',
      'third.md',
    ]);
    expect(turnFileChanges(timeline, 'thread', 'a1')?.map(({ path }) => path)).toEqual([
      'first.md',
    ]);
    expect(turnFileChanges(timeline, 'other', 'a1')).toBeUndefined();
  });
});
