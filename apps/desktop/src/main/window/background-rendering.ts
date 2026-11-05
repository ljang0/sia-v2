import type { BrowserWindow } from 'electron';

/** Keep an open window usable by background computer control, without painting hidden UI. */
export function configureBackgroundRendering(window: BrowserWindow): void {
  const throttle = (hidden: boolean) => {
    if (!window.isDestroyed()) window.webContents.setBackgroundThrottling(hidden);
  };
  // Electron emits hide before isVisible() changes on macOS. Use the lifecycle
  // event's state rather than sampling the previous native visibility here.
  window.on('show', () => throttle(false));
  window.on('hide', () => throttle(true));
  window.on('minimize', () => throttle(true));
  window.on('restore', () => throttle(!window.isVisible()));
  throttle(!window.isVisible() || window.isMinimized());
}
