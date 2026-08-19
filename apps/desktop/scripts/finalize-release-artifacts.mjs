import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const requestedArch = process.argv
  .find((argument) => argument.startsWith('--arch='))
  ?.slice('--arch='.length);

if (!requestedArch || !['arm64', 'x64', 'universal'].includes(requestedArch)) {
  throw new Error('Usage: finalize-release-artifacts.mjs --arch=arm64|x64|universal');
}

const desktopRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'));
const dmgPath = join(
  desktopRoot,
  'release',
  `Sia-${String(packageJson.version)}-${requestedArch}.dmg`,
);

verifyDeveloperIdSignature(dmgPath);

const notaryArguments = ['notarytool', 'submit', dmgPath, '--wait'];
if (process.env.APPLE_KEYCHAIN_PROFILE) {
  notaryArguments.push('--keychain-profile', process.env.APPLE_KEYCHAIN_PROFILE);
} else {
  notaryArguments.push(
    '--apple-id',
    process.env.APPLE_ID,
    '--password',
    process.env.APPLE_APP_SPECIFIC_PASSWORD,
    '--team-id',
    process.env.APPLE_TEAM_ID,
  );
}

runSystem('/usr/bin/xcrun', notaryArguments);
runSystem('/usr/bin/xcrun', ['stapler', 'staple', dmgPath]);
runSystem('/usr/bin/xcrun', ['stapler', 'validate', dmgPath]);
runSystem('/usr/sbin/spctl', [
  '--assess',
  '--type',
  'open',
  '--context',
  'context:primary-signature',
  '--verbose=4',
  dmgPath,
]);

console.log(`Finalized signed, notarized, and stapled DMG: ${dmgPath}`);

function verifyDeveloperIdSignature(path) {
  runSystem('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', path]);
  const details = runSystem('/usr/bin/codesign', ['-dv', '--verbose=4', path], true);
  const output = `${details.stdout}\n${details.stderr}`;
  if (
    !output.includes('Format=disk image') ||
    !output.includes('Authority=Developer ID Application:') ||
    !/TeamIdentifier=(?!not set)\S+/.test(output)
  ) {
    throw new Error(`DMG is not signed with a Developer ID Application identity:\n${output}`);
  }
}

function runSystem(command, args, allowStderr = false) {
  if (args.some((argument) => typeof argument !== 'string' || argument.length === 0)) {
    throw new Error(`Missing argument for ${command}.`);
  }
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 20 * 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0]} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  }
  if (!allowStderr && result.signal) {
    throw new Error(`${command} was terminated by ${result.signal}.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}
