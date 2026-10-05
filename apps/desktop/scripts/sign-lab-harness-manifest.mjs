#!/usr/bin/env node
// Signs a lab harness testing manifest with Sia's release manifest key.
//
//   SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE=… SIA_RELEASE_MANIFEST_KEY_ID=… \
//     node scripts/sign-lab-harness-manifest.mjs harnesses.json signed-manifest.json [--days 14]
//
// `harnesses.json` lists each harness without its hash:
//   [{ "id": "example_lab", "name": "Example Lab", "command": "/abs/path/example-acp",
//      "args": ["acp"], "models": [{ "id": "example/spark", "label": "Spark" }],
//      "disclosure": "Prompts and tool results go to Example Lab; kept 30 days." }]
// The script hashes each command file on this machine, so sign only the exact binary the tester
// will run. A tester starts Sia with SIA_LAB_HARNESS_MANIFEST=<signed-manifest.json>.
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const daysIndex = process.argv.indexOf('--days');
const days = daysIndex > 0 ? Number(process.argv[daysIndex + 1]) : 14;
const privateKeyPath = process.env.SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE;
const keyId = process.env.SIA_RELEASE_MANIFEST_KEY_ID;
if (!input || !output || !privateKeyPath || !keyId) {
  console.error(
    'Usage: SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE=… SIA_RELEASE_MANIFEST_KEY_ID=… node scripts/sign-lab-harness-manifest.mjs <harnesses.json> <out.json> [--days N]',
  );
  process.exit(2);
}
if (!Number.isInteger(days) || days < 1 || days > 90) {
  console.error('--days must be a whole number from 1 to 90.');
  process.exit(2);
}
const keyDetails = await stat(privateKeyPath);
if (!keyDetails.isFile() || (keyDetails.mode & 0o077) !== 0) {
  throw new Error('The manifest private-key file must be a regular file with mode 0600.');
}
const privateKey = createPrivateKey(await readFile(privateKeyPath));
if (privateKey.asymmetricKeyType !== 'ed25519')
  throw new Error('The signing key must be Ed25519.');

const harnesses = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(harnesses) || harnesses.length === 0)
  throw new Error('The input must be a non-empty array of harnesses.');
const payload = {
  schemaVersion: 1,
  kind: 'lab_harness_test',
  expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
  harnesses: await Promise.all(
    harnesses.map(async (harness) => ({
      ...harness,
      sha256: createHash('sha256')
        .update(await readFile(harness.command))
        .digest('hex'),
    })),
  ),
};
const manifest = {
  payload,
  keyId,
  signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64url'),
};
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
console.log(
  `Signed ${payload.harnesses.length} lab harness(es); expires ${payload.expiresAt}.`,
);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
