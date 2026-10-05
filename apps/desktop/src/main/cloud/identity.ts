import type { IdTokenSource } from './cloud-client.js';
import type { RecordRepository } from '../storage/persistence.js';

type CloudIdentityState =
  | 'unconfigured'
  | 'signed_out'
  | 'code_sent'
  | 'password_required'
  | 'mfa_required'
  | 'signed_in';

export interface CloudIdentityStatus {
  state: CloudIdentityState;
  email?: string;
  admin?: boolean;
  adminMfa?: boolean;
}

interface StoredTokens {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  mfaVerified?: boolean;
}

interface PendingChallenge {
  kind: 'email' | 'password' | 'totp';
  email: string;
  username: string;
  session?: string;
}

/** A definitive Cognito rejection, as opposed to a transient network or service failure. */
class CognitoApiError extends Error {
  readonly type: string;
  readonly detail: string;

  constructor(message: string, type: string, detail = '') {
    super(message);
    this.type = type;
    this.detail = detail;
  }
}

const REFRESH_TOKEN_REJECTED =
  /NotAuthorized|UserNotFound|PasswordResetRequired|UserNotConfirmed/i;

/** Passwordless Cognito client. Refresh tokens stay inside the encrypted repository. */
export class CognitoIdentityManager implements IdTokenSource {
  readonly #region: string | undefined;
  readonly #clientId: string | undefined;
  readonly #repository: RecordRepository;
  readonly #developmentIdToken: string | undefined;
  #tokens: StoredTokens | undefined;
  #accessTokenValue: string | undefined;
  #pending: PendingChallenge | undefined;
  #refreshing: Promise<string | undefined> | undefined;
  #authGeneration = 0;

  constructor(options: {
    region?: string;
    clientId?: string;
    repository: RecordRepository;
    developmentIdToken?: string;
  }) {
    this.#region = validRegion(options.region) ? options.region : undefined;
    this.#clientId = validClientId(options.clientId) ? options.clientId : undefined;
    this.#repository = options.repository;
    this.#developmentIdToken = options.developmentIdToken;
  }

