import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareDevElectron } from './prepare-dev-electron.mjs';

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
      ]) {
        assert.equal(result[key], descriptions[key]);
        assert.ok(result[key].length > 0);
      }
      assert.equal(result.CFBundleIdentifier, 'com.github.Electron');
      const first = readFileSync(plist, 'utf8');
      prepareDevElectron(executable, descriptions);
      assert.equal(readFileSync(plist, 'utf8'), first);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
