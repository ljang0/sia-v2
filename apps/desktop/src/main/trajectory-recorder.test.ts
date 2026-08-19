import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
});
