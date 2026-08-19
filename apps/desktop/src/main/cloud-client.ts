import { randomUUID } from 'node:crypto';

import type {
  MetaCapabilities,
  MetaStreamEvent,
  MetaTransport,
  MetaTurnRequest,
} from '@sia/runtime';

import type { ConnectionId } from '../shared/bridge.js';

export interface IdTokenSource {
  read(): Promise<string | undefined>;
}

export interface ConnectionStartResult {
  redirectUrl: string;
  connectionId: string;
  expiresAt: string;
}

export interface ConnectionStatusResult {
  connections: Array<{
    id: string;
    app: 'gmail' | 'google_drive' | 'slack';
    status: 'link_pending' | 'connected' | 'failed' | 'disconnected';
    accountLabel?: string;
  }>;
}

export type PreparedActionResult =
  | { status: 'executed'; executionId: string; result: unknown }
  | {
      status: 'approval_required';
      actionId: string;
      digest: string;
      expiresAt: string;
      preview: unknown;
    };

export interface ConnectorUploadDescriptor {
  uploadId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface ConnectorUploadRequest {
  connectionId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  md5: string;
  sha256: string;
}

export type CloudDeletionState =
  | 'requested'
  | 'processing'
  | 'research_deleted'
  | 'connections_revoked'
  | 'identity_deleted'
  | 'completed'
  | 'failed';

export type CloudDeletionScope = 'research' | 'account';

export interface CloudDeletionJob {
  id: string;
  scope: CloudDeletionScope;
  state: CloudDeletionState;
  failureCode?: string;
}

export interface CloudDeletionWaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

interface ConnectorUploadGrant {
  file: ConnectorUploadDescriptor;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

interface CloudMetaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: CloudMetaToolCall[];
}

interface CloudMetaToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

const MAX_META_HISTORY_MESSAGES = 80;
const MAX_META_HISTORY_CHARACTERS = 160_000;

export class CloudClient implements MetaTransport {
  readonly #baseUrl: URL | undefined;
  readonly #idTokens: IdTokenSource;
  readonly #metaHistory = new Map<string, CloudMetaMessage[]>();

  constructor(baseUrl: string | undefined, idTokens: IdTokenSource) {
    this.#baseUrl = parseCloudBaseUrl(baseUrl);
    this.#idTokens = idTokens;
  }

