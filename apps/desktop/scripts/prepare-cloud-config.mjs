import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const mode = process.argv[2];
if (!['--allow-disabled', '--require-enabled'].includes(mode)) {
  throw new Error('Usage: prepare-cloud-config.mjs --allow-disabled|--require-enabled');
}

const values = {
  apiBaseUrl: process.env.SIA_RELEASE_API_BASE_URL,
  cognitoRegion: process.env.SIA_RELEASE_COGNITO_REGION,
  cognitoClientId: process.env.SIA_RELEASE_COGNITO_CLIENT_ID,
};
const updateManifestUrl = process.env.SIA_RELEASE_UPDATE_MANIFEST_URL;
const updateManifestPublicKey = process.env.SIA_RELEASE_UPDATE_MANIFEST_PUBLIC_KEY;
const supplied = Object.values(values).filter(Boolean).length;
let config;
if (supplied === 0 && mode === '--allow-disabled') {
  config = {
    schemaVersion: 1,
    enabled: false,
    ...(updateManifestUrl ? { updateManifestUrl } : {}),
    ...(updateManifestPublicKey ? { updateManifestPublicKey } : {}),
  };
} else {
  if (supplied !== 3) {
    throw new Error(
      'Release cloud configuration requires SIA_RELEASE_API_BASE_URL, SIA_RELEASE_COGNITO_REGION, and SIA_RELEASE_COGNITO_CLIENT_ID together.',
    );
  }
  validate(values);
  config = {
    schemaVersion: 1,
    enabled: true,
    ...values,
    ...(updateManifestUrl ? { updateManifestUrl } : {}),
    ...(updateManifestPublicKey ? { updateManifestPublicKey } : {}),
  };
}

if (Boolean(updateManifestUrl) !== Boolean(updateManifestPublicKey)) {
  throw new Error(
    'Release update configuration requires SIA_RELEASE_UPDATE_MANIFEST_URL and SIA_RELEASE_UPDATE_MANIFEST_PUBLIC_KEY together.',
  );
}
if (updateManifestUrl) validateHttpsUrl(updateManifestUrl, 'SIA_RELEASE_UPDATE_MANIFEST_URL');
if (updateManifestPublicKey && !/^[A-Za-z0-9_-]{59}$/.test(updateManifestPublicKey)) {
  throw new Error(
    'SIA_RELEASE_UPDATE_MANIFEST_PUBLIC_KEY must be a base64url Ed25519 SPKI key.',
  );
}

const desktopRoot = resolve(import.meta.dirname, '..');
const output = join(desktopRoot, 'build', 'sia-cloud.json');
const temporary = `${output}.tmp-${process.pid}`;
await mkdir(dirname(output), { recursive: true });
await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
await rename(temporary, output);
console.log(`Prepared ${config.enabled ? 'enabled' : 'disabled'} signed cloud configuration.`);

function validate(value) {
  validateHttpsUrl(value.apiBaseUrl, 'SIA_RELEASE_API_BASE_URL');
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(value.cognitoRegion)) {
    throw new Error('SIA_RELEASE_COGNITO_REGION is invalid.');
  }
  if (!/^[A-Za-z0-9]{10,128}$/.test(value.cognitoClientId)) {
    throw new Error('SIA_RELEASE_COGNITO_CLIENT_ID is invalid.');
  }
}

function validateHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be a clean HTTPS URL.`);
  }
}
