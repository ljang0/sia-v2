export class RemoteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
import { RelayConnection, RelayError, readPairing } from './relay';

export const remoteBase = new URL('./', window.location.href);

/**
 * The Mac's Wi-Fi link serves this page at `/t/<token>/`; anywhere else (the Sia site) the page
 * reaches the Mac through the encrypted relay with the pairing saved on this phone.
 */
export const remoteTransport: 'wifi' | 'relay' = /\/t\/[a-f0-9]{64}\//.test(
  window.location.pathname,
)
  ? 'wifi'
  : 'relay';
const pairing = remoteTransport === 'relay' ? readPairing() : undefined;
const relay = pairing ? new RelayConnection(pairing) : undefined;
const NOT_PAIRED =
  'This phone is not paired yet. In Sia on your Mac, open Settings → Phone remote, choose Pair a phone, and scan the code.';
/** Pushed state is fresh enough to show without asking the Mac again. */
const STATE_MAX_AGE_MS = 4_000;

export async function remoteRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (remoteTransport === 'relay') return await relayRequest<T>(path, body, signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 12000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await fetch(new URL(path, remoteBase), {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new RemoteRequestError(
        typeof data.error === 'string' ? data.error : 'Sia could not complete this request.',
        response.status,
      );
    return data as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
// randomUUID is secure-context-only. getRandomValues also works on Notch-style LAN HTTP.
export function requestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function relayRequest<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!relay) throw new RemoteRequestError(NOT_PAIRED, 404);
  const url = new URL(path, 'https://relay.invalid/');
  const route = url.pathname.slice(1);
  if (route === 'state' && body === undefined) {
    const pushed = relay.latestState(STATE_MAX_AGE_MS);
    if (pushed !== undefined) return pushed as T;
  }
  try {
    const reply = await relay.request(
      requestId(),
      body === undefined ? 'GET' : 'POST',
      route,
      Object.fromEntries(url.searchParams),
      body,
      signal,
    );
    if (reply.status >= 400) {
      const error = (reply.json as { error?: unknown } | undefined)?.error;
      throw new RemoteRequestError(
        typeof error === 'string' ? error : 'Sia could not complete this request.',
        reply.status,
      );
    }
    return reply.json as T;
  } catch (cause) {
    if (cause instanceof RelayError) throw new RemoteRequestError(cause.message, cause.status);
    throw cause;
  }
}

/** Saves a result file. Over the relay the bytes arrive sealed and are saved from memory. */
export async function saveRemoteFile(route: string, name: string): Promise<void> {
  if (remoteTransport === 'wifi' || !relay) {
    const link = document.createElement('a');
    link.href = new URL(route, remoteBase).href;
    link.download = name;
    link.click();
    return;
  }
  const reply = await relay.request(requestId(), 'GET', route, {}, undefined);
  if (!reply.file) {
    const error = (reply.json as { error?: unknown } | undefined)?.error;
    throw new RemoteRequestError(
      typeof error === 'string' ? error : 'This file could not be sent to your phone.',
      reply.status,
    );
  }
  const bytes = Uint8Array.from(atob(reply.file.data), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = reply.file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