  get configured(): boolean {
    return Boolean(this.#baseUrl);
  }

  async capabilities(_signal?: AbortSignal): Promise<MetaCapabilities> {
    return this.configured
      ? { available: true, models: [], streaming: true, tools: true }
      : {
          available: false,
          models: [],
          streaming: false,
          tools: false,
          reason: 'Sia cloud services are not configured.',
        };
  }

  async *stream(
    request: MetaTurnRequest,
    signal?: AbortSignal,
  ): AsyncIterable<MetaStreamEvent> {
    if (!this.#baseUrl) throw new Error('Sia cloud services are not configured.');
    const history = [
      ...(this.#metaHistory.get(request.sessionId) ?? [
        { role: 'system' as const, content: request.instructions },
      ]),
    ];
    for (const input of request.input) {
      if (input.type === 'user_message') {
        history.push({ role: 'user', content: input.text });
      } else {
        history.push({
          role: 'tool',
          tool_call_id: input.callId,
          content: safeJson(input.output),
        });
      }
    }
    const token = await this.#idTokens.read();
    const response = await fetch(resolveCloudUrl(this.#baseUrl, '/v1/meta/turns'), {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        turnId: request.turnId,
        sessionId: request.sessionId,
        model: request.model,
        messages: history,
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10 * 60_000)])
        : AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Meta relay failed (${response.status}).`);
    }

    const calls = new Map<number, PendingToolCall>();
    let assistantText = '';
    let finishReason: string | undefined;
    for await (const raw of readSseData(response.body)) {
      const event = asRecord(raw);
      const type = typeof event.type === 'string' ? event.type : '';
      if (type === 'delta' && typeof event.text === 'string') {
        assistantText += event.text;
        yield { type: 'text_delta', messageId: request.turnId, text: event.text };
      } else if (type === 'tool_call_delta') {
        mergeToolCallDeltas(calls, event.delta);
      } else if (type === 'usage') {
        const usage = asRecord(event.usage);
        const details = asRecord(usage.prompt_tokens_details);
        const inputTokens = finiteInteger(usage.prompt_tokens);
        const outputTokens = finiteInteger(usage.completion_tokens);
        const cachedInputTokens = finiteInteger(details.cached_tokens);
        yield {
          type: 'usage',
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
          ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
        };
      } else if (type === 'done') {
        finishReason = typeof event.finishReason === 'string' ? event.finishReason : undefined;
      } else if (type === 'error') {
        yield {
          type: 'error',
          code: typeof event.code === 'string' ? event.code : 'meta_relay_error',
          message: typeof event.message === 'string' ? event.message : 'Meta relay failed.',
          recoverable: true,
        };
      }
    }

    const completedCalls: CloudMetaToolCall[] = [];
    for (const [index, call] of [...calls.entries()].sort(([left], [right]) => left - right)) {
      let argumentsValue: Readonly<Record<string, unknown>>;
      try {
        const parsed: unknown = JSON.parse(call.arguments || '{}');
        argumentsValue = asRecord(parsed);
      } catch {
        yield {
          type: 'error',
          code: 'invalid_tool_arguments',
          message: `Meta returned invalid arguments for ${call.name || `tool ${index}`}.`,
          recoverable: true,
        };
        continue;
      }
      const id = call.id || `meta-tool-${request.turnId}-${index}`;
      const name = call.name;
      if (!name) continue;
      completedCalls.push({
        id,
        type: 'function',
        function: { name, arguments: call.arguments || '{}' },
      });
      yield { type: 'tool_call', callId: id, name, arguments: argumentsValue };
    }
    history.push({
      role: 'assistant',
      content: assistantText,
      ...(completedCalls.length ? { tool_calls: completedCalls } : {}),
    });
    this.#metaHistory.set(request.sessionId, compactMetaHistory(history));
    const responseId = randomUUID();
    yield {
      type: 'completed',
      responseId,
      stopReason:
        completedCalls.length > 0 || finishReason === 'tool_calls' ? 'tool_calls' : 'complete',
    };
  }

  async startConnection(connectionId: ConnectionId): Promise<ConnectionStartResult> {
    return this.#request<ConnectionStartResult>(`/v1/connections/${cloudAppId(connectionId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async connectionStatus(connectionId: ConnectionId): Promise<ConnectionStatusResult> {
    return this.#request<ConnectionStatusResult>(
      `/v1/connections/${cloudAppId(connectionId)}`,
      { method: 'GET' },
    );
  }

  async disconnect(connectionId: ConnectionId, remoteConnectionId: string): Promise<void> {
    const query = new URLSearchParams({ connectionId: remoteConnectionId });
    await this.#request(`/v1/connections/${cloudAppId(connectionId)}?${query.toString()}`, {
      method: 'DELETE',
    });
  }

