import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRemote, sealRemote, type SealedMessage } from '../../shared/remote-seal.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { CloudRemote, type RelaySocket } from './cloud-remote.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The real relay service from apps/cloud, so this checks the Mac, relay, and phone protocol
// together. It is loaded at run time so the desktop project does not type-check cloud sources.
interface RelayService {
  handle(event: { routeKey: string; connectionId: string; body?: string }): Promise<void>;
}
interface RelayDependencies {
  store: unknown;
  pusher: {
    send(connectionId: string, frame: Record<string, unknown>): Promise<boolean>;
    close(connectionId: string): Promise<void>;
  };
  idTokens: { verify(token: string): Promise<{ subject: string }> };
  clock: { now(): Date };
  ids: { next(): string };
}
const cloudSource = new URL('../../../../cloud/src', import.meta.url).href;
const { RemoteRelayService } = (await import(
  /* @vite-ignore */ `${cloudSource}/services/remote-relay.ts`
)) as { RemoteRelayService: new (deps: RelayDependencies) => RelayService };
const { MemoryRemoteRelayStore } = (await import(
  /* @vite-ignore */ `${cloudSource}/memory.ts`
)) as { MemoryRemoteRelayStore: new () => unknown };

/** In-memory API Gateway: sockets on one side, the relay service on the other. */
function relayNetwork() {
  const sockets = new Map<string, RelaySocket & { closed: boolean }>();
  const relay = new RemoteRelayService({
    store: new MemoryRemoteRelayStore(),
    pusher: {
      send: async (connectionId, frame) => {
        const socket = sockets.get(connectionId);
        if (!socket || socket.closed) return false;
        queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify(frame) }));
        return true;
      },
      close: async (connectionId) => {
        const socket = sockets.get(connectionId);
        if (socket && !socket.closed) {
          socket.closed = true;
          queueMicrotask(() => socket.onclose?.());
          await relay.handle({ routeKey: '$disconnect', connectionId });
        }
      },
    },
    idTokens: {
      verify: async (token) => {
        if (token !== 'mac-id-token') throw new Error('invalid');
        return { subject: 'user-1' };
      },
    },
    clock: { now: () => new Date('2026-10-14T00:00:00.000Z') },
    ids: { next: () => `device-${sockets.size}` },
  });
  let count = 0;
  const connect = (): RelaySocket & { closed: boolean } => {
    const connectionId = `conn-${++count}`;
    const socket: RelaySocket & { closed: boolean } = {
      closed: false,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: (data) => void relay.handle({ routeKey: '$default', connectionId, body: data }),
      close: () => {
        if (socket.closed) return;
        socket.closed = true;
        void relay.handle({ routeKey: '$disconnect', connectionId });
        queueMicrotask(() => socket.onclose?.());
      },
    };
    sockets.set(connectionId, socket);
    void relay.handle({ routeKey: '$connect', connectionId }).then(() => socket.onopen?.());
    return socket;
  };
  return { connect };
}

/** A phone page: authenticates with the pairing fragment and exchanges sealed messages. */
async function phone(network: ReturnType<typeof relayNetwork>, pairingUrl: string) {
  const fragment = new URLSearchParams(new URL(pairingUrl).hash.slice(1));
  const deviceId = fragment.get('d')!;
  const key = fragment.get('k')!;
  const received: SealedMessage[] = [];
  const frames: Record<string, unknown>[] = [];
  const socket = network.connect();
  socket.onmessage = (event) => {
    const frame = JSON.parse(String(event.data)) as Record<string, unknown>;
    frames.push(frame);
    if (frame.type === 'sealed')
      void openRemote(key, deviceId, String(frame.payload)).then((m) => received.push(m));
  };
  await new Promise<void>((resolve) => (socket.onopen = () => resolve()));
  socket.send(
    JSON.stringify({ type: 'hello', role: 'phone', deviceId, token: fragment.get('t') }),
  );
  return {
    socket,
    deviceId,
    received,
    frames,
    request: async (message: Omit<Extract<SealedMessage, { kind: 'request' }>, 'kind'>) =>
      socket.send(
        JSON.stringify({
          type: 'sealed',
          payload: await sealRemote(key, deviceId, { kind: 'request', ...message }),
        }),
      ),
  };
}

const repositories: SqliteRecordRepository[] = [];
afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
  vi.useRealTimers();
});

