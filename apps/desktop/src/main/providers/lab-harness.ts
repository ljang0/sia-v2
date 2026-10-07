import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { BUILTIN_HARNESS_IDS, harnessIdSchema } from '@sia/protocol';
import { z } from 'zod';

import { verifyCanonicalSignature } from '../cloud/update-manifest.js';

/**
 * Lab harness testing builds. A model lab that wants to test its own model and harness in Sia
 * hands the release owner an ACP-speaking command; the owner signs a manifest with Sia's release
 * key that pins that exact binary. Starting Sia with `SIA_LAB_HARNESS_MANIFEST=<path>` then adds
 * those harnesses next to Codex, which stays the default. Without a valid signature from the
 * pinned key, an unexpired manifest, and a matching binary hash, nothing is registered.
 */
export const LAB_HARNESS_MANIFEST_ENV = 'SIA_LAB_HARNESS_MANIFEST';

const labHarnessSchema = z
  .object({
    id: harnessIdSchema.refine(
      (id) => !(BUILTIN_HARNESS_IDS as readonly string[]).includes(id),
      'Lab harness ids must not reuse a built-in harness id',
    ),
    name: z.string().trim().min(1).max(80),
    /** Absolute path to the lab's ACP stdio command on the tester's Mac. */
    command: z.string().min(1).max(1024).refine(isAbsolute, 'The command must be absolute'),
    args: z.array(z.string().max(256)).max(16).default([]),
    versionArgs: z.array(z.string().max(64)).max(4).default(['--version']),
    /** SHA-256 of the command file; a different binary is never started. */
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    models: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(256),
            label: z.string().trim().min(1).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    /** What leaves the Mac and who retains it, shown in Settings next to the harness. */
    disclosure: z.string().trim().min(1).max(600),
  })
  .strict();

const labHarnessPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('lab_harness_test'),
    expiresAt: z.string().datetime({ offset: true }),
    harnesses: z.array(labHarnessSchema).min(1).max(4),
  })
  .strict();

const signedLabHarnessManifestSchema = z
  .object({
    // Preserve exactly what was signed; defaults and trimmed text change canonical JSON.
    payload: z.unknown(),
    keyId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
  .strict();

export type LabHarness = z.infer<typeof labHarnessSchema>;

export async function loadLabHarnessManifest(input: {
  readonly path: string;
  readonly publicKey: string | undefined;
  readonly now?: Date;
  readonly hashFile?: (path: string) => Promise<string>;
}): Promise<readonly LabHarness[]> {
  if (!input.publicKey)
    throw new Error(
      'This build has no release key, so it cannot verify a lab harness manifest.',
    );
  const parsed = signedLabHarnessManifestSchema.parse(
    JSON.parse(await readFile(input.path, 'utf8')),
  );
  verifyCanonicalSignature(
    parsed.payload,
    parsed.signature,
    input.publicKey,
    'lab harness manifest',
  );
  const payload = labHarnessPayloadSchema.parse(parsed.payload);
  if (Date.parse(payload.expiresAt) <= (input.now ?? new Date()).getTime())
    throw new Error('The lab harness manifest has expired.');
  const ids = new Set<string>();
  const models = new Set<string>();
  for (const harness of payload.harnesses) {
    if (ids.has(harness.id)) throw new Error(`Lab harness ${harness.id} is listed twice.`);
    ids.add(harness.id);
    for (const { id } of harness.models) {
      if (models.has(id)) throw new Error(`Lab model ${id} is listed twice.`);
      models.add(id);
    }
    const actual = await (input.hashFile ?? sha256File)(harness.command);
    if (actual !== harness.sha256)
      throw new Error(`The ${harness.name} command does not match its signed hash.`);
  }
  return payload.harnesses;
}

async function sha256File(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error('A lab harness command must be a file.');
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}
