const requiredCloud = [
  'SIA_RELEASE_API_BASE_URL',
  'SIA_RELEASE_COGNITO_REGION',
  'SIA_RELEASE_COGNITO_CLIENT_ID',
  'SIA_RELEASE_UPDATE_MANIFEST_URL',
  'SIA_RELEASE_UPDATE_MANIFEST_PUBLIC_KEY',
];

const signingReady =
  Boolean(process.env.CSC_NAME) ||
  Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
const appleIdNotarizationReady = Boolean(
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
);
const notarizationReady =
  Boolean(process.env.APPLE_KEYCHAIN_PROFILE) || appleIdNotarizationReady;
const missingCloud = requiredCloud.filter((name) => !process.env[name]);
const missing = [
  ...(!signingReady ? ['CSC_NAME or CSC_LINK + CSC_KEY_PASSWORD'] : []),
  ...(!notarizationReady
    ? ['APPLE_KEYCHAIN_PROFILE or APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID']
    : []),
  ...missingCloud,
];

if (missing.length) {
  throw new Error(
    `Signed release credentials/configuration are incomplete: ${missing.join(', ')}`,
  );
}
if (appleIdNotarizationReady && !/^[A-Z0-9]{10}$/.test(process.env.APPLE_TEAM_ID)) {
  throw new Error('APPLE_TEAM_ID must be a 10-character Apple team identifier.');
}
console.log('Signed release environment is complete.');
