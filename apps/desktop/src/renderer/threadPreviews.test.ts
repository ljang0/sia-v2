import { expect, it } from 'vitest';
import type { TimelineItemView } from '../shared/bridge';
import { threadPreviews } from './threadPreviews';
const item = (
  sequence: number,
  overrides: Partial<TimelineItemView> = {},
): TimelineItemView => ({
  id: String(sequence),
  threadId: 'task',
  sequence,
  timestamp: '',
  kind: 'assistant',
  text: 'A reply',
  ...overrides,
});
it('summarizes the latest turn without confusing late results or unrelated tasks', () => {
  const previews = threadPreviews([
    item(1, { kind: 'user', turnId: 'old', text: 'Old question' }),
    item(5, { turnId: 'old', text: 'Late old result' }),
    item(3, { kind: 'user', turnId: 'new', text: 'New question' }),
    item(4, { turnId: 'new', text: '  Current\n result  ' }),
    item(6, { threadId: 'another', text: 'Separate result' }),
  ]);
  expect(previews.get('task')).toEqual({ label: 'Latest reply', text: 'Current result' });
  expect(previews.get('another')?.text).toBe('Separate result');
});
it('bounds replies and uses friendly activity labels without exposing tool payloads', () => {
  expect(
    threadPreviews([item(1, { text: 'a'.repeat(500) })]).get('task')!.text.length,
  ).toBeLessThanOrEqual(420);
  const previews = threadPreviews([
    item(2, {
      kind: 'activity',
      toolName: 'mail_search',
      text: 'raw body',
      detail: 'raw payload',
    }),
  ]);
  expect(previews.get('task')).toEqual({
    label: 'Latest activity',
    text: 'Searching your mail',
  });
});
