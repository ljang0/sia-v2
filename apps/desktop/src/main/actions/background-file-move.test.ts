import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, symlink, link, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { ActionGateway, DefaultActionAuthorizationPolicy } from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { workspaceFileMover } from '../mac/workspace-file-move.js';

// The real compiled helper performs these filesystem operations. native:test builds
// it before the desktop suite; no synthetic move implementation stands in for it.
describe.skipIf(process.platform !== 'darwin')(
  'native workspace moves through the gateway',
  () => {
    let root: string;
    let gateway: ActionGateway;
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    const invoke = (name: string, args: Record<string, unknown>) =>
      gateway.invoke({
        name,
        arguments: args,
        context: {
          sessionId: 'files',
          threadId: 'files',
          turnId: 'move',
          provider: 'codex',
          workspace: root,
          backgroundOnly: true,
        },
      });
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'sia-native-files-'));
      gateway = new ActionGateway({
        backend: new DesktopActionBackend({
          cua: {
            call: async () => {
              throw new Error('File tools must not touch apps or clipboard.');
            },
          },
          workspaceFileMove: workspaceFileMover(resolve('build/native/SiaVoiceHelper')),
        }),
        policy: new DefaultActionAuthorizationPolicy({ trustLocalActions: () => true }),
      });
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });
    it('organizes nested documents with byte verification and useful listing revisions', async () => {
      await mkdir(join(root, 'Inbox'));
      const text = 'Project handoff — résumé ✓\n';
      await writeFile(join(root, 'Inbox', 'brief.md'), text);
      expect((await invoke('computer_list_files', {})).data).toMatchObject({
        directories: ['Inbox'],
      });
      const listing = await invoke('computer_list_files', { directory: 'Inbox' });
      expect(listing.data).toMatchObject({
        files: ['Inbox/brief.md'],
        file_details: [
          { name: 'Inbox/brief.md', bytes: Buffer.byteLength(text), sha256: digest(text) },
        ],
      });
      const moved = await invoke('computer_move_file', {
        source: 'Inbox/brief.md',
        destination: 'Review packet/Planning/brief.md',
        expected_sha256: digest(text),
      });
      expect(moved.outcome, JSON.stringify(moved)).toBe('verified');
      expect(moved.data).toMatchObject({
        name: 'Review packet/Planning/brief.md',
        sha256: digest(text),
      });
      expect(await readFile(join(root, 'Review packet/Planning/brief.md'), 'utf8')).toBe(text);
      expect((await invoke('computer_list_files', { directory: 'Inbox' })).data).toMatchObject({
        files: [],
      });
      expect(
        (await invoke('computer_read_file', { name: 'Review packet/Planning/brief.md' })).data,
      ).toMatchObject({ text });
      expect(
        (
          await invoke('computer_write_file', {
            name: 'Review packet/Planning/brief.md',
            text: 'Edited',
            expected_sha256: digest(text),
          })
        ).outcome,
      ).toBe('verified');
    });
    it('preserves stale revisions, existing destinations, and linked or sensitive targets', async () => {
      await writeFile(join(root, 'source.md'), 'newer');
      await writeFile(join(root, 'keep.md'), 'keep');
      await symlink(tmpdir(), join(root, 'outside'));
      await symlink(join(root, 'source.md'), join(root, 'linked.md'));
      await link(join(root, 'keep.md'), join(root, 'hard.md'));
      const cases = [
        { source: 'source.md', destination: 'new.md', expected_sha256: digest('stale') },
        { source: 'linked.md', destination: 'new.md', expected_sha256: digest('newer') },
        { source: 'hard.md', destination: 'new.md', expected_sha256: digest('keep') },
        ...[
          'keep.md',
          'outside/escape.md',
          '../escape.md',
          '/tmp/escape.md',
          '.hidden/file.md',
          'passwords/file.md',
          'session/file.md',
          'App.app/file.md',
        ].map((destination) => ({
          source: 'source.md',
          destination,
          expected_sha256: digest('newer'),
        })),
      ];
      for (const args of cases)
        expect((await invoke('computer_move_file', args)).outcome, JSON.stringify(args)).toBe(
          'refused',
        );
      expect(await readFile(join(root, 'source.md'), 'utf8')).toBe('newer');
      expect(await readFile(join(root, 'keep.md'), 'utf8')).toBe('keep');
      expect((await invoke('computer_list_files', { directory: 'outside' })).outcome).toBe(
        'refused',
      );
      expect((await invoke('computer_read_file', { name: 'outside/escape.md' })).outcome).toBe(
        'refused',
      );
      expect(
        (await invoke('computer_move_file', { source: 'source.md', destination: 'new.md' }))
          .outcome,
      ).toBe('refused');
    });
    it('serializes competing sources, destinations and revision-checked edits without losing data', async () => {
      await writeFile(join(root, 'source.md'), 'original');
      const moves = await Promise.all(
        ['one.md', 'two.md'].map((destination) =>
          invoke('computer_move_file', {
            source: 'source.md',
            destination,
            expected_sha256: digest('original'),
          }),
        ),
      );
      expect(moves.map((result) => result.outcome).sort()).toEqual(['refused', 'verified']);
      for (const name of ['left', 'right']) await writeFile(join(root, name + '.md'), name);
      const collision = await Promise.all(
        ['left', 'right'].map((name) =>
          invoke('computer_move_file', {
            source: name + '.md',
            destination: 'shared.md',
            expected_sha256: digest(name),
          }),
        ),
      );
      expect(collision.map((result) => result.outcome).sort()).toEqual(['refused', 'verified']);
      const winner = await readFile(join(root, 'shared.md'), 'utf8');
      const loser = winner === 'left' ? 'right' : 'left';
      expect(await readFile(join(root, loser + '.md'), 'utf8')).toBe(loser);
      const race = await Promise.all([
        invoke('computer_write_file', {
          name: 'shared.md',
          text: 'edited',
          expected_sha256: digest(winner),
        }),
        invoke('computer_move_file', {
          source: 'shared.md',
          destination: 'final.md',
          expected_sha256: digest(winner),
        }),
      ]);
      expect(race.map((result) => result.outcome).sort()).toEqual(['refused', 'verified']);
      const editWon = race[0]!.outcome === 'verified';
      expect(await readFile(join(root, editWon ? 'shared.md' : 'final.md'), 'utf8')).toBe(
        editWon ? 'edited' : winner,
      );
    });
  },
);
