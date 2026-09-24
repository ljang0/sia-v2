import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export function developmentLaunchFile(home = homedir()) {
  return join(home, 'Library/Application Support/Sia Development/launch.json');
}

function validateLaunch(value) {
  if (value.version !== 1 || typeof value.appPath !== 'string' || !isAbsolute(value.appPath))
    throw new Error('Sia’s development launch location is missing. Run pnpm preview again.');
  if (
    value.userData !== undefined &&
    (typeof value.userData !== 'string' || !isAbsolute(value.userData))
  )
    throw new Error('Sia’s development profile location is invalid.');
  const manifest = JSON.parse(readFileSync(join(value.appPath, 'package.json'), 'utf8'));
  if (manifest.name !== '@sia/desktop' || manifest.main !== 'out/main/index.js')
    throw new Error('The saved launch location is not a Sia desktop build.');
  return value;
}

// Only explicit preview launches register a destination. Test harnesses and voice
// configuration must never replace the person's saved app or profile.
export function rememberDevelopmentLaunch(appPath, userData, file = developmentLaunchFile()) {
  const value = validateLaunch({ version: 1, appPath, ...(userData ? { userData } : {}) });
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, file);
}

export function restoreDevelopmentLaunch(argv, environment, file = developmentLaunchFile()) {
  // Keep Electron CLI invocations, test apps, and development-server launches intact.
  if (argv.slice(1).some((arg) => !arg.startsWith('-psn_'))) return false;
  const value = validateLaunch(JSON.parse(readFileSync(file, 'utf8')));
  for (const key of Object.keys(environment))
    if (key.startsWith('SIA_TEST_')) delete environment[key];
  delete environment.ELECTRON_RENDERER_URL;
  environment.SIA_FAKE_SERVICES = '0';
  if (value.userData) environment.SIA_TEST_USER_DATA = value.userData;
  argv.splice(1, argv.length - 1, value.appPath);
  return true;
}
