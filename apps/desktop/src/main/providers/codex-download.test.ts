import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { downloadCodexArchive } from './codex-download.js';

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sia-download-test-'));
  roots.push(root);
  const archive = join(root, 'download.tgz');
  const chunk = Buffer.alloc(1_000_000, 'a');
  const expected = Buffer.concat([chunk, chunk, chunk]);
  const release = {
    url: 'https://registry.npmjs.org/test-fixture.tgz',
    integrity: createHash('sha512').update(expected).digest('base64'),
  };
  const progress = vi.fn();
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const download: typeof fetch = async (_url, options) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          options?.signal?.addEventListener(
            'abort',
            () => controller.error(options.signal?.reason),
            { once: true },
          );
        },
      }),
      { headers: { 'content-length': String(expected.length) } },
    );
  vi.useFakeTimers();
  const pending = downloadCodexArchive(release, archive, download, progress);
  await vi.waitFor(() => expect(stream).toBeDefined());
  return { archive, chunk, expected, progress, pending, stream };
}

it('finishes a progressing download that takes longer than two minutes and reports bytes', async () => {
  const test = await fixture();
  for (let i = 1; i <= 3; i++) {
    await vi.advanceTimersByTimeAsync(90_000);
    test.stream.enqueue(test.chunk);
    await vi.waitFor(() =>
      expect(test.progress).toHaveBeenLastCalledWith(`Downloading Codex… ${i} MB of 3 MB.`),
    );
  }
  test.stream.close();
  await test.pending;
  // Compare bytes natively; recursively diffing three million Buffer entries can exhaust
  // the test's wall-clock budget on the hosted Mac even though the download is complete.
  expect((await readFile(test.archive)).equals(test.expected)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts a stalled connection with an actionable error and clears the deadline', async () => {
  const test = await fixture();
  const result = expect(test.pending).rejects.toThrow('stopped responding');
  await vi.advanceTimersByTimeAsync(120_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds even a continuously progressing download to 45 minutes', async () => {
  const test = await fixture();
  const result = expect(test.pending).rejects.toThrow('took too long');
  for (let i = 1; i < 30; i++) {
    await vi.advanceTimersByTimeAsync(90_000);
    test.stream.enqueue(test.chunk);
    await vi.waitFor(() => expect(test.progress).toHaveBeenCalledTimes(i));
  }
  await vi.advanceTimersByTimeAsync(90_000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
