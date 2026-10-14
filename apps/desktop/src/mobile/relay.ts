import { openRemote, sealRemote, type SealedMessage } from '../shared/remote-seal';

/**
 * The phone side of the encrypted relay (docs/phone-cloud-relay.md). Pairing details arrive in
 * the QR link's fragment, which the browser never sends anywhere; they are kept on this phone so
 * a Home Screen shortcut keeps working, and removed from the address bar.
 */
export interface RelayPairing {
  /** The relay's wss URL. */
  r: string;
  /** Device id and token issued by the relay at pairing. */
  d: string;
  t: string;
  /** The AES-256-GCM key shared only with the Mac. */
  k: string;
}

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const STORAGE_KEY = 'sia-phone-pairing';
const REQUEST_TIMEOUT_MS = 12_000;

export function readPairing(location: Location = window.location): RelayPairing | undefined {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const fromLink = pairingFrom(fragment);
  if (fromLink) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromLink));
    } catch {
      // Private browsing: the pairing works until this tab closes.
    }
    history.replaceState(null, '', location.pathname + location.search);
    return fromLink;
  }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved && typeof saved === 'object'
      ? pairingFrom(new URLSearchParams(saved as Record<string, string>))
      : undefined;
  } catch {
    return undefined;
  }
}

export function forgetPairing(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

function pairingFrom(values: URLSearchParams): RelayPairing | undefined {
  const r = values.get('r');
  const d = values.get('d');
  const t = values.get('t');
  const k = values.get('k');
  if (!r || !d || !t || !k) return undefined;
  try {
    const url = new URL(r);
    // Encrypted transport only; plain ws is allowed solely for a relay on this same device.
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) return undefined;
  } catch {
    return undefined;
  }
  return { r, d, t, k };
}

interface Pending {
  resolve: (message: Extract<SealedMessage, { kind: 'reply' }>) => void;
  reject: (error: RelayError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One WebSocket to the relay, with sealed request/reply and pushed state. */
export class RelayConnection {
  readonly #pairing: RelayPairing;
  #socket: WebSocket | undefined;
  #ready: Promise<void> | undefined;
  #pending = new Map<string, Pending>();
  #state: { value: unknown; at: number } | undefined;
  #backoff = 1_000;
  #fatal: RelayError | undefined;

  constructor(pairing: RelayPairing) {
    this.#pairing = pairing;
  }

  /** The newest state the Mac pushed, if it arrived within `maxAgeMs`. */
  latestState(maxAgeMs: number): unknown {
    return this.#state && Date.now() - this.#state.at <= maxAgeMs
      ? this.#state.value
      : undefined;
  }

  async request(
    id: string,
    method: 'GET' | 'POST',
    route: string,
    query: Record<string, string>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Extract<SealedMessage, { kind: 'reply' }>> {
    await this.#connect();
    const payload = await sealRemote(this.#pairing.k, this.#pairing.d, {
      kind: 'request',
      id,
      method,
      route,
      ...(Object.keys(query).length ? { query } : {}),
      ...(body === undefined ? {} : { body }),
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new RelayError('Your Mac did not answer. Keep Sia open and your Mac awake.', 504),
        );
      }, REQUEST_TIMEOUT_MS);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.#pending.delete(id);
          reject(new RelayError('The request was cancelled.', 499));
        },
        { once: true },
      );
      this.#pending.set(id, { resolve, reject, timer });
      this.#socket?.send(JSON.stringify({ type: 'sealed', payload }));
    });
  }

  #connect(): Promise<void> {
    if (this.#fatal) return Promise.reject(this.#fatal);
    if (this.#ready) return this.#ready;
    this.#ready = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.#pairing.r);
      this.#socket = socket;
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: 'hello',
            role: 'phone',
            deviceId: this.#pairing.d,
            token: this.#pairing.t,
          }),
        );
      socket.onmessage = (event) => void this.#onFrame(String(event.data), resolve, reject);
      socket.onclose = () => {
        if (this.#socket !== socket) return;
        this.#socket = undefined;
        this.#ready = undefined;
        this.#failPending(new RelayError('Reconnecting to your Mac…', 503));
        reject(new RelayError('Reconnecting to your Mac…', 503));
        if (!this.#fatal) {
          setTimeout(() => void this.#connect().catch(() => undefined), this.#backoff);
          this.#backoff = Math.min(this.#backoff * 2, 30_000);
        }
      };
    });
    return this.#ready;
  }

  async #onFrame(raw: string, ready: () => void, failed: (error: RelayError) => void) {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (frame.type === 'ready') {
      this.#backoff = 1_000;
      ready();
      return;
    }
    if (frame.type === 'mac_offline') {
      this.#failPending(
        new RelayError(
          'Your Mac is offline. Open Sia and keep your Mac awake and online.',
          503,
        ),
      );
      return;
    }
    if (frame.type === 'error') {
      if (frame.code === 'authentication_failed' || frame.code === 'device_revoked') {
        forgetPairing();
        this.#fatal = new RelayError(
          'This phone is no longer paired. In Sia on your Mac, open Settings → Phone remote and pair it again.',
          401,
        );
        this.#failPending(this.#fatal);
        failed(this.#fatal);
      }
      return;
    }
    if (frame.type !== 'sealed' || typeof frame.payload !== 'string') return;
    let message: SealedMessage;
    try {
      message = await openRemote(this.#pairing.k, this.#pairing.d, frame.payload);
    } catch {
      return;
    }
    if (message.kind === 'state') {
      this.#state = { value: message.state, at: Date.now() };
    } else if (message.kind === 'reply') {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id);
      pending.resolve(message);
    }
  }

  #failPending(error: RelayError): void {
    for (const [id, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.#pending.delete(id);
    }
  }
}
