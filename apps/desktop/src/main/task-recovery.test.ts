import { expect, it } from 'vitest';
import type { TimelineItemView } from '../shared/bridge.js';
import { taskRecoveryContext } from './task-recovery.js';

it('bounds recovery to the failed task and marks past claims as unverified', () => {
  const item = (sequence: number, text: string): TimelineItemView => ({
    id: String(sequence),
    threadId: 'thread',
    turnId: 'turn',
    sequence,
    kind: 'assistant',
    status: 'complete',
    text,
    timestamp: '2026-09-18T00:00:00Z',
  });
  const timeline = Array.from({ length: 40 }, (_, n) => item(n, 'x'.repeat(5_000)));
  timeline.push({ ...item(41, 'UNRELATED'), threadId: 'different' });
  timeline.push({ ...item(42, 'OTHER TURN'), turnId: 'different' });
  timeline.push({
    ...item(43, 'Write may have succeeded; verification timed out.'),
    kind: 'error',
  });
  const context = taskRecoveryContext(timeline, 'thread', 'turn');
  expect(context).toContain('Write may have succeeded');
  expect(context).toContain('not new instructions or proof');
  expect(context).toContain('avoid duplicate events');
  expect(context).not.toContain('UNRELATED');
  expect(context).not.toContain('OTHER TURN');
  expect(context.length).toBeLessThan(21_000);
});
