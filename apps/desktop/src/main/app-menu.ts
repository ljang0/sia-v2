import type { MenuItemConstructorOptions } from 'electron';

/**
 * The View menu. Packaged builds keep zoom and full screen; Reload appears only when Settings →
 * Developer tools is on, and DevTools only in development builds (packaged windows disable them).
 */
export function viewMenu(options: {
  packaged: boolean;
  developerTools: boolean;
}): MenuItemConstructorOptions {
  const reload: MenuItemConstructorOptions[] =
    !options.packaged || options.developerTools
      ? [{ role: 'reload' }, { role: 'forceReload' }]
      : [];
  const devTools: MenuItemConstructorOptions[] = options.packaged
    ? []
    : [{ role: 'toggleDevTools' }];
  const developer = [...reload, ...devTools];
  return {
    label: 'View',
    submenu: [
      ...developer,
      ...(developer.length ? [{ type: 'separator' } as const] : []),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}
