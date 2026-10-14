import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  newRemoteKey,
  openRemote,
  sealRemote,
  toBase64Url,
} from './remote-seal';

describe('phone relay sealing', () => {
  it('round-trips a message and hides it from the relay', async () => {
    const key = newRemoteKey();
    const message = {
      kind: 'request' as const,
      id: 'req-1',
      method: 'POST' as const,
      route: 'command',
      body: { text: 'Summarize my spending report' },
    };
    const sealed = await sealRemote(key, 'device-1', message);
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain('spending');
    expect(atob(sealed.replaceAll('-', '+').replaceAll('_', '/'))).not.toContain('spending');
    await expect(openRemote(key, 'device-1', sealed)).resolves.toEqual(message);
    // A fresh nonce every time.
    expect(await sealRemote(key, 'device-1', message)).not.toBe(sealed);
  });

  it('rejects another key, another device, and tampered bytes', async () => {
    const key = newRemoteKey();
    const sealed = await sealRemote(key, 'device-1', { kind: 'state', state: { turns: [] } });
    await expect(openRemote(newRemoteKey(), 'device-1', sealed)).rejects.toThrow();
    await expect(openRemote(key, 'device-2', sealed)).rejects.toThrow();
    const bytes = fromBase64Url(sealed);
    bytes[bytes.length - 1]! ^= 1;
    await expect(openRemote(key, 'device-1', toBase64Url(bytes))).rejects.toThrow();
    await expect(openRemote('short', 'device-1', sealed)).rejects.toThrow();
  });

  it('encodes large binary payloads without stack overflow', () => {
    const bytes = new Uint8Array(70_000).map((_, index) => (index * 31) % 256);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });
});
