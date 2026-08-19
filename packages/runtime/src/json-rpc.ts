import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface JsonRpcTransport {
  send(message: JsonRpcMessage): void | Promise<void>;
  onMessage(listener: (message: JsonRpcMessage) => void): () => void;
  close(): void | Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonRpcMessage(value: unknown): JsonRpcMessage {
  if (!isObject(value) || (value.jsonrpc !== undefined && value.jsonrpc !== '2.0'))
    throw new Error('Invalid JSON-RPC envelope');
  if (typeof value.method === 'string') {
    if (typeof value.id === 'string' || typeof value.id === 'number') {
      return {
        jsonrpc: '2.0',
        id: value.id,
        method: value.method,
        ...(value.params === undefined ? {} : { params: value.params }),
      };
    }
    return {
      jsonrpc: '2.0',
      method: value.method,
      ...(value.params === undefined ? {} : { params: value.params }),
    };
  }
  if (typeof value.id !== 'string' && typeof value.id !== 'number')
    throw new Error('Invalid JSON-RPC response id');
  if (value.error !== undefined) {
    if (
      !isObject(value.error) ||
      typeof value.error.code !== 'number' ||
      typeof value.error.message !== 'string'
    ) {
      throw new Error('Invalid JSON-RPC error');
    }
    return {
      jsonrpc: '2.0',
      id: value.id,
      error: {
        code: value.error.code,
        message: value.error.message,
        ...(value.error.data === undefined ? {} : { data: value.error.data }),
      },
    };
  }
  return { jsonrpc: '2.0', id: value.id, result: value.result };
}

/** JSON-lines framing used by Codex app-server and ACP stdio transports. */
export class JsonLinesTransport implements JsonRpcTransport {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #listeners = new Set<(message: JsonRpcMessage) => void>();
  #buffer = '';
  #closed = false;

  constructor(input: Readable, output: Writable) {
    this.#input = input;
    this.#output = output;
    input.setEncoding('utf8');
    input.on('data', this.#onData);
  }

  readonly #onData = (chunk: string): void => {
    this.#buffer += chunk;
    while (true) {
      const newline = this.#buffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.#buffer.slice(0, newline).trim();
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line) continue;
      let parsed: JsonRpcMessage;
      try {
        parsed = parseJsonRpcMessage(JSON.parse(line));
      } catch {
        continue;
      }
      for (const listener of this.#listeners) listener(parsed);
    }
  };

  async send(message: JsonRpcMessage): Promise<void> {
    if (this.#closed) throw new Error('JSON-RPC transport is closed');
    const line = `${JSON.stringify(message)}\n`;
    if (!this.#output.write(line)) {
      await new Promise<void>((resolve, reject) => {
        this.#output.once('drain', resolve);
        this.#output.once('error', reject);
      });
    }
  }

  onMessage(listener: (message: JsonRpcMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#input.off('data', this.#onData);
    this.#listeners.clear();
  }
}

export type JsonRpcRequestHandler = (
  method: string,
  params: unknown,
  id: JsonRpcId,
) => Promise<unknown>;

export class JsonRpcPeer {
  readonly #transport: JsonRpcTransport;
  readonly #pending = new Map<
    JsonRpcId,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      cleanup: () => void;
    }
  >();
  readonly #notificationListeners = new Set<(method: string, params: unknown) => void>();
  #requestHandler?: JsonRpcRequestHandler;
  #closed = false;
  readonly #unsubscribe: () => void;

  constructor(transport: JsonRpcTransport) {
    this.#transport = transport;
    this.#unsubscribe = transport.onMessage((message) => {
      // A transport may disappear between receiving a request and sending its
      // response. Incoming messages are event-driven, so there is no caller that
      // could observe a rejected receive promise.
      void this.#receive(message).catch(() => undefined);
    });
  }

  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.#notificationListeners.add(listener);
    return () => this.#notificationListeners.delete(listener);
  }

  onRequest(handler: JsonRpcRequestHandler): void {
    this.#requestHandler = handler;
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: {
      readonly signal?: AbortSignal;
      readonly timeoutMs?: number;
    },
  ): Promise<T> {
    if (this.#closed) throw new Error('JSON-RPC peer is closed');
    const id = randomUUID();
    return await new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = (): void => {
        this.#pending.delete(id);
        cleanup();
        reject(options?.signal?.reason ?? new Error(`JSON-RPC request ${method} aborted`));
      };
      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        options?.signal?.removeEventListener('abort', abort);
      };
      this.#pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        cleanup,
      });
      if (options?.timeoutMs) {
        timer = setTimeout(() => {
          this.#pending.delete(id);
          cleanup();
          reject(new Error(`JSON-RPC request ${method} timed out`));
        }, options.timeoutMs);
      }
      if (options?.signal?.aborted) return abort();
      options?.signal?.addEventListener('abort', abort, { once: true });
      void Promise.resolve(
        this.#transport.send({
          jsonrpc: '2.0',
          id,
          method,
          ...(params === undefined ? {} : { params }),
        }),
      ).catch((error) => {
        this.#pending.delete(id);
        cleanup();
        reject(error);
      });
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.#transport.send({
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  async #receive(message: JsonRpcMessage): Promise<void> {
    if ('method' in message) {
      if ('id' in message) {
        let response: JsonRpcResponse;
        try {
          if (!this.#requestHandler)
            throw Object.assign(new Error('Method not found'), { code: -32601 });
          const result = await this.#requestHandler(message.method, message.params, message.id);
          response = { jsonrpc: '2.0', id: message.id, result };
        } catch (error) {
          const candidate = error as { code?: unknown; message?: unknown; data?: unknown };
          response = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: typeof candidate.code === 'number' ? candidate.code : -32603,
              message:
                typeof candidate.message === 'string' ? candidate.message : 'Internal error',
              ...(candidate.data === undefined ? {} : { data: candidate.data }),
            },
          };
        }
        // Failure to deliver either kind of response means the peer has gone away;
        // do not turn that expected disconnect into an unhandled rejection.
        await Promise.resolve(this.#transport.send(response)).catch(() => undefined);
      } else {
        for (const listener of this.#notificationListeners)
          listener(message.method, message.params);
      }
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    pending.cleanup();
    if (message.error) {
      pending.reject(
        Object.assign(new Error(message.error.message), {
          code: message.error.code,
          data: message.error.data,
        }),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#unsubscribe();
    for (const pending of this.#pending.values()) {
      pending.cleanup();
      pending.reject(new Error('JSON-RPC peer closed'));
    }
    this.#pending.clear();
    await this.#transport.close();
  }
}
