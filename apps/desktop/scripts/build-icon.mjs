import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const desktopRoot = resolve(import.meta.dirname, '..');
const source = join(desktopRoot, 'build', 'icon.svg');
const destination = join(desktopRoot, 'build', 'icon.icns');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'sia-icon.'));
const iconset = join(temporaryRoot, 'Sia.iconset');

try {
  await mkdir(iconset);
  const sizes = [16, 32, 128, 256, 512];
  for (const size of sizes) {
    render(size, join(iconset, `icon_${size}x${size}.png`));
    render(size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
  }
  run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', destination]);
  const signature = (await readFile(destination)).subarray(0, 4).toString('ascii');
  if (signature !== 'icns') throw new Error('Generated icon does not have an ICNS header.');
  console.log(`Generated ${basename(destination)} from ${basename(source)}.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

function render(size, output) {
  run('/usr/bin/sips', [
    '-s',
    'format',
    'png',
    '-z',
    String(size),
    String(size),
    source,
    '--out',
    output,
  ]);
}

function run(command, argumentsValue) {
  const result = spawnSync(command, argumentsValue, {
    encoding: 'utf8',
    cwd: dirname(source),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
}
