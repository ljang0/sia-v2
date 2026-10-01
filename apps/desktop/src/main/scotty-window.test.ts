/* eslint-disable @typescript-eslint/no-explicit-any -- Electron is mocked with loose window and IPC shapes. */
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopController } from './controller/desktop-controller.js';
import type { RecordRepository } from './persistence.js';
const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<unknown>>(),
  listeners: new Map<string, (...args: any[]) => void>(),
  windows: [] as any[],
  cursor: { x: 1200, y: 800 },
  load: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock('electron', () => ({
  app: { isPackaged: true },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => Promise<unknown>) =>
      electron.handlers.set(name, handler),
    removeHandler: (name: string) => electron.handlers.delete(name),
    on: (name: string, handler: (...args: any[]) => void) =>
      electron.listeners.set(name, handler),
    removeListener: (name: string) => electron.listeners.delete(name),
  },
  Menu: { buildFromTemplate: () => ({ popup: vi.fn() }) },
  screen: {
    getCursorScreenPoint: () => electron.cursor,
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 24, width: 1440, height: 876 } }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 24, width: 1440, height: 876 } }),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  BrowserWindow: class {
    visible = false;
    destroyed = false;
    bounds = { x: 0, y: 0, width: 224, height: 216 };
    webContents = { mainFrame: {}, send: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn() };
    show = vi.fn(() => {
      this.visible = true;
    });
    showInactive = vi.fn(() => {
      this.visible = true;
    });
    hide = vi.fn(() => {
      this.visible = false;
    });
    focus = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setAlwaysOnTop = vi.fn();
    constructor(public options: any) {
      electron.windows.push(this);
    }
    setBounds(bounds: typeof this.bounds) {
      this.bounds = bounds;
    }
    getBounds() {
      return this.bounds;
    }
    isVisible() {
      return this.visible;
    }
    isDestroyed() {
      return this.destroyed;
    }
    on() {}
    once() {}
    loadFile() {
      return electron.load();
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));
import { clampScotty, createScottyCompanion, scottyPanelBounds } from './scotty-window.js';
afterEach(() => {
  vi.clearAllMocks();
  electron.handlers.clear();
  electron.listeners.clear();
  electron.windows.length = 0;
  electron.load.mockReset().mockResolvedValue(undefined);
  electron.cursor = { x: 1200, y: 800 };
  vi.useRealTimers();
});
function setup() {
  const saved = new Map<string, unknown>();
  const repository = {
    get: (scope: string, id: string) => saved.get(`${scope}/${id}`),
    put: (scope: string, id: string, value: unknown) =>
      saved.set(`${scope}/${id}`, structuredClone(value)),
  } as unknown as RecordRepository;
  let changed!: () => void;
  let allowed = true;
  const controller = {
    taskSnapshot: vi.fn(() => ({
      revision: 1,
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
    })),
    remoteAccessAllowed: () => allowed,
    subscribe: (listener: () => void) => {
      changed = listener;
      return vi.fn();
    },
    invoke: vi.fn(),
  } as unknown as DesktopController;
  const pet = createScottyCompanion(controller, repository, vi.fn());
  return {
    pet,
    controller,
    saved,
    changed: () => changed(),
    deny: () => {
      allowed = false;
    },
  };
}
it('creates no windows until enabled, restores position, stays passive on updates, and suspends both surfaces', async () => {
  const { pet, saved, changed, controller } = setup();
  await pet.initialize();
  expect(electron.windows).toHaveLength(0);
  await pet.configure({ operation: 'show' });
  const window = electron.windows[0];
  expect(window.options.webPreferences).toMatchObject({
    sandbox: true,
    nodeIntegration: false,
    contextIsolation: true,
    backgroundThrottling: false,
    devTools: false,
  });
  expect(window.showInactive).toHaveBeenCalledOnce();
  expect(window.focus).not.toHaveBeenCalled();
  expect(electron.windows).toHaveLength(1);
  const event = { senderFrame: window.webContents.mainFrame };
  await electron.handlers.get('sia:scotty:expand')!(event, true);
  const panel = electron.windows[1];
  for (const surface of [window, panel]) {
    if (process.platform === 'darwin') expect(surface.options.type).toBe('panel');
    expect(surface.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: process.platform === 'darwin',
    });
    expect(surface.setAlwaysOnTop).toHaveBeenCalledWith(true, 'status');
  }
  expect(panel.focus).toHaveBeenCalledOnce();
  await electron.handlers.get('sia:scotty:nudge')!(
    { senderFrame: panel.webContents.mainFrame },
    { dx: -20, dy: -20 },
  );
  const persisted = saved.get('scotty/settings') as { position: { x: number; y: number } };
  expect(persisted.position).toEqual({ x: window.bounds.x, y: window.bounds.y });
  await electron.handlers.get('sia:scotty:expand')!(event, false);
  changed();
  expect(panel.visible).toBe(false);
  pet.suspend(true);
  expect(window.visible).toBe(false);
  expect(panel.visible).toBe(false);
  expect(await electron.handlers.get('sia:scotty:state')!(event)).toMatchObject({
    available: false,
    tasks: [],
  });
  pet.suspend(false);
  expect(window.visible).toBe(true);
  expect(panel.visible).toBe(false);
  await pet.configure({ operation: 'hide' });
  expect(window.visible).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const reads = vi.mocked(controller.taskSnapshot).mock.calls.length;
  changed();
  await new Promise((resolve) => setTimeout(resolve, 150));
  // A hidden Scotty does not rebuild task state for background updates.
  expect(controller.taskSnapshot).toHaveBeenCalledTimes(reads);
  pet.dispose();
  expect(electron.handlers.size).toBe(0);
  expect(window.destroyed).toBe(true);
});
it('bounds hidden-window startup and shares an in-flight load instead of leaving settings pending', async () => {
  vi.useFakeTimers();
  electron.load.mockImplementation(() => new Promise(() => undefined));
  const { pet } = setup();
  const first = expect(pet.configure({ operation: 'show' })).rejects.toThrow('too long');
  const second = expect(pet.configure({ operation: 'show' })).rejects.toThrow('too long');
  expect(electron.windows).toHaveLength(1);
  const window = electron.windows[0];
  expect(window.showInactive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15000);
  await Promise.all([first, second]);
  expect(window.destroyed).toBe(true);
  expect(await pet.configure({ operation: 'status' })).toMatchObject({ enabled: false });
  pet.dispose();
});
it('moves with the native cursor, persists the drop, and stops a drag when the Mac locks', async () => {
  const { pet, saved } = setup();
  await pet.configure({ operation: 'show' });
  const window = electron.windows[0];
  const event = { senderFrame: window.webContents.mainFrame };
  const move = electron.handlers.get('sia:scotty:move')!;
  const origin = { ...window.bounds };
  await move(event, 'start');
  electron.cursor = { x: 1100, y: 750 };
  await move(event, 'update');
  expect(window.bounds).toMatchObject({ x: origin.x - 100, y: origin.y - 50 });
  await move(event, 'end');
  expect(saved.get('scotty/settings')).toMatchObject({
    position: { x: origin.x - 100, y: origin.y - 50 },
  });
  await move(event, 'start');
  pet.suspend(true);
  electron.cursor = { x: 800, y: 550 };
  await expect(move(event, 'update')).rejects.toThrow('unlock');
  pet.suspend(false);
  await move(event, 'update');
  expect(window.bounds).toMatchObject({ x: origin.x - 100, y: origin.y - 50 });
  pet.dispose();
});
it('rejects foreign frame IPC and action calls from the decorative pet, and hides on sign-out', async () => {
  const { pet, deny, changed, controller } = setup();
  await pet.configure({ operation: 'show' });
  await expect(electron.handlers.get('sia:scotty:state')!({ senderFrame: {} })).rejects.toThrow(
    'Blocked',
  );
  const window = electron.windows[0];
  const event = { senderFrame: window.webContents.mainFrame };
  await expect(electron.handlers.get('sia:scotty:action')!(event, {})).rejects.toThrow(
    'task tray',
  );
  expect(controller.invoke).not.toHaveBeenCalled();
  deny();
  changed();
  expect(window.visible).toBe(false);
  await expect(electron.handlers.get('sia:scotty:expand')!(event, true)).rejects.toThrow(
    'unlock',
  );
  pet.dispose();
});
it('keeps Scotty and the tray within usable bounds after monitor removal or on negative-coordinate displays', () => {
  const area = { x: -1920, y: 24, width: 1920, height: 1056 };
  const pet = clampScotty({ x: 4000, y: -1000, width: 224, height: 216 }, area);
  expect(pet).toEqual({ x: -224, y: 24, width: 224, height: 216 });
  for (const position of [{ ...pet, y: 820 }, pet, { ...pet, x: -1900, y: 500 }]) {
    const panel = scottyPanelBounds(position, area);
    expect(panel.x).toBeGreaterThanOrEqual(area.x);
    expect(panel.y).toBeGreaterThanOrEqual(area.y);
    expect(panel.x + panel.width).toBeLessThanOrEqual(area.x + area.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(area.y + area.height);
  }
});
