import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/assets/download.js', import.meta.url), 'utf8');
const version = '0.1.0-alpha.25';
const sha256 = 'b'.repeat(64);
const release = {
  schemaVersion: 1,
  version,
  sha256,
  bytes: 1024,
  path: `/downloads/${version}/${sha256.slice(0, 16)}/Sia-${version}-universal.dmg`,
};
async function render(value, ok = true) {
  const elements = new Map();
  for (const id of [
    'download-status',
    'download-installer',
    'download-version',
    'download-checksum',
    'download-details',
  ])
    elements.set(id, { hidden: true, textContent: '', href: undefined });
  const context = {
    document: { getElementById: (id) => elements.get(id) },
    fetch: async (path) => {
      assert.equal(path, '/download/release.json');
      return { ok, json: async () => value };
    },
  };
  runInNewContext(
    source.replace('void loadDownload();', 'globalThis.finished = loadDownload();'),
    context,
  );
  await context.finished;
  return elements;
}
test('published metadata renders its exact immutable installer and checksum', async () => {
  const ui = await render(release);
  assert.equal(ui.get('download-installer').href, release.path);
  assert.equal(ui.get('download-installer').hidden, false);
  assert.equal(ui.get('download-checksum').textContent, sha256);
  assert.match(ui.get('download-status').textContent, /is available/);
});
test('missing, malformed, external, or mismatched metadata never exposes a download', async () => {
  for (const value of [
    null,
    {},
    { ...release, path: 'https://example.com/installer.dmg' },
    { ...release, path: '/downloads/../installer.dmg' },
    { ...release, sha256: 'wrong' },
    { ...release, bytes: -1 },
    { ...release, version: '0.0.0' },
  ]) {
    const ui = await render(value);
    assert.equal(ui.get('download-installer').hidden, true);
    assert.equal(ui.get('download-installer').href, undefined);
    assert.match(ui.get('download-status').textContent, /being prepared/);
  }
  assert.equal((await render(release, false)).get('download-installer').hidden, true);
});
