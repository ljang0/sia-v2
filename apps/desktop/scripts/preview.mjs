import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { prepareDevelopmentApp } from './prepare-dev-electron.mjs';
import { rememberDevelopmentLaunch } from './development-launch.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
if (process.platform === 'darwin') {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const executable = prepareDevelopmentApp(require('electron'), manifest.build.mac.extendInfo);
  if (process.env.SIA_FAKE_SERVICES !== '1')
    rememberDevelopmentLaunch(root, process.env.SIA_TEST_USER_DATA);
  // LaunchServices gives the development app its own TCC responsibility, even
  // when this command runs inside an IDE. Direct spawn inherits the IDE's identity.
  const launchEnvironment = [
    'SIA_FAKE_SERVICES',
    'SIA_TEST_USER_DATA',
    'SIA_TEST_WORKSPACE',
    'SIA_TEST_PLAINTEXT_STORAGE',
  ];
  execFileSync('/usr/bin/open', [
    '-n',
    '-a',
    resolve(executable, '../../..'),
    ...launchEnvironment.flatMap((key) =>
      process.env[key] === undefined ? [] : ['--env', `${key}=${process.env[key]}`],
    ),
    '--args',
    root,
  ]);
} else {
  const child = spawn(require('electron'), [root], { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
