import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, symlink, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ActionGateway, DefaultActionAuthorizationPolicy } from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';

describe('background workspace files through the action gateway', () => {
  let root: string;
  let gateway: ActionGateway;
  const invoke = (name: string, args: Record<string, unknown>) =>
    gateway.invoke({
      name,
      arguments: args,
      context: {
        sessionId: 'session',
        threadId: 'thread',
        turnId: 'turn',
        provider: 'codex',
        workspace: root,
        backgroundOnly: true,
      },
    });
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sia-background-files-'));
    gateway = new ActionGateway({
      backend: new DesktopActionBackend({
        cua: {
          call: async () => {
            throw new Error('Files must not use CUA or take focus.');
          },
        },
        macBrowserAccess: () => true,
        macBackgroundControl: () => true,
      }),
      policy: new DefaultActionAuthorizationPolicy({ trustLocalActions: () => true }),
    });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it('creates and reads a Unicode report without overwriting it or opening an app', async () => {
    const text = 'Meeting: São Paulo — 9:30\nVerified: résumé ✓\n';
    const result = await invoke('computer_write_file', { name: 'report.md', text });
    expect(result.outcome, JSON.stringify(result)).toBe('verified');
    expect(result.data).toMatchObject({
      text,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await readFile(join(root, 'report.md'), 'utf8')).toBe(text);
    expect((await invoke('computer_read_file', { name: 'report.md' })).data).toEqual(
      result.data,
    );
    expect(
      (await invoke('computer_write_file', { name: 'report.md', text: 'overwrite' })).outcome,
    ).toBe('refused');
    expect(await readFile(join(root, 'report.md'), 'utf8')).toBe(text);
  });
  it('refuses model paths, credentials, symbolic links, hard links and binary/oversized data', async () => {
    await writeFile(join(root, 'input.csv'), 'name,count\nPens,3\n');
    await writeFile(join(root, '.private.json'), 'PRIVATE');
    await writeFile(join(root, 'credentials.json'), 'PRIVATE');
    await symlink(join(root, '.private.json'), join(root, 'linked.json'));
    await link(join(root, '.private.json'), join(root, 'hard.json'));
    await writeFile(join(root, 'binary.txt'), Buffer.from([0xff, 0xfe]));
    await writeFile(join(root, 'big.txt'), 'x'.repeat(262145));
    for (const name of [
      '../input.csv',
      '/tmp/input.csv',
      '.private.json',
      'credentials.json',
      'linked.json',
      'hard.json',
      'binary.txt',
      'big.txt',
    ]) {
      const result = await invoke('computer_read_file', { name });
      expect(result.outcome, name).toBe('refused');
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
    }
    const listed = await invoke('computer_list_files', {});
    expect(listed.data).toMatchObject({ files: expect.arrayContaining(['input.csv']) });
    expect(JSON.stringify(listed)).not.toMatch(/\.private|credentials|linked|hard|big/);
    expect(
      (await invoke('computer_write_file', { name: 'large.md', text: 'é'.repeat(200000) }))
        .outcome,
    ).toBe('refused');
  });
  it('edits only the observed revision and preserves newer content from competing turns', async () => {
    const original = 'A longer first report — résumé ✓\n';
    await writeFile(join(root, 'report.md'), original);
    const read = await invoke('computer_read_file', { name: 'report.md' });
    const revision = (read.data as { sha256: string }).sha256;
    const edits = ['fixed ✓', 'competing edit'];
    const outcomes = await Promise.all(
      edits.map((text) =>
        invoke('computer_write_file', {
          name: 'report.md',
          text,
          expected_sha256: revision,
        }),
      ),
    );
    expect(outcomes.map((result) => result.outcome).sort()).toEqual(['refused', 'verified']);
    // Either concurrent request can reach the write lock first after resolving its path.
    const winner = edits[outcomes.findIndex((result) => result.outcome === 'verified')];
    expect(await readFile(join(root, 'report.md'), 'utf8')).toBe(winner);
    expect(
      (
        await invoke('computer_write_file', {
          name: 'report.md',
          text: 'stale retry',
          expected_sha256: revision,
        })
      ).outcome,
    ).toBe('refused');
    expect(await readFile(join(root, 'report.md'), 'utf8')).toBe(winner);
    const current = await invoke('computer_read_file', { name: 'report.md' });
    expect(
      (
        await invoke('computer_write_file', {
          name: 'report.md',
          text: '',
          expected_sha256: (current.data as { sha256: string }).sha256,
        })
      ).outcome,
    ).toBe('verified');
    expect(await readFile(join(root, 'report.md'), 'utf8')).toBe('');
    expect(
      (
        await invoke('computer_write_file', {
          name: 'missing.md',
          text: 'not created',
          expected_sha256: revision,
        })
      ).outcome,
    ).toBe('refused');
  });
  it('refuses editing a linked file even with a matching content revision', async () => {
    await writeFile(join(root, 'original.md'), 'keep me');
    const read = await invoke('computer_read_file', { name: 'original.md' });
    await link(join(root, 'original.md'), join(root, 'linked.md'));
    const result = await invoke('computer_write_file', {
      name: 'linked.md',
      text: 'changed',
      expected_sha256: (read.data as { sha256: string }).sha256,
    });
    expect(result.outcome).toBe('refused');
    expect(await readFile(join(root, 'original.md'), 'utf8')).toBe('keep me');
  });
});