  async initialize(): Promise<CloudIdentityStatus> {
    if (this.#developmentIdToken) return this.status();
    if (!this.configured) return this.status();
    const stored = this.#repository.get<unknown>('auth', 'cognito');
    this.#authGeneration += 1;
    this.#tokens = parseStoredTokens(stored);
    if (stored !== undefined) {
      if (this.#tokens) this.#repository.put('auth', 'cognito', this.#tokens);
      else this.#repository.remove('auth', 'cognito');
    }
    // Refresh once on every launch even when the cached ID token has not expired.
    // Cognito group changes are reflected only in newly issued tokens; keeping a
    // still-valid token can otherwise leave the desktop on stale access policy
    // for up to an hour after an approved tester is enrolled.
    if (this.#tokens) await this.#refreshOnce().catch(() => undefined);
    return this.status();
  }

  get configured(): boolean {
    return Boolean(this.#developmentIdToken || (this.#region && this.#clientId));
  }

  status(): CloudIdentityStatus {
    if (this.#developmentIdToken) {
      const admin = tokenGroups(this.#developmentIdToken).includes('Admins');
      return {
        state: 'signed_in',
        email: 'Development session',
        ...(admin ? { admin: true, adminMfa: true } : {}),
      };
    }
    if (!this.#region || !this.#clientId) return { state: 'unconfigured' };
    if (this.#tokens)
      return {
        state: 'signed_in',
        email: this.#tokens.email,
        ...(tokenGroups(this.#tokens.idToken).includes('Admins') ? { admin: true } : {}),
        ...(this.#tokens.mfaVerified ? { adminMfa: true } : {}),
      };
    if (this.#pending)
      return {
        state:
          this.#pending.kind === 'totp'
            ? 'mfa_required'
            : this.#pending.kind === 'password'
              ? 'password_required'
              : 'code_sent',
        email: this.#pending.email,
      };
    return { state: 'signed_out' };
  }

  async read(): Promise<string | undefined> {
    if (this.#developmentIdToken) return this.#developmentIdToken;
    if (!this.#tokens) return undefined;
    if (this.#tokens.expiresAt > Date.now() + 60_000) return this.#tokens.idToken;
    return await this.#refreshOnce();
  }

  async refreshSession(): Promise<CloudIdentityStatus> {
    if (this.#developmentIdToken || !this.#tokens) return this.status();
    await this.#refreshOnce();
    return this.status();
  }

  async startEmailSignIn(emailValue: string): Promise<CloudIdentityStatus> {
    this.#assertConfiguredForUserAuth();
    const email = normalizeEmail(emailValue);
    const generation = ++this.#authGeneration;
    this.#refreshing = undefined;
    // A failed resend must not discard a code that is already in the inbox.
    const previous = this.#pending?.email === email ? this.#pending : undefined;
    this.#pending = undefined;
    let response: Record<string, unknown>;
    try {
      response = await this.#cognito('InitiateAuth', {
        AuthFlow: 'USER_AUTH',
        ClientId: this.#clientId,
        AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
      });
      if (generation !== this.#authGeneration) return this.status();
      if (
        response.ChallengeName === 'SELECT_CHALLENGE' &&
        !stringArray(response.AvailableChallenges).includes('EMAIL_OTP') &&
        stringArray(response.AvailableChallenges).includes('PASSWORD')
      ) {
        this.#pending = { kind: 'password', email, username: email };
        return this.status();
      }
      if (response.ChallengeName === 'SELECT_CHALLENGE') {
        response = await this.#cognito('RespondToAuthChallenge', {
          ChallengeName: 'SELECT_CHALLENGE',
          ClientId: this.#clientId,
          ChallengeResponses: { USERNAME: email, ANSWER: 'EMAIL_OTP' },
          Session: requiredString(response.Session, 'Cognito session'),
        });
      }
    } catch (error) {
      if (generation !== this.#authGeneration) return this.status();
      // Cognito does not offer passwordless EMAIL_OTP as a first factor after a
      // user has enrolled TOTP MFA. Invited participants stay passwordless;
      // the MFA-protected bootstrap admin falls back to password, then TOTP.
      if (
        error instanceof CognitoApiError &&
        /NotAuthorized/i.test(error.type) &&
        /no available challenges/i.test(error.detail)
      ) {
        this.#pending = { kind: 'password', email, username: email };
        return this.status();
      }
      this.#pending = previous;
      throw error;
    }
    if (generation !== this.#authGeneration) return this.status();
    if (record(response.AuthenticationResult).IdToken) {
      this.#storeTokens(response, email);
      return this.status();
    }
    if (response.ChallengeName !== 'EMAIL_OTP') {
      throw new Error('Email-code sign-in is not available for this account.');
    }
    const parameters = record(response.ChallengeParameters);
    this.#pending = {
      kind: 'email',
      email,
      username:
        typeof parameters.USERNAME === 'string' && parameters.USERNAME
          ? parameters.USERNAME
          : email,
      session: requiredString(response.Session, 'Cognito session'),
    };
    return this.status();
  }

  async completeEmailSignIn(codeValue: string): Promise<CloudIdentityStatus> {
    this.#assertConfiguredForUserAuth();
    const pending = this.#pending;
    if (!pending || pending.kind !== 'email')
      throw new Error('Request a new email code first.');
    const code = codeValue.replaceAll(/\s/g, '');
    if (!/^\d{6,10}$/.test(code)) throw new Error('Enter the numeric code from your email.');
    let response: Record<string, unknown>;
    try {
      response = await this.#cognito('RespondToAuthChallenge', {
        ChallengeName: 'EMAIL_OTP',
        ClientId: this.#clientId,
        ChallengeResponses: { USERNAME: pending.username, EMAIL_OTP_CODE: code },
        Session: requiredString(pending.session, 'Cognito session'),
      });
    } catch (error) {
      // Cognito reports an expired sign-in session as NotAuthorized, not ExpiredCode.
      if (error instanceof CognitoApiError && /NotAuthorized/i.test(error.type)) {
        throw new CognitoApiError(
          'That code expired. Request a new one.',
          error.type,
          error.detail,
        );
      }
      throw error;
    }
    if (this.#pending !== pending) return this.status();
    if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      this.#pending = {
        kind: 'totp',
        email: pending.email,
        username: pending.username,
        session: requiredString(response.Session, 'Cognito MFA session'),
      };
      return this.status();
    }
    this.#storeTokens(response, pending.email, false);
    this.#pending = undefined;
    return this.status();
  }

  async completePasswordSignIn(passwordValue: string): Promise<CloudIdentityStatus> {
    this.#assertConfiguredForUserAuth();
    const pending = this.#pending;
    if (!pending || pending.kind !== 'password') {
      throw new Error('Start sign-in again first.');
    }
    if (passwordValue.length === 0 || passwordValue.length > 256) {
      throw new Error('Enter the password for this administrator account.');
    }

    let response = await this.#cognito('InitiateAuth', {
      AuthFlow: 'USER_AUTH',
      ClientId: this.#clientId,
      AuthParameters: {
        USERNAME: pending.username,
        PREFERRED_CHALLENGE: 'PASSWORD',
        PASSWORD: passwordValue,
      },
    });
    if (this.#pending !== pending) return this.status();
    if (response.ChallengeName === 'SELECT_CHALLENGE') {
      response = await this.#cognito('RespondToAuthChallenge', {
        ChallengeName: 'SELECT_CHALLENGE',
        ClientId: this.#clientId,
        ChallengeResponses: {
          USERNAME: pending.username,
          ANSWER: 'PASSWORD',
          PASSWORD: passwordValue,
        },
        Session: requiredString(response.Session, 'Cognito password session'),
      });
    } else if (response.ChallengeName === 'PASSWORD') {
      const parameters = record(response.ChallengeParameters);
      const username =
        typeof parameters.USERNAME === 'string' && parameters.USERNAME
          ? parameters.USERNAME
          : pending.username;
      response = await this.#cognito('RespondToAuthChallenge', {
        ChallengeName: 'PASSWORD',
        ClientId: this.#clientId,
        ChallengeResponses: { USERNAME: username, PASSWORD: passwordValue },
        Session: requiredString(response.Session, 'Cognito password session'),
      });
      pending.username = username;
    }

    if (this.#pending !== pending) return this.status();
    if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      const parameters = record(response.ChallengeParameters);
      this.#pending = {
        kind: 'totp',
        email: pending.email,
        username:
          typeof parameters.USERNAME === 'string' && parameters.USERNAME
            ? parameters.USERNAME
            : pending.username,
        session: requiredString(response.Session, 'Cognito MFA session'),
      };
      return this.status();
    }
    this.#storeTokens(response, pending.email, false);
    this.#pending = undefined;
    return this.status();
  }

  async completeMfaSignIn(codeValue: string): Promise<CloudIdentityStatus> {
    this.#assertConfiguredForUserAuth();
    const pending = this.#pending;
    if (!pending || pending.kind !== 'totp') throw new Error('Start sign-in again first.');
    const code = validTotp(codeValue);
    const response = await this.#cognito('RespondToAuthChallenge', {
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      ClientId: this.#clientId,
      ChallengeResponses: {
        USERNAME: pending.username,
        SOFTWARE_TOKEN_MFA_CODE: code,
      },
      Session: requiredString(pending.session, 'Cognito MFA session'),
    });
    if (this.#pending !== pending) return this.status();
    this.#storeTokens(response, pending.email, true);
    this.#pending = undefined;
    return this.status();
  }

  async beginMfaEnrollment(): Promise<{ secretCode: string }> {
    const generation = this.#authGeneration;
    const accessToken = await this.#accessToken();
    if (generation !== this.#authGeneration) throw new Error('Sign-in changed. Try again.');
    if (!accessToken) throw new Error('Sign in again before securing admin access.');
    const response = await this.#cognito('AssociateSoftwareToken', {
      AccessToken: accessToken,
    });
    if (generation !== this.#authGeneration) throw new Error('Sign-in changed. Try again.');
    return { secretCode: requiredString(response.SecretCode, 'Authenticator setup secret') };
  }

  async completeMfaEnrollment(codeValue: string): Promise<CloudIdentityStatus> {
    const generation = this.#authGeneration;
    const accessToken = await this.#accessToken();
    if (generation !== this.#authGeneration) throw new Error('Sign-in changed. Try again.');
    if (!accessToken) throw new Error('Sign in again before securing admin access.');
    const response = await this.#cognito('VerifySoftwareToken', {
      AccessToken: accessToken,
      UserCode: validTotp(codeValue),
      FriendlyDeviceName: 'Sia admin',
    });
    if (generation !== this.#authGeneration) return this.status();
    if (response.Status !== 'SUCCESS')
      throw new Error('That authenticator code was not accepted.');
    await this.#cognito('SetUserMFAPreference', {
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
    });
    if (generation !== this.#authGeneration) return this.status();
    if (this.#tokens) {
      this.#tokens.mfaVerified = true;
      this.#repository.put('auth', 'cognito', this.#tokens);
    }
    return this.status();
  }

  async signOut(): Promise<CloudIdentityStatus> {
    this.#authGeneration += 1;
    this.#refreshing = undefined;
    const refreshToken = this.#tokens?.refreshToken;
    this.#tokens = undefined;
    this.#accessTokenValue = undefined;
    this.#pending = undefined;
    this.#repository.remove('auth', 'cognito');
    if (refreshToken && this.#clientId) {
      await this.#cognito('RevokeToken', {
        ClientId: this.#clientId,
        Token: refreshToken,
      }).catch(() => undefined);
    }
    return this.status();
  }

