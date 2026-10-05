import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { PayloadCipher } from '../storage/persistence.js';
import type { HostedResponsesForwarder } from './hosted-responses-proxy.js';

/**
 * A model the person reaches with their own API key. The key lives only in this encrypted
 * file and in the main process: Codex receives a loopback URL and a scoped capability, and the
 * renderer only ever sees the model and the endpoint's host.
 */
export interface ByokConfig {
  /** OpenAI Responses-compatible base URL, e.g. https://api.openai.com/v1. */
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export interface ByokSummary {
  readonly model: string;
  readonly host: string;
}

export const DEFAULT_BYOK_BASE_URL = 'https://api.openai.com/v1';

/** Device-local. Never stored in a workspace, profile export, or renderer state. */
export function byokCredentialPath(appData: string): string {
  return join(appData, 'Sia', 'models', 'byok.enc');
}

export function validateByokConfig(value: {
  baseUrl?: string | undefined;
  model: string;
  apiKey: string;
}): ByokConfig {
  const baseUrl = normalizeBaseUrl(value.baseUrl?.trim() || DEFAULT_BYOK_BASE_URL);
  const model = value.model.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/.test(model))
    throw new Error('Enter the model name your provider uses, such as gpt-5.');
  const apiKey = value.apiKey.trim();
  if (!/^[\x21-\x7e]{8,512}$/.test(apiKey))
    throw new Error('Enter the API key exactly as your provider shows it.');
  return { baseUrl, model, apiKey };
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter the full endpoint address, starting with https://.');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new Error('The endpoint must use https:// (http:// is allowed only on this Mac).');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Enter the endpoint without a password, query, or fragment.');
  return url.toString().replace(/\/+$/, '');
}

export class ByokCredential {
  #summary: ByokSummary | null | undefined;

  constructor(
    readonly path: string,
    private readonly cipher: PayloadCipher,
  ) {}

  get configured(): boolean {
    return existsSync(this.path);
  }

  /** The non-secret part, cached so snapshots never decrypt the key. */
  summary(): ByokSummary | undefined {
    if (this.#summary === undefined) {
      try {
        this.#summary = this.configured ? summarize(this.read()) : null;
      } catch {
        this.#summary = null;
      }
    }
    return this.#summary ?? undefined;
  }

  read(): ByokConfig {
    try {
      const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.size > 16_384 ||
          (stat.mode & 0o077) !== 0
        )
          throw new Error();
        const value = JSON.parse(this.cipher.decrypt(readFileSync(fd))) as Record<
          string,
          unknown
        >;
        return validateByokConfig({
          baseUrl: String(value.baseUrl ?? ''),
          model: String(value.model ?? ''),
          apiKey: String(value.apiKey ?? ''),
        });
      } finally {
        closeSync(fd);
      }
    } catch {
      throw new Error(
        'Your API key could not be unlocked on this Mac. Add it again in Settings.',
      );
    }
  }

  save(config: ByokConfig): void {
    const valid = validateByokConfig(config);
    const encrypted = this.cipher.encrypt(JSON.stringify(valid));
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, this.path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    this.#summary = summarize(valid);
  }

  clear(): void {
    if (existsSync(this.path)) unlinkSync(this.path);
    this.#summary = null;
  }
}

function summarize(config: ByokConfig): ByokSummary {
  return { model: config.model, host: new URL(config.baseUrl).host };
}

/**
 * Attaches the person's key to the one Responses route the loopback proxy accepts. Provider
 * bodies pass through unchanged; request URLs and headers are never echoed.
 */
export class ByokForwarder implements HostedResponsesForwarder {
  constructor(
    private readonly config: () => ByokConfig,
    private readonly request: typeof fetch = fetch,
  ) {}

  async forwardHostedResponses(body: string, signal?: AbortSignal): Promise<Response> {
    const { baseUrl, apiKey } = this.config();
    return await this.request(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body,
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)])
        : AbortSignal.timeout(10 * 60_000),
    });
  }
}

/**
 * Checks the key before saving it. Only a definite rejection fails: some compatible endpoints
 * do not list models, so any other answer is accepted and the first turn reports problems.
 */
export async function checkByokConfig(
  config: ByokConfig,
  request: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await request(`${config.baseUrl}/models`, {
      method: 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${config.apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(
      'Sia could not reach that endpoint. Check the address and your connection.',
    );
  }
  await response.body?.cancel().catch(() => undefined);
  if (response.status === 401 || response.status === 403)
    throw new Error('That API key was not accepted. Check it and try again.');
}
