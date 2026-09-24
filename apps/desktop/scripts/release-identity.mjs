import { readFileSync } from 'node:fs';

export const releaseIdentity = Object.freeze(
  JSON.parse(readFileSync(new URL('../build/release-identity.json', import.meta.url), 'utf8')),
);

// Product name selects Electron's Keychain service; bundle ID and signing team
// identify its trusted app. Keep all three stable across distributed updates.
export function verifyReleaseIdentity(
  { productName, bundleIdentifier, executable, signature },
  expected = releaseIdentity,
) {
  if (
    productName !== expected.productName ||
    executable !== expected.productName ||
    bundleIdentifier !== expected.bundleIdentifier
  )
    throw new Error(
      'Release identity changed: preserve Sia’s product name, executable, and bundle identifier for Keychain and permission continuity.',
    );
  if (
    !signature.split('\n').includes(`TeamIdentifier=${expected.teamIdentifier}`) ||
    !signature.split('\n').includes(`Identifier=${expected.bundleIdentifier}`) ||
    !signature.includes('Authority=Developer ID Application:')
  )
    throw new Error(
      'Release signing identity does not match Sia’s pinned Developer ID team and bundle identifier.',
    );
}
