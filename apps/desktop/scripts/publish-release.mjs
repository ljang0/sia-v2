import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const desktopRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'));
const version = String(packageJson.version);
const stackName = option('stack') ?? process.env.SIA_RELEASE_STACK ?? 'sia-alpha';
const region = option('region') ?? process.env.AWS_REGION ?? 'us-east-1';
const expiresIn = Number(option('expires') ?? '604800');
const dryRun = process.argv.includes('--dry-run');
const privateKeyPath =
  option('manifest-key') ?? process.env.SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE;
const keyId = option('manifest-key-id') ?? process.env.SIA_RELEASE_MANIFEST_KEY_ID;

if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 604_800) {
  throw new Error('--expires must be an integer between 60 and 604800 seconds.');
}
if (!dryRun && (!privateKeyPath || !keyId)) {
  throw new Error(
    'Publishing requires SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE and SIA_RELEASE_MANIFEST_KEY_ID.',
  );
}
if (keyId && !/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) {
  throw new Error('The release manifest key ID is invalid.');
}

const artifacts = [
  {
    path: join(desktopRoot, 'release', `Sia-${version}-universal.dmg`),
    contentType: 'application/x-apple-diskimage',
  },
  {
    path: join(desktopRoot, 'release', `Sia-${version}-universal.zip`),
    contentType: 'application/zip',
  },
];

const prepared = [];
for (const artifact of artifacts) {
  const details = await stat(artifact.path);
  if (!details.isFile() || details.size <= 0) {
    throw new Error(`Release artifact is missing or empty: ${artifact.path}`);
  }
  prepared.push({
    ...artifact,
    bytes: details.size,
    sha256: await sha256(artifact.path),
  });
}

if (dryRun) {
  process.stdout.write(
    `${JSON.stringify(
      {
        dryRun: true,
        version,
        stackName,
        region,
        expiresIn,
        artifacts: prepared.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const bucket = runAws([
  'cloudformation',
  'describe-stacks',
  '--stack-name',
  stackName,
  '--region',
  region,
  '--query',
  'Stacks[0].Outputs[?OutputKey==`ReleaseArtifactsBucketName`].OutputValue | [0]',
  '--output',
  'text',
]).trim();
const apiBaseUrl = runAws([
  'cloudformation',
  'describe-stacks',
  '--stack-name',
  stackName,
  '--region',
  region,
  '--query',
  'Stacks[0].Outputs[?OutputKey==`ApiBaseUrl`].OutputValue | [0]',
  '--output',
  'text',
]).trim();

if (!bucket || bucket === 'None') {
  throw new Error(`Stack ${stackName} does not expose ReleaseArtifactsBucketName.`);
}

const published = [];
for (const artifact of prepared) {
  const key = `releases/${version}/${artifact.sha256.slice(0, 16)}/${basename(artifact.path)}`;
  const existing = headObject(bucket, key);
  if (existing && existing.Metadata?.sha256 !== artifact.sha256) {
    throw new Error(`Refusing to replace ${key}: its recorded SHA-256 does not match.`);
  }
  if (!existing) {
    runAws([
      's3',
      'cp',
      artifact.path,
      `s3://${bucket}/${key}`,
      '--region',
      region,
      '--only-show-errors',
      '--content-type',
      artifact.contentType,
      '--metadata',
      `sha256=${artifact.sha256},version=${version}`,
    ]);
  }
  const verified = headObject(bucket, key);
  if (
    !verified ||
    Number(verified.ContentLength) !== artifact.bytes ||
    verified.Metadata?.sha256 !== artifact.sha256
  ) {
    throw new Error(`Uploaded artifact verification failed for s3://${bucket}/${key}.`);
  }
  published.push({ ...artifact, bucket, key });
}

