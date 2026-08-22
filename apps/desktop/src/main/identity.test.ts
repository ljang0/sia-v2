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

  it('falls back to password then TOTP for an MFA-protected admin without persisting the password', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (calls.length === 1) {
          return Response.json({
            ChallengeName: 'SELECT_CHALLENGE',
            AvailableChallenges: ['PASSWORD', 'PASSWORD_SRP'],
            Session: 'choice-session-value-that-is-long-enough',
          });
        }
        if (calls.length === 2) {
          return Response.json({
            ChallengeName: 'SOFTWARE_TOKEN_MFA',
            ChallengeParameters: { USERNAME: 'canonical-admin' },
            Session: 'totp-session-value-that-is-long-enough',
          });
        }
        return Response.json({
          AuthenticationResult: {
            AccessToken: 'access-token',
            IdToken: idToken({ 'cognito:groups': ['Admins'] }),
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

    await expect(identity.startEmailSignIn('admin@example.com')).resolves.toEqual({
      state: 'password_required',
      email: 'admin@example.com',
    });
    await expect(identity.completePasswordSignIn('unique admin password')).resolves.toEqual({
      state: 'mfa_required',
      email: 'admin@example.com',
    });
    expect(calls[1]).toEqual({
      AuthFlow: 'USER_AUTH',
      ClientId: 'clientid123456789',
      AuthParameters: {
        USERNAME: 'admin@example.com',
        PREFERRED_CHALLENGE: 'PASSWORD',
        PASSWORD: 'unique admin password',
      },
    });

    await expect(identity.completeMfaSignIn('123456')).resolves.toMatchObject({
      state: 'signed_in',
      admin: true,
      adminMfa: true,
    });
    expect(calls[2]).toMatchObject({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ChallengeResponses: {
        USERNAME: 'canonical-admin',
        SOFTWARE_TOKEN_MFA_CODE: '123456',
      },
    });
    const stored = repository.get('auth', 'cognito');
    expect(stored).not.toHaveProperty('accessToken');
    expect(JSON.stringify(stored)).not.toContain('unique admin password');
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

  it('completes a software-token challenge and marks the admin session MFA-verified', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (calls.length === 1) {
          return Response.json({
            ChallengeName: 'EMAIL_OTP',
            ChallengeParameters: { USERNAME: 'admin-user' },
            Session: 'email-session-value-that-is-long-enough',
          });
        }
        if (calls.length === 2) {
          return Response.json({
            ChallengeName: 'SOFTWARE_TOKEN_MFA',
            Session: 'totp-session-value-that-is-long-enough',
          });
        }
        return Response.json({
          AuthenticationResult: {
            AccessToken: 'access-token',
            IdToken: idToken({ 'cognito:groups': ['Admins'] }),
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

    await identity.startEmailSignIn('admin@example.com');
    await expect(identity.completeEmailSignIn('12345678')).resolves.toMatchObject({
      state: 'mfa_required',
    });
    await expect(identity.completeMfaSignIn('123456')).resolves.toMatchObject({
      state: 'signed_in',
      admin: true,
      adminMfa: true,
    });
    expect(calls[2]).toMatchObject({
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ChallengeResponses: {
        USERNAME: 'admin-user',
        SOFTWARE_TOKEN_MFA_CODE: '123456',
      },
    });
    expect(repository.get('auth', 'cognito')).not.toHaveProperty('accessToken');
    repository.close();
  });

  it('enrolls an admin authenticator without persisting its access token', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (calls.length === 1) {
          return Response.json({
            ChallengeName: 'EMAIL_OTP',
            ChallengeParameters: { USERNAME: 'admin-user' },
            Session: 'email-session-value-that-is-long-enough',
          });
        }
        if (calls.length === 2) {
          return Response.json({
            AuthenticationResult: {
              AccessToken: 'access-token',
              IdToken: idToken({ 'cognito:groups': ['Admins'] }),
              RefreshToken: 'refresh-token',
              ExpiresIn: 3600,
            },
          });
        }
        if (calls.length === 3) return Response.json({ SecretCode: 'BASE32SETUPKEY' });
        if (calls.length === 4) return Response.json({ Status: 'SUCCESS' });
        return Response.json({});
      }),
    );
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const identity = new CognitoIdentityManager({
      region: 'us-east-1',
      clientId: 'clientid123456789',
      repository,
    });

    await identity.startEmailSignIn('admin@example.com');
    await identity.completeEmailSignIn('12345678');
    await expect(identity.beginMfaEnrollment()).resolves.toEqual({
      secretCode: 'BASE32SETUPKEY',
    });
    await expect(identity.completeMfaEnrollment('654321')).resolves.toMatchObject({
      admin: true,
      adminMfa: true,
    });
    expect(calls.slice(2)).toEqual([
      { AccessToken: 'access-token' },
      {
        AccessToken: 'access-token',
        UserCode: '654321',
        FriendlyDeviceName: 'Sia admin',
      },
      {
        AccessToken: 'access-token',
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      },
    ]);
    expect(repository.get('auth', 'cognito')).not.toHaveProperty('accessToken');
    repository.close();
  });
});

function idToken(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

function expiredTokens() {
  return {
    idToken: 'expired-id-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() - 60_000,
    email: 'person@example.com',
  };
}
