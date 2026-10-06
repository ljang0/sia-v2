import type { Fetch } from './oauth.js';

/** A provider HTTP failure, mapped to a short message the agent can relay. */
export class ConnectorRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  get reconnectRequired(): boolean {
    return this.status === 401;
  }
}

export async function jsonRequest(
  fetchImpl: Fetch,
  url: string,
  token: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 500) };
  }
  if (!response.ok)
    throw new ConnectorRequestError(response.status, failureMessage(response.status, body));
  return body;
}

function failureMessage(status: number, body: unknown): string {
  const record = (body ?? {}) as Record<string, unknown>;
  const nested = record.error as Record<string, unknown> | string | undefined;
  const detail =
    (typeof nested === 'object' && typeof nested?.message === 'string' && nested.message) ||
    (typeof record.message === 'string' && record.message) ||
    (typeof nested === 'string' && nested) ||
    '';
  if (status === 401)
    return 'This app connection expired. Reconnect it in Settings > Connections.';
  if (status === 403)
    return `The connected account is not allowed to do that${detail ? `: ${detail.slice(0, 300)}` : '.'}`;
  if (status === 404) return 'That item was not found, or the connected account cannot see it.';
  if (status === 429)
    return 'The app is rate-limiting requests. Wait a moment, then try again.';
  return `The app returned an error (${status})${detail ? `: ${detail.slice(0, 300)}` : '.'}`;
}
