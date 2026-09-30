import { app, BrowserWindow, globalShortcut, Menu, screen } from 'electron';

export type ScreenControl = Record<string, 'foreground' | 'background'>;
export const STOP_SHORTCUT = 'Escape';

/** The on-screen cue: one click-through window per display. */
export interface IndicatorOverlay {
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface IndicatorDependencies {
  overlay: IndicatorOverlay;
  shortcuts: {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
  };
  /** Stops these On my screen tasks. */
  stop(threadIds: string[]): void;
  /** A quiet status line (the Dock menu); undefined when no Mac task is working. */
  status?(status: 'foreground' | 'background' | undefined): void;
}

/**
 * Shows the "Sia is using your screen" cue and holds the global Esc shortcut only while an
 * On my screen task is actively working. Background tasks show nothing on screen. Pausing
 * (lock or sleep), waiting on the person, finishing, stopping, or a failed turn all hide it.
 */
export class ScreenControlIndicator {
  readonly #deps: IndicatorDependencies;
  #foreground: string[] = [];
  #suspended = false;
  #disposed = false;
  #shown = false;
  #escape = false;
  #status: 'foreground' | 'background' | undefined;

  constructor(deps: IndicatorDependencies) {
    this.#deps = deps;
  }

  get shown(): boolean {
    return this.#shown;
  }

  get escapeRegistered(): boolean {
    return this.#escape;
  }

  update(control: ScreenControl): void {
    if (this.#disposed) return;
    const entries = Object.entries(control);
    this.#foreground = entries.filter(([, mode]) => mode === 'foreground').map(([id]) => id);
    const status = this.#foreground.length
      ? 'foreground'
      : entries.length
        ? 'background'
        : undefined;
    if (status !== this.#status) {
      this.#status = status;
      this.#deps.status?.(status);
    }
    this.#sync();
  }

  /** The Mac locked or went to sleep: remove the cue at once, whatever the task state. */
  suspend(value: boolean): void {
    this.#suspended = value;
    this.#sync();
  }

  /** The overlay's renderer died; the next update recreates it if still needed. Esc stays. */
  overlayCrashed(): void {
    this.#shown = false;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#foreground = [];
    this.#sync();
    this.#disposed = true;
    this.#deps.overlay.dispose();
    this.#deps.status?.(undefined);
  }

  #sync(): void {
    const active = !this.#disposed && !this.#suspended && this.#foreground.length > 0;
    if (active && !this.#shown) {
      this.#deps.overlay.show();
      this.#shown = true;
    } else if (!active && this.#shown) {
      this.#deps.overlay.hide();
      this.#shown = false;
    }
    if (active && !this.#escape) {
      this.#escape = this.#deps.shortcuts.register(STOP_SHORTCUT, () => this.#stop());
    } else if (!active && this.#escape) {
      this.#deps.shortcuts.unregister(STOP_SHORTCUT);
      this.#escape = false;
    }
  }

