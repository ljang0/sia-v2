import { describe, expect, it } from 'vitest';
import { clipText, conversationTitle, plainText } from './plain-text';

describe('plainText', () => {
  it('removes emphasis, code, links, and list markers', () => {
    expect(plainText('The answer is **42**.')).toBe('The answer is 42.');
    expect(
      plainText('# Report\n\n- Read `notes.md`\n- See [the doc](https://example.com)'),
    ).toBe('Report Read notes.md See the doc');
    expect(plainText('An _important_ and *quiet* ~~old~~ note')).toBe(
      'An important and quiet old note',
    );
  });

  it('keeps ordinary punctuation and identifiers', () => {
    expect(plainText('Use snake_case_names and 2 * 3 = 6')).toBe(
      'Use snake_case_names and 2 * 3 = 6',
    );
    expect(plainText('Before\n\n```js\nconsole.log(1)\n```\nafter')).toBe('Before after');
  });

  it('clips without splitting emoji or words', () => {
    expect(clipText('short', 10)).toBe('short');
    const clipped = clipText(`Check my calendar ${'📅'.repeat(30)}`, 40);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(clipText('Please look at the internationalization requirements', 40)).toBe(
      'Please look at the internationalization…',
    );
  });

  it('builds readable conversation titles', () => {
    expect(
      conversationTitle('## Summarize **this** doc: https://docs.google.com/d/1Ab/edit'),
    ).toBe('Summarize this doc: docs.google.com');
    expect(conversationTitle('```\nconst x = 1\n```')).toBe('');
  });

  it('keeps a whole short request and ends a long one with an ellipsis', () => {
    expect(conversationTitle('Summarize the next three steps for the alpha review.')).toBe(
      'Summarize the next three steps for the alpha review.',
    );
    const long = conversationTitle(
      'Plan a weekend in Pittsburgh with a museum, a long walk by the rivers, and a quiet dinner somewhere nearby',
    );
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long).toMatch(/^Plan a weekend in Pittsburgh with a museum/);
  });
});
