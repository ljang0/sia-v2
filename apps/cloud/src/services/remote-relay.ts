import { createHash, randomBytes } from 'node:crypto';
import { constantTimeEqual, isRecord } from '../domain.js';
import type {
  Clock,
  ConnectionPusher,
  IdGenerator,
  IdTokenVerifier,
  RemoteConnection,
  RemoteRelayStore,
} from '../ports.js';

export const MAX_REMOTE_DEVICES = 10;
/** API Gateway allows 128 KiB per message; sealed payloads stay well under it. */
export const MAX_SEALED_PAYLOAD = 96 * 1024;
export const FRAMES_PER_MINUTE = 120;
const CONNECTION_TTL_SECONDS = 24 * 60 * 60;

export interface RemoteRelayDependencies {
  readonly store: RemoteRelayStore;
  readonly pusher: ConnectionPusher;
  readonly idTokens: IdTokenVerifier;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RelayEvent {
  readonly routeKey: string;
  readonly connectionId: string;
  readonly body?: string | null | undefined;
}

/**
 * The phone relay: forwards end-to-end sealed frames between a Mac and its paired phones over
 * API Gateway WebSockets. It authenticates each connection from its first frame and never sees
 * plaintext. See docs/phone-cloud-relay.md.
 */
export class RemoteRelayService {
  constructor(private readonly deps: RemoteRelayDependencies) {}

  async handle(event: RelayEvent): Promise<void> {
    if (event.routeKey === '$connect') return await this.#connect(event.connectionId);
    if (event.routeKey === '$disconnect') return await this.#disconnect(event.connectionId);
    const connection = await this.deps.store.getConnection(event.connectionId);
    if (!connection) return await this.deps.pusher.close(event.connectionId);
    const minute = Math.floor(this.deps.clock.now().getTime() / 60_000);
    if ((await this.deps.store.countFrame(event.connectionId, minute)) > FRAMES_PER_MINUTE) {
      await this.#reply(event.connectionId, { type: 'error', code: 'rate_limited' });
      return;
    }
    const frame = parseFrame(event.body);
    if (!frame) return await this.#reject(event.connectionId, 'invalid_frame');
    if (connection.role === 'pending') {
      if (frame.type !== 'hello')
        return await this.#reject(event.connectionId, 'hello_required');
      return await this.#hello(connection, frame);
    }
    if (connection.role === 'mac') return await this.#fromMac(connection, frame);
    return await this.#fromPhone(connection, frame);
  }

  async #connect(connectionId: string): Promise<void> {
    await this.deps.store.putConnection({
      connectionId,
      role: 'pending',
      connectedAt: this.deps.clock.now().toISOString(),
      expiresAt: this.#expiry(),
    });
  }

