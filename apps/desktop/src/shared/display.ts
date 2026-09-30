/**
 * Theme and text size, chosen in Settings → Appearance. Main applies the theme to every window
 * (nativeTheme.themeSource) and the renderer scales its type tokens by the text size.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const TEXT_SIZES = ['small', 'default', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Multiplier on every type token. Kept small enough that Larger still fits a 960x640 window. */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = {
  small: 0.92,
  default: 1,
  large: 1.1,
  larger: 1.22,
};

export function isTheme(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function isTextSize(value: unknown): value is TextSize {
  return typeof value === 'string' && (TEXT_SIZES as readonly string[]).includes(value);
}

/** ⌘+ / ⌘− move one step and stop at the ends; ⌘0 (step 0) returns to Default. */
export function stepTextSize(current: TextSize | undefined, step: -1 | 0 | 1): TextSize {
  if (step === 0) return 'default';
  const index = TEXT_SIZES.indexOf(current ?? 'default');
  return TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, index + step))]!;
}