function mac(network: ReturnType<typeof relayNetwork>, state: { turns: unknown[] }) {
  const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  repositories.push(repository);
  const dispatch = vi.fn(async () => ({ status: 200, json: { ok: true } }));
  const remote = new CloudRemote({
    relayUrl: 'wss://relay.example.test/v1',
    pageUrl: 'https://sia.example.test/remote/',
    idToken: async () => 'mac-id-token',
    repository,
    available: () => true,
    dispatch,
    state: () => state,
    connect: () => network.connect(),
  });
  return { remote, repository, dispatch };
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await flush();
  expect(check()).toBe(true);
}

describe('cloud phone remote', () => {
  it('pairs a phone, pushes sealed state, and answers sealed requests through dispatch', async () => {
    const network = relayNetwork();
    const state = { turns: [{ id: 't1', text: 'Hi', response: 'Hello', status: 'done' }] };
    const { remote, repository, dispatch } = mac(network, state);
    remote.reconcile();
    await until(() => remote.connected);

    const { url, deviceId } = await remote.pair();
    expect(url.startsWith('https://sia.example.test/remote/#')).toBe(true);
    const fragment = new URLSearchParams(new URL(url).hash.slice(1));
    expect(fragment.get('r')).toBe('wss://relay.example.test/v1');
    // The key stays in Sia's encrypted store and the QR fragment; it is never sent to the relay.
    const stored = repository.get<{ devices: { key: string }[] }>('phone-relay', 'devices');
    expect(stored?.devices[0]?.key).toBe(fragment.get('k'));

    const handset = await phone(network, url);
    expect(handset.deviceId).toBe(deviceId);
    await until(() => handset.received.some((message) => message.kind === 'state'));
    expect(handset.received.find((message) => message.kind === 'state')).toEqual({
      kind: 'state',
      state,
    });
    expect(remote.devices()).toEqual([
      { deviceId, pairedAt: expect.any(String), online: true },
    ]);

    await handset.request({ id: 'r1', method: 'POST', route: 'command', body: { text: 'Go' } });
    await until(() => handset.received.some((message) => message.kind === 'reply'));
    expect(handset.received.find((message) => message.kind === 'reply')).toEqual({
      kind: 'reply',
      id: 'r1',
      status: 200,
      json: { ok: true },
    });
    expect(dispatch).toHaveBeenCalledWith({
      method: 'POST',
      route: 'command',
      query: new URLSearchParams(),
      body: { text: 'Go' },
    });
    // Nothing the relay forwarded was readable.
    expect(JSON.stringify(handset.frames)).not.toContain('Hello');
    remote.stop();
  });

  it('ignores requests sealed with the wrong key and cuts off a revoked phone', async () => {
    const network = relayNetwork();
    const { remote, dispatch } = mac(network, { turns: [] });
    remote.reconcile();
    await until(() => remote.connected);
    const { url, deviceId } = await remote.pair();
    const handset = await phone(network, url);
    await until(() => remote.devices()[0]?.online === true);

    handset.socket.send(
      JSON.stringify({
        type: 'sealed',
        payload: await sealRemote('A'.repeat(43), deviceId, {
          kind: 'request',
          id: 'forged',
          method: 'GET',
          route: 'state',
        }),
      }),
    );
    await flush();
    await flush();
    expect(dispatch).not.toHaveBeenCalled();

    remote.revoke(deviceId);
    await until(() => handset.socket.closed);
    expect(remote.devices()).toEqual([]);
    remote.stop();
  });

  it('sends only small files inline and stops when another Mac takes over', async () => {
    const network = relayNetwork();
    const first = mac(network, { turns: [] });
    first.dispatch.mockResolvedValueOnce({
      status: 200,
      file: { name: 'big.pdf', data: Buffer.alloc(60 * 1024) },
    } as never);
    first.remote.reconcile();
    await until(() => first.remote.connected);
    const handset = await phone(network, (await first.remote.pair()).url);
    await handset.request({ id: 'f1', method: 'GET', route: 'results/abc' });
    await until(() => handset.received.some((message) => message.kind === 'reply'));
    expect(handset.received.find((message) => message.kind === 'reply')).toMatchObject({
      status: 413,
    });

    const second = mac(network, { turns: [] });
    second.remote.reconcile();
    await until(() => second.remote.connected);
    await until(() => !first.remote.connected);
    expect(first.remote.detail).toContain('another Mac');
    second.remote.stop();
  });
});
