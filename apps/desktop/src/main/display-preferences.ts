import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isTheme, type ThemePreference } from '../shared/display.js';

/**
 * The theme lives in Sia's encrypted preferences, which open only after the Keychain unlocks.
 * The first window paints before that, so main mirrors the choice to a small plain file (a
 * theme name, nothing private) and reads it back at launch. That keeps a Dark choice on a light
 * Mac, or the reverse, from flashing the wrong background.
 */
export function readLaunchTheme(path: string): ThemePreference {
  try {
    const value = (JSON.parse(readFileSync(path, 'utf8')) as { theme?: unknown }).theme;
    return isTheme(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeLaunchTheme(path: string, theme: ThemePreference): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify({ theme }), { mode: 0o600 });
    renameSync(temporary, path);
  } catch {
    // Only the next launch's first frame depends on this; the saved preference is unaffected.
  }
}

/**
 * Applies a theme to every Sia window through nativeTheme.themeSource, which drives
 * prefers-color-scheme in each renderer and shouldUseDarkColors for window backgrounds, and
 * mirrors it for the next launch. Repeated snapshots with the same theme do nothing.
 */
export class ThemeSync {
  #current: ThemePreference;
  constructor(
    initial: ThemePreference,
    private readonly apply: (theme: ThemePreference) => void,
    private readonly remember: (theme: ThemePreference) => void,
  ) {
    this.#current = initial;
    apply(initial);
  }
  update(theme: ThemePreference | undefined): void {
    const next = theme ?? 'system';
    if (next === this.#current) return;
    this.#current = next;
    this.apply(next);
    this.remember(next);
  }
}

/** The ⌘E launcher's panel color, painted before its page loads. Matches CommandLauncher.module.css. */
export function launcherBackgroundColor(dark: boolean): string {
  return dark ? '#202422' : '#f8f9f8';
}
