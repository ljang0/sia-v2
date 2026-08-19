import { createHash, randomUUID } from 'node:crypto';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(',')}}`;
}

export function actionTargetDigest(toolName: string, argumentsValue: unknown): string {
  return createHash('sha256')
    .update(`${toolName}\0${canonicalize(argumentsValue)}`)
    .digest('hex');
}

export interface OneShotGrant {
  readonly id: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly targetDigest: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export class OneShotGrantStore {
  readonly #grants = new Map<string, OneShotGrant>();
  readonly #now: () => number;
  readonly #maximumTtlMs: number;

  constructor(options: { readonly now?: () => number; readonly maximumTtlMs?: number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#maximumTtlMs = options.maximumTtlMs ?? 5 * 60_000;
  }

  issue(
    input: Omit<OneShotGrant, 'id' | 'issuedAt' | 'expiresAt'> & { readonly ttlMs?: number },
  ): OneShotGrant {
    const issuedAt = this.#now();
    const ttlMs = Math.max(1, Math.min(input.ttlMs ?? 60_000, this.#maximumTtlMs));
    const grant: OneShotGrant = {
      id: randomUUID(),
      sessionId: input.sessionId,
      toolName: input.toolName,
      targetDigest: input.targetDigest,
      issuedAt,
      expiresAt: issuedAt + ttlMs,
    };
    this.#grants.set(grant.id, grant);
    return grant;
  }

  consume(input: {
    readonly id: string;
    readonly sessionId: string;
    readonly toolName: string;
    readonly targetDigest: string;
  }): boolean {
    const grant = this.#grants.get(input.id);
    if (!grant) return false;
    if (grant.expiresAt <= this.#now()) {
      this.#grants.delete(input.id);
      return false;
    }
    if (
      grant.sessionId !== input.sessionId ||
      grant.toolName !== input.toolName ||
      grant.targetDigest !== input.targetDigest
    )
      return false;
    this.#grants.delete(input.id);
    return true;
  }

  revokeSession(sessionId: string): void {
    for (const [id, grant] of this.#grants)
      if (grant.sessionId === sessionId) this.#grants.delete(id);
  }

  prune(): void {
    const now = this.#now();
    for (const [id, grant] of this.#grants) if (grant.expiresAt <= now) this.#grants.delete(id);
  }

  get size(): number {
    return this.#grants.size;
  }
}
