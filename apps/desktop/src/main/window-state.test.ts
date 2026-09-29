import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseWindowState,
  readWindowState,
  restoredBounds,
  windowBackgroundColor,
  WindowStateSaver,
} from './window-state.js';

const workArea = { x: 0, y: 25, width: 1440, height: 875 };
const minimum = { minWidth: 960, minHeight: 640 };

afterEach(() => vi.useRealTimers());

describe('window placement', () => {
  it('restores saved bounds that fit the display', () => {
    expect(
      restoredBounds({ x: 100, y: 80, width: 1000, height: 700 }, workArea, minimum),
    ).toEqual({ x: 100, y: 80, width: 1000, height: 700 });
  });

  it('pulls a window back inside the work area and shrinks one larger than it', () => {
    expect(
      restoredBounds({ x: 900, y: 0, width: 2000, height: 1200 }, workArea, minimum),
    ).toEqual({ x: 0, y: 25, width: 1440, height: 875 });
    expect(
      restoredBounds({ x: 1000, y: 500, width: 1000, height: 700 }, workArea, minimum),
    ).toEqual({ x: 440, y: 200, width: 1000, height: 700 });
  });

  it('falls back to the default when the saved display is gone', () => {
    expect(
      restoredBounds({ x: 3000, y: 100, width: 1000, height: 700 }, workArea, minimum),
    ).toBeUndefined();
  });

  it('ignores malformed saved state', () => {
    expect(parseWindowState({ bounds: { x: 1, y: 2, width: -5, height: 3 } })).toBeUndefined();
    expect(parseWindowState({ bounds: { x: '1', y: 2, width: 5, height: 3 } })).toBeUndefined();
    expect(parseWindowState(null)).toBeUndefined();
    expect(readWindowState('/nonexistent/window-state.json')).toBeUndefined();
  });

  it('saves after moves settle and flushes on quit', async () => {
    vi.useFakeTimers();
    const path = join(mkdtempSync(join(tmpdir(), 'sia-window-')), 'window-state.json');
    const saver = new WindowStateSaver(path, 500);
    saver.schedule({ bounds: { x: 1, y: 2, width: 1000, height: 700 }, maximized: false });
    saver.schedule({ bounds: { x: 5, y: 6, width: 1100, height: 720 }, maximized: true });
    expect(readWindowState(path)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await saver.flush();
    expect(readWindowState(path)).toEqual({
      bounds: { x: 5, y: 6, width: 1100, height: 720 },
      maximized: true,
    });

    saver.schedule({ bounds: { x: 9, y: 9, width: 1000, height: 700 }, maximized: false });
    saver.flushNow();
    expect(JSON.parse(readFileSync(path, 'utf8')).bounds.x).toBe(9);
  });
});

describe('launch background', () => {
  it('matches the system appearance so light mode does not flash dark', () => {
    expect(windowBackgroundColor(false)).toBe('#f4f6f2');
    expect(windowBackgroundColor(true)).toBe('#0d1915');
  });
});
