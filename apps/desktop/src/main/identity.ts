import type { IdTokenSource } from './cloud-client.js';
import type { RecordRepository } from './persistence.js';

export type CloudIdentityState = 'unconfigured' | 'signed_out' | 'code_sent' | 'signed_in';

export interface CloudIdentityStatus {
  state: CloudIdentityState;
  email?: string;
}

interface StoredTokens {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
}

interface PendingChallenge {
  email: string;
  username: string;
  session: string;
}

/** A definitive Cognito rejection, as opposed to a transient network or service failure. */
class CognitoApiError extends Error {
  readonly type: string;

  constructor(message: string, type: string) {
    super(message);
    this.type = type;
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
  #pending: PendingChallenge | undefined;
  #refreshing: Promise<string | undefined> | undefined;

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
    this.#tokens = parseStoredTokens(stored);
    if (stored !== undefined) {
      if (this.#tokens) this.#repository.put('auth', 'cognito', this.#tokens);
      else this.#repository.remove('auth', 'cognito');
    }
    if (this.#tokens && this.#tokens.expiresAt <= Date.now() + 60_000) {
      await this.#refresh().catch(() => undefined);
    }
    return this.status();
  }

  get configured(): boolean {
    return Boolean(this.#developmentIdToken || (this.#region && this.#clientId));
  }

  status(): CloudIdentityStatus {
    if (this.#developmentIdToken) return { state: 'signed_in', email: 'Development session' };
    if (!this.#region || !this.#clientId) return { state: 'unconfigured' };
    if (this.#tokens) return { state: 'signed_in', email: this.#tokens.email };
    if (this.#pending) return { state: 'code_sent', email: this.#pending.email };
    return { state: 'signed_out' };
  }

  async read(): Promise<string | undefined> {
    if (this.#developmentIdToken) return this.#developmentIdToken;
    if (!this.#tokens) return undefined;
    if (this.#tokens.expiresAt > Date.now() + 60_000) return this.#tokens.idToken;
    return await (this.#refreshing ??= this.#refresh().finally(() => {
      this.#refreshing = undefined;
    }));
  }

  async startEmailSignIn(emailValue: string): Promise<CloudIdentityStatus> {
    this.#assertConfiguredForUserAuth();
    const email = normalizeEmail(emailValue);
    let response = await this.#cognito('InitiateAuth', {
      AuthFlow: 'USER_AUTH',
      ClientId: this.#clientId,
      AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
    });
    if (response.ChallengeName === 'SELECT_CHALLENGE') {
      response = await this.#cognito('RespondToAuthChallenge', {
        ChallengeName: 'SELECT_CHALLENGE',
        ClientId: this.#clientId,
        ChallengeResponses: { USERNAME: email, ANSWER: 'EMAIL_OTP' },
        Session: requiredString(response.Session, 'Cognito session'),
      });
    }
    if (record(response.AuthenticationResult).IdToken) {
      this.#storeTokens(response, email);
      return this.status();
    }
    if (response.ChallengeName !== 'EMAIL_OTP') {
      throw new Error('Email-code sign-in is not available for this invited account.');
    }
    const parameters = record(response.ChallengeParameters);
    this.#pending = {
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
    if (!pending) throw new Error('Request a new email code first.');
    const code = codeValue.replaceAll(/\s/g, '');
    if (!/^\d{6,10}$/.test(code)) throw new Error('Enter the numeric code from your email.');
    const response = await this.#cognito('RespondToAuthChallenge', {
      ChallengeName: 'EMAIL_OTP',
      ClientId: this.#clientId,
      ChallengeResponses: { USERNAME: pending.username, EMAIL_OTP_CODE: code },
      Session: pending.session,
    });
    this.#storeTokens(response, pending.email);
    this.#pending = undefined;
    return this.status();
  }

  async signOut(): Promise<CloudIdentityStatus> {
    const refreshToken = this.#tokens?.refreshToken;
    this.#tokens = undefined;
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

  async #refresh(): Promise<string | undefined> {
    const current = this.#tokens;
    if (!current || !this.#clientId) return undefined;
    try {
      const response = await this.#cognito('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: this.#clientId,
        AuthParameters: { REFRESH_TOKEN: current.refreshToken },
      });
      const result = record(response.AuthenticationResult);
      const idToken = requiredString(result.IdToken, 'ID token');
      const expiresIn = positiveNumber(result.ExpiresIn) ?? 3_600;
      this.#tokens = {
        idToken,
        refreshToken: current.refreshToken,
        expiresAt: Date.now() + expiresIn * 1_000,
        email: current.email,
      };
      this.#repository.put('auth', 'cognito', this.#tokens);
      return idToken;
    } catch (error) {
      // Only an explicit Cognito rejection ends the session. Transient failures
      // (offline, timeout, 5xx) keep the stored tokens so identity-bound local
      // state is not destroyed by a network blip; the next read retries.
      if (error instanceof CognitoApiError && REFRESH_TOKEN_REJECTED.test(error.type)) {
        this.#tokens = undefined;
        this.#repository.remove('auth', 'cognito');
      }
      return undefined;
    }
  }

  #storeTokens(response: Record<string, unknown>, email: string): void {
    const result = record(response.AuthenticationResult);
    const idToken = requiredString(result.IdToken, 'ID token');
    const refreshToken =
      typeof result.RefreshToken === 'string'
        ? result.RefreshToken
        : this.#tokens?.refreshToken;
    if (!refreshToken) throw new Error('Cognito did not return a renewable session.');
    this.#tokens = {
      idToken,
      refreshToken,
      expiresAt: Date.now() + (positiveNumber(result.ExpiresIn) ?? 3_600) * 1_000,
      email,
    };
    this.#repository.put('auth', 'cognito', this.#tokens);
  }

  async #cognito(
    operation: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.#region) throw new Error('Sia cloud sign-in is not configured.');
    const response = await fetch(`https://cognito-idp.${this.#region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      let type = '';
      try {
        const error = record(await response.json());
        type = String(error.__type ?? error.code ?? '');
      } catch {
        // Return a stable, non-sensitive error below.
      }
      if (/CodeMismatch/i.test(type))
        throw new CognitoApiError('That code is not correct.', type);
      if (/ExpiredCode/i.test(type)) {
        throw new CognitoApiError('That code expired. Request a new one.', type);
      }
      if (/TooManyRequests|LimitExceeded/i.test(type)) {
        throw new CognitoApiError(
          'Too many sign-in attempts. Wait a moment and try again.',
          type,
        );
      }
      if (/NotAuthorized|UserNotFound/i.test(type)) {
        throw new CognitoApiError('This email is not active in the Sia alpha.', type);
      }
      throw new CognitoApiError(`Sia sign-in failed (${response.status}).`, type);
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
