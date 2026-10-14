import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import type { IdTokenVerifier } from '../ports.js';

const JWKS_TTL_MS = 60 * 60 * 1_000;

/**
 * Verifies a Cognito user pool ID token without extra dependencies: RS256 signature against the
 * pool's published JWKS, issuer, audience (the desktop app client), `token_use`, and expiry.
 */
export class CognitoIdTokenVerifier implements IdTokenVerifier {
  readonly #issuer: string;
  #keys: { fetchedAt: number; byKid: Map<string, JsonWebKey> } | undefined;

  constructor(
    region: string,
    userPoolId: string,
    private readonly clientId: string,
    private readonly fetchJson: (url: string) => Promise<unknown> = async (url) =>
      (await fetch(url, { signal: AbortSignal.timeout(5_000) })).json(),
    private readonly now: () => number = Date.now,
  ) {
    this.#issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  }

  async verify(idToken: string): Promise<{ subject: string }> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decodeSegment(headerPart);
    const payload = decodeSegment(payloadPart);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Bad header');
    const jwk = await this.#key(header.kid);
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${payloadPart}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(signaturePart, 'base64url'),
    );
    if (!valid) throw new Error('Bad signature');
    const seconds = Math.floor(this.now() / 1_000);
    if (
      payload.iss !== this.#issuer ||
      payload.aud !== this.clientId ||
      payload.token_use !== 'id' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= seconds ||
      typeof payload.sub !== 'string' ||
      !payload.sub
    ) {
      throw new Error('Token claims are not valid for this relay');
    }
    return { subject: payload.sub };
  }

  async #key(kid: string): Promise<JsonWebKey> {
    const fresh = this.#keys && this.now() - this.#keys.fetchedAt < JWKS_TTL_MS;
    let key = fresh ? this.#keys!.byKid.get(kid) : undefined;
    // Refetch on a cache miss too, so a rotated signing key is picked up.
    if (!key) {
      const body = (await this.fetchJson(`${this.#issuer}/.well-known/jwks.json`)) as {
        keys?: Array<JsonWebKey & { kid?: string }>;
      };
      this.#keys = {
        fetchedAt: this.now(),
        byKid: new Map((body.keys ?? []).flatMap((k) => (k.kid ? [[k.kid, k]] : []))),
      };
      key = this.#keys.byKid.get(kid);
    }
    if (!key) throw new Error('Unknown signing key');
    return key;
  }
}

function decodeSegment(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  if (typeof value !== 'object' || value === null) throw new Error('Malformed token');
  return value as Record<string, unknown>;
}