const dmg = published.find(({ path }) => path.endsWith('.dmg'));
if (!dmg) throw new Error('The universal DMG was not published.');
const signingKey = await loadSigningKey(privateKeyPath);
const payload = {
  schemaVersion: 1,
  channel: 'internal',
  platform: 'macos',
  architecture: 'universal',
  version,
  publishedAt: new Date().toISOString(),
  minimumSystemVersion: '14.0',
  artifact: { key: dmg.key, sha256: dmg.sha256, bytes: dmg.bytes },
};
const manifest = {
  payload,
  keyId,
  signature: sign(null, Buffer.from(canonicalJson(payload)), signingKey.privateKey).toString(
    'base64url',
  ),
};
const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha256 = createHash('sha256').update(manifestBody).digest('hex');
const manifestPath = join(desktopRoot, 'release', 'update-manifest.json');
await writeFile(manifestPath, manifestBody, { encoding: 'utf8', mode: 0o600 });
const immutableManifestKey = `manifests/macos/${version}/${manifestSha256}.json`;
if (headObject(bucket, 'manifests/macos/latest.json')) {
  const existing = JSON.parse(
    runAws([
      's3',
      'cp',
      `s3://${bucket}/manifests/macos/latest.json`,
      '-',
      '--region',
      region,
      '--only-show-errors',
    ]),
  );
  const existingVersion = existing?.payload?.version;
  if (typeof existingVersion !== 'string' || compareVersions(existingVersion, version) > 0) {
    throw new Error(
      'Refusing to replace the latest manifest with an older or invalid release.',
    );
  }
  if (
    compareVersions(existingVersion, version) === 0 &&
    (existing?.payload?.artifact?.key !== dmg.key ||
      existing?.payload?.artifact?.sha256 !== dmg.sha256)
  ) {
    throw new Error(
      'Refusing to replace a same-version latest manifest with a different artifact.',
    );
  }
}
for (const key of [immutableManifestKey, 'manifests/macos/latest.json']) {
  runAws([
    's3',
    'cp',
    manifestPath,
    `s3://${bucket}/${key}`,
    '--region',
    region,
    '--only-show-errors',
    '--content-type',
    'application/json',
    '--cache-control',
    'no-store',
    '--metadata',
    `sha256=${manifestSha256},version=${version},keyid=${keyId}`,
  ]);
  const verified = headObject(bucket, key);
  if (
    !verified ||
    Number(verified.ContentLength) !== Buffer.byteLength(manifestBody) ||
    verified.Metadata?.sha256 !== manifestSha256
  ) {
    throw new Error(`Published manifest verification failed for s3://${bucket}/${key}.`);
  }
}
const downloadUrl = runAws([
  's3',
  'presign',
  `s3://${dmg.bucket}/${dmg.key}`,
  '--region',
  region,
  '--expires-in',
  String(expiresIn),
]).trim();

process.stdout.write(
  `${JSON.stringify(
    {
      version,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      downloadUrl,
      updateManifestUrl: `${apiBaseUrl}/v1/releases/macos`,
      updateManifestPublicKey: signingKey.publicKey,
      manifest: {
        key: immutableManifestKey,
        sha256: manifestSha256,
        keyId,
      },
      artifacts: published.map(({ path, bytes, sha256, bucket: name, key }) => ({
        path,
        bytes,
        sha256,
        bucket: name,
        key,
      })),
    },
    null,
    2,
  )}\n`,
);

function option(name) {
  return process.argv
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

function runAws(args, allowMissing = false) {
  const result = spawnSync('aws', args, { encoding: 'utf8', timeout: 20 * 60_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowMissing && result.status === 254) return undefined;
    throw new Error(`aws ${args[0]} failed (${String(result.status)}): ${result.stderr}`);
  }
  return result.stdout;
}

function headObject(bucket, key) {
  const output = runAws(
    [
      's3api',
      'head-object',
      '--bucket',
      bucket,
      '--key',
      key,
      '--region',
      region,
      '--output',
      'json',
    ],
    true,
  );
  return output ? JSON.parse(output) : undefined;
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function loadSigningKey(path) {
  const details = await stat(path);
  if (!details.isFile() || (details.mode & 0o077) !== 0) {
    throw new Error('The manifest private-key file must be a regular file with mode 0600.');
  }
  const privateKey = createPrivateKey(await readFile(path));
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('The manifest signing key must be Ed25519.');
  }
  const publicKey = createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .toString('base64url');
  return { privateKey, publicKey };
}

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

function compareVersions(left, right) {
  const parse = (value) =>
    value
      .replace(/^v/, '')
      .split(/[.-]/)
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return av < bv ? -1 : 1;
    return String(av).localeCompare(String(bv));
  }
  return 0;
}
