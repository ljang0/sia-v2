import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const desktopRoot = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'));
const version = String(packageJson.version);
const stackName = option('stack') ?? process.env.SIA_RELEASE_STACK ?? 'sia-alpha';
const region = option('region') ?? process.env.AWS_REGION ?? 'us-east-1';
const expiresIn = Number(option('expires') ?? '604800');
const dryRun = process.argv.includes('--dry-run');

if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 604_800) {
  throw new Error('--expires must be an integer between 60 and 604800 seconds.');
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
