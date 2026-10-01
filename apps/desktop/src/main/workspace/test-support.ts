/** Shared Git repository fixtures for the workspace service tests. */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { WorkspaceGitService } from './git-service.js';

const execFileAsync = promisify(execFile);
export const gitExecutable = '/usr/bin/git';
export const temporaryRoots: string[] = [];

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync(gitExecutable, args, {
    cwd,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME },
  });
  return result.stdout;
}

export async function repositoryFixture(): Promise<{
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

/** Removes every fixture root created by the current test. */
export async function removeTemporaryRoots(): Promise<void> {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(async (root) => await rm(root, { recursive: true, force: true })),
  );
}
