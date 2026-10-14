import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MemoryRemoteRelayStore } from '../src/memory.js';
import type { ConnectionPusher } from '../src/ports.js';
import {
  FRAMES_PER_MINUTE,
  MAX_REMOTE_DEVICES,
  MAX_SEALED_PAYLOAD,
  RemoteRelayService,
  tokenHash,
} from '../src/services/remote-relay.js';

class RecordingPusher implements ConnectionPusher {
  readonly sent: Array<{ connectionId: string; frame: Record<string, unknown> }> = [];
  readonly closed: string[] = [];
  readonly gone = new Set<string>();
  async send(connectionId: string, frame: Record<string, unknown>): Promise<boolean> {
    if (this.gone.has(connectionId)) return false;
    this.sent.push({ connectionId, frame });
    return true;
  }
  async close(connectionId: string): Promise<void> {
    this.closed.push(connectionId);
  }
  to(connectionId: string) {
    return this.sent.filter((entry) => entry.connectionId === connectionId).map((e) => e.frame);
  }
}

function relay() {
  const store = new MemoryRemoteRelayStore();
  const pusher = new RecordingPusher();
  let id = 0;
  const service = new RemoteRelayService({
    store,
    pusher,
    idTokens: {
      verify: async (token) => {
        if (token !== 'valid-mac-token') throw new Error('bad token');
        return { subject: 'user-1' };
      },
    },
    clock: { now: () => new Date('2026-10-14T00:00:00.000Z') },
    ids: { next: () => `device-${++id}` },
  });
  const send = (connectionId: string, frame: Record<string, unknown> | string) =>
    service.handle({
      routeKey: '$default',
      connectionId,
      body: typeof frame === 'string' ? frame : JSON.stringify(frame),
    });
  const connect = (connectionId: string) =>
    service.handle({ routeKey: '$connect', connectionId });
  return { store, pusher, service, send, connect };
}

async function pairedPhone() {
  const harness = relay();
  await harness.connect('mac');
  await harness.send('mac', { type: 'hello', role: 'mac', idToken: 'valid-mac-token' });
  await harness.send('mac', { type: 'pair' });
  const paired = harness.pusher.to('mac').find(({ type }) => type === 'paired')!;
  await harness.connect('phone');
  await harness.send('phone', {
    type: 'hello',
    role: 'phone',
    deviceId: paired.deviceId,
    token: paired.token,
  });
  return { ...harness, deviceId: String(paired.deviceId), token: String(paired.token) };
}

