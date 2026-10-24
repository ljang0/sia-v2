import { describe, expect, it } from 'vitest';
import { parseConversationTitle } from './conversation-title.js';

describe('conversation title validation', () => {
  it('accepts short summaries and removes decorative formatting', () => {
    expect(parseConversationTitle('{"title":"CMU professor lookup"}')).toBe(
      'CMU professor lookup',
    );
    expect(parseConversationTitle('{"title":"**Weekly Canvas assignment review.**"}')).toBe(
      'Weekly Canvas assignment review',
    );
  });

  it.each([
    'not JSON',
    '{"title":"Too short"}',
    '{"title":"Can you find my CMU professors"}',
    '{"title":"Open https://example.com today"}',
    '{"title":"First line\\nSecond line"}',
    '{"title":123}',
    '{}',
  ])('rejects unusable model output: %s', (response) => {
    expect(parseConversationTitle(response)).toBeUndefined();
  });
});