  async uploadResearchBatch(batch: unknown): Promise<{
    status: 'uploaded' | 'already_uploaded';
    batchId: string;
    eventCount?: number;
    sha256: string;
  }> {
    return this.#request('/v1/research/batches', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  }

  /**
   * Stages local bytes without relaying them through Sia or exposing the
   * provider's API key. The presigned URL remains inside the main process.
   */
  async stageConnectorFile(
    request: ConnectorUploadRequest,
    bytes: Uint8Array,
    signal?: AbortSignal,
  ): Promise<ConnectorUploadDescriptor> {
    if (bytes.byteLength !== request.byteLength) {
      throw new Error('The selected file changed before it could be staged.');
    }
    const grant = await this.#request<ConnectorUploadGrant>(
      '/v1/connector-files/upload-request',
      {
        method: 'POST',
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal }),
      },
    );
    const file = validateConnectorUploadGrant(grant, request);
    const uploadUrl = parsePresignedUploadUrl(grant.upload.url);
    const uploadHeaders = validateUploadHeaders(grant.upload.headers, request);
    const uploadBytes = Uint8Array.from(bytes);
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: uploadBytes.buffer,
        redirect: 'error',
        signal: withTimeout(signal, 60_000),
      });
    } finally {
      uploadBytes.fill(0);
    }
    if (!uploadResponse.ok) {
      throw new Error(`The selected file could not be staged (${uploadResponse.status}).`);
    }
    return file;
  }

  async prepareAction(
    request: {
      connectionId: string;
      tool: string;
      input: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<PreparedActionResult> {
    return this.#request('/v1/actions/prepare', {
      method: 'POST',
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    });
  }

  async commitAction(
    request: {
      actionId: string;
      digest: string;
      input: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<{
    status: 'completed' | 'already_completed';
    actionId: string;
    result?: unknown;
  }> {
    return this.#request('/v1/actions/commit', {
      method: 'POST',
      body: JSON.stringify(request),
      ...(signal ? { signal } : {}),
    });
  }

  async requestResearchExport(): Promise<{ downloadUrl: string }> {
    return this.#request('/v1/research/export', { method: 'POST' });
  }

  async deleteResearchData(options: CloudDeletionWaitOptions = {}): Promise<CloudDeletionJob> {
    return this.#deleteData('research', options);
  }

  async deleteAccountData(options: CloudDeletionWaitOptions = {}): Promise<CloudDeletionJob> {
    return this.#deleteData('account', options);
  }

  async #deleteData(
    scope: CloudDeletionScope,
    options: CloudDeletionWaitOptions,
  ): Promise<CloudDeletionJob> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const pollIntervalMs = options.pollIntervalMs ?? 1_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Cloud deletion timeout must be positive.');
    }
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
      throw new Error('Cloud deletion polling interval must be non-negative.');
    }
    const requested = parseCloudDeletionJob(
      await this.#request<unknown>('/v1/research/delete', {
        method: 'POST',
        body: JSON.stringify({ scope }),
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    );
    assertCloudDeletionSucceeded(requested, scope);
    if (requested.state === 'completed') {
      if (scope === 'account') this.#metaHistory.clear();
      return requested;
    }

    const deadline = Date.now() + timeoutMs;
    const maximumPolls = Math.max(1, Math.ceil(timeoutMs / Math.max(1, pollIntervalMs)));
    for (let poll = 0; poll < maximumPolls && Date.now() < deadline; poll += 1) {
      await abortableDelay(
        Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())),
        options.signal,
      );
      const status = asRecord(
        await this.#request<unknown>('/v1/research/delete', {
          method: 'GET',
          ...(options.signal ? { signal: options.signal } : {}),
        }),
      );
      if (status.deletion === null) {
        throw new Error(`Sia cloud lost the accepted ${scope} deletion job.`);
      }
      const deletion = parseCloudDeletionJob(status.deletion);
      if (deletion.id !== requested.id) {
        throw new Error(`Sia cloud returned a different ${scope} deletion job.`);
      }
      assertCloudDeletionSucceeded(deletion, scope);
      if (deletion.state === 'completed') {
        if (scope === 'account') this.#metaHistory.clear();
        return deletion;
      }
    }
    throw new Error(`Cloud ${scope} deletion did not complete before the safety timeout.`);
  }

  async #request<T = void>(path: string, init: RequestInit): Promise<T> {
    if (!this.#baseUrl) throw new Error('Sia cloud services are not configured.');
    const token = await this.#idTokens.read();
    const response = await fetch(resolveCloudUrl(this.#baseUrl, path), {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: withTimeout(init.signal ?? undefined, 15_000),
    });
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id');
      throw new Error(
        `Sia cloud request failed (${response.status})${requestId ? `, request ${requestId}` : ''}.`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function compactMetaHistory(history: readonly CloudMetaMessage[]): CloudMetaMessage[] {
  const system = history.find(({ role }) => role === 'system');
  const recent: CloudMetaMessage[] = [];
  let characters = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    if (message === system) continue;
    const size = message.content.length + safeJson(message.tool_calls ?? []).length;
    if (
      recent.length > 0 &&
      (recent.length >= MAX_META_HISTORY_MESSAGES - (system ? 1 : 0) ||
        characters + size > MAX_META_HISTORY_CHARACTERS)
    ) {
      break;
    }
    recent.unshift(message);
    characters += size;
  }
  while (recent[0]?.role === 'tool') recent.shift();
  return system ? [system, ...recent] : recent;
}

const CLOUD_DELETION_STATES = new Set<CloudDeletionState>([
  'requested',
  'processing',
  'research_deleted',
  'connections_revoked',
  'identity_deleted',
  'completed',
  'failed',
]);

function parseCloudDeletionJob(value: unknown): CloudDeletionJob {
  const record = asRecord(value);
  if (
    typeof record.id !== 'string' ||
    record.id.length === 0 ||
    (record.scope !== 'research' && record.scope !== 'account') ||
    typeof record.state !== 'string' ||
    !CLOUD_DELETION_STATES.has(record.state as CloudDeletionState) ||
    (record.failureCode !== undefined && typeof record.failureCode !== 'string')
  ) {
    throw new Error('Sia cloud returned an invalid deletion status.');
  }
  return {
    id: record.id,
    scope: record.scope,
    state: record.state as CloudDeletionState,
    ...(typeof record.failureCode === 'string' ? { failureCode: record.failureCode } : {}),
  };
}

function assertCloudDeletionSucceeded(
  deletion: CloudDeletionJob,
  expectedScope: CloudDeletionScope,
): void {
  if (deletion.scope !== expectedScope) {
    throw new Error(
      `Sia cloud returned a ${deletion.scope} job for ${expectedScope} deletion.`,
    );
  }
  if (deletion.state === 'failed') {
    throw new Error(
      `Cloud ${expectedScope} deletion failed${deletion.failureCode ? ` (${deletion.failureCode})` : ''}.`,
    );
  }
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('Cloud deletion was cancelled.'));
  }
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Cloud deletion was cancelled.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function validateConnectorUploadGrant(
  grant: ConnectorUploadGrant,
  request: ConnectorUploadRequest,
): ConnectorUploadDescriptor {
  const file = asRecord(grant.file);
  const upload = asRecord(grant.upload);
  const descriptor: ConnectorUploadDescriptor = {
    uploadId: requiredResponseString(file.uploadId, 'uploadId'),
    fileName: requiredResponseString(file.fileName, 'fileName'),
    mimeType: requiredResponseString(file.mimeType, 'mimeType'),
    byteLength: requiredResponseInteger(file.byteLength, 'byteLength'),
    sha256: requiredResponseString(file.sha256, 'sha256'),
  };
  const expiresAt = Date.parse(requiredResponseString(upload.expiresAt, 'expiresAt'));
  if (
    descriptor.fileName !== request.fileName ||
    descriptor.mimeType !== request.mimeType ||
    descriptor.byteLength !== request.byteLength ||
    descriptor.sha256 !== request.sha256 ||
    upload.method !== 'PUT' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new Error('Sia cloud returned an invalid file staging grant.');
  }
  return descriptor;
}

