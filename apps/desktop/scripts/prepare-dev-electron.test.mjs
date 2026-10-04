import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  developmentLaunchFile,
  rememberDevelopmentLaunch,
  restoreDevelopmentLaunch,
} from './development-launch.mjs';
import { prepareDefaultApplication } from './prepare-dev-bootstrap.mjs';
import test from 'node:test';
import { prepareDevElectron } from './prepare-dev-electron.mjs';
import { cleanSigningMetadata } from './signing-metadata.mjs';
import {
  assertSameIdentity,
  selectIdentity,
  devIdentity,
  signDevelopment,
} from './dev-signing.mjs';

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
        'NSScreenCaptureDescription',
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
      assertSameIdentity(join(directory, 'v1'), join(directory, 'v2'));
      signDevelopment(join(directory, 'v2'), identity, 'ai.sia.desktop.changed-identity');
      assert.throws(
        () => assertSameIdentity(join(directory, 'v1'), join(directory, 'v2')),
        /invalidate saved permissions/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  'release staging removes Finder metadata and preserves other attributes',
  { skip: process.platform !== 'darwin' },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-signing-metadata-'));
    try {
      const app = join(directory, 'Sia.app');
      const contents = join(app, 'Contents');
      mkdirSync(contents, { recursive: true });
      writeFileSync(
        join(contents, 'Info.plist'),
        '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict/></plist>',
      );
      const file = join(contents, 'fixture.txt');
      writeFileSync(file, 'fixture');
      execFileSync('/usr/bin/xattr', [
        '-wx',
        'com.apple.FinderInfo',
        '0000000000000000000000100000000000000000000000000000000000000000',
        app,
      ]);
      execFileSync('/usr/bin/xattr', ['-w', 'com.apple.ResourceFork', 'test resource', file]);
      const quarantine = '0081;00000000;SiaTest;';
      execFileSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantine, file]);
      const afterPack = createRequire(import.meta.url)('../build/after-pack.cjs');
      await afterPack({
        electronPlatformName: 'darwin',
        appOutDir: directory,
        packager: { appInfo: { productFilename: 'Sia' } },
      });
      assert.equal(spawnSync('/usr/bin/xattr', ['-p', 'com.apple.FinderInfo', app]).status, 1);
      assert.equal(
        spawnSync('/usr/bin/xattr', ['-p', 'com.apple.ResourceFork', file]).status,
        1,
      );
      assert.equal(
        execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file], {
          encoding: 'utf8',
        }).trim(),
        quarantine,
      );
      assert.equal(readFileSync(file, 'utf8'), 'fixture');
      cleanSigningMetadata(app);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test('bare launches restore only the saved real profile; explicit Electron invocations stay intact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sia-launch-state-'));
  try {
    const appPath = join(directory, 'Sia checkout');
    mkdirSync(appPath);
    writeFileSync(
      join(appPath, 'package.json'),
      JSON.stringify({ name: '@sia/desktop', main: 'out/main/index.js' }),
    );
    const file = developmentLaunchFile(directory);
    const profile = join(directory, 'Personal profile');
    rememberDevelopmentLaunch(appPath, profile, file);
    const argv = ['/electron', '-psn_0_1'];
    const environment = {
      SIA_TEST_PLAINTEXT_STORAGE: '1',
      SIA_FAKE_SERVICES: '1',
      ELECTRON_RENDERER_URL: 'old-server',
    };
    assert.equal(restoreDevelopmentLaunch(argv, environment, file), true);
    assert.deepEqual(argv, ['/electron', appPath]);
    assert.deepEqual(environment, { SIA_TEST_USER_DATA: profile, SIA_FAKE_SERVICES: '0' });
    for (const args of [
      ['/electron', '/test/app'],
      ['/electron', '--version'],
    ]) {
      const before = [...args],
        env = { SIA_FAKE_SERVICES: '1' };
      assert.equal(restoreDevelopmentLaunch(args, env, '/does-not-exist'), false);
      assert.deepEqual(args, before);
      assert.equal(env.SIA_FAKE_SERVICES, '1');
    }
    assert.throws(
      () => rememberDevelopmentLaunch(appPath, 'relative-profile', file),
      /invalid/,
    );
    writeFileSync(
      join(appPath, 'package.json'),
      JSON.stringify({ name: 'other-app', main: 'index.js' }),
    );
    assert.throws(() => restoreDevelopmentLaunch(['/electron'], {}, file), /not a Sia/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  'real Electron bare launch loads Sia as unpackaged and restores its profile',
  { skip: process.platform !== 'darwin', timeout: 60000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-default-launch-'));
    try {
      const require = createRequire(import.meta.url);
      const electron = require('electron');
      const bundle = join(directory, 'Sia Fixture.app');
      execFileSync('/usr/bin/ditto', [resolve(electron, '../../..'), bundle]);
      await prepareDefaultApplication(join(bundle, 'Contents/Resources/default_app.asar'));
      const appPath = join(directory, 'fixture');
      const profile = join(directory, 'profile');
      const output = join(directory, 'result.json');
      mkdirSync(join(appPath, 'out/main'), { recursive: true });
      writeFileSync(
        join(appPath, 'package.json'),
        JSON.stringify({ name: '@sia/desktop', main: 'out/main/index.js', type: 'module' }),
      );
      writeFileSync(
        join(appPath, 'out/main/index.js'),
        `
      import { app } from 'electron';
      import { writeFileSync } from 'node:fs';
      app.setPath('userData', process.env.SIA_TEST_USER_DATA);
      app.whenReady().then(() => {
      writeFileSync(${JSON.stringify(output)}, JSON.stringify({ appPath: app.getAppPath(), profile: app.getPath('userData'), packaged: app.isPackaged }));
      app.exit(0);
      });
    `,
      );
      execFileSync(process.execPath, ['--check', join(appPath, 'out/main/index.js')]);
      mkdirSync(profile);
      rememberDevelopmentLaunch(appPath, profile, developmentLaunchFile(directory));
      execFileSync(join(bundle, 'Contents/MacOS/Electron'), [], {
        env: { HOME: directory, PATH: '/usr/bin:/bin', TMPDIR: tmpdir() },
        timeout: 30000,
        stdio: 'pipe',
      });
      assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
        appPath,
        profile,
        packaged: false,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
