import type { MenuItemConstructorOptions } from 'electron';

/**
 * The View menu. Packaged builds keep text size and full screen; Reload appears only when
 * Settings → Developer tools is on, and DevTools only in development builds (packaged windows
 * disable them).
 *
 * ⌘+ / ⌘− / ⌘0 change Settings → Appearance → Text size instead of page zoom, so there is one
 * saved size that also reaches Scotty and the launcher, and layouts reflow to fit the window
 * rather than being magnified past its edges. Actual Size also clears any leftover page zoom.
 */
export function viewMenu(options: {
  packaged: boolean;
  developerTools: boolean;
  onTextSize?: (step: -1 | 0 | 1) => void;
}): MenuItemConstructorOptions {
  const textSize = (step: -1 | 0 | 1) => () => options.onTextSize?.(step);
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
      { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: textSize(0) },
      { label: 'Make Text Bigger', accelerator: 'CommandOrControl+Plus', click: textSize(1) },
      // ⌘= without Shift, as in other Mac apps.
      {
        label: 'Make Text Bigger',
        accelerator: 'CommandOrControl+=',
        visible: false,
        acceleratorWorksWhenHidden: true,
        click: textSize(1),
      },
      { label: 'Make Text Smaller', accelerator: 'CommandOrControl+-', click: textSize(-1) },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}