describe('phone relay', () => {
  it('authenticates a Mac and pairs a device whose token is stored only as a hash', async () => {
    const { store, pusher, deviceId, token } = await pairedPhone();
    assert.deepEqual(pusher.to('mac')[0], { type: 'ready', role: 'mac' });
    assert.deepEqual(pusher.to('phone')[0], { type: 'ready', role: 'phone' });
    const device = await store.getDevice(deviceId);
    assert.equal(device?.userId, 'user-1');
    assert.equal(device?.tokenHash, tokenHash(token));
    assert.doesNotMatch(JSON.stringify([...store.devices.values()]), new RegExp(token));
    // The Mac hears that the phone came online.
    assert.deepEqual(pusher.to('mac').at(-1), { type: 'presence', deviceId, online: true });
  });

  it('forwards sealed frames both ways without reading them', async () => {
    const { pusher, send, deviceId } = await pairedPhone();
    await send('phone', { type: 'sealed', payload: 'c2VhbGVkLXJlcXVlc3Q' });
    assert.deepEqual(pusher.to('mac').at(-1), {
      type: 'sealed',
      deviceId,
      payload: 'c2VhbGVkLXJlcXVlc3Q',
    });
    await send('mac', { type: 'sealed', deviceId, payload: 'c2VhbGVkLXJlcGx5' });
    assert.deepEqual(pusher.to('phone').at(-1), {
      type: 'sealed',
      payload: 'c2VhbGVkLXJlcGx5',
    });
  });

  it('closes a connection whose first frame is not a valid hello', async () => {
    const harness = relay();
    await harness.connect('stranger');
    await harness.send('stranger', { type: 'sealed', payload: 'abc' });
    assert.ok(harness.pusher.closed.includes('stranger'));
    assert.equal(await harness.store.getConnection('stranger'), undefined);

    await harness.connect('forger');
    await harness.send('forger', { type: 'hello', role: 'mac', idToken: 'forged' });
    assert.deepEqual(harness.pusher.to('forger'), [
      { type: 'error', code: 'authentication_failed' },
    ]);
    assert.ok(harness.pusher.closed.includes('forger'));
  });

  it('rejects a phone with a wrong token and cuts off a revoked device at once', async () => {
    const { pusher, send, connect, deviceId } = await pairedPhone();
    await connect('impostor');
    await send('impostor', { type: 'hello', role: 'phone', deviceId, token: 'guess' });
    assert.ok(pusher.closed.includes('impostor'));

    await send('mac', { type: 'revoke', deviceId });
    assert.ok(pusher.closed.includes('phone'));
    await connect('phone-again');
    await send('phone-again', { type: 'hello', role: 'phone', deviceId, token: 'any' });
    assert.ok(pusher.closed.includes('phone-again'));
  });

  it('tells the phone when its Mac is offline, and drops vanished peers', async () => {
    const { pusher, send, service } = await pairedPhone();
    pusher.gone.add('mac');
    await send('phone', { type: 'sealed', payload: 'cmVxdWVzdA' });
    assert.deepEqual(pusher.to('phone').at(-1), { type: 'mac_offline' });
    await service.handle({ routeKey: '$disconnect', connectionId: 'mac' });
    await send('phone', { type: 'sealed', payload: 'cmVxdWVzdA' });
    assert.deepEqual(pusher.to('phone').at(-1), { type: 'mac_offline' });
  });

  it('keeps one Mac connection per account', async () => {
    const { pusher, send, connect } = await pairedPhone();
    await connect('mac-2');
    await send('mac-2', { type: 'hello', role: 'mac', idToken: 'valid-mac-token' });
    assert.deepEqual(pusher.to('mac').at(-1), { type: 'replaced' });
    assert.ok(pusher.closed.includes('mac'));
    await send('phone', { type: 'sealed', payload: 'cmVxdWVzdA' });
    assert.equal(pusher.to('mac-2').at(-1)?.type, 'sealed');
  });

  it('enforces device, size, and frame-rate limits', async () => {
    const { pusher, send, deviceId } = await pairedPhone();
    for (let index = 1; index < MAX_REMOTE_DEVICES; index += 1)
      await send('mac', { type: 'pair' });
    await send('mac', { type: 'pair' });
    assert.deepEqual(pusher.to('mac').at(-1), { type: 'error', code: 'too_many_devices' });

    await send('phone', { type: 'sealed', payload: 'a'.repeat(MAX_SEALED_PAYLOAD + 1) });
    assert.equal(pusher.to('phone').at(-1)?.type, 'error');

    for (let index = 0; index <= FRAMES_PER_MINUTE; index += 1) {
      await send('mac', { type: 'sealed', deviceId, payload: 'eA' });
    }
    assert.deepEqual(pusher.to('mac').at(-1), { type: 'error', code: 'rate_limited' });
  });

  it('lists devices with their live state for the Mac', async () => {
    const { pusher, send, deviceId } = await pairedPhone();
    await send('mac', { type: 'devices' });
    assert.deepEqual(pusher.to('mac').at(-1), {
      type: 'devices',
      devices: [
        {
          deviceId,
          createdAt: '2026-10-14T00:00:00.000Z',
          lastSeenAt: '2026-10-14T00:00:00.000Z',
          online: true,
        },
      ],
    });
  });
});
