import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
