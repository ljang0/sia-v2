import { describe, expect, it } from 'vitest';
import { isTextSize, isTheme, stepTextSize, TEXT_SCALE, TEXT_SIZES } from './display.js';

describe('display preferences', () => {
  it('steps text size one notch at a time and stops at the ends', () => {
    expect(stepTextSize(undefined, 1)).toBe('large');
    expect(stepTextSize('large', 1)).toBe('larger');
    expect(stepTextSize('larger', 1)).toBe('larger');
    expect(stepTextSize('default', -1)).toBe('small');
    expect(stepTextSize('small', -1)).toBe('small');
    expect(stepTextSize('larger', 0)).toBe('default');
  });

  it('recognizes only the listed choices', () => {
    expect(['system', 'light', 'dark'].every(isTheme)).toBe(true);
    expect([undefined, 'auto', 'Dark', 1].some(isTheme)).toBe(false);
    expect(TEXT_SIZES.every(isTextSize)).toBe(true);
    expect(['medium', 'toString', 1.2].some(isTextSize)).toBe(false);
  });

  it('grows monotonically around Default', () => {
    const scales = TEXT_SIZES.map((size) => TEXT_SCALE[size]);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(TEXT_SCALE.default).toBe(1);
  });
});
