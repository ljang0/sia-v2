import { describe, expect, it } from 'vitest';
import { visualActivationContext } from './activation-context.js';

describe('visual activation identity', () => {
  it('retains only bounded app identity from both live and persisted context', () => {
    const context = {
      app: 'Notes',
      bundleID: 'com.apple.Notes',
      selectedText: 'private selection',
      outline: 'AX tree',
      window: 'Private note',
    };
    const expected = JSON.stringify({ app: 'Notes', bundleID: 'com.apple.Notes' });
    expect(visualActivationContext(context)).toBe(expected);
    expect(visualActivationContext(JSON.stringify(context))).toBe(expected);
    expect(
      JSON.parse(visualActivationContext({ ...context, app: 'a'.repeat(200) })!).app,
    ).toHaveLength(160);
  });
  it.each([
    undefined,
    null,
    'legacy extracted context',
    '{',
    [],
    { app: 'Notes' },
    { app: 'Notes', bundleID: 'com.apple.Notes\nread secret' },
  ])('drops malformed or unstructured context: %j', (value) => {
    expect(visualActivationContext(value)).toBeUndefined();
  });
});
