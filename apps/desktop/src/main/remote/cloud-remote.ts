import type { RecordRepository } from '../storage/persistence.js';
import {
  newRemoteKey,
  openRemote,
  sealRemote,
  type SealedMessage,
} from '../../shared/remote-seal.js';
import type { RemoteCall, RemoteReply } from './phone-remote.js';

/** The relay accepts 96 KiB of sealed payload; leave room for the nonce and tag. */
const MAX_SEALED = 96 * 1024;
/** Files above this stay on the Mac until sealed object transfer exists. */
const MAX_INLINE_FILE = 48 * 1024;
const STATE_INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

/** The subset of a WebSocket the relay client uses; injectable for tests. */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface PairedPhone {
  deviceId: string;
  /** The AES-256-GCM key shared only with this phone, via the pairing QR fragment. */
  key: string;
  pairedAt: string;
}

export interface CloudRemoteDevice {
  deviceId: string;
  pairedAt: string;
  online: boolean;
}

export interface CloudRemoteDependencies {
  relayUrl: string;
  pageUrl: string;
  idToken: () => Promise<string | undefined>;
  repository: RecordRepository;
  /** Whether phone access is on, signed in, and not paused for lock or sleep. */
  available: () => boolean;
  dispatch: (call: RemoteCall) => Promise<RemoteReply>;
  /** The phone view to push, or undefined when phone access is unavailable. */
  state: () => unknown;
  connect?: (url: string) => RelaySocket;
  now?: () => Date;
}

interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Sia's side of the encrypted phone relay (docs/phone-cloud-relay.md): one outbound WebSocket to
 * Sia cloud while phone access is on. Requests from paired phones are opened with that phone's
 * key, answered by the same handler as the Wi-Fi remote, and sealed back; phone state is pushed
 * whenever it changes. The relay only ever sees ciphertext.
 */
export class CloudRemote {
  readonly #deps: CloudRemoteDependencies;
  #socket: RelaySocket | undefined;
  #ready = false;
  #stopped = true;
  #backoff = 1_000;
  #retry: NodeJS.Timeout | undefined;
  #stateTimer: NodeJS.Timeout | undefined;
  #online = new Set<string>();
  #pushed = new Map<string, string>();
  #pairing: Pending<{ deviceId: string; token: string }> | undefined;
  #detail = 'Phone access over the internet is off.';

  constructor(deps: CloudRemoteDependencies) {
    this.#deps = deps;
  }

  get connected(): boolean {
    return this.#ready;
  }

  get detail(): string {
    return this.#detail;
  }

  /** Connects when phone access is available and disconnects when it is not. */
  reconcile(): void {
    if (this.#deps.available()) {
      if (this.#stopped) {
        this.#stopped = false;
        this.#open();
      }
    } else if (!this.#stopped) {
      this.stop('Phone access over the internet is off.');
    }
  }

