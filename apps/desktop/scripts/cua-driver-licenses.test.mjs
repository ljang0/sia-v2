import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCuaLicenses } from './cua-driver-licenses.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'sia-cua-licenses-'));
  try {
    await mkdir(join(root, 'libs/cua-driver/rust'), { recursive: true });
    await writeFile(
      join(root, 'libs/cua-driver/rust/THIRD_PARTY_NOTICES.md'),
      'Original Cua attributions',
    );
    const packages = [];
    for (const name of ['cua-driver-sdk', 'dependency', 'build-helper', 'dev-only']) {
      const directory = join(root, name);
      await mkdir(directory);
      packages.push({
        id: name,
        name,
        version: '1.0.0',
        manifest_path: join(directory, 'Cargo.toml'),
        source: name === 'cua-driver-sdk' ? null : 'registry+test',
        repository: 'https://example.test/source',
        license: 'MIT',
        authors: ['Original author'],
      });
    }
    const metadata = {
      packages,
      resolve: {
        nodes: packages.map((item) => ({
          id: item.id,
          deps:
            item.id === 'cua-driver-sdk'
              ? [
                  { pkg: 'dependency', dep_kinds: [{ kind: null }] },
                  { pkg: 'build-helper', dep_kinds: [{ kind: 'build' }] },
                  { pkg: 'dev-only', dep_kinds: [{ kind: 'dev' }] },
                ]
              : [],
        })),
      },
    };
    const inputs = {
      supplements: [],
      files: new Map([['cua-driver-rs-v0.38.0-MIT.txt', 'Original workspace terms']]),
    };
    await writeFile(join(root, 'build-helper/LICENSE'), 'Build helper terms');
    await run({ root, metadata, inputs });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('bundles normal/build and embedded-library notices without dev-only crates or local paths', async () => {
  await fixture(async ({ root, metadata, inputs }) => {
    await writeFile(join(root, 'dependency/LICENSE'), 'Original dependency terms');
    await mkdir(join(root, 'dependency/vendor/engine'), { recursive: true });
    await writeFile(
      join(root, 'dependency/vendor/engine/COPYING'),
      'Embedded engine copyright and terms',
    );
    const output = await buildCuaLicenses(metadata, inputs, root);
    assert.match(output, /Original dependency terms/);
    assert.match(output, /Embedded engine copyright and terms/);
    assert.match(output, /Build helper terms/);
    assert.match(output, /Original Cua attributions/);
    assert.doesNotMatch(output, /dev-only/);
    assert.ok(!output.includes(root));
  });
});

test('missing terms fail unless the original supplement matches the exact crate source revision', async () => {
  await fixture(async ({ root, metadata, inputs }) => {
    await writeFile(
      join(root, 'dependency/.cargo_vcs_info.json'),
      JSON.stringify({ git: { sha1: 'exact-revision' } }),
    );
    inputs.supplements.push({
      repository: 'https://example.test/source',
      commit: 'different-revision',
      file: 'original.txt',
      sourceUrl: 'https://example.test/source/license',
    });
    inputs.files.set('original.txt', 'Original author copyright and complete license');
    await assert.rejects(
      buildCuaLicenses(metadata, inputs, root),
      /Missing original license terms/,
    );
    inputs.supplements[0].commit = 'exact-revision';
    assert.match(
      await buildCuaLicenses(metadata, inputs, root),
      /Original author copyright and complete license/,
    );
  });
});
