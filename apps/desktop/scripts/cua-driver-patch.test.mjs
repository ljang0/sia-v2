import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCuaPatch } from './cua-driver-patch.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'sia-cua-patch-'));
  const source = join(root, 'source');
  await mkdir(source);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: source,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Patch fixture');
    git('config', 'user.email', 'fixture@example.test');
    await writeFile(join(source, 'existing.rs'), 'original\n');
    await mkdir(join(source, 'unrelated'));
    await writeFile(join(source, 'unrelated/untouched.rs'), 'outside the sparse cone\n');
    git('add', 'existing.rs', 'unrelated/untouched.rs');
    git('commit', '--quiet', '-m', 'fixture');
    await writeFile(join(source, 'existing.rs'), 'patched\n');
    await writeFile(join(source, 'new.rs'), 'new source\n');
    git('add', '--intent-to-add', 'new.rs');
    const patch = join(root, 'native.patch');
    await writeFile(patch, git('diff', 'HEAD', '--binary', '--abbrev=7'));
    git('reset', '--hard', 'HEAD');
    await rm(join(source, 'new.rs'), { force: true });
    await run({ source, patch, git });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a fresh patch with a new source passes repeated verification and preserves its bytes', () =>
  fixture(async ({ source, patch, git }) => {
    prepareCuaPatch(source, patch);
    prepareCuaPatch(source, patch);
    assert.equal(await readFile(join(source, 'new.rs'), 'utf8'), 'new source\n');
    assert.equal(git('ls-files', '--others', '--exclude-standard').trim(), '');
    assert.equal(git('diff', 'HEAD', '--binary', '--abbrev=7'), await readFile(patch, 'utf8'));
  }));

test('an older plain-apply cache is repaired without replacing new sources', () =>
  fixture(async ({ source, patch, git }) => {
    git('apply', patch);
    assert.equal(git('ls-files', '--others', '--exclude-standard').trim(), 'new.rs');
    prepareCuaPatch(source, patch);
    prepareCuaPatch(source, patch);
    assert.equal(await readFile(join(source, 'new.rs'), 'utf8'), 'new source\n');
  }));

test('modified patch sources are refused and preserved, including formerly untracked new files', () =>
  fixture(async ({ source, patch, git }) => {
    git('apply', patch);
    await writeFile(join(source, 'new.rs'), 'local work\n');
    assert.throws(() => prepareCuaPatch(source, patch), /different patch/);
    assert.equal(await readFile(join(source, 'new.rs'), 'utf8'), 'local work\n');
  }));

test('unexpected source files are refused without changing or deleting them', () =>
  fixture(async ({ source, patch, git }) => {
    git('apply', patch);
    await writeFile(join(source, 'unrelated.rs'), 'local work\n');
    assert.throws(() => prepareCuaPatch(source, patch), /unexpected untracked files/);
    assert.equal(await readFile(join(source, 'unrelated.rs'), 'utf8'), 'local work\n');
    assert.equal(await readFile(join(source, 'existing.rs'), 'utf8'), 'patched\n');
  }));

test('new patch files preserve the index in a sparse checkout', () =>
  fixture(async ({ source, patch, git }) => {
    git('sparse-checkout', 'set', '--cone', 'driver');
    prepareCuaPatch(source, patch);
    prepareCuaPatch(source, patch);
    assert.equal(git('diff', 'HEAD', '--binary', '--abbrev=7'), await readFile(patch, 'utf8'));
    assert.equal(git('show', 'HEAD:unrelated/untouched.rs'), 'outside the sparse cone\n');
  }));
