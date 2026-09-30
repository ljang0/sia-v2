import { beforeEach, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  shortcuts: new Map<string, () => void>(),
  windows: [] as any[],
  dockMenus: [] as unknown[][],
  displays: [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      workArea: { x: 0, y: 37, width: 1440, height: 800 },
    },
    {
      id: 2,
      bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1440, y: 25, width: 1920, height: 1055 },
    },
  ],
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    dock: { setMenu: (menu: unknown[]) => electron.dockMenus.push(menu) },
  },
  Menu: { buildFromTemplate: (template: unknown[]) => template },
  globalShortcut: {
    register: (accelerator: string, callback: () => void) => {
      electron.shortcuts.set(accelerator, callback);
      return true;
    },
    unregister: (accelerator: string) => electron.shortcuts.delete(accelerator),
  },
  screen: {
    getAllDisplays: () => electron.displays,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: class {
    options: any;
    visible = false;
    destroyed = false;
    ignoreMouse = false;
    contentProtection = false;
    level = '';
    crash: (() => void) | undefined;
    webContents = {
      setWindowOpenHandler: vi.fn(),
      isLoading: () => false,
      on: (event: string, listener: () => void) => {
        if (event === 'render-process-gone') this.crash = listener;
      },
    };
    constructor(options: any) {
      this.options = options;
      electron.windows.push(this);
    }
    loadURL = vi.fn(() => Promise.resolve());
    setIgnoreMouseEvents = (value: boolean) => void (this.ignoreMouse = value);
    setContentProtection = (value: boolean) => void (this.contentProtection = value);
    setVisibleOnAllWorkspaces = vi.fn();
    setAlwaysOnTop = (_value: boolean, level: string) => void (this.level = level);
    setBounds = vi.fn();
    on = vi.fn();
    showInactive = vi.fn(() => void (this.visible = true));
    show = vi.fn(() => void (this.visible = true));
    hide = vi.fn(() => void (this.visible = false));
    isVisible = () => this.visible;
    isDestroyed = () => this.destroyed;
    destroy = () => void (this.destroyed = true);
  },
}));

const { ScreenControlIndicator, createScreenControlIndicator, STOP_SHORTCUT } =
  await import('./screen-control-indicator.js');

beforeEach(() => {
  electron.shortcuts.clear();
  electron.windows.length = 0;
  electron.dockMenus.length = 0;
});

function fakes() {
  const overlay = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
  const registered = new Map<string, () => void>();
  const shortcuts = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      registered.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => void registered.delete(accelerator)),
  };
  const stop = vi.fn();
  const status = vi.fn();
  const indicator = new ScreenControlIndicator({ overlay, shortcuts, stop, status });
  return { indicator, overlay, registered, shortcuts, stop, status };
}

it('shows the cue and holds ⌃Esc only while an On my screen task works', () => {
  const { indicator, overlay, registered, shortcuts, status } = fakes();
  indicator.update({});
  expect(indicator.shown).toBe(false);
  expect(shortcuts.register).not.toHaveBeenCalled();

  indicator.update({ a: 'background' });
  expect(indicator.shown).toBe(false);
  expect(registered.size).toBe(0);
  expect(status).toHaveBeenLastCalledWith('background');

  indicator.update({ a: 'background', b: 'foreground' });
  expect(indicator.shown).toBe(true);
  expect(indicator.escapeRegistered).toBe(true);
  expect(registered.has(STOP_SHORTCUT)).toBe(true);
  expect(status).toHaveBeenLastCalledWith('foreground');

  // Repeated updates neither re-show nor re-register.
  indicator.update({ b: 'foreground' });
  expect(overlay.show).toHaveBeenCalledTimes(1);
  expect(shortcuts.register).toHaveBeenCalledTimes(1);

  // Finishing, stopping, a failed turn, or waiting on the person all leave no foreground task.
  indicator.update({});
  expect(indicator.shown).toBe(false);
  expect(overlay.hide).toHaveBeenCalledTimes(1);
  expect(registered.size).toBe(0);
  expect(indicator.escapeRegistered).toBe(false);
  expect(status).toHaveBeenLastCalledWith(undefined);
});

it('⌃Esc stops every On my screen task and releases itself at once', () => {
  const { indicator, registered, stop } = fakes();
  indicator.update({ a: 'foreground', b: 'background', c: 'foreground' });
  registered.get(STOP_SHORTCUT)!();
  expect(stop).toHaveBeenCalledWith(['a', 'c']);
  expect(indicator.shown).toBe(false);
  expect(registered.size).toBe(0);
});

