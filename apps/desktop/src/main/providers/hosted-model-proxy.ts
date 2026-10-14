import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { isRecord } from '../actions/records.js';

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_SCOPES = 256;

/** The model APIs a harness may call through the proxy; each maps to the same cloud path. */
export const MODEL_API_ROUTES = ['responses', 'messages', 'chat/completions'] as const;
export type ModelApiRoute = (typeof MODEL_API_ROUTES)[number];

export interface ModelRequestForwarder {
  forwardModelRequest(
    route: ModelApiRoute,
    body: string,
    signal?: AbortSignal,
    attribution?: { harnessId: string },
  ): Promise<Response>;
}

export interface HostedCodexProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly bearerToken: string;
}

interface Scope {
  readonly model: string;
  /** The harness this capability was issued to, reported upstream for usage attribution. */
  readonly harnessId: string;
  readonly issuedAt: number;
}

/**
 * A loopback-only capability proxy between a harness (Codex, Claude Code, OpenCode, …) and
 * Sia cloud or the person's own provider. Its tokens authorize exactly one model and reveal
 * neither the Sia identity token nor any lab or personal API key. Each harness calls the model
 * API it speaks natively; the cloud relay translates to the lab's own protocol.
 */
export class HostedModelProxy {
  readonly #forwarder: ModelRequestForwarder;
  readonly #scopes = new Map<string, Scope>();
  readonly #requests = new Set<AbortController>();
  #generation = 0;
  #server: Server | undefined;
  #baseUrl: string | undefined;
  #starting: Promise<void> | undefined;

  readonly #provider: { readonly id: string; readonly name: string };
  readonly #routes: ReadonlySet<ModelApiRoute>;

  constructor(
    forwarder: ModelRequestForwarder,
    provider: { readonly id: string; readonly name: string } = {
      id: 'sia_included',
      name: 'Sia included models',
    },
    routes: readonly ModelApiRoute[] = MODEL_API_ROUTES,
  ) {
    this.#forwarder = forwarder;
    this.#provider = provider;
    this.#routes = new Set(routes);
  }

  async issue(model: string, harnessId: string): Promise<HostedCodexProvider> {
    if (!model || model.length > 256) throw new Error('Hosted model id is invalid.');
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(harnessId)) throw new Error('Harness id is invalid.');
    const generation = this.#generation;
    await this.#start();
    if (generation !== this.#generation) throw new Error('The model relay was reset.');
    const bearerToken = randomBytes(32).toString('base64url');
    this.#scopes.set(bearerToken, { model, harnessId, issuedAt: Date.now() });
    if (this.#scopes.size > MAX_SCOPES) {
      const oldest = [...this.#scopes.entries()].sort(
        ([, left], [, right]) => left.issuedAt - right.issuedAt,
      )[0];
      if (oldest) this.#scopes.delete(oldest[0]);
    }
    return {
      id: this.#provider.id,
      name: this.#provider.name,
      baseUrl: `${this.#baseUrl}/v1`,
      bearerToken,
    };
  }

  async dispose(): Promise<void> {
    this.#generation += 1;
    this.#scopes.clear();
    const server = this.#server;
    const starting = this.#starting;
    this.#server = undefined;
    this.#baseUrl = undefined;
    this.#starting = undefined;
    for (const request of this.#requests) request.abort();
    this.#requests.clear();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
    await starting?.catch(() => undefined);
  }

  async #start(): Promise<void> {
    if (this.#server?.listening) return;
    if (this.#starting) return await this.#starting;
    const generation = this.#generation;
    const starting = new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.#handle(request, response);
      });
      const fail = (error: Error) => {
        reject(error);
      };
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', fail);
        if (generation !== this.#generation) {
          server.close(() => reject(new Error('The model relay was reset.')));
          return;
        }
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Could not bind the hosted model relay.'));
          return;
        }
        server.unref();
        this.#server = server;
        this.#baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
    this.#starting = starting;
    try {
      await starting;
    } finally {
      if (this.#starting === starting) this.#starting = undefined;
    }
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let abort: AbortController | undefined;
    try {
      if (!isLoopback(request.socket.remoteAddress)) {
        return jsonError(response, 403, 'forbidden', 'Loopback access is required.');
      }
      const route = modelApiRoute(request.url);
      if (request.method !== 'POST' || !route || !this.#routes.has(route)) {
        request.resume();
        return jsonError(response, 404, 'not_found', 'That local route is unavailable.');
      }
      // OpenAI clients send a bearer token; Anthropic clients send x-api-key.
      const token = bearerToken(request.headers.authorization) ?? apiKeyHeader(request);
      const scope = token ? this.#scopes.get(token) : undefined;
      if (!scope) {
        request.resume();
        return jsonError(
          response,
          401,
          'unauthorized',
          'The local model capability is invalid.',
        );
      }
      const declaredLength = Number(request.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
        request.resume();
        return jsonError(response, 413, 'request_too_large', 'The request exceeds 2 MiB.');
      }
      const body = await readBody(request);
      if (!token || this.#scopes.get(token) !== scope) {
        return jsonError(response, 401, 'unauthorized', 'The local model capability expired.');
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return jsonError(response, 400, 'invalid_json', 'The request body must be JSON.');
      }
      if (!isRecord(payload) || payload.model !== scope.model) {
        return jsonError(
          response,
          403,
          'model_scope_mismatch',
          'This local capability is scoped to a different model.',
        );
      }
      abort = new AbortController();
      const signal = abort.signal;
      this.#requests.add(abort);
      request.once('aborted', () => abort?.abort());
      response.once('close', () => {
        if (!response.writableEnded) abort?.abort();
      });
      const upstream = await this.#forwarder.forwardModelRequest(route, body, signal, {
        harnessId: scope.harnessId,
      });
      if (signal.aborted || response.destroyed) {
        await upstream.body?.cancel();
        return;
      }
      response.writeHead(upstream.status, {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...(upstream.headers.get('x-request-id')
          ? { 'x-request-id': upstream.headers.get('x-request-id')! }
          : {}),
      });
      if (!upstream.body) {
        response.end();
        return;
      }
      for await (const chunk of upstream.body) {
        if (!response.write(Buffer.from(chunk))) {
          await once(response, 'drain', { signal });
        }
      }
      response.end();
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      if (error instanceof RequestTooLargeError) {
        jsonError(response, 413, 'request_too_large', 'The request exceeds 2 MiB.');
        return;
      }
      jsonError(response, 502, 'relay_failed', 'The hosted model relay could not be reached.');
    } finally {
      if (abort) this.#requests.delete(abort);
    }
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    length += chunk.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      throw new RequestTooLargeError();
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class RequestTooLargeError extends Error {}

function bearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith('Bearer ')) return undefined;
  const token = value.slice('Bearer '.length);
  return token.length > 0 ? token : undefined;
}

function apiKeyHeader(request: IncomingMessage): string | undefined {
  const value = request.headers['x-api-key'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** `/v1/messages?beta=true` and similar client query strings select the same route. */
function modelApiRoute(url: string | undefined): ModelApiRoute | undefined {
  const path = url?.split('?', 1)[0];
  return MODEL_API_ROUTES.find((route) => path === `/v1/${route}`);
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function jsonError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify({ error: { code, message } }));
}
