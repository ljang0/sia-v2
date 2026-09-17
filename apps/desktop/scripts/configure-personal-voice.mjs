import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareDevelopmentApp } from './prepare-dev-electron.mjs';

if (process.platform !== 'darwin')
  throw new Error('Personal voice configuration requires macOS Keychain.');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const executable = prepareDevelopmentApp(require('electron'), manifest.build.mac.extendInfo);
const entry = resolve(import.meta.dirname, '../out/main/configure-personal-voice.js');
const verify = process.argv.includes('--verify');
const child = spawn(executable, [entry, ...(verify ? ['--verify'] : [])], {
  stdio: [verify ? 'ignore' : 'pipe', 'inherit', 'inherit'],
});
// Pipe from a hidden terminal prompt or a secret manager. Never accept the key as an argument.
if (!verify) process.stdin.pipe(child.stdin);
child.on('error', () => {
  process.stderr.write('Could not start Sia voice configuration.\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
