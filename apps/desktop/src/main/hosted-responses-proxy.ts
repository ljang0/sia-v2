import { randomBytes } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_SCOPES = 256;

export interface HostedResponsesForwarder {
  forwardHostedResponses(body: string, signal?: AbortSignal): Promise<Response>;
}

export interface HostedCodexProvider {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly bearerToken: string;
}

interface Scope {
  readonly model: string;
  readonly issuedAt: number;
}

/**
 * A loopback-only capability proxy between Codex App Server and Sia cloud.
 * Its bearer tokens authorize exactly one included model and reveal neither the
 * Sia identity token nor the model lab's permanent API key.
 */
export class HostedResponsesProxy {
  readonly #forwarder: HostedResponsesForwarder;
  readonly #scopes = new Map<string, Scope>();
  #server: Server | undefined;
  #baseUrl: string | undefined;
  #starting: Promise<void> | undefined;

  constructor(forwarder: HostedResponsesForwarder) {
    this.#forwarder = forwarder;
  }

  async issue(model: string): Promise<HostedCodexProvider> {
    if (!model || model.length > 256) throw new Error('Hosted model id is invalid.');
    await this.#start();
    const bearerToken = randomBytes(32).toString('base64url');
    this.#scopes.set(bearerToken, { model, issuedAt: Date.now() });
    if (this.#scopes.size > MAX_SCOPES) {
      const oldest = [...this.#scopes.entries()].sort(
        ([, left], [, right]) => left.issuedAt - right.issuedAt,
      )[0];
      if (oldest) this.#scopes.delete(oldest[0]);
    }
    return {
      id: 'sia_included',
      name: 'Sia included models',
      baseUrl: `${this.#baseUrl}/v1`,
      bearerToken,
    };
  }

  async dispose(): Promise<void> {
    this.#scopes.clear();
    const server = this.#server;
    this.#server = undefined;
    this.#baseUrl = undefined;
    this.#starting = undefined;
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async #start(): Promise<void> {
    if (this.#server?.listening) return;
    if (this.#starting) return await this.#starting;
    this.#starting = new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.#handle(request, response);
      });
      const fail = (error: Error) => {
        this.#starting = undefined;
        reject(error);
      };
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', fail);
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
    try {
      await this.#starting;
    } finally {
      this.#starting = undefined;
    }
  }

  async #handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (!isLoopback(request.socket.remoteAddress)) {
        return jsonError(response, 403, 'forbidden', 'Loopback access is required.');
      }
      if (request.method !== 'POST' || request.url !== '/v1/responses') {
        request.resume();
        return jsonError(response, 404, 'not_found', 'That local route is unavailable.');
      }
      const token = bearerToken(request.headers.authorization);
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
      const abort = new AbortController();
      request.once('aborted', () => abort.abort());
      response.once('close', () => {
        if (!response.writableEnded) abort.abort();
      });
      const upstream = await this.#forwarder.forwardHostedResponses(body, abort.signal);
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
          await new Promise<void>((resolve) => response.once('drain', resolve));
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

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  if (response.writableEnded) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify({ error: { code, message } }));
}