function validateUploadHeaders(
  value: Record<string, string>,
  request: ConnectorUploadRequest,
): Record<string, string> {
  const headers = asRecord(value);
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, headerValue]) => [key.toLowerCase(), headerValue]),
  );
  if (
    Object.keys(normalized).some((key) => key !== 'content-type' && key !== 'content-length') ||
    normalized['content-type'] !== request.mimeType ||
    normalized['content-length'] !== String(request.byteLength)
  ) {
    throw new Error('Sia cloud returned unsafe file upload headers.');
  }
  return {
    'content-type': request.mimeType,
    'content-length': String(request.byteLength),
  };
}

function parsePresignedUploadUrl(value: unknown): URL {
  const text = requiredResponseString(value, 'upload URL');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Sia cloud returned an invalid file upload URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Sia cloud returned an unsafe file upload URL.');
  }
  return url;
}

function requiredResponseString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Sia cloud omitted ${label} from the file staging grant.`);
  }
  return value;
}

function requiredResponseInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Sia cloud returned an invalid ${label}.`);
  }
  return value;
}

function withTimeout(signal: AbortSignal | undefined, milliseconds: number): AbortSignal {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function parseCloudBaseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The Sia cloud API URL must be a clean HTTPS URL.');
  }
  return url;
}

/** Joins an API route without discarding an API Gateway stage in the base URL. */
function resolveCloudUrl(baseUrl: URL, path: string): URL {
  const route = new URL(path, 'https://sia.invalid');
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    route.origin !== 'https://sia.invalid'
  ) {
    throw new Error('The Sia cloud API route is invalid.');
  }
  const url = new URL(baseUrl);
  const basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}${route.pathname}`;
  url.search = route.search;
  return url;
}

function cloudAppId(connectionId: ConnectionId): 'gmail' | 'google_drive' | 'slack' {
  return connectionId === 'drive' ? 'google_drive' : connectionId;
}

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        try {
          yield JSON.parse(data) as unknown;
        } catch {
          // Ignore malformed upstream frames; no untrusted text crosses as metadata.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function mergeToolCallDeltas(calls: Map<number, PendingToolCall>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const candidate of value) {
    const delta = asRecord(candidate);
    const index = finiteInteger(delta.index) ?? 0;
    const fn = asRecord(delta.function);
    const current = calls.get(index) ?? { id: '', name: '', arguments: '' };
    calls.set(index, {
      id: current.id || (typeof delta.id === 'string' ? delta.id : ''),
      name: `${current.name}${typeof fn.name === 'string' ? fn.name : ''}`,
      arguments: `${current.arguments}${typeof fn.arguments === 'string' ? fn.arguments : ''}`,
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: 'Tool output was not serializable.' });
  }
}