  stop(detail = 'Phone access over the internet is off.'): void {
    this.#stopped = true;
    this.#detail = detail;
    clearTimeout(this.#retry);
    clearInterval(this.#stateTimer);
    this.#stateTimer = undefined;
    this.#ready = false;
    this.#online.clear();
    this.#pushed.clear();
    this.#pairing?.reject(new Error('Phone access stopped.'));
    this.#pairing = undefined;
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close();
  }

  devices(): CloudRemoteDevice[] {
    return this.#paired().map(({ deviceId, pairedAt }) => ({
      deviceId,
      pairedAt,
      online: this.#online.has(deviceId),
    }));
  }

  /**
   * Pairs a new phone. The returned URL carries the device credential and key in its fragment,
   * which the browser keeps on the phone; show it only as a QR code on this Mac.
   */
  async pair(): Promise<{ deviceId: string; url: string }> {
    if (!this.#ready || !this.#socket)
      throw new Error('Sia is not connected to phone access yet. Try again in a moment.');
    if (this.#pairing) throw new Error('A phone is already being paired.');
    const paired = await new Promise<{ deviceId: string; token: string }>((resolve, reject) => {
      this.#pairing = { resolve, reject };
      this.#send({ type: 'pair' });
    }).finally(() => {
      this.#pairing = undefined;
    });
    const key = newRemoteKey();
    this.#save([
      ...this.#paired(),
      {
        deviceId: paired.deviceId,
        key,
        pairedAt: (this.#deps.now?.() ?? new Date()).toISOString(),
      },
    ]);
    const fragment = new URLSearchParams({
      r: this.#deps.relayUrl,
      d: paired.deviceId,
      t: paired.token,
      k: key,
    });
    return { deviceId: paired.deviceId, url: `${this.#deps.pageUrl}#${fragment.toString()}` };
  }

  /** Forgets a phone here and revokes it at the relay so its connections close. */
  revoke(deviceId: string): void {
    this.#save(this.#paired().filter((phone) => phone.deviceId !== deviceId));
    this.#online.delete(deviceId);
    this.#pushed.delete(deviceId);
    if (this.#ready) this.#send({ type: 'revoke', deviceId });
  }

  #open(): void {
    let socket: RelaySocket;
    try {
      socket = (this.#deps.connect ?? defaultConnect)(this.#deps.relayUrl);
    } catch {
      this.#scheduleRetry();
      return;
    }
    this.#socket = socket;
    this.#detail = 'Connecting phone access…';
    socket.onopen = () => {
      void this.#hello(socket);
    };
    socket.onmessage = (event) => {
      if (socket !== this.#socket || typeof event.data !== 'string') return;
      void this.#onFrame(event.data).catch(() => undefined);
    };
    socket.onclose = () => {
      if (socket !== this.#socket) return;
      this.#socket = undefined;
      this.#ready = false;
      this.#online.clear();
      clearInterval(this.#stateTimer);
      this.#stateTimer = undefined;
      if (!this.#stopped) this.#scheduleRetry();
    };
    socket.onerror = () => undefined;
  }

  async #hello(socket: RelaySocket): Promise<void> {
    const idToken = await this.#deps.idToken().catch(() => undefined);
    if (socket !== this.#socket) return;
    if (!idToken) {
      this.stop('Sign in to Sia on your Mac to use phone access.');
      return;
    }
    socket.send(JSON.stringify({ type: 'hello', role: 'mac', idToken }));
  }

  #scheduleRetry(): void {
    this.#detail = 'Phone access is reconnecting…';
    clearTimeout(this.#retry);
    this.#retry = setTimeout(() => {
      if (!this.#stopped) this.#open();
    }, this.#backoff);
    this.#retry.unref?.();
    this.#backoff = Math.min(this.#backoff * 2, MAX_BACKOFF_MS);
  }

  async #onFrame(raw: string): Promise<void> {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (frame.type) {
      case 'ready':
        this.#ready = true;
        this.#backoff = 1_000;
        this.#detail = 'Phone access is on. Paired phones can reach this Mac from anywhere.';
        this.#send({ type: 'devices' });
        clearInterval(this.#stateTimer);
        this.#stateTimer = setInterval(() => void this.#pushState(), STATE_INTERVAL_MS);
        this.#stateTimer.unref?.();
        return;
      case 'paired':
        if (typeof frame.deviceId === 'string' && typeof frame.token === 'string')
          this.#pairing?.resolve({ deviceId: frame.deviceId, token: frame.token });
        return;
      case 'devices':
        this.#online = new Set(
          (Array.isArray(frame.devices) ? frame.devices : [])
            .filter((device) => device?.online === true && typeof device.deviceId === 'string')
            .map((device) => String(device.deviceId)),
        );
        await this.#pushState();
        return;
      case 'presence':
        if (typeof frame.deviceId !== 'string') return;
        if (frame.online === true) this.#online.add(frame.deviceId);
        else this.#online.delete(frame.deviceId);
        this.#pushed.delete(frame.deviceId);
        await this.#pushState();
        return;
      case 'sealed':
        if (typeof frame.deviceId === 'string' && typeof frame.payload === 'string')
          await this.#onRequest(frame.deviceId, frame.payload);
        return;
      case 'replaced':
        this.stop('Phone access moved to another Mac signed in to this Sia account.');
        return;
      case 'error':
        if (frame.code === 'authentication_failed')
          this.stop('Sign in to Sia on your Mac again to use phone access.');
        else this.#pairing?.reject(new Error(pairingError(frame.code)));
        return;
    }
  }

  async #onRequest(deviceId: string, payload: string): Promise<void> {
    const phone = this.#paired().find((entry) => entry.deviceId === deviceId);
    if (!phone) return;
    let message: SealedMessage;
    try {
      message = await openRemote(phone.key, deviceId, payload);
    } catch {
      return; // Not sealed with this phone's key: ignore rather than answer.
    }
    if (message.kind !== 'request') return;
    const reply = this.#deps.available()
      ? await this.#deps.dispatch({
          method: message.method,
          route: message.route,
          query: new URLSearchParams(message.query ?? {}),
          origin: 'own_device',
          ...(message.body === undefined ? {} : { body: message.body }),
        })
      : { status: 404, json: { error: 'Phone access is off on your Mac.' } };
    await this.#sendSealed(phone, replyMessage(message.id, reply));
    this.#pushed.delete(deviceId);
    await this.#pushState();
  }

  async #pushState(): Promise<void> {
    if (!this.#ready || this.#online.size === 0) return;
    const state = this.#deps.state();
    if (state === undefined) return;
    const serialized = JSON.stringify(state);
    for (const phone of this.#paired()) {
      if (!this.#online.has(phone.deviceId) || this.#pushed.get(phone.deviceId) === serialized)
        continue;
      this.#pushed.set(phone.deviceId, serialized);
      await this.#sendSealed(phone, { kind: 'state', state: fitState(state) });
    }
  }

  async #sendSealed(phone: PairedPhone, message: SealedMessage): Promise<void> {
    const payload = await sealRemote(phone.key, phone.deviceId, message);
    if (payload.length > MAX_SEALED) return;
    this.#send({ type: 'sealed', deviceId: phone.deviceId, payload });
  }

  #send(frame: Record<string, unknown>): void {
    this.#socket?.send(JSON.stringify(frame));
  }

  #paired(): PairedPhone[] {
    return (
      this.#deps.repository.get<{ devices: PairedPhone[] }>('phone-relay', 'devices')
        ?.devices ?? []
    );
  }

  #save(devices: PairedPhone[]): void {
    this.#deps.repository.put('phone-relay', 'devices', { devices });
  }
}

