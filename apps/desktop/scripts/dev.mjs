import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { prepareDevelopmentApp } from './prepare-dev-electron.mjs';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const executable =
  process.platform === 'darwin'
    ? prepareDevelopmentApp(require('electron'), manifest.build.mac.extendInfo)
    : require('electron');
const child = spawn('pnpm', ['exec', 'electron-vite', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_EXEC_PATH: executable },
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
