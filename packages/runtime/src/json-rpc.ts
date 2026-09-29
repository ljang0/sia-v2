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
  /** Reports that no further messages can arrive, with the reason when it was a failure. */
  onClose?(listener: (error?: Error) => void): () => void;
  close(): void | Promise<void>;
}

/** Largest unterminated line a JSON-lines peer may send before the transport closes. */
export const JSON_LINES_MAX_BUFFER_CHARACTERS = 64 * 1024 * 1024;

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
  readonly #closeListeners = new Set<(error?: Error) => void>();
  readonly #maxBufferCharacters: number;
  #buffer = '';
  #closed = false;

  constructor(
    input: Readable,
    output: Writable,
    options: { readonly maxBufferCharacters?: number } = {},
  ) {
    this.#input = input;
    this.#output = output;
    this.#maxBufferCharacters = options.maxBufferCharacters ?? JSON_LINES_MAX_BUFFER_CHARACTERS;
    input.setEncoding('utf8');
    input.on('data', this.#onData);
    input.on('end', this.#onEnd);
    input.on('close', this.#onEnd);
    input.on('error', this.#onError);
  }

  readonly #onEnd = (): void => {
    this.#shutdown(new Error('JSON-RPC input ended'));
  };

  readonly #onError = (error: Error): void => {
    this.#shutdown(error);
  };

  readonly #onData = (chunk: string): void => {
    if (this.#closed) return;
    this.#buffer += chunk;
    while (true) {
      const newline = this.#buffer.indexOf('\n');
      if (newline < 0) {
        if (this.#buffer.length > this.#maxBufferCharacters) {
          this.#shutdown(new Error('JSON-RPC message exceeded the transport size limit'));
          this.#input.destroy();
        }
        return;
      }
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
      if (this.#closed) return;
    }
  };

  async send(message: JsonRpcMessage): Promise<void> {
    if (this.#closed) throw new Error('JSON-RPC transport is closed');
    if (this.#output.destroyed || this.#output.writableEnded)
      throw new Error('JSON-RPC transport is closed');
    const line = `${JSON.stringify(message)}\n`;
    if (!this.#output.write(line)) {
      await new Promise<void>((resolve, reject) => {
        const settle = (error?: Error): void => {
          this.#output.off('drain', settle);
          this.#output.off('error', settle);
          this.#output.off('close', settle);
          if (error) reject(error);
          else if (this.#output.writableEnded || this.#output.destroyed)
            reject(new Error('JSON-RPC transport is closed'));
          else resolve();
        };
        this.#output.once('drain', settle);
        this.#output.once('error', settle);
        this.#output.once('close', settle);
      });
    }
  }

  onMessage(listener: (message: JsonRpcMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  onClose(listener: (error?: Error) => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  close(): void {
    this.#shutdown();
  }

  #shutdown(error?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#buffer = '';
    this.#input.off('data', this.#onData);
    this.#input.off('end', this.#onEnd);
    this.#input.off('close', this.#onEnd);
    // Keep a listener so a later stream error cannot become an uncaught exception.
    this.#input.off('error', this.#onError);
    this.#input.on('error', () => undefined);
    this.#listeners.clear();
    const listeners = [...this.#closeListeners];
    this.#closeListeners.clear();
    for (const listener of listeners) listener(error);
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
  #disposed = false;
  readonly #unsubscribe: () => void;
  readonly #unsubscribeClose: () => void;

  constructor(transport: JsonRpcTransport) {
    this.#transport = transport;
    this.#unsubscribe = transport.onMessage((message) => {
      // A transport may disappear between receiving a request and sending its
      // response. Incoming messages are event-driven, so there is no caller that
      // could observe a rejected receive promise.
      void this.#receive(message).catch(() => undefined);
    });
    // Without this, a request whose peer exited would wait for its timeout (or forever).
    this.#unsubscribeClose =
      transport.onClose?.((error) => {
        this.#closed = true;
        this.#rejectPending(error ?? new Error('JSON-RPC transport closed'));
      }) ?? (() => undefined);
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
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe();
    this.#unsubscribeClose();
    this.#closed = true;
    this.#rejectPending(new Error('JSON-RPC peer closed'));
    await this.#transport.close();
  }

  #rejectPending(error: Error): void {
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const entry of pending) {
      entry.cleanup();
      entry.reject(error);
    }
  }
}
