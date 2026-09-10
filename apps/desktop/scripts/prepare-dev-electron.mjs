import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// TCC attributes a child helper's permission request to the responsible app. The
// downloaded development Electron bundle needs the same descriptions as Sia.app.
// This only adds usage descriptions; it does not grant or reset any permissions.
export function prepareDevElectron(executable, descriptions) {
  const plist = resolve(dirname(executable), '../Info.plist');
  const current = JSON.parse(
    execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist], {
      encoding: 'utf8',
    }),
  );
  for (const key of [
    'NSSpeechRecognitionUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSAccessibilityUsageDescription',
    'NSAppleEventsUsageDescription',
    'NSLocalNetworkUsageDescription',
  ]) {
    const value = descriptions[key];
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`Sia is missing its ${key} permission description.`);
    if (current[key] === value) continue;
    execFileSync('/usr/bin/plutil', [
      Object.hasOwn(current, key) ? '-replace' : '-insert',
      key,
      '-string',
      value,
      plist,
    ]);
  }
  if (
    JSON.stringify(current.NSBonjourServices) !== JSON.stringify(descriptions.NSBonjourServices)
  ) {
    execFileSync('/usr/bin/plutil', [
      Object.hasOwn(current, 'NSBonjourServices') ? '-replace' : '-insert',
      'NSBonjourServices',
      '-json',
      JSON.stringify(descriptions.NSBonjourServices),
      plist,
    ]);
  }
}

if (
  process.platform === 'darwin' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  prepareDevElectron(require('electron'), manifest.build.mac.extendInfo);
}
