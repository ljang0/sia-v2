import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PASTED_ATTACHMENT_MAX_BYTES, savePastedAttachment } from './pasted-attachments.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('pasted attachments', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sia-paste-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves a screenshot and long text as private files with plain names', async () => {
    const image = await savePastedAttachment(root, {
      name: 'image.png',
      mimeType: 'image/png',
      data: PNG,
    });
    expect(basename(image)).toBe('Pasted image.png');
    expect(dirname(dirname(image))).toBe(root);
    expect(new Uint8Array(await readFile(image))).toEqual(PNG);
    expect((await stat(image)).mode & 0o777).toBe(0o600);

    const text = await savePastedAttachment(root, {
      name: '../../etc/Meeting notes.txt',
      mimeType: 'text/plain',
      data: new TextEncoder().encode('Agenda'),
    });
    expect(basename(text)).toBe('Meeting notes.txt');
    expect(dirname(dirname(text))).toBe(root);
  });

  it('refuses types it does not handle, mismatched bytes, empty and oversized items', async () => {
    await expect(
      savePastedAttachment(root, { mimeType: 'application/x-sh', data: PNG }),
    ).rejects.toThrow('images, PDFs and text');
    await expect(
      savePastedAttachment(root, { mimeType: 'image/jpeg', data: PNG }),
    ).rejects.toThrow('could not be read');
    await expect(
      savePastedAttachment(root, { mimeType: 'text/plain', data: new Uint8Array([0x61, 0]) }),
    ).rejects.toThrow('could not be read');
    await expect(
      savePastedAttachment(root, { mimeType: 'image/png', data: new Uint8Array() }),
    ).rejects.toThrow('empty');
    const big = new Uint8Array(PASTED_ATTACHMENT_MAX_BYTES + 1);
    big.set(PNG);
    await expect(
      savePastedAttachment(root, { mimeType: 'image/png', data: big }),
    ).rejects.toThrow('25 MB');
    expect(await readdir(root)).toEqual([]);
  });

  it('removes pasted files older than a week', async () => {
    const old = join(root, 'old');
    await mkdir(old);
    const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60_000);
    await utimes(old, weekAgo, weekAgo);
    await savePastedAttachment(root, { mimeType: 'image/png', data: PNG });
    expect(await readdir(root)).not.toContain('old');
  });
});