  #stop(): void {
    const threads = [...this.#foreground];
    if (!threads.length) return;
    // Take the cue down at once; the controller's update confirms the stop.
    this.#foreground = [];
    this.#sync();
    this.#deps.stop(threads);
  }
}

/** The pill sits just below the menu bar (and a MacBook's camera notch). */
const overlayHtml = (top: number) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Sia is using your screen</title><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;
font:500 13px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;user-select:none;cursor:default}
.edge{position:fixed;inset:0;border:3px solid rgba(217,119,87,.85);border-radius:10px;
box-shadow:inset 0 0 18px rgba(217,119,87,.45);animation:breathe 2.8s ease-in-out infinite}
.pill{position:fixed;top:${top}px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;
padding:8px 14px;border-radius:999px;background:rgba(28,25,23,.86);color:#fafaf9;
box-shadow:0 4px 18px rgba(0,0,0,.25);white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:#d97757}
kbd{font:inherit;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.16)}
@keyframes breathe{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.edge{animation:none}}
</style></head><body><div class="edge"></div>
<div class="pill" role="status"><span class="dot"></span>Sia is using your screen · Press <kbd>Esc</kbd> to stop</div>
</body></html>`;

/**
 * Click-through, non-focusable panels over every display. Content protection keeps them out
 * of screenshots, and they belong to Sia's own process, which Sia's window control already
 * refuses to target.
 */
function createIndicatorOverlay(onCrash: () => void): IndicatorOverlay {
  const windows = new Map<number, BrowserWindow>();
  let visible = false;
  const create = (display: Electron.Display) => {
    const window = new BrowserWindow({
      ...display.bounds,
      title: 'Sia is using your screen',
      ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        javascript: false,
        devTools: !app.isPackaged,
      },
    });
    window.setIgnoreMouseEvents(true);
    window.setContentProtection(true);
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: process.platform === 'darwin',
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('render-process-gone', () => {
      windows.delete(display.id);
      if (!window.isDestroyed()) window.destroy();
      onCrash();
    });
    window.on('closed', () => {
      if (windows.get(display.id) === window) windows.delete(display.id);
    });
    windows.set(display.id, window);
    return window;
  };
  const pillTop = new WeakMap<BrowserWindow, number>();
  const render = (window: BrowserWindow, display: Electron.Display) => {
    const top = Math.max(0, display.workArea.y - display.bounds.y) + 8;
    if (pillTop.get(window) === top) return;
    pillTop.set(window, top);
    void window
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml(top))}`)
      .then(() => {
        if (visible && !window.isDestroyed()) window.showInactive();
      })
      .catch(() => undefined);
  };
  const place = () => {
    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((display) => display.id));
    for (const [id, window] of windows)
      if (!ids.has(id)) {
        windows.delete(id);
        window.destroy();
      }
    for (const display of displays) {
      const window = windows.get(display.id) ?? create(display);
      window.setBounds(display.bounds);
      render(window, display);
      if (visible && !window.isVisible() && !window.webContents.isLoading())
        window.showInactive();
    }
  };
  const displaysChanged = () => {
    if (visible) place();
  };
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  return {
    show() {
      visible = true;
      place();
    },
    hide() {
      visible = false;
      for (const window of windows.values()) if (!window.isDestroyed()) window.hide();
    },
    dispose() {
      visible = false;
      screen.removeListener('display-added', displaysChanged);
      screen.removeListener('display-removed', displaysChanged);
      screen.removeListener('display-metrics-changed', displaysChanged);
      for (const window of windows.values()) if (!window.isDestroyed()) window.destroy();
      windows.clear();
    },
  };
}

/** Wires the indicator to the controller, the global Esc shortcut, and the Dock menu. */
export function createScreenControlIndicator(controller: {
  screenControl(): ScreenControl;
  subscribe(listener: () => void): () => void;
  invoke(method: 'threads.cancel', input: { threadId: string }): Promise<unknown>;
}) {
  const indicator: ScreenControlIndicator = new ScreenControlIndicator({
    overlay: createIndicatorOverlay(() => indicator.overlayCrashed()),
    shortcuts: {
      register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
      unregister: (accelerator) => globalShortcut.unregister(accelerator),
    },
    stop: (threadIds) => {
      for (const threadId of threadIds)
        void controller.invoke('threads.cancel', { threadId }).catch(() => undefined);
    },
    status: (status) => {
      if (!app.dock) return;
      app.dock.setMenu(
        Menu.buildFromTemplate(
          status
            ? [
                {
                  label:
                    status === 'foreground'
                      ? 'Sia is using your screen'
                      : 'Sia is working quietly in the background',
                  enabled: false,
                },
              ]
            : [],
        ),
      );
    },
  });
  const unsubscribe = controller.subscribe(() => indicator.update(controller.screenControl()));
  indicator.update(controller.screenControl());
  return {
    suspend: (value: boolean) => indicator.suspend(value),
    dispose() {
      unsubscribe();
      indicator.dispose();
    },
  };
}
