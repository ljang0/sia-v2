import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DirectUserBackgroundTerminalService,
  DirectUserTerminalService,
  WorkspaceGitService,
  WorkspaceOperationError,
  WorkspaceOperationsService,
} from './workspace-operations.js';

const execFileAsync = promisify(execFile);
const gitExecutable = '/usr/bin/git';
const temporaryRoots: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync(gitExecutable, args, {
    cwd,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
  });
  return result.stdout;
}

async function repositoryFixture(): Promise<{
  root: string;
  worktrees: string;
  service: WorkspaceGitService;
}> {
  const root = await mkdtemp(join(tmpdir(), 'sia-workspace-operations-'));
  temporaryRoots.push(root);
  const requestedRepository = join(root, 'repository');
  const worktrees = join(root, 'private-worktrees');
  await mkdir(requestedRepository);
  const repository = await realpath(requestedRepository);
  await git(repository, 'init', '-q');
  await git(repository, 'config', 'user.name', 'Sia Test');
  await git(repository, 'config', 'user.email', 'sia@example.invalid');
  await writeFile(join(repository, 'tracked.txt'), 'first line\n');
  await writeFile(join(repository, '--option-looking.txt'), 'safe argument\n');
  await git(repository, 'add', '--', 'tracked.txt', '--option-looking.txt');
  await git(repository, 'commit', '-qm', 'initial');
  const service = new WorkspaceGitService({
    privateWorktreeRoot: worktrees,
    gitExecutable,
    environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
    commandTimeoutMs: 5_000,
  });
  return { root: repository, worktrees, service };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

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

describe('DirectUserTerminalService', () => {
  it('binds a single command to the validated workspace and captures both streams', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserTerminalService({
      environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
      maxTimeoutMs: 1_000,
      maxOutputBytes: 4_096,
    });
    const command = await terminal.scope(root);
    const resolvedRoot = await realpath(root);

    const result = await command.execute("printf 'standard'; printf 'problem' >&2; /bin/pwd");

    expect(result).toMatchObject({
      workspace: resolvedRoot,
      exitCode: 0,
      timedOut: false,
      aborted: false,
      outputLimitExceeded: false,
      stderr: 'problem',
    });
    expect(result.stdout).toBe(`standard${resolvedRoot}\n`);
    await expect(command.execute('true')).rejects.toBeInstanceOf(WorkspaceOperationError);
  });

  it('bounds output and terminates the one-shot process when the limit is reached', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-output-'));
    temporaryRoots.push(root);
    const command = await new DirectUserTerminalService({
      maxTimeoutMs: 1_000,
      maxOutputBytes: 128,
    }).scope(root);

    const result = await command.execute("while true; do printf '0123456789'; done");

    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBeLessThanOrEqual(128);
    expect(result.outputLimitExceeded).toBe(true);
    expect(result.signal).toBe('SIGKILL');
  });

  it('supports timeout and abort without allowing a caller-selected cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-user-terminal-bounds-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserTerminalService({ maxTimeoutMs: 500 });
    const timeoutCommand = await terminal.scope(root);
    const timeout = await timeoutCommand.execute('sleep 2', { timeoutMs: 20 });
    expect(timeout).toMatchObject({ timedOut: true, aborted: false, signal: 'SIGKILL' });

    const abort = new AbortController();
    const abortedCommand = await terminal.scope(root);
    const running = abortedCommand.execute('sleep 2', { signal: abort.signal });
    setTimeout(() => abort.abort(), 20);
    const aborted = await running;
    expect(aborted).toMatchObject({ timedOut: false, aborted: true, signal: 'SIGKILL' });
  });
});

describe('DirectUserBackgroundTerminalService', () => {
  it('keeps a workspace-scoped process running, accepts input, and stops its process group', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-background-terminal-'));
    temporaryRoots.push(root);
    const terminal = new DirectUserBackgroundTerminalService({
      environment: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
      maxOutputBytes: 4_096,
    });

    const started = await terminal.start(
      root,
      'read line; printf \'received:%s\' "$line"; sleep 5',
    );
    expect(started).toMatchObject({ cwd: await realpath(root), status: 'running' });
    await terminal.write(root, started.id, 'hello\n');

    let session = started;
    for (
      let attempt = 0;
      attempt < 30 && !session.output.includes('received:hello');
      attempt += 1
    ) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      session = (await terminal.list(root))[0]!;
    }
    expect(session.output).toContain('received:hello');
    expect(await terminal.stop(root, started.id)).toMatchObject({ status: 'stopped' });
    terminal.dispose();
  });
});

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
