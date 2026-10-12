import { createPublicKey, verify } from 'node:crypto';

import { z } from 'zod';

const version = z
  .string()
  .min(1)
  .max(64)
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const artifactKey = z
  .string()
  .min(1)
  .max(512)
  .regex(/^releases\/[0-9A-Za-z.-]+\/[a-f0-9]{16}\/Sia-[0-9A-Za-z.-]+-universal\.dmg$/);

const updateManifestPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    channel: z.literal('internal'),
    platform: z.literal('macos'),
    architecture: z.literal('universal'),
    version,
    publishedAt: z.string().datetime({ offset: true }),
    minimumSystemVersion: z.string().regex(/^\d{1,2}\.\d{1,2}$/),
    artifact: z
      .object({
        key: artifactKey,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        bytes: z.number().int().positive().max(2_000_000_000),
      })
      .strict(),
  })
  .strict();

const signedUpdateManifestResponseSchema = z
  .object({
    payload: updateManifestPayloadSchema,
    keyId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
    downloadUrl: z.string().min(1).max(4_096),
  })
  .strict();

export type UpdateManifestPayload = z.infer<typeof updateManifestPayloadSchema>;

export function verifyUpdateManifestResponse(
  value: unknown,
  publicKeyBase64Url: string,
): { payload: UpdateManifestPayload; downloadUrl: string } {
  const parsed = signedUpdateManifestResponseSchema.parse(value);
  verifyCanonicalSignature(
    parsed.payload,
    parsed.signature,
    publicKeyBase64Url,
    'update manifest',
  );
  if (!safeHttpsDownloadUrl(parsed.downloadUrl, parsed.payload.artifact.key)) {
    throw new Error('The update manifest download URL is not safe.');
  }
  const expectedName = `Sia-${parsed.payload.version}-universal.dmg`;
  if (!parsed.payload.artifact.key.endsWith(`/${expectedName}`)) {
    throw new Error('The update manifest artifact does not match its version.');
  }
  return { payload: parsed.payload, downloadUrl: parsed.downloadUrl };
}

/**
 * Verifies an Ed25519 signature over the canonical JSON of `payload`. Shared by every manifest
 * Sia trusts from its release key, so each has the same encoding and key checks.
 */
export function verifyCanonicalSignature(
  payload: unknown,
  signatureBase64Url: string,
  publicKeyBase64Url: string,
  label: string,
): void {
  const publicKeyBytes = decodeBase64Url(publicKeyBase64Url, `${label} public key`);
  if (publicKeyBytes.byteLength !== 44) {
    throw new Error(`The ${label} public key is not an Ed25519 SPKI key.`);
  }
  const signature = decodeBase64Url(signatureBase64Url, `${label} signature`);
  if (signature.byteLength !== 64) {
    throw new Error(`The ${label} signature is invalid.`);
  }
  const publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
  if (!verify(null, Buffer.from(canonicalJson(payload), 'utf8'), publicKey, signature)) {
    throw new Error(`The ${label} signature could not be verified.`);
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function decodeBase64Url(value: string, label: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`The ${label} is invalid.`);
  return Buffer.from(value, 'base64url');
}

function safeHttpsDownloadUrl(value: string, artifactKey: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^[a-z0-9.-]+\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/.test(hostname) &&
      decodeURIComponent(url.pathname.replace(/^\/+/, '')) === artifactKey
    );
  } catch {
    return false;
  }
}
