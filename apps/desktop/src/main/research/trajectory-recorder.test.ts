import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TrajectoryRecorder } from './trajectory-recorder.js';

describe('TrajectoryRecorder', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('writes one JSONL row per event and stores images beside the log', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-08-19T10:00:00.000Z'),
    });
    recorder.record({ type: 'user_message', threadId: 'thread/1', turnId: 't1', text: 'hi' });
    recorder.record(
      { type: 'action_result', threadId: 'thread/1', turnId: 't1', name: 'computer_snapshot' },
      [{ mimeType: 'image/png', dataBase64: Buffer.from('png-bytes').toString('base64') }],
    );
    const directory = join(root, 'thread_1');
    const rows = readFileSync(join(directory, 'events.jsonl'), 'utf8').trim().split('\n');
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[0]!)).toMatchObject({ type: 'user_message', text: 'hi' });
    const second = JSON.parse(rows[1]!);
    expect(second.images).toHaveLength(1);
    expect(readdirSync(directory)).toContain(second.images[0].file);
    expect(readFileSync(join(directory, second.images[0].file), 'utf8')).toBe('png-bytes');
  });

  it('removes and suppresses a turn excluded by the connector data policy', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-policy-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-08-23T00:00:00.000Z'),
    });
    recorder.record({
      type: 'user_message',
      threadId: 'thread-1',
      turnId: 'keep',
      text: 'keep',
    });
    recorder.record(
      {
        type: 'action_result',
        threadId: 'thread-1',
        turnId: 'exclude',
        data: 'Google Workspace fixture',
      },
      [{ mimeType: 'image/png', dataBase64: Buffer.from('remove-image').toString('base64') }],
    );
    const directory = join(root, 'thread-1');
    const image = readdirSync(directory).find((file) => file.endsWith('.png'));
    expect(image).toBeDefined();

    recorder.excludeTurn('thread-1', 'exclude');
    recorder.record({
      type: 'turn_finished',
      threadId: 'thread-1',
      turnId: 'exclude',
      text: 'must stay excluded',
    });

    const log = readFileSync(join(directory, 'events.jsonl'), 'utf8');
    expect(log).toContain('"turnId":"keep"');
    expect(log).not.toContain('"turnId":"exclude"');
    expect(log).not.toContain('Google Workspace fixture');
    expect(image && existsSync(join(directory, image))).toBe(false);
  });

  it('excludes a credential-bearing rejected action and its earlier turn evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-credential-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({ rootDirectory: root, enabled: () => true });
    recorder.record({ type: 'user_message', threadId: 'thread', turnId: 'keep', text: 'keep' });
    recorder.record({ type: 'action_result', threadId: 'thread', turnId: 'exclude' }, [
      { mimeType: 'image/png', dataBase64: Buffer.from('earlier-image').toString('base64') },
    ]);
    recorder.record({
      type: 'action_result',
      threadId: 'thread',
      turnId: 'exclude',
      name: 'memory_learn',
      outcome: 'refused',
      arguments: { text: 'password: fictional-fixture-only' },
    });
    recorder.record({ type: 'turn_finished', threadId: 'thread', turnId: 'exclude' });

    const directory = join(root, 'thread');
    expect(readdirSync(directory)).toEqual(['events.jsonl']);
    const log = readFileSync(join(directory, 'events.jsonl'), 'utf8');
    expect(log).toContain('"turnId":"keep"');
    expect(log).not.toContain('"turnId":"exclude"');
    expect(log).not.toContain('fictional-fixture-only');
  });

  it('omits a private-link event without a turn id together with its images', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-private-link-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({ rootDirectory: root, enabled: () => true });
    recorder.record({ type: 'notice', threadId: 'thread', text: 'ordinary event' });
    recorder.record(
      {
        type: 'notice',
        threadId: 'thread',
        data: { nested: { url: 'https://example.test/report?signature=fictional-fixture' } },
      },
      [{ mimeType: 'image/png', dataBase64: Buffer.from('do-not-save').toString('base64') }],
    );

    const directory = join(root, 'thread');
    expect(readdirSync(directory)).toEqual(['events.jsonl']);
    const log = readFileSync(join(directory, 'events.jsonl'), 'utf8');
    expect(log).toContain('ordinary event');
    expect(log).not.toContain('fictional-fixture');
  });

  it('retains ordinary public documentation without treating every password mention as a secret', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-public-text-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({ rootDirectory: root, enabled: () => true });
    recorder.record({
      type: 'notice',
      threadId: 'thread',
      turnId: 'turn',
      text: 'Read public password-reset guidance; never enter credentials.',
      data: { url: 'https://example.test/help?topic=reset' },
    });

    const log = readFileSync(join(root, 'thread', 'events.jsonl'), 'utf8');
    expect(log).toContain('password-reset guidance');
    expect(log).toContain('topic=reset');
  });

  it('is a no-op while disabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-off-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({ rootDirectory: root, enabled: () => false });
    recorder.record({ type: 'user_message', threadId: 'a', text: 'x' });
    expect(readdirSync(root)).toEqual([]);
  });

  it('removes complete thread logs after the retention window without touching fresh logs', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-retention-'));
    roots.push(root);
    const expired = join(root, 'expired');
    const current = join(root, 'current');
    mkdirSync(expired);
    mkdirSync(current);
    writeFileSync(join(expired, 'events.jsonl'), '{"old":true}\n');
    writeFileSync(join(current, 'events.jsonl'), '{"current":true}\n');
    const old = new Date('2026-01-01T00:00:00.000Z');
    const recent = new Date('2026-04-30T00:00:00.000Z');
    utimesSync(join(expired, 'events.jsonl'), old, old);
    utimesSync(join(current, 'events.jsonl'), recent, recent);

    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      maxAgeMs: 90 * 24 * 60 * 60 * 1_000,
      maintenanceIntervalMs: 0,
    });
    recorder.record({ type: 'user_message', threadId: 'new', text: 'retained' });

    expect(existsSync(expired)).toBe(false);
    expect(existsSync(current)).toBe(true);
    expect(existsSync(join(root, 'new', 'events.jsonl'))).toBe(true);
  });

  it('evicts the oldest complete thread directories before exceeding the byte budget', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-budget-'));
    roots.push(root);
    const oldest = join(root, 'oldest');
    const newer = join(root, 'newer');
    mkdirSync(oldest);
    mkdirSync(newer);
    writeFileSync(join(oldest, 'events.jsonl'), 'a'.repeat(220));
    writeFileSync(join(newer, 'events.jsonl'), 'b'.repeat(220));
    const first = new Date('2026-04-29T00:00:00.000Z');
    const second = new Date('2026-04-30T00:00:00.000Z');
    utimesSync(join(oldest, 'events.jsonl'), first, first);
    utimesSync(join(newer, 'events.jsonl'), second, second);

    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      maxBytes: 520,
      maintenanceIntervalMs: 0,
    });
    recorder.record({ type: 'user_message', threadId: 'new', text: 'within budget' });

    expect(existsSync(oldest)).toBe(false);
    expect(existsSync(newer)).toBe(true);
    expect(existsSync(join(root, 'new', 'events.jsonl'))).toBe(true);
  });

  it('keeps the thread receiving the new event while evicting other old threads', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-active-'));
    roots.push(root);
    const active = join(root, 'active');
    const other = join(root, 'other');
    mkdirSync(active);
    mkdirSync(other);
    writeFileSync(join(active, 'events.jsonl'), 'active history\n');
    writeFileSync(join(other, 'events.jsonl'), 'other history'.repeat(20));
    const old = new Date('2026-01-01T00:00:00.000Z');
    utimesSync(join(active, 'events.jsonl'), old, old);
    utimesSync(join(other, 'events.jsonl'), old, old);

    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      maxBytes: 180,
      maintenanceIntervalMs: 0,
    });
    recorder.record({ type: 'user_message', threadId: 'active', text: 'new event' });

    expect(readFileSync(join(active, 'events.jsonl'), 'utf8')).toContain('active history');
    expect(readFileSync(join(active, 'events.jsonl'), 'utf8')).toContain('new event');
    expect(existsSync(other)).toBe(false);
  });

  it('bounds a long active conversation without deleting its earlier evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-active-budget-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      maxBytes: 512,
    });
    recorder.record({ type: 'user_message', threadId: 'active', text: 'keep this request' });
    const path = join(root, 'active', 'events.jsonl');
    const first = readFileSync(path, 'utf8');
    for (let index = 0; index < 20; index++) {
      recorder.record({
        type: 'action_result',
        threadId: 'active',
        text: 'fixture'.repeat(12),
      });
    }

    const retained = readFileSync(path, 'utf8');
    expect(Buffer.byteLength(retained)).toBeLessThanOrEqual(512);
    expect(retained.startsWith(first)).toBe(true);
    expect(
      retained
        .trim()
        .split('\n')
        .every((line) => JSON.parse(line)),
    ).toBe(true);
  });

  it('rejects an oversized image event without orphaning images or evicting other evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-oversized-'));
    roots.push(root);
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      maxBytes: 512,
    });
    recorder.record({ type: 'user_message', threadId: 'other', text: 'keep' });
    const previous = readFileSync(join(root, 'other', 'events.jsonl'), 'utf8');
    recorder.record({ type: 'action_result', threadId: 'active' }, [
      { mimeType: 'image/png', dataBase64: Buffer.alloc(1024).toString('base64') },
    ]);

    expect(readFileSync(join(root, 'other', 'events.jsonl'), 'utf8')).toBe(previous);
    expect(existsSync(join(root, 'active'))).toBe(false);
    recorder.record({ type: 'user_message', threadId: 'active', text: 'small event' });
    expect(readdirSync(join(root, 'active'))).toEqual(['events.jsonl']);
  });

  it('does not grow an already oversized legacy active log', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-legacy-budget-'));
    roots.push(root);
    mkdirSync(join(root, 'active'));
    const path = join(root, 'active', 'events.jsonl');
    const original = 'legacy evidence'.repeat(100);
    writeFileSync(path, original);
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      maxBytes: 512,
    });

    expect(() => recorder.record({ type: 'notice', threadId: 'active' })).not.toThrow();
    expect(readFileSync(path, 'utf8')).toBe(original);
  });

  it('recounts partial image writes before admitting another event', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-partial-write-'));
    roots.push(root);
    const active = join(root, 'active');
    mkdirSync(join(active, 'events.jsonl'), { recursive: true });
    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      maxBytes: 512,
    });
    const image = { mimeType: 'image/png', dataBase64: Buffer.alloc(200).toString('base64') };
    // The image succeeds but appending the row fails: an interrupted write must
    // not leave the cached size smaller than the actual on-disk evidence.
    expect(() =>
      recorder.record({ type: 'action_result', threadId: 'active' }, [image]),
    ).not.toThrow();
    rmSync(join(active, 'events.jsonl'), { recursive: true });
    recorder.record({ type: 'action_result', threadId: 'active' }, [image]);

    const bytes = readdirSync(active).reduce(
      (total, name) => total + statSync(join(active, name)).size,
      0,
    );
    expect(bytes).toBeLessThanOrEqual(512);
    recorder.record({ type: 'notice', threadId: 'active' });
    expect(readFileSync(join(active, 'events.jsonl'), 'utf8')).toContain('notice');
  });

  it('does not follow symbolic links while pruning app-owned trajectory directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-trajectory-link-'));
    roots.push(root);
    const outside = mkdtempSync(join(tmpdir(), 'sia-trajectory-outside-'));
    roots.push(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    symlinkSync(outside, join(root, 'linked'));

    const recorder = new TrajectoryRecorder({
      rootDirectory: root,
      enabled: () => true,
      now: () => new Date('2026-05-01T00:00:00.000Z'),
      maxBytes: 1,
      maintenanceIntervalMs: 0,
    });
    recorder.record({ type: 'user_message', threadId: 'new', text: 'best effort' });

    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
