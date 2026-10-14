import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';

import { CognitoIdTokenVerifier } from '../../src/aws/cognito-id-token.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';
const now = 1_790_000_000_000;

function token(claims: Record<string, unknown>, kid = 'key-1', key = privateKey): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: 'desktop-client',
      token_use: 'id',
      sub: 'user-1',
      exp: now / 1_000 + 300,
      ...claims,
    }),
  ).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), key);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function verifier(fetches: string[] = []) {
  return new CognitoIdTokenVerifier(
    'us-east-1',
    'us-east-1_pool',
    'desktop-client',
    async (url) => {
      fetches.push(url);
      return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'key-1' }] };
    },
    () => now,
  );
}

describe('Cognito ID token verification for the phone relay', () => {
  it('accepts a signed, current ID token for the desktop client and caches the keys', async () => {
    const fetches: string[] = [];
    const subject = verifier(fetches);
    assert.deepEqual(await subject.verify(token({})), { subject: 'user-1' });
    await subject.verify(token({}));
    assert.deepEqual(fetches, [`${issuer}/.well-known/jwks.json`]);
  });

  it('rejects wrong audience, access tokens, expired tokens, and forged signatures', async () => {
    const subject = verifier();
    const forger = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    for (const bad of [
      token({ aud: 'another-client' }),
      token({ token_use: 'access' }),
      token({ exp: now / 1_000 - 1 }),
      token({ iss: 'https://evil.example' }),
      token({}, 'key-1', forger),
      token({}, 'unknown-kid'),
      'not.a.jwt',
    ]) {
      await assert.rejects(subject.verify(bad));
    }
  });
});
