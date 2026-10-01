import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Same per-file limit as chosen or dropped attachments. */
export const PASTED_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/** Pasted files outlive their one-hour grant so queued and retried turns can still read them. */
const PASTED_ATTACHMENT_RETENTION_MS = 7 * 24 * 60 * 60_000;

interface PastedType {
  readonly extension: string;
  readonly label: string;
  matches(bytes: Uint8Array): boolean;
}

const startsWith = (bytes: Uint8Array, ...signature: number[]) =>
  signature.every((value, index) => bytes[index] === value);
const ascii = (bytes: Uint8Array, offset: number, text: string) =>
  [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
const isText = (bytes: Uint8Array) => {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

/** Clipboard types Sia accepts. Each file must also look like what its type claims. */
const PASTED_TYPES: Readonly<Record<string, PastedType>> = {
  'image/png': {
    extension: '.png',
    label: 'Pasted image',
    matches: (bytes) => startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  },
  'image/jpeg': {
    extension: '.jpg',
    label: 'Pasted image',
    matches: (bytes) => startsWith(bytes, 0xff, 0xd8, 0xff),
  },
  'image/gif': {
    extension: '.gif',
    label: 'Pasted image',
    matches: (bytes) => ascii(bytes, 0, 'GIF8'),
  },
  'image/webp': {
    extension: '.webp',
    label: 'Pasted image',
    matches: (bytes) => ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP'),
  },
  'image/tiff': {
    extension: '.tiff',
    label: 'Pasted image',
    matches: (bytes) =>
      startsWith(bytes, 0x49, 0x49, 0x2a, 0x00) || startsWith(bytes, 0x4d, 0x4d, 0x00, 0x2a),
  },
  'application/pdf': {
    extension: '.pdf',
    label: 'Pasted document',
    matches: (bytes) => ascii(bytes, 0, '%PDF-'),
  },
  'text/plain': { extension: '.txt', label: 'Pasted text', matches: isText },
  'text/markdown': { extension: '.md', label: 'Pasted text', matches: isText },
  'text/csv': { extension: '.csv', label: 'Pasted table', matches: isText },
  'application/json': { extension: '.json', label: 'Pasted text', matches: isText },
};

export interface PastedAttachmentInput {
  readonly name?: string | undefined;
  readonly mimeType: string;
  readonly data: Uint8Array;
}

/**
 * Saves clipboard bytes as a private file under Sia's attachment area and returns its path.
 * Only images, PDFs and plain text are accepted, and the bytes must match the claimed type.
 */
export async function savePastedAttachment(
  root: string,
  input: PastedAttachmentInput,
  now = Date.now(),
): Promise<string> {
  const type = PASTED_TYPES[input.mimeType.toLocaleLowerCase()];
  if (!type) throw new Error('Sia can attach pasted images, PDFs and text.');
  if (!input.data.byteLength) throw new Error('The pasted item was empty.');
  if (input.data.byteLength > PASTED_ATTACHMENT_MAX_BYTES) {
    throw new Error('The pasted item is larger than the 25 MB attachment limit.');
  }
  if (!type.matches(input.data)) throw new Error('The pasted item could not be read.');
  await mkdir(root, { recursive: true, mode: 0o700 });
  await prunePastedAttachments(root, now);
  const directory = join(root, randomUUID());
  await mkdir(directory, { mode: 0o700 });
  const path = join(directory, pastedFileName(input.name, type));
  await writeFile(path, input.data, { mode: 0o600, flag: 'wx' });
  return path;
}

/** A plain, safe file name that keeps the person's name when the clipboard had one. */
function pastedFileName(name: string | undefined, type: PastedType): string {
  const base = (name ?? '')
    .split(/[\\/]/)
    .at(-1)!
    .replace(/\.[^.]*$/, '')
    // Control characters, colons and leading dots never reach the file system.
    .replace(/[:\u0000-\u001f\u007f]+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 80);
  // Browsers name every clipboard image "image.png"; say what it is instead.
  const plain = !base || /^image$/i.test(base) ? type.label : base;
  return `${plain}${type.extension}`;
}

async function prunePastedAttachments(root: string, now: number): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(root, entry.name);
        const info = await stat(path).catch(() => undefined);
        if (info && now - info.mtimeMs > PASTED_ATTACHMENT_RETENTION_MS) {
          await rm(path, { recursive: true, force: true }).catch(() => undefined);
        }
      }),
  );
}
