import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseIdentity, verifyReleaseIdentity } from './release-identity.mjs';

const released = {
  productName: 'Sia',
  executable: 'Sia',
  bundleIdentifier: 'ai.sia.desktop',
  signature:
    'Identifier=ai.sia.desktop\nAuthority=Developer ID Application: Example\nTeamIdentifier=DXYJ578DD4\n',
};
test('release identity preserves the existing Keychain namespace and Developer ID team', () => {
  assert.deepEqual(releaseIdentity, {
    productName: 'Sia',
    bundleIdentifier: 'ai.sia.desktop',
    teamIdentifier: 'DXYJ578DD4',
  });
  assert.doesNotThrow(() => verifyReleaseIdentity(released));
});
test('rejects renamed, development, foreign-team and unsigned release artifacts', () => {
  for (const changed of [
    { productName: 'Sia Development' },
    { executable: 'Electron' },
    { bundleIdentifier: 'ai.sia.desktop.dev' },
    { signature: released.signature.replace('DXYJ578DD4', 'OTHERTEAM1') },
    {
      signature: released.signature.replace('Developer ID Application:', 'Apple Development:'),
    },
    {
      signature: released.signature.replace(
        'Identifier=ai.sia.desktop\n',
        'Identifier=ai.sia.desktop.dev\n',
      ),
    },
    { signature: '' },
  ])
    assert.throws(() => verifyReleaseIdentity({ ...released, ...changed }), /identity/);
});
