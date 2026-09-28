import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const desktopRoot = resolve(import.meta.dirname, '..');
const siteRoot = resolve(desktopRoot, '../site');
const manifest = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/.test(version))
  throw new Error('Invalid release version.');
// This calls real signature, Gatekeeper, notarization, runtime and architecture checks.
// No unsigned/skip mode exists for staging a public installer.
execFileSync(
  process.execPath,
  [
    join(desktopRoot, 'scripts/verify-packaged-app.mjs'),
    '--arch=universal',
    '--signing=release',
  ],
  { stdio: 'inherit' },
);
const name = `Sia-${version}-universal.dmg`;
const artifact = join(desktopRoot, 'release', name);
const details = await stat(artifact);
if (!details.isFile() || details.size <= 0) throw new Error('Installer is empty.');
const hash = createHash('sha256');
for await (const chunk of createReadStream(artifact)) hash.update(chunk);
const sha256 = hash.digest('hex');
execFileSync(process.execPath, [join(siteRoot, 'scripts/build.mjs')], { stdio: 'inherit' });
const relativePath = `downloads/${version}/${sha256.slice(0, 16)}/${name}`;
const output = join(siteRoot, 'dist', relativePath);
await mkdir(resolve(output, '..'), { recursive: true });
await cp(artifact, output, { errorOnExist: true, force: false });
await writeFile(
  join(siteRoot, 'dist/download/release.json'),
  JSON.stringify(
    { schemaVersion: 1, version, path: '/' + relativePath, bytes: details.size, sha256 },
    null,
    2,
  ) + '\n',
);
console.log(
  `Verified public download staged locally at ${output}. Nothing uploaded or published.`,
);
