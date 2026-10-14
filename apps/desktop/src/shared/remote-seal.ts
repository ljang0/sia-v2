/**
 * End-to-end sealing for the phone cloud relay (docs/phone-cloud-relay.md). The Mac and the
 * phone share a random 256-bit AES-GCM key from the pairing QR code's URL fragment; the relay
 * only ever carries the sealed result. Uses WebCrypto, so the same code runs in Sia's main
 * process (Node) and on the phone page (browser).
 */

const NONCE_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Plaintext carried inside a sealed relay frame. */
export type SealedMessage =
  | {
      kind: 'request';
      id: string;
      method: 'GET' | 'POST';
      route: string;
      query?: Record<string, string>;
      body?: unknown;
    }
  | {
      kind: 'reply';
      id: string;
      status: number;
      json?: unknown;
      /** Small files only; base64 of the bytes. */
      file?: { name: string; data: string };
    }
  | { kind: 'state'; state: unknown };

export function newRemoteKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sealRemote(
  key: string,
  deviceId: string,
  message: SealedMessage,
): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(deviceId) },
      await importKey(key),
      encoder.encode(JSON.stringify(message)),
    ),
  );
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return toBase64Url(out);
}

/** Opens a sealed payload; throws when the key, device id, or bytes do not match. */
export async function openRemote(
  key: string,
  deviceId: string,
  payload: string,
): Promise<SealedMessage> {
  const bytes = fromBase64Url(payload);
  if (bytes.length <= NONCE_BYTES) throw new Error('Sealed payload is too short');
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.subarray(0, NONCE_BYTES),
      additionalData: encoder.encode(deviceId),
    },
    await importKey(key),
    bytes.subarray(NONCE_BYTES),
  );
  const value: unknown = JSON.parse(decoder.decode(plain));
  if (
    typeof value !== 'object' ||
    value === null ||
    !['request', 'reply', 'state'].includes(String((value as { kind?: unknown }).kind))
  ) {
    throw new Error('Sealed payload is not a relay message');
  }
  return value as SealedMessage;
}

async function importKey(key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(key);
  if (raw.length !== 32) throw new Error('Remote key must be 256 bits');
  return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid base64url');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
