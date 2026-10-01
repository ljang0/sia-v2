import { chmod, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkspaceGitService } from './git-service.js';
import { git, gitExecutable, removeTemporaryRoots, repositoryFixture } from './test-support.js';

afterEach(removeTemporaryRoots);

describe('WorkspaceGitService', () => {
  it('reports robust status and bounded unified diffs from a repository subdirectory', async () => {
    const { root, service } = await repositoryFixture();
    const nested = join(root, 'nested');
    await mkdir(nested);
    await writeFile(join(root, 'tracked.txt'), 'changed line\n');
    await writeFile(join(root, 'new file.txt'), 'new\n');

    const status = await service.status(nested);

    expect(status.workspace).toBe(nested);
    expect(status.repositoryRoot).toBe(root);
    expect(status.detached).toBe(false);
    expect(status.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'tracked.txt',
          staged: false,
          unstaged: true,
          untracked: false,
        }),
        expect.objectContaining({
          path: 'new file.txt',
          untracked: true,
        }),
      ]),
    );
    const diff = await service.diff(nested, { paths: ['tracked.txt'], contextLines: 1 });
    expect(diff).toMatchObject({ repositoryRoot: root, staged: false, truncated: false });
    expect(diff.text).toContain('-first line');
    expect(diff.text).toContain('+changed line');
  });

  it('stages selected canonical paths and treats option-looking names as paths', async () => {
    const { root, service } = await repositoryFixture();
    await writeFile(join(root, '--option-looking.txt'), 'changed safely\n');
    await writeFile(join(root, 'new file.txt'), 'new\n');

    const status = await service.stage(root, ['--option-looking.txt', 'new file.txt']);

    expect(status.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '--option-looking.txt', staged: true }),
        expect.objectContaining({ path: 'new file.txt', staged: true, untracked: false }),
      ]),
    );
    const stagedDiff = await service.diff(root, { staged: true });
    expect(stagedDiff.text).toContain('changed safely');
    expect(stagedDiff.text).toContain('new file.txt');
  });

  it('rejects escaping paths and restores tracked paths without touching untracked files', async () => {
    const { root, service } = await repositoryFixture();
    await writeFile(join(root, 'tracked.txt'), 'discard me\n');
    await writeFile(join(root, 'untracked.txt'), 'keep me\n');

    await expect(service.stage(root, ['../outside.txt'])).rejects.toMatchObject({
      code: 'invalid_path',
    });
    await expect(service.restoreTracked(root, ['untracked.txt'])).rejects.toMatchObject({
      code: 'path_not_tracked',
    });

    const status = await service.restoreTracked(root, ['tracked.txt']);
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('first line\n');
    expect(await readFile(join(root, 'untracked.txt'), 'utf8')).toBe('keep me\n');
    expect(status.files).toEqual([
      expect.objectContaining({ path: 'untracked.txt', untracked: true }),
    ]);
  });

  it('creates a detached worktree only beneath its injected private root', async () => {
    const { root, worktrees, service } = await repositoryFixture();

    const created = await service.createDetachedWorktree(root, { revision: 'HEAD' });

    const privateRoot = await realpath(worktrees);
    expect(relative(privateRoot, created.path)).toMatch(/^worktree-[0-9a-f-]+$/);
    expect(relative(privateRoot, created.path)).not.toMatch(/^\.\./);
    expect(created.commit).toMatch(/^[0-9a-f]{40}$/);
    expect((await stat(worktrees)).mode & 0o077).toBe(0);
    expect(await readFile(join(created.path, 'tracked.txt'), 'utf8')).toBe('first line\n');
    expect((await git(created.path, 'branch', '--show-current')).trim()).toBe('');
    await expect(
      service.createDetachedWorktree(root, { revision: '--definitely-not-an-option' }),
    ).rejects.toMatchObject({ code: 'invalid_revision' });
  });

  it('rejects a symlink or non-private worktree root', async () => {
    const { root } = await repositoryFixture();
    const publicRoot = join(root, 'public-worktrees');
    await mkdir(publicRoot, { mode: 0o755 });
    await chmod(publicRoot, 0o755);
    const service = new WorkspaceGitService({
      privateWorktreeRoot: publicRoot,
      gitExecutable,
    });

    await expect(service.createDetachedWorktree(root)).rejects.toMatchObject({
      code: 'invalid_private_root',
    });
  });

  it('keeps durable snapshots without changing the workspace and restores only at the same revision', async () => {
    const { root, service } = await repositoryFixture();
    await writeFile(join(root, 'tracked.txt'), 'saved change\n');

    const snapshot = await service.createSnapshot(root);
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('saved change\n');
    expect(await service.listSnapshots(root)).toEqual([snapshot]);

    await git(root, 'restore', '--staged', '--worktree', '--', 'tracked.txt');
    await service.restoreSnapshot(root, snapshot.id);
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('saved change\n');

    await service.deleteSnapshot(root, snapshot.id);
    expect(await service.listSnapshots(root)).toEqual([]);

    await writeFile(join(root, 'untracked.txt'), 'not implicit\n');
    await expect(service.createSnapshot(root)).rejects.toThrow('Stage untracked files');
  });
});
