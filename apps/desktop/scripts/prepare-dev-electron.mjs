import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { assertSameIdentity, devHome, devIdentity, signDevelopment } from './dev-signing.mjs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rememberDevelopmentLaunch } from './development-launch.mjs';

// TCC attributes a child helper's permission request to the responsible app. The
// downloaded development Electron bundle needs the same descriptions as Sia.app.
// This function only patches metadata; prepareDevelopmentApp signs the result.
// Neither function grants or resets macOS permissions.
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
    'NSScreenCaptureDescription',
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

// Apple's QA1940 disallows Finder/resource-fork metadata in signed bundles.
// Keep other attributes, including quarantine, intact on the staged copy.
export function cleanSigningMetadata(app) {
  for (const attribute of ['com.apple.FinderInfo', 'com.apple.ResourceFork'])
    execFileSync('/usr/bin/xattr', ['-dr', attribute, app]);
}

export function prepareDevelopmentApp(executable, descriptions) {
  const identity = devIdentity();
  const source = resolve(executable, '../../..');
  const app = resolve(devHome, 'Sia Development.app');
  const target = resolve(app, 'Contents/MacOS/Electron');
  const marker = resolve(devHome, 'electron.sha256');
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        source,
        descriptions,
        identity: identity.hash,
        version: readFileSync(resolve(source, 'Contents/Info.plist'), 'utf8'),
        script: readFileSync(new URL(import.meta.url), 'utf8'),
        bootstrap: readFileSync(
          new URL('./prepare-dev-bootstrap.mjs', import.meta.url),
          'utf8',
        ),
        launch: readFileSync(new URL('./development-launch.mjs', import.meta.url), 'utf8'),
      }),
    )
    .digest('hex');
  if (existsSync(target) && existsSync(marker) && readFileSync(marker, 'utf8') === digest) {
    try {
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {
        stdio: 'pipe',
      });
      return target;
    } catch {
      /* Repair only when the app is not running. */
    }
  }
  const processes = execFileSync('/bin/ps', ['-axo', 'comm='], { encoding: 'utf8' });
  if (processes.split('\n').some((line) => line.trim().startsWith(app + '/')))
    throw new Error('Quit Sia Development before updating its signed Electron runtime.');
  mkdirSync(devHome, { recursive: true, mode: 0o700 });
  const staging = resolve(devHome, 'Sia Development.pending.app');
  rmSync(staging, { recursive: true, force: true });
  execFileSync('/usr/bin/ditto', [source, staging]);
  cleanSigningMetadata(staging);
  const stagedExecutable = resolve(staging, 'Contents/MacOS/Electron');
  prepareDevElectron(stagedExecutable, descriptions);
  execFileSync(process.execPath, [
    resolve(import.meta.dirname, 'prepare-dev-bootstrap.mjs'),
    resolve(staging, 'Contents/Resources/default_app.asar'),
  ]);
  for (const [key, value] of Object.entries({
    CFBundleIdentifier: 'ai.sia.desktop.dev',
    CFBundleName: 'Sia Development',
    CFBundleDisplayName: 'Sia Development',
  })) {
    execFileSync('/usr/bin/plutil', [
      '-replace',
      key,
      '-string',
      value,
      resolve(staging, 'Contents/Info.plist'),
    ]);
  }
  // npm Electron helpers may have incomplete resource seals. Sign nested helper
  // bundles inside-out, preserving their runtime entitlements, before the outer app.
  const frameworks = resolve(staging, 'Contents/Frameworks');
  for (const name of readdirSync(frameworks).filter((entry) =>
    /\.(app|framework)$/.test(entry),
  )) {
    const nested = resolve(frameworks, name);
    const identifier = execFileSync(
      '/usr/bin/plutil',
      [
        '-extract',
        'CFBundleIdentifier',
        'raw',
        '-o',
        '-',
        resolve(nested, name.endsWith('.app') ? 'Contents/Info.plist' : 'Resources/Info.plist'),
      ],
      { encoding: 'utf8' },
    ).trim();
    signDevelopment(nested, identity, identifier, [
      '--preserve-metadata=entitlements,flags,runtime',
    ]);
  }
  signDevelopment(staging, identity, 'ai.sia.desktop.dev');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', staging], {
    stdio: 'inherit',
  });
  // A valid signature alone is insufficient: permission grants are bound to the
  // designated requirement, which must survive Electron and metadata updates.
  if (existsSync(target)) assertSameIdentity(app, staging);
  rmSync(app, { recursive: true, force: true });
  renameSync(staging, app);
  writeFileSync(marker, digest, { mode: 0o600 });
  return target;
}

if (
  process.platform === 'darwin' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  prepareDevelopmentApp(require('electron'), manifest.build.mac.extendInfo);
  if (process.argv.includes('--remember-launch')) {
    const profile = process.argv.find((arg) => arg.startsWith('--user-data='))?.slice(12);
    rememberDevelopmentLaunch(resolve(import.meta.dirname, '..'), profile);
  }
}
