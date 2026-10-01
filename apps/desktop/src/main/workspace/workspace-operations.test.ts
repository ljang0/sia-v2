import { realpath, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { WorkspaceOperationsService } from './workspace-operations.js';
import { gitExecutable, removeTemporaryRoots, repositoryFixture } from './test-support.js';

afterEach(removeTemporaryRoots);

describe('WorkspaceOperationsService controller facade', () => {
  it('returns shared diff views and implements the fixed controller contract', async () => {
    const { root, worktrees } = await repositoryFixture();
    const service = new WorkspaceOperationsService({
      privateWorktreeRoot: worktrees,
      gitExecutable,
      environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
      terminalTimeoutMs: 1_000,
    });
    await writeFile(join(root, 'tracked.txt'), 'facade change\n');

    const before = await service.readDiff(root);
    expect(before).toMatchObject({
      workspace: root,
      files: [expect.objectContaining({ path: 'tracked.txt', status: 'modified' })],
    });
    expect(before.unifiedDiff).toContain('facade change');
    expect(Date.parse(before.generatedAt)).not.toBeNaN();

    const staged = await service.stage(root, ['tracked.txt']);
    expect(staged.files[0]).toMatchObject({ path: 'tracked.txt', staged: true });
    expect(staged.unifiedDiff).toContain('facade change');

    const restored = await service.restore(root, ['tracked.txt']);
    expect(restored.files).toEqual([]);

    const terminal = await service.runTerminal(root, '/bin/pwd');
    expect(terminal).toMatchObject({
      command: '/bin/pwd',
      cwd: root,
      output: `${root}\n`,
      exitCode: 0,
      timedOut: false,
    });

    const worktree = await service.createWorktree(root, 'thread_123');
    expect(relative(await realpath(worktrees), worktree.path)).toMatch(
      /^thread-thread_123-[0-9a-f-]+$/,
    );
    await service.removeWorktree(worktree.path);
    await expect(stat(worktree.path)).rejects.toMatchObject({ code: 'ENOENT' });
    service.dispose();
  });
});
