import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';

const cloudRoot = resolve(import.meta.dirname, '..');
const outputRoot = join(cloudRoot, 'lambda');
const require = createRequire(import.meta.url);
const entries = [
  ['control', 'src/lambda.ts'],
  ['meta', 'src/meta-lambda.ts'],
  ['deletion', 'src/deletion-lambda.ts'],
];

// Lambda injects this streaming adapter at runtime. A minimal local stand-in lets
// the build load every cold-start path without invoking a handler.
globalThis.awslambda = {
  streamifyResponse: (handler) => handler,
  HttpResponseStream: { from: (stream) => stream },
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const artifacts = [];
for (const [name, entry] of entries) {
  const directory = join(outputRoot, name);
  const outfile = join(directory, 'index.cjs');
  await mkdir(directory, { recursive: true });
  await build({
    absWorkingDir: cloudRoot,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    charset: 'utf8',
    legalComments: 'linked',
    minify: false,
    sourcemap: false,
    treeShaking: true,
    logLevel: 'warning',
  });
  if (typeof require(outfile).handler !== 'function') {
    throw new Error(`${name} Lambda bundle cannot load its handler in Node.js.`);
  }
  const bytes = await readFile(outfile);
  artifacts.push({
    name,
    file: `${name}/index.cjs`,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

await writeFile(
  join(outputRoot, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, target: 'node22', artifacts }, null, 2)}\n`,
  'utf8',
);
console.log(`Built ${artifacts.length} reproducible Lambda bundles in ${outputRoot}.`);
