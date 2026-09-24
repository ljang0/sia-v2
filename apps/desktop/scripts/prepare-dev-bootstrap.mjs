import { createPackage, extractAll } from '@electron/asar';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function prepareDefaultApplication(archive) {
  const directory = mkdtempSync(join(tmpdir(), 'sia-default-app-'));
  try {
    extractAll(archive, directory);
    const manifestFile = join(directory, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (manifest.main !== 'main.js') throw new Error('Unexpected Electron default app entry.');
    manifest.main = 'sia-bootstrap.js';
    writeFileSync(manifestFile, JSON.stringify(manifest));
    writeFileSync(
      join(directory, 'sia-development-launch.mjs'),
      readFileSync(new URL('./development-launch.mjs', import.meta.url)),
    );
    writeFileSync(
      join(directory, 'sia-bootstrap.js'),
      `
import { app, dialog } from 'electron';
import { restoreDevelopmentLaunch } from './sia-development-launch.mjs';
let restored = true;
try {
  restoreDevelopmentLaunch(process.argv, process.env);
} catch {
  restored = false;
  app.whenReady().then(() => {
  dialog.showErrorBox('Sia needs to be opened from its launcher',
    'Open Sia with your saved launcher or run pnpm --filter @sia/desktop preview from the Sia checkout.');
  app.exit(1);
  });
}
// Retain Electron's official loader and unpackaged-app semantics.
if (restored) await import('./main.js');
`,
    );
    await createPackage(directory, archive);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await prepareDefaultApplication(process.argv[2]);
