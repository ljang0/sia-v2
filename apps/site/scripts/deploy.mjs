import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(siteRoot, '../..');
const stackName = process.env.SIA_SITE_STACK ?? 'sia-public-site';
const domain = process.env.SIA_SITE_DOMAIN ?? 'superintelligentagents.ai';
const certificateArn = process.env.SIA_SITE_CERTIFICATE_ARN;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

run('node', [join(siteRoot, 'scripts/build.mjs')]);
const parameterOverrides = [
  `DomainName=${domain}`,
  `UseCustomDomain=${certificateArn ? 'true' : 'false'}`,
];
if (certificateArn) parameterOverrides.push(`CertificateArn=${certificateArn}`);

run('aws', [
  'cloudformation',
  'deploy',
  '--stack-name',
  stackName,
  '--template-file',
  join(repositoryRoot, 'infra/public-site.yaml'),
  '--parameter-overrides',
  ...parameterOverrides,
  '--tags',
  'Project=Sia',
  'Environment=alpha',
  '--no-fail-on-empty-changeset',
]);

const outputs = JSON.parse(
  run(
    'aws',
    [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      stackName,
      '--query',
      'Stacks[0].Outputs',
      '--output',
      'json',
    ],
    { capture: true },
  ),
);

const output = (key) => outputs.find((item) => item.OutputKey === key)?.OutputValue;
const bucket = output('BucketName');
const distribution = output('DistributionId');

if (!bucket || !distribution)
  throw new Error('The site stack did not return deployment outputs.');

run('aws', [
  's3',
  'sync',
  join(siteRoot, 'dist'),
  `s3://${bucket}`,
  '--delete',
  '--cache-control',
  'public,max-age=300,must-revalidate',
]);
run('aws', [
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  distribution,
  '--paths',
  '/*',
]);

console.log(`Staged ${domain} in s3://${bucket} through CloudFront ${distribution}.`);
