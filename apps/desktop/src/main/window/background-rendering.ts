import type { BrowserWindow } from 'electron';

/** Keep an open window usable by background computer control, without painting hidden UI. */
export function configureBackgroundRendering(window: BrowserWindow): void {
  const throttle = (hidden: boolean) => {
    if (window.isDestroyed()) return;
    window.webContents.setBackgroundThrottling(hidden);
    if (!hidden) window.webContents.invalidate();
  };
  // Electron emits hide before isVisible() changes on macOS. Use the lifecycle
  // event's state rather than sampling the previous native visibility here.
  window.on('show', () => throttle(false));
  window.on('hide', () => throttle(true));
  window.on('minimize', () => throttle(true));
  window.on('restore', () => throttle(!window.isVisible()));
  // Secure startup first paints an inert page, then replaces its renderer with
  // the app. The original ready-to-show event belongs to that earlier page.
  window.webContents.on('did-finish-load', () => {
    throttle(!window.isVisible() || window.isMinimized());
  });
  throttle(!window.isVisible() || window.isMinimized());
}
