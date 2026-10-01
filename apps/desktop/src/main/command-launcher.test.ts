/* eslint-disable @typescript-eslint/no-explicit-any -- Electron is mocked with loose window and IPC shapes. */
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopController } from './controller/desktop-controller.js';
import type { DesktopSnapshot } from '../shared/bridge.js';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>();
  const windows: any[] = [];
  const register = vi.fn();
  const unregister = vi.fn();
  return { handlers, windows, register, unregister };
});
vi.mock('electron', () => ({
  app: { isPackaged: true },
  nativeTheme: { shouldUseDarkColors: false },
  globalShortcut: { register: electron.register, unregister: electron.unregister },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => Promise<unknown>) =>
      electron.handlers.set(name, handler),
    removeHandler: (name: string) => electron.handlers.delete(name),
  },
  screen: {
    getDisplayMatching: () => ({ workArea: { height: 900 } }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
  BrowserWindow: class {
    visible = false;
    webContents = { mainFrame: {}, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
    show = vi.fn(() => {
      this.visible = true;
    });
    focus = vi.fn();
    hide = vi.fn(() => {
      this.visible = false;
    });
    constructor(public options: any) {
      electron.windows.push(this);
    }
    isDestroyed() {
      return false;
    }
    isVisible() {
      return this.visible;
    }
    getBounds() {
      return { x: 0, y: 0, width: 560, height: 208 };
    }
    getSize() {
      return [560, 208];
    }
    setSize = vi.fn();
    setBackgroundColor = vi.fn();
    setPosition() {}
    setVisibleOnAllWorkspaces() {}
    on() {}
    async loadFile() {}
    destroy() {}
  },
}));
import { createCommandLauncher } from './command-launcher.js';
afterEach(() => {
  vi.clearAllMocks();
  electron.windows.length = 0;
  electron.handlers.clear();
});
it('opens only on explicit Cmd+E, never from background snapshots, and unregisters the same shortcut', async () => {
  let changed!: () => void;
  let snapshot = { agents: [], threads: [], timeline: [] } as unknown as DesktopSnapshot;
  const controller = {
    captureLauncherContext: vi.fn(async () => {
      expect(electron.windows.every((window) => !window.visible)).toBe(true);
      return 'Source app: TextEdit';
    }),
    taskSnapshot: vi.fn(() => snapshot),
    subscribe: (listener: () => void) => {
      changed = listener;
      return vi.fn();
    },
  } as unknown as DesktopController;
  electron.register.mockReturnValue(true);
  const openSia = vi.fn();
  const launcher = createCommandLauncher(controller, openSia);
  expect(electron.register).toHaveBeenCalledWith('Command+E', expect.any(Function));
  snapshot = {
    ...snapshot,
    agents: [{ id: 'agent', name: 'Sia' }],
    threads: [{ id: 'voice', agentId: 'agent', title: 'Voice task', status: 'running' }],
  } as DesktopSnapshot;
  changed();
  expect(electron.windows).toHaveLength(0);
  const shortcut = electron.register.mock.calls[0]![1];
  shortcut();
  await vi.waitFor(() => expect(electron.windows[0]?.show).toHaveBeenCalledOnce());
  expect(controller.captureLauncherContext).toHaveBeenCalledOnce();
  expect(electron.windows[0].options.webPreferences.devTools).toBe(false);
  shortcut();
  expect(electron.windows[0].visible).toBe(false);
  const reads = vi.mocked(controller.taskSnapshot).mock.calls.length;
  changed();
  expect(electron.windows[0].visible).toBe(false);
  // A hidden panel does not rebuild its state for background updates.
  expect(controller.taskSnapshot).toHaveBeenCalledTimes(reads);
  expect(electron.windows[0].show).toHaveBeenCalledOnce();
  expect(openSia).not.toHaveBeenCalled();
  launcher.dispose();
  expect(electron.unregister).toHaveBeenCalledExactlyOnceWith('Command+E');
});

it('hands the pre-focus context to the host send route once without exposing it to the renderer', async () => {
  const agentId = '0ca8ce47-5fb5-4bca-9476-92e34de07d25';
  const threadId = '6e973c04-9e1d-4b52-8e10-d565c566b8a1';
  const context = 'Source app: TextEdit; selected text: synthetic selection';
  const snapshot = {
    agents: [{ id: agentId, name: 'Sia' }],
    threads: [],
    timeline: [],
  } as unknown as DesktopSnapshot;
  const send = vi.fn();
  const controller = {
    taskSnapshot: vi.fn(() => snapshot),
    subscribe: () => vi.fn(),
    captureLauncherContext: async () => context,
    sendLauncherTurn: send,
    invoke: vi.fn(async () => ({ threadId })),
  } as unknown as DesktopController;
  const launcher = createCommandLauncher(controller, vi.fn());
  try {
    await launcher.toggle();
    const window = electron.windows[0];
    const event = { senderFrame: window.webContents.mainFrame };
    const input = { kind: 'new', agentId, text: 'Summarize this selection' };
    await electron.handlers.get('sia:launcher:send')!(event, input);
    expect(send).toHaveBeenLastCalledWith({ threadId, text: input.text }, context);
    expect(JSON.stringify(window.webContents.send.mock.calls)).not.toContain(
      'synthetic selection',
    );
    await electron.handlers.get('sia:launcher:send')!(event, input);
    expect(send).toHaveBeenLastCalledWith({ threadId, text: input.text }, undefined);
  } finally {
    launcher.dispose();
  }
});

it('keeps the panel recoverable until the main window opens successfully', async () => {
  const snapshot = { agents: [], threads: [], timeline: [] } as unknown as DesktopSnapshot;
  const controller = {
    taskSnapshot: vi.fn(() => snapshot),
    subscribe: () => vi.fn(),
    captureLauncherContext: async () => undefined,
  } as unknown as DesktopController;
  const openSia = vi.fn().mockRejectedValueOnce(new Error('Unable to open'));
  const launcher = createCommandLauncher(controller, openSia);
  try {
    await launcher.toggle();
    const window = electron.windows[0];
    const open = () =>
      electron.handlers.get('sia:launcher:open')!({
        senderFrame: window.webContents.mainFrame,
      });
    await expect(open()).rejects.toThrow('Unable to open');
    expect(window.visible).toBe(true);
    let finish!: () => void;
    openSia.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = open();
    expect(window.visible).toBe(true);
    finish();
    await pending;
    expect(window.visible).toBe(false);
  } finally {
    launcher.dispose();
  }
});

it('grows the panel for larger text and paints it in the current theme', async () => {
  const snapshot = {
    agents: [{ id: 'agent', name: 'Sia' }],
    threads: [],
    timeline: [],
    preferences: { completionSound: false, textSize: 'larger' },
  } as unknown as DesktopSnapshot;
  const controller = {
    captureLauncherContext: vi.fn(async () => undefined),
    taskSnapshot: () => snapshot,
    subscribe: () => vi.fn(),
  } as unknown as DesktopController;
  electron.register.mockReturnValue(true);
  const launcher = createCommandLauncher(controller, vi.fn());
  electron.register.mock.calls[0]![1]();
  await vi.waitFor(() => expect(electron.windows[0]?.show).toHaveBeenCalledOnce());
  const window = electron.windows[0];
  expect(window.options.backgroundColor).toBe('#f8f9f8');
  // 208px at Default; Larger (1.22x) needs 254px to keep the prompt and buttons in view.
  expect(window.setSize).toHaveBeenCalledWith(560, 254);
  expect(window.setBackgroundColor).toHaveBeenCalledWith('#f8f9f8');
  launcher.dispose();
});
