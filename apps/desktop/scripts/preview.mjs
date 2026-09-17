import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { prepareDevelopmentApp } from './prepare-dev-electron.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
if (process.platform === 'darwin') {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const executable = prepareDevelopmentApp(require('electron'), manifest.build.mac.extendInfo);
  // LaunchServices gives the development app its own TCC responsibility, even
  // when this command runs inside an IDE. Direct spawn inherits the IDE's identity.
  execFileSync('/usr/bin/open', ['-n', '-a', resolve(executable, '../../..'), '--args', root]);
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