  async #disconnect(connectionId: string): Promise<void> {
    const connection = await this.deps.store.getConnection(connectionId);
    await this.deps.store.deleteConnection(connectionId);
    if (connection?.role === 'mac' && connection.userId) {
      await this.deps.store.clearMacConnection(connection.userId, connectionId);
    }
    if (connection?.role === 'phone' && connection.userId && connection.deviceId) {
      await this.#presence(connection.userId, connection.deviceId);
    }
  }

  async #hello(connection: RemoteConnection, frame: Record<string, unknown>): Promise<void> {
    if (frame.role === 'mac' && typeof frame.idToken === 'string') {
      let subject: string;
      try {
        ({ subject } = await this.deps.idTokens.verify(frame.idToken));
      } catch {
        return await this.#reject(connection.connectionId, 'authentication_failed');
      }
      await this.deps.store.putConnection({
        ...connection,
        role: 'mac',
        userId: subject,
        expiresAt: this.#expiry(),
      });
      const previous = await this.deps.store.setMacConnection(subject, connection.connectionId);
      // One Mac per account: the newest connection replaces any older one.
      if (previous && previous !== connection.connectionId) {
        await this.deps.pusher.send(previous, { type: 'replaced' });
        await this.deps.pusher.close(previous);
      }
      await this.#reply(connection.connectionId, { type: 'ready', role: 'mac' });
      return;
    }
    if (
      frame.role === 'phone' &&
      typeof frame.deviceId === 'string' &&
      typeof frame.token === 'string'
    ) {
      const device = await this.deps.store.getDevice(frame.deviceId);
      if (!device || !constantTimeEqual(device.tokenHash, tokenHash(frame.token))) {
        return await this.#reject(connection.connectionId, 'authentication_failed');
      }
      await this.deps.store.putConnection({
        ...connection,
        role: 'phone',
        userId: device.userId,
        deviceId: device.deviceId,
        expiresAt: this.#expiry(),
      });
      await this.deps.store.touchDevice(device.deviceId, this.deps.clock.now().toISOString());
      await this.#reply(connection.connectionId, { type: 'ready', role: 'phone' });
      await this.#presence(device.userId, device.deviceId);
      return;
    }
    await this.#reject(connection.connectionId, 'authentication_failed');
  }

  async #fromMac(connection: RemoteConnection, frame: Record<string, unknown>): Promise<void> {
    const userId = connection.userId!;
    if (frame.type === 'pair') {
      const devices = await this.deps.store.listDevices(userId);
      if (devices.length >= MAX_REMOTE_DEVICES) {
        return await this.#reply(connection.connectionId, {
          type: 'error',
          code: 'too_many_devices',
        });
      }
      const deviceId = this.deps.ids.next();
      const token = randomBytes(32).toString('base64url');
      await this.deps.store.createDevice({
        deviceId,
        userId,
        tokenHash: tokenHash(token),
        createdAt: this.deps.clock.now().toISOString(),
      });
      return await this.#reply(connection.connectionId, { type: 'paired', deviceId, token });
    }
    if (frame.type === 'devices') {
      const devices = await this.deps.store.listDevices(userId);
      const listed = await Promise.all(
        devices.map(async (device) => ({
          deviceId: device.deviceId,
          createdAt: device.createdAt,
          ...(device.lastSeenAt ? { lastSeenAt: device.lastSeenAt } : {}),
          online: (await this.deps.store.deviceConnections(device.deviceId)).length > 0,
        })),
      );
      return await this.#reply(connection.connectionId, { type: 'devices', devices: listed });
    }
    if (frame.type === 'revoke' && typeof frame.deviceId === 'string') {
      const device = await this.deps.store.getDevice(frame.deviceId);
      if (device?.userId === userId) {
        const live = await this.deps.store.deviceConnections(device.deviceId);
        await this.deps.store.deleteDevice(userId, device.deviceId);
        for (const connectionId of live) {
          await this.deps.store.deleteConnection(connectionId);
          await this.deps.pusher.close(connectionId);
        }
      }
      return await this.#reply(connection.connectionId, {
        type: 'revoked',
        deviceId: frame.deviceId,
      });
    }
    if (frame.type === 'sealed' && typeof frame.deviceId === 'string') {
      const payload = sealedPayload(frame.payload);
      const device = payload ? await this.deps.store.getDevice(frame.deviceId) : undefined;
      if (!payload || device?.userId !== userId) {
        return await this.#reply(connection.connectionId, { type: 'error', code: 'not_found' });
      }
      for (const connectionId of await this.deps.store.deviceConnections(device.deviceId)) {
        await this.#forward(connectionId, { type: 'sealed', payload });
      }
      return;
    }
    await this.#reply(connection.connectionId, { type: 'error', code: 'unsupported_frame' });
  }

  async #fromPhone(
    connection: RemoteConnection,
    frame: Record<string, unknown>,
  ): Promise<void> {
    if (frame.type !== 'sealed') {
      return await this.#reply(connection.connectionId, {
        type: 'error',
        code: 'unsupported_frame',
      });
    }
    const payload = sealedPayload(frame.payload);
    if (!payload)
      return await this.#reply(connection.connectionId, { type: 'error', code: 'too_large' });
    // A revoked device loses its connections, but check the record on every frame anyway.
    const device = await this.deps.store.getDevice(connection.deviceId!);
    if (!device || device.userId !== connection.userId) {
      return await this.#reject(connection.connectionId, 'device_revoked');
    }
    const mac = await this.deps.store.macConnection(device.userId);
    const delivered = mac
      ? await this.#forward(mac, { type: 'sealed', deviceId: device.deviceId, payload })
      : false;
    if (!delivered) await this.#reply(connection.connectionId, { type: 'mac_offline' });
  }

  async #presence(userId: string, deviceId: string): Promise<void> {
    const mac = await this.deps.store.macConnection(userId);
    if (!mac) return;
    const online = (await this.deps.store.deviceConnections(deviceId)).length > 0;
    await this.#forward(mac, { type: 'presence', deviceId, online });
  }

  /** Sends to a peer, dropping its record when API Gateway reports it gone. */
  async #forward(connectionId: string, frame: Record<string, unknown>): Promise<boolean> {
    if (await this.deps.pusher.send(connectionId, frame)) return true;
    await this.#disconnect(connectionId);
    return false;
  }

  async #reply(connectionId: string, frame: Record<string, unknown>): Promise<void> {
    await this.deps.pusher.send(connectionId, frame);
  }

  async #reject(connectionId: string, code: string): Promise<void> {
    await this.deps.pusher.send(connectionId, { type: 'error', code });
    await this.deps.store.deleteConnection(connectionId);
    await this.deps.pusher.close(connectionId);
  }

  #expiry(): number {
    return Math.floor(this.deps.clock.now().getTime() / 1_000) + CONNECTION_TTL_SECONDS;
  }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function parseFrame(body: string | null | undefined): Record<string, unknown> | undefined {
  if (!body || body.length > MAX_SEALED_PAYLOAD + 4_096) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return isRecord(value) && typeof value.type === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Sealed payloads are opaque base64url ciphertext; the relay checks only shape and size. */
function sealedPayload(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SEALED_PAYLOAD &&
    /^[A-Za-z0-9_-]+$/.test(value)
    ? value
    : undefined;
}
