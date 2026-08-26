import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { canonicalJson, verifyUpdateManifestResponse } from './update-manifest.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
const payload = {
  schemaVersion: 1 as const,
  channel: 'internal' as const,
  platform: 'macos' as const,
  architecture: 'universal' as const,
  version: '0.1.0-alpha.14',
  publishedAt: '2026-08-26T12:00:00.000Z',
  minimumSystemVersion: '14.0',
  artifact: {
    key: 'releases/0.1.0-alpha.14/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.14-universal.dmg',
    sha256: 'a'.repeat(64),
    bytes: 250_000_000,
  },
};

function signed(overrides: Record<string, unknown> = {}) {
  return {
    payload,
    keyId: 'sia-release-2026-01',
    signature: sign(null, Buffer.from(canonicalJson(payload)), keys.privateKey).toString(
      'base64url',
    ),
    downloadUrl:
      'https://sia-alpha-releases.s3.us-east-1.amazonaws.com/releases/0.1.0-alpha.14/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.14-universal.dmg?X-Amz-Signature=test',
    ...overrides,
  };
}

describe('signed update manifest', () => {
  it('accepts an Ed25519-signed manifest and a time-limited HTTPS download', () => {
    expect(verifyUpdateManifestResponse(signed(), publicKey)).toEqual({
      payload,
      downloadUrl: signed().downloadUrl,
    });
  });

  it('rejects tampering, unknown fields, unsafe downloads, and the wrong public key', () => {
    expect(() =>
      verifyUpdateManifestResponse(
        signed({ payload: { ...payload, version: '0.1.0-alpha.99' } }),
        publicKey,
      ),
    ).toThrow(/signature/);
    expect(() =>
      verifyUpdateManifestResponse({ ...signed(), extra: true }, publicKey),
    ).toThrow();
    expect(() =>
      verifyUpdateManifestResponse(
        signed({ downloadUrl: 'http://example.test/file.dmg' }),
        publicKey,
      ),
    ).toThrow(/download URL/);
    expect(() =>
      verifyUpdateManifestResponse(
        signed({
          downloadUrl:
            'https://sia-alpha-releases.s3.us-east-1.amazonaws.com/releases/0.1.0-alpha.14/bbbbbbbbbbbbbbbb/Sia-0.1.0-alpha.14-universal.dmg?X-Amz-Signature=test',
        }),
        publicKey,
      ),
    ).toThrow(/download URL/);
    const other = generateKeyPairSync('ed25519').publicKey.export({
      format: 'der',
      type: 'spki',
    });
    expect(() => verifyUpdateManifestResponse(signed(), other.toString('base64url'))).toThrow(
      /signature/,
    );
  });
});
