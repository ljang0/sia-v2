import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { canonicalJson } from '../cloud/update-manifest.js';
import { loadLabHarnessManifest } from './lab-harness.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyText = publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
const hash = 'a'.repeat(64);

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: 'lab_harness_test',
    expiresAt: '2030-01-01T00:00:00.000Z',
    harnesses: [
      {
        id: 'example_lab',
        name: 'Example Lab',
        command: '/opt/example/acp',
        args: ['acp'],
        versionArgs: ['--version'],
        sha256: hash,
        models: [{ id: 'example/spark', label: 'Spark' }],
        disclosure: 'Prompts and tool results go to Example Lab and are kept for 30 days.',
      },
    ],
    ...overrides,
  };
}

function write(value: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'sia-lab-'));
  directories.push(directory);
  const path = join(directory, 'manifest.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function signed<T>(value: T, key = privateKey) {
  return {
    payload: value,
    keyId: 'release-1',
    signature: sign(null, Buffer.from(canonicalJson(value)), key).toString('base64url'),
  };
}

const now = new Date('2026-10-05T00:00:00.000Z');

describe('lab harness testing manifest', () => {
  it('loads harnesses signed by the release key whose command matches its hash', async () => {
    const harnesses = await loadLabHarnessManifest({
      path: write(signed(payload())),
      publicKey: publicKeyText,
      now,
      hashFile: async () => hash,
    });
    expect(harnesses).toMatchObject([
      { id: 'example_lab', command: '/opt/example/acp', models: [{ id: 'example/spark' }] },
    ]);
  });

  it('refuses another key, an edited payload, an expired manifest, or a changed binary', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const load = (value: unknown, hashFile = async () => hash) =>
      loadLabHarnessManifest({ path: write(value), publicKey: publicKeyText, now, hashFile });

    await expect(load(signed(payload(), other))).rejects.toThrow('could not be verified');
    const edited = signed(payload());
    edited.payload.harnesses[0]!.command = '/tmp/other';
    await expect(load(edited)).rejects.toThrow('could not be verified');
    await expect(
      load(signed(payload({ expiresAt: '2026-01-01T00:00:00.000Z' }))),
    ).rejects.toThrow('expired');
    await expect(load(signed(payload()), async () => 'b'.repeat(64))).rejects.toThrow(
      'does not match its signed hash',
    );
  });

  it('never lets a lab harness reuse a built-in id or load without a release key', async () => {
    const reused = payload();
    reused.harnesses[0]!.id = 'codex_app_server';
    await expect(
      loadLabHarnessManifest({
        path: write(signed(reused)),
        publicKey: publicKeyText,
        now,
        hashFile: async () => hash,
      }),
    ).rejects.toThrow();
    await expect(
      loadLabHarnessManifest({ path: write(signed(payload())), publicKey: undefined, now }),
    ).rejects.toThrow('no release key');
  });
});