it('hides on lock or sleep and returns when the task resumes', () => {
  const { indicator, registered } = fakes();
  indicator.update({ a: 'foreground' });
  indicator.suspend(true);
  expect(indicator.shown).toBe(false);
  expect(registered.size).toBe(0);
  indicator.update({ a: 'foreground' });
  expect(indicator.shown).toBe(false);
  indicator.suspend(false);
  expect(indicator.shown).toBe(true);
  expect(registered.size).toBe(1);
});

it('does not claim ⌃Esc when another app already holds it', () => {
  const { indicator, shortcuts } = fakes();
  shortcuts.register.mockReturnValue(false);
  indicator.update({ a: 'foreground' });
  expect(indicator.shown).toBe(true);
  expect(indicator.escapeRegistered).toBe(false);
  indicator.update({});
  expect(shortcuts.unregister).not.toHaveBeenCalled();
});

it('releases ⌃Esc and the overlay on dispose', () => {
  const { indicator, overlay, registered, status } = fakes();
  indicator.update({ a: 'foreground' });
  indicator.dispose();
  expect(registered.size).toBe(0);
  expect(overlay.dispose).toHaveBeenCalled();
  expect(status).toHaveBeenLastCalledWith(undefined);
  indicator.update({ a: 'foreground' });
  expect(indicator.shown).toBe(false);
});

it('draws click-through, capture-protected panels on every display', async () => {
  let control: Record<string, 'foreground' | 'background'> = {};
  const listeners = new Set<() => void>();
  const invoke = vi.fn(async () => undefined);
  const indicator = createScreenControlIndicator({
    screenControl: () => control,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invoke,
  });
  const change = (next: typeof control) => {
    control = next;
    for (const listener of listeners) listener();
  };
  expect(electron.windows).toHaveLength(0);

  change({ t1: 'background' });
  expect(electron.windows).toHaveLength(0);
  expect(electron.dockMenus.at(-1)).toEqual([
    { label: 'Sia is working quietly in the background', enabled: false },
  ]);

  change({ t1: 'foreground' });
  expect(electron.windows).toHaveLength(2);
  for (const window of electron.windows) {
    expect(window.options).toMatchObject({ focusable: false, show: false, transparent: true });
    expect(window.ignoreMouse).toBe(true);
    expect(window.contentProtection).toBe(true);
    expect(window.level).toBe('screen-saver');
    expect(window.visible).toBe(true);
  }
  expect(electron.windows[1].options).toMatchObject(electron.displays[1]!.bounds);
  // The pill clears each display's menu bar and camera notch.
  expect(decodeURIComponent(electron.windows[0].loadURL.mock.calls[0][0])).toContain(
    'top:45px',
  );
  expect(decodeURIComponent(electron.windows[1].loadURL.mock.calls[0][0])).toContain(
    'top:33px',
  );
  expect(decodeURIComponent(electron.windows[0].loadURL.mock.calls[0][0])).toContain(
    'Press <kbd>⌃Esc</kbd> to stop',
  );
  // Plain Escape stays with apps, so an Escape the task types never stops it.
  expect(electron.shortcuts.has('Escape')).toBe(false);
  expect(electron.shortcuts.has('Control+Escape')).toBe(true);

  electron.shortcuts.get('Control+Escape')!();
  expect(invoke).toHaveBeenCalledWith('threads.cancel', { threadId: 't1' });
  expect(electron.windows.every((window) => !window.visible)).toBe(true);
  expect(electron.shortcuts.has('Control+Escape')).toBe(false);

  // A crashed overlay renderer is rebuilt on the next update; ⌃Esc keeps working.
  change({ t2: 'foreground' });
  electron.windows[0].crash();
  expect(electron.windows[0].destroyed).toBe(true);
  expect(electron.shortcuts.has('Control+Escape')).toBe(true);
  change({ t2: 'foreground' });
  expect(electron.windows).toHaveLength(3);
  expect(electron.windows[2].visible).toBe(true);

  indicator.suspend(true);
  expect(electron.windows.filter((window) => window.visible && !window.destroyed)).toHaveLength(
    0,
  );
  expect(electron.shortcuts.size).toBe(0);
  indicator.dispose();
  expect(listeners.size).toBe(0);
  expect(electron.windows.every((window) => window.destroyed)).toBe(true);
});
