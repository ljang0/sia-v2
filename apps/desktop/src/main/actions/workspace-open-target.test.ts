import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { workspaceOpenTarget } from './workspace-open-target.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'sia-document-open-')));
  roots.push(root);
  const workspace = join(root, 'work');
  await mkdir(workspace);
  await mkdir(join(workspace, 'Notes'));
  await writeFile(join(workspace, 'Notes', 'meeting.txt'), 'Thursday at 2');
  await writeFile(join(workspace, 'calendar.pdf'), 'disposable PDF fixture');
  await writeFile(join(root, 'outside.txt'), 'not in the working folder');
  return { root, workspace };
}

it('opens only existing ordinary documents in their matching app and working-folder directories', async () => {
  const { workspace } = await fixture();
  expect(await workspaceOpenTarget(workspace, 'Notes/meeting.txt', 'com.apple.TextEdit')).toBe(
    join(workspace, 'Notes', 'meeting.txt'),
  );
  expect(await workspaceOpenTarget(workspace, 'calendar.pdf', 'com.apple.Preview')).toBe(
    join(workspace, 'calendar.pdf'),
  );
  expect(await workspaceOpenTarget(workspace, workspace, 'com.apple.finder')).toBe(workspace);
  await expect(
    workspaceOpenTarget(workspace, 'calendar.pdf', 'com.apple.TextEdit'),
  ).rejects.toThrow();
  await expect(workspaceOpenTarget(workspace, 'Notes', 'com.apple.TextEdit')).rejects.toThrow();
  await expect(
    workspaceOpenTarget(workspace, 'missing.txt', 'com.apple.TextEdit'),
  ).rejects.toThrow();
});

it('rejects outside paths, URLs, credential files, executable bundles and both kinds of links', async () => {
  const { root, workspace } = await fixture();
  await symlink(join(root, 'outside.txt'), join(workspace, 'linked.txt'));
  await symlink(join(root), join(workspace, 'linked-folder'));
  await link(join(workspace, 'Notes', 'meeting.txt'), join(workspace, 'hardlink.txt'));
  await writeFile(join(workspace, 'passwords.txt'), 'private');
  await writeFile(join(workspace, 'session.json'), '{}');
  await writeFile(join(workspace, '.hidden.txt'), 'hidden');
  await mkdir(join(workspace, 'Runnable.app'));
  for (const candidate of [
    '../outside.txt',
    join(root, 'outside.txt'),
    'file:///tmp/outside.txt',
    'https://example.com',
    'linked.txt',
    'linked-folder/outside.txt',
    'hardlink.txt',
    'passwords.txt',
    'session.json',
    '.hidden.txt',
    'Notes\\meeting.txt',
    'Notes/meeting.txt\n',
  ])
    await expect(
      workspaceOpenTarget(workspace, candidate, 'com.apple.TextEdit'),
    ).rejects.toThrow();
  await expect(
    workspaceOpenTarget(workspace, 'Runnable.app', 'com.apple.finder'),
  ).rejects.toThrow();
});
