import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareDevElectron } from './prepare-dev-electron.mjs';
import { selectIdentity, devIdentity, signDevelopment } from './dev-signing.mjs';

test(
  'development app has release permission descriptions before any helper request',
  {
    skip: process.platform !== 'darwin',
  },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-dev-permissions-'));
    try {
      const contents = join(directory, 'Electron.app/Contents');
      mkdirSync(join(contents, 'MacOS'), { recursive: true });
      const plist = join(contents, 'Info.plist');
      writeFileSync(
        plist,
        JSON.stringify({
          CFBundleIdentifier: 'com.github.Electron',
          NSMicrophoneUsageDescription: 'Generic microphone description',
        }),
      );
      execFileSync('/usr/bin/plutil', ['-convert', 'xml1', plist]);
      const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
      const descriptions = manifest.build.mac.extendInfo;
      const executable = join(contents, 'MacOS/Electron');
      prepareDevElectron(executable, descriptions);
      const result = JSON.parse(
        execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist]),
      );
      for (const key of [
        'NSSpeechRecognitionUsageDescription',
        'NSMicrophoneUsageDescription',
        'NSAccessibilityUsageDescription',
        'NSAppleEventsUsageDescription',
        'NSLocalNetworkUsageDescription',
      ]) {
        assert.equal(result[key], descriptions[key]);
        assert.ok(result[key].length > 0);
      }
      assert.deepEqual(result.NSBonjourServices, ['_http._tcp']);
      assert.equal(result.CFBundleIdentifier, 'com.github.Electron');
      const first = readFileSync(plist, 'utf8');
      prepareDevElectron(executable, descriptions);
      assert.equal(readFileSync(plist, 'utf8'), first);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('development signing pins a certificate and never silently rotates or falls back', () => {
  const notch = { name: 'Notch Dev Signing', hash: 'A'.repeat(40) };
  const sia = { name: 'Sia Dev Signing', hash: 'B'.repeat(40) };
  assert.equal(selectIdentity([notch, sia], notch), notch);
  assert.equal(selectIdentity([notch, sia]), sia);
  assert.throws(() => selectIdentity([sia], notch), /Restore/);
  assert.throws(() => selectIdentity([notch, sia], notch, sia.name), /already pinned/);
  assert.throws(() => selectIdentity([]), /stable development/);
});

test(
  'two different binaries retain the same designated requirement',
  { skip: process.platform !== 'darwin' },
  () => {
    const identity = devIdentity({ required: false });
    if (!identity) return;
    const directory = mkdtempSync(join(tmpdir(), 'sia-signing-check-'));
    try {
      const requirements = [],
        hashes = [];
      for (const version of [1, 2]) {
        const source = join(directory, `v${version}.c`),
          binary = join(directory, `v${version}`);
        writeFileSync(source, `int main(void) { return ${version}; }`);
        execFileSync('/usr/bin/xcrun', ['clang', source, '-o', binary]);
        signDevelopment(binary, identity, 'ai.sia.desktop.signature-test');
        // codesign writes signature diagnostics to stderr.
        const requirement = spawnSync('/usr/bin/codesign', ['-d', '-r-', binary], {
          encoding: 'utf8',
        });
        assert.equal(requirement.status, 0);
        requirements.push(
          (requirement.stdout + requirement.stderr).match(/designated => ([^\r\n]+)/)?.[1],
        );
        hashes.push(
          spawnSync('/usr/bin/codesign', ['-d', '--verbose=4', binary], {
            encoding: 'utf8',
          }).stderr.match(/CDHash=(.+)/)?.[1],
        );
      }
      assert.ok(requirements[0]);
      assert.equal(requirements[0], requirements[1]);
      assert.notEqual(hashes[0], hashes[1]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
