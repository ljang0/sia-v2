import { describe, expect, it } from 'vitest';
import { viewMenu } from './app-menu.js';

const roles = (options: Parameters<typeof viewMenu>[0]) =>
  (viewMenu(options).submenu as { role?: string; type?: string }[]).map(
    (item) => item.role ?? item.type,
  );

describe('View menu', () => {
  it('keeps only zoom and full screen in a packaged build', () => {
    expect(roles({ packaged: true, developerTools: false })).toEqual([
      'resetZoom',
      'zoomIn',
      'zoomOut',
      'separator',
      'togglefullscreen',
    ]);
  });

  it('adds Reload when developer tools are on, and DevTools only in development', () => {
    expect(roles({ packaged: true, developerTools: true })).toEqual([
      'reload',
      'forceReload',
      'separator',
      'resetZoom',
      'zoomIn',
      'zoomOut',
      'separator',
      'togglefullscreen',
    ]);
    expect(roles({ packaged: false, developerTools: false }).slice(0, 4)).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
    ]);
  });
});
