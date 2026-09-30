import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  launcherBackgroundColor,
  readLaunchTheme,
  ThemeSync,
  writeLaunchTheme,
} from './display-preferences.js';

describe('launch theme', () => {
  it('round-trips a theme and falls back to System for anything unreadable', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'sia-theme-')), 'nested', 'appearance.json');
    expect(readLaunchTheme(path)).toBe('system');
    writeLaunchTheme(path, 'dark');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ theme: 'dark' });
    expect(readLaunchTheme(path)).toBe('dark');
    writeFileSync(path, '{"theme":"neon"}');
    expect(readLaunchTheme(path)).toBe('system');
    writeFileSync(path, 'not json');
    expect(readLaunchTheme(path)).toBe('system');
  });

  it('applies the launch theme at once, then only real changes, remembering each', () => {
    const apply = vi.fn();
    const remember = vi.fn();
    const sync = new ThemeSync('dark', apply, remember);
    expect(apply).toHaveBeenLastCalledWith('dark');
    sync.update('dark');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(remember).not.toHaveBeenCalled();
    // The saved preference wins over a stale launch hint.
    sync.update(undefined);
    expect(apply).toHaveBeenLastCalledWith('system');
    expect(remember).toHaveBeenLastCalledWith('system');
    sync.update('light');
    sync.update('light');
    expect(apply.mock.calls).toEqual([['dark'], ['system'], ['light']]);
    expect(remember.mock.calls).toEqual([['system'], ['light']]);
  });

  it('paints the launcher in the chosen scheme before its page loads', () => {
    expect(launcherBackgroundColor(false)).toBe('#f8f9f8');
    expect(launcherBackgroundColor(true)).toBe('#202422');
  });
});
