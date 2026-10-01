import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readlink, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it, vi } from 'vitest';
import { installCodexRelease, managedCodexCommand } from './codex-installer.js';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(version = '0.153.0') {
  const root = await mkdtemp(join(tmpdir(), 'sia-installer-test-'));
  roots.push(root);
  const target = 'test-platform';
  const source = join(root, 'source');
  for (const name of [
    'bin/codex',
    'bin/codex-code-mode-host',
    'codex-path/rg',
    'codex-resources/zsh/bin/zsh',
    'codex-package.json',
  ]) {
    const path = join(source, 'package/vendor', target, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      name === 'bin/codex' ? `#!/bin/sh\nprintf 'codex-cli ${version}\\n'\n` : 'fixture',
    );
  }
  await writeFile(join(source, 'unwanted'), 'never extracted');
  const archive = join(root, 'archive.tgz');
  await exec('/usr/bin/tar', ['-czf', archive, '-C', source, 'package', 'unwanted']);
  const bytes = await readFile(archive);
  return {
    root: join(root, 'installed'),
    bytes,
    release: {
      version,
      target,
      url: 'https://registry.npmjs.org/test-fixture.tgz',
      integrity: createHash('sha512').update(bytes).digest('base64'),
    },
    download: vi.fn<typeof fetch>(async () => new Response(bytes)),
  };
}

it('verifies and installs the real archive path, selects it atomically, and makes retry idempotent', async () => {
  const test = await fixture();
  await installCodexRelease(test.root, test.release, test.download);
  expect((await exec(managedCodexCommand(test.root), ['--version'])).stdout.trim()).toBe(
    'codex-cli 0.153.0',
  );
  const selected = await readlink(join(test.root, 'current'));
  expect(await readdir(join(test.root, selected))).toEqual([
    'bin',
    'codex-package.json',
    'codex-path',
    'codex-resources',
  ]);
  expect(test.download).toHaveBeenCalledWith(
    test.release.url,
    expect.objectContaining({ redirect: 'error', credentials: 'omit' }),
  );
  await installCodexRelease(test.root, test.release, test.download);
  expect(test.download).toHaveBeenCalledOnce();
  expect(await readlink(join(test.root, 'current'))).toBe(selected);
  expect((await readdir(test.root)).some((name) => name.startsWith('.'))).toBe(false);
});

it('rejects tampered and wrong-version downloads while preserving the last working installation', async () => {
  const previous = await fixture('0.152.0');
  await installCodexRelease(previous.root, previous.release, previous.download);
  const selected = await readlink(join(previous.root, 'current'));
  const next = await fixture();
  await expect(
    installCodexRelease(previous.root, next.release, async () => new Response('tampered')),
  ).rejects.toThrow('could not be verified');
  await expect(
    installCodexRelease(
      previous.root,
      { ...previous.release, version: '0.153.0' },
      previous.download,
    ),
  ).rejects.toThrow('could not start');
  expect(await readlink(join(previous.root, 'current'))).toBe(selected);
  expect((await exec(managedCodexCommand(previous.root), ['--version'])).stdout.trim()).toBe(
    'codex-cli 0.152.0',
  );
  expect((await readdir(previous.root)).some((name) => name.startsWith('.'))).toBe(false);
  await installCodexRelease(previous.root, next.release, next.download);
  expect(await readlink(join(previous.root, 'current'))).not.toBe(selected);
  expect((await exec(managedCodexCommand(previous.root), ['--version'])).stdout.trim()).toBe(
    'codex-cli 0.153.0',
  );
});

it('rejects network errors and unadmitted releases without publishing an installation', async () => {
  const test = await fixture();
  await expect(
    installCodexRelease(test.root, { ...test.release, version: '0.154.0' }, test.download),
  ).rejects.toThrow('not been verified');
  expect(test.download).not.toHaveBeenCalled();
  await expect(
    installCodexRelease(
      test.root,
      test.release,
      async () => new Response(null, { status: 503 }),
    ),
  ).rejects.toThrow('download failed');
  expect(await readdir(test.root)).toEqual([]);
});