  #refreshOnce(): Promise<string | undefined> {
    if (this.#refreshing) return this.#refreshing;
    const refreshing = this.#refresh().finally(() => {
      if (this.#refreshing === refreshing) this.#refreshing = undefined;
    });
    this.#refreshing = refreshing;
    return refreshing;
  }

  async #refresh(): Promise<string | undefined> {
    const generation = this.#authGeneration;
    const current = this.#tokens;
    if (!current || !this.#clientId) return undefined;
    try {
      const response = await this.#cognito('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: this.#clientId,
        AuthParameters: { REFRESH_TOKEN: current.refreshToken },
      });
      if (generation !== this.#authGeneration || this.#tokens !== current) return undefined;
      const result = record(response.AuthenticationResult);
      const idToken = requiredString(result.IdToken, 'ID token');
      const accessToken = requiredString(result.AccessToken, 'access token');
      const expiresIn = positiveNumber(result.ExpiresIn) ?? 3_600;
      this.#accessTokenValue = accessToken;
      this.#tokens = {
        idToken,
        refreshToken: current.refreshToken,
        expiresAt: Date.now() + expiresIn * 1_000,
        email: current.email,
        ...(current.mfaVerified ? { mfaVerified: true } : {}),
      };
      this.#repository.put('auth', 'cognito', this.#tokens);
      return idToken;
    } catch (error) {
      if (generation !== this.#authGeneration || this.#tokens !== current) return undefined;
      // Only an explicit Cognito rejection ends the session. Transient failures
      // (offline, timeout, 5xx) keep the stored tokens so identity-bound local
      // state is not destroyed by a network blip; the next read retries.
      if (error instanceof CognitoApiError && REFRESH_TOKEN_REJECTED.test(error.type)) {
        this.#tokens = undefined;
        this.#accessTokenValue = undefined;
        this.#repository.remove('auth', 'cognito');
      }
      return undefined;
    }
  }

  #storeTokens(response: Record<string, unknown>, email: string, mfaVerified = false): void {
    const result = record(response.AuthenticationResult);
    const idToken = requiredString(result.IdToken, 'ID token');
    const accessToken = requiredString(result.AccessToken, 'access token');
    const refreshToken =
      typeof result.RefreshToken === 'string'
        ? result.RefreshToken
        : this.#tokens?.refreshToken;
    if (!refreshToken) throw new Error('Cognito did not return a renewable session.');
    this.#accessTokenValue = accessToken;
    this.#tokens = {
      idToken,
      refreshToken,
      expiresAt: Date.now() + (positiveNumber(result.ExpiresIn) ?? 3_600) * 1_000,
      email,
      ...(mfaVerified ? { mfaVerified: true } : {}),
    };
    this.#repository.put('auth', 'cognito', this.#tokens);
  }

  async #accessToken(): Promise<string | undefined> {
    if (!this.#tokens) return undefined;
    if (this.#tokens.expiresAt <= Date.now() + 60_000 || !this.#accessTokenValue) {
      await this.#refreshOnce();
    }
    return this.#accessTokenValue;
  }

  async #cognito(
    operation: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.#region) throw new Error('Sia cloud sign-in is not configured.');
    let response: Response;
    try {
      response = await fetch(`https://cognito-idp.${this.#region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(
        'Sia could not reach the sign-in service. Check your internet connection and try again.',
      );
    }
    if (!response.ok) {
      let type = '';
      let detail = '';
      try {
        const error = record(await response.json());
        type = String(error.__type ?? error.code ?? '');
        detail = typeof error.message === 'string' ? error.message : '';
      } catch {
        // Return a stable, non-sensitive error below.
      }
      if (/CodeMismatch/i.test(type))
        throw new CognitoApiError('That code is not correct.', type, detail);
      if (/ExpiredCode/i.test(type)) {
        throw new CognitoApiError('That code expired. Request a new one.', type, detail);
      }
      if (/TooManyRequests|LimitExceeded/i.test(type)) {
        throw new CognitoApiError(
          'Too many sign-in attempts. Wait a moment and try again.',
          type,
          detail,
        );
      }
      if (/NotAuthorized|UserNotFound/i.test(type)) {
        throw new CognitoApiError('Sia could not start email sign-in.', type, detail);
      }
      throw new CognitoApiError(`Sia sign-in failed (${response.status}).`, type, detail);
    }
    return record(await response.json());
  }

  #assertConfiguredForUserAuth(): void {
    if (this.#developmentIdToken) {
      throw new Error('Development-token sessions cannot be changed here.');
    }
    if (!this.#region || !this.#clientId)
      throw new Error('Sia cloud sign-in is not configured.');
  }
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Enter a valid email address.');
  return email;
}

function validTotp(value: string): string {
  const code = value.replaceAll(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from your authenticator.');
  return code;
}

function tokenGroups(token: string): string[] {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return [];
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const groups = claims['cognito:groups'];
    return Array.isArray(groups)
      ? groups.filter((group): group is string => typeof group === 'string')
      : typeof groups === 'string'
        ? groups.split(',').map((group) => group.trim())
        : [];
  } catch {
    return [];
  }
}

function validRegion(value: string | undefined): value is string {
  return Boolean(value && /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(value));
}

function validClientId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9]{10,128}$/.test(value));
}

function parseStoredTokens(value: unknown): StoredTokens | undefined {
  const candidate = record(value);
  if (
    typeof candidate.idToken !== 'string' ||
    candidate.idToken.length === 0 ||
    typeof candidate.refreshToken !== 'string' ||
    candidate.refreshToken.length === 0 ||
    typeof candidate.expiresAt !== 'number' ||
    !Number.isFinite(candidate.expiresAt) ||
    candidate.expiresAt <= 0 ||
    typeof candidate.email !== 'string' ||
    candidate.email.length === 0
  ) {
    return undefined;
  }
  return {
    idToken: candidate.idToken,
    refreshToken: candidate.refreshToken,
    expiresAt: candidate.expiresAt,
    email: candidate.email,
    ...(candidate.mfaVerified === true ? { mfaVerified: true } : {}),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} was missing.`);
  return value;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
