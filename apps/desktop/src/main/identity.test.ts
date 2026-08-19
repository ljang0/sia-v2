import { afterEach, describe, expect, it, vi } from 'vitest';

import { CognitoIdentityManager } from './identity.js';
import { PlaintextTestCipher, SqliteRecordRepository } from './persistence.js';

afterEach(() => vi.unstubAllGlobals());

describe('CognitoIdentityManager', () => {
  it('completes passwordless email OTP and persists only the renewable encrypted session', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (calls.length === 1) {
          return Response.json({
            ChallengeName: 'EMAIL_OTP',
            ChallengeParameters: { USERNAME: 'canonical-user' },
            Session: 'a-session-value-that-is-long-enough',
          });
        }
        return Response.json({
          AuthenticationResult: {
            AccessToken: 'access-token',
            IdToken: 'id-token',
            RefreshToken: 'refresh-token',
            ExpiresIn: 3600,
          },
        });
      }),
    );
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const identity = new CognitoIdentityManager({
      region: 'us-east-1',
      clientId: 'clientid123456789',
      repository,
    });

    await expect(identity.startEmailSignIn('Person@Example.com')).resolves.toEqual({
      state: 'code_sent',
      email: 'person@example.com',
    });
    await expect(identity.completeEmailSignIn('12345678')).resolves.toEqual({
      state: 'signed_in',
      email: 'person@example.com',
    });
    await expect(identity.read()).resolves.toBe('id-token');
    expect(calls[1]).toMatchObject({
      ChallengeName: 'EMAIL_OTP',
      ChallengeResponses: { USERNAME: 'canonical-user', EMAIL_OTP_CODE: '12345678' },
    });
    const stored = repository.get('auth', 'cognito');
    expect(stored).toMatchObject({
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      email: 'person@example.com',
    });
    expect(stored).not.toHaveProperty('accessToken');
    repository.close();
  });

  it('refreshes and returns the Cognito ID token required by the API authorizer', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('auth', 'cognito', {
      accessToken: 'legacy-access-token',
      idToken: 'expired-id-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 60_000,
      email: 'person@example.com',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          AuthenticationResult: {
            AccessToken: 'refreshed-access-token',
            IdToken: 'refreshed-id-token',
            ExpiresIn: 3600,
          },
        }),
      ),
    );
    const identity = new CognitoIdentityManager({
      region: 'us-east-1',
      clientId: 'clientid123456789',
      repository,
    });

    await expect(identity.initialize()).resolves.toEqual({
      state: 'signed_in',
      email: 'person@example.com',
    });
    await expect(identity.read()).resolves.toBe('refreshed-id-token');
    const stored = repository.get('auth', 'cognito');
    expect(stored).toMatchObject({ idToken: 'refreshed-id-token' });
    expect(stored).not.toHaveProperty('accessToken');
    repository.close();
  });

  it('keeps an expired stored session when refresh fails transiently', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('auth', 'cognito', expiredTokens());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Network unavailable');
      }),
    );
    const identity = new CognitoIdentityManager({
      region: 'us-east-1',
      clientId: 'clientid123456789',
      repository,
    });

    await expect(identity.initialize()).resolves.toEqual({
      state: 'signed_in',
      email: 'person@example.com',
    });
    expect(repository.get('auth', 'cognito')).toMatchObject({
      refreshToken: 'refresh-token',
    });
    repository.close();
  });

  it('clears an expired stored session only after Cognito definitively rejects it', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('auth', 'cognito', expiredTokens());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { __type: 'NotAuthorizedException', message: 'Refresh token rejected' },
          { status: 400 },
        ),
      ),
    );
    const identity = new CognitoIdentityManager({
      region: 'us-east-1',
      clientId: 'clientid123456789',
      repository,
    });

    await expect(identity.initialize()).resolves.toEqual({ state: 'signed_out' });
    expect(repository.get('auth', 'cognito')).toBeUndefined();
    repository.close();
  });
});

function expiredTokens() {
  return {
    idToken: 'expired-id-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
    email: 'person@example.com',
  };
}
