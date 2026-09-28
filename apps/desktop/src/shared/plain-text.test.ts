import { describe, expect, it } from 'vitest';
import { plainText } from './plain-text';

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
});
