import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { abortableDelay } from '../controller/async-utils.js';

export type Fetch = typeof fetch;

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

const SIGN_IN_TIMEOUT_MS = 10 * 60_000;

function base64url(value: Buffer): string {
  return value.toString('base64url');
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

const CALLBACK_PAGE = (ok: boolean) =>
  `<!doctype html><meta charset="utf-8"><title>Sia</title><body style="font:16px -apple-system,system-ui;margin:4rem auto;max-width:28rem;text-align:center"><h1 style="font-size:1.4rem">${
    ok ? 'You’re connected' : 'Sign-in didn’t finish'
  }</h1><p>${ok ? 'You can close this tab and return to Sia.' : 'Return to Sia and try again.'}</p></body>`;

/**
 * Runs one OAuth authorization-code + PKCE sign-in through the default browser, receiving the
 * code on a single-use loopback listener bound to 127.0.0.1.
 */
export async function loopbackAuthorization(options: {
  /** Host placed in the redirect URI. The listener always binds 127.0.0.1. */
  redirectHost: '127.0.0.1' | 'localhost';
  /** Builds the provider URL once the redirect URI and PKCE values are known. */
  authorizationUrl(input: {
    redirectUri: string;
    state: string;
    challenge: string;
  }): URL | Promise<URL>;
  openExternal(url: string): Promise<void>;
  signal?: AbortSignal;
}): Promise<{ code: string; redirectUri: string; verifier: string }> {
  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(24));
  let server: Server | undefined;
  try {
    const received = new Promise<string>((resolve, reject) => {
      server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/callback') {
          response.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const stateMatches = url.searchParams.get('state') === state;
        const ok = Boolean(code) && stateMatches;
        response
          .writeHead(ok ? 200 : 400, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          })
          .end(CALLBACK_PAGE(ok));
        // A request without this sign-in's state is not from the provider; keep waiting.
        if (!stateMatches) return;
        if (ok) resolve(code!);
        else
          reject(
            new Error(
              url.searchParams.get('error') === 'access_denied'
                ? 'Sign-in was cancelled.'
                : 'Sign-in didn’t finish. Try again.',
            ),
          );
      });
      server.on('error', reject);
    });
    // Rejections are observed by raceTimeout below; this keeps an early one from going unhandled.
    received.catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server!.address();
    if (!address || typeof address === 'string') throw new Error('Sign-in could not start.');
    const redirectUri = `http://${options.redirectHost}:${address.port}/callback`;
    const url = await options.authorizationUrl({ redirectUri, state, challenge });
    if (url.protocol !== 'https:') throw new Error('Sign-in must use HTTPS.');
    await options.openExternal(url.toString());
    const code = await raceTimeout(received, options.signal);
    return { code, redirectUri, verifier };
  } finally {
    server?.close();
  }
}

async function raceTimeout<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Sign-in timed out. You can safely try again.')),
          SIGN_IN_TIMEOUT_MS,
        );
        onAbort = () => reject(new Error('Sign-in was cancelled.'));
        if (signal?.aborted) onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}

/** Posts a form to a token endpoint and normalizes the standard OAuth token response. */
export async function requestToken(
  fetchImpl: Fetch,
  endpoint: string,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<TokenResponse> {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams(form),
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new OAuthError(
      typeof body.error === 'string' ? body.error : `http_${response.status}`,
    );
  }
  return tokenFields(body);
}

export function tokenFields(body: Record<string, unknown>): TokenResponse {
  return {
    accessToken: body.access_token as string,
    ...(typeof body.refresh_token === 'string' ? { refreshToken: body.refresh_token } : {}),
    ...(typeof body.expires_in === 'number' && body.expires_in > 0
      ? { expiresAt: Date.now() + body.expires_in * 1000 }
      : {}),
  };
}

export class OAuthError extends Error {
  constructor(readonly code: string) {
    super(
      code === 'invalid_grant'
        ? 'This app connection expired. Reconnect it in Settings > Connections.'
        : 'The app declined sign-in. Try connecting again.',
    );
  }
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresAt: number;
}

/** RFC 8628 device authorization: the person types a short code on the provider's own page. */
export async function startDeviceAuthorization(
  fetchImpl: Fetch,
  endpoint: string,
  form: Record<string, string>,
  signal?: AbortSignal,
): Promise<DeviceAuthorization> {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams(form),
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !response.ok ||
    typeof body.device_code !== 'string' ||
    typeof body.user_code !== 'string' ||
    typeof body.verification_uri !== 'string'
  ) {
    throw new Error('Sign-in could not start. Try again in a moment.');
  }
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    intervalSeconds: typeof body.interval === 'number' ? body.interval : 5,
    expiresAt:
      Date.now() + (typeof body.expires_in === 'number' ? body.expires_in : 900) * 1000,
  };
}

export async function pollDeviceAuthorization(
  fetchImpl: Fetch,
  endpoint: string,
  form: Record<string, string>,
  device: DeviceAuthorization,
  signal?: AbortSignal,
): Promise<TokenResponse> {
  let interval = device.intervalSeconds;
  while (Date.now() < device.expiresAt) {
    await abortableDelay(interval * 1000, signal);
    if (signal?.aborted) throw new Error('Sign-in was cancelled.');
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        ...form,
        device_code: device.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      ...(signal ? { signal } : {}),
    }).catch(() => undefined);
    if (!response) continue;
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.access_token === 'string') return tokenFields(body);
    if (body.error === 'authorization_pending') continue;
    if (body.error === 'slow_down') {
      interval += 5;
      continue;
    }
    if (body.error === 'access_denied') throw new Error('Sign-in was cancelled.');
    if (body.error === 'expired_token') break;
    throw new Error('The app declined sign-in. Try connecting again.');
  }
  throw new Error('Sign-in timed out. You can safely try again.');
}