function replyMessage(id: string, reply: RemoteReply): SealedMessage {
  if (!('file' in reply)) return { kind: 'reply', id, status: reply.status, json: reply.json };
  if (reply.file.data.length > MAX_INLINE_FILE) {
    return {
      kind: 'reply',
      id,
      status: 413,
      json: { error: 'This file is too large to send to your phone yet. Open it on your Mac.' },
    };
  }
  return {
    kind: 'reply',
    id,
    status: 200,
    file: { name: reply.file.name, data: reply.file.data.toString('base64') },
  };
}

/** Keeps the newest turns that fit in one sealed frame. */
function fitState(state: unknown): unknown {
  if (
    typeof state !== 'object' ||
    state === null ||
    !Array.isArray((state as { turns?: unknown }).turns)
  )
    return state;
  const value = state as { turns: unknown[] };
  let turns = value.turns;
  while (turns.length > 1 && JSON.stringify({ ...value, turns }).length > MAX_SEALED * 0.7) {
    turns = turns.slice(1);
  }
  return { ...value, turns };
}

function pairingError(code: unknown): string {
  return code === 'too_many_devices'
    ? 'Ten phones are already paired. Remove one, then try again.'
    : 'The phone could not be paired. Try again.';
}

function defaultConnect(url: string): RelaySocket {
  return new WebSocket(url) as unknown as RelaySocket;
}
