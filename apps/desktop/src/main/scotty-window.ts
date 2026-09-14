import { BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import type { DesktopController } from './controller.js';
import type { RecordRepository } from './persistence.js';
import type { ScottyCommand, ScottySettings } from '../shared/scotty.js';
import { scottyCommand, ScottyTasks } from './scotty-state.js';

const savedSettings = z.object({
  enabled: z.boolean(),
  size: z.enum(['small', 'medium', 'large']),
  motion: z.boolean(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
});
const defaultSettings: ScottySettings = { enabled: false, size: 'medium', motion: true };
export const scottyPixels = { small: 112, medium: 144, large: 176 };
type Rect = { x: number; y: number; width: number; height: number };
export function clampScotty(bounds: Rect, area: Rect): Rect {
  return {
    ...bounds,
    x: Math.round(
      Math.max(area.x, Math.min(bounds.x, area.x + Math.max(0, area.width - bounds.width))),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(bounds.y, area.y + Math.max(0, area.height - bounds.height))),
    ),
  };
}
export function scottyPanelBounds(pet: Rect, area: Rect): Rect {
  const width = Math.min(376, area.width);
  const height = Math.min(548, area.height);
  const above = pet.y - height - 8;
  const below = pet.y + pet.height + 8;
  const x = pet.x + pet.width - width;
  if (above >= area.y) return clampScotty({ x, y: above, width, height }, area);
  if (below + height <= area.y + area.height)
    return clampScotty({ x, y: below, width, height }, area);
  const side =
    pet.x + pet.width + 8 + width <= area.x + area.width
      ? pet.x + pet.width + 8
      : pet.x - width - 8;
  return clampScotty({ x: side, y: pet.y, width, height }, area);
}

/** Entirely Sia-owned windows and IPC. No Codex pet processes, APIs, or asset paths. */
export function createScottyCompanion(
  controller: DesktopController,
  repository: RecordRepository,
  openSia: () => void,
  rendererDevUrl?: string,
) {
  const parsed = savedSettings.safeParse(repository.get('scotty', 'settings'));
  let config: z.infer<typeof savedSettings> = parsed.success
    ? parsed.data
    : { ...defaultSettings };
  let pet: BrowserWindow | undefined;
  let petReady = false;
  let panel: BrowserWindow | undefined;
  let disposed = false;
  let suspended = false;
  let opening: Promise<void> | undefined;
  let sending = false;
  let queued: NodeJS.Timeout | undefined;
  let drag: { cursor: { x: number; y: number }; origin: Rect } | undefined;
  const tasks = new ScottyTasks();
  const allowed = () => !disposed && !suspended && controller.remoteAccessAllowed();
  const settings = (): ScottySettings => ({
    enabled: config.enabled,
    size: config.size,
    motion: config.motion,
  });
  const persist = () => repository.put('scotty', 'settings', config);
  const state = () =>
    tasks.view(controller.snapshot(), settings(), allowed() && config.enabled);
  const placePanel = () => {
    if (!pet || pet.isDestroyed() || !panel || panel.isDestroyed()) return;
    panel.setBounds(
      scottyPanelBounds(pet.getBounds(), screen.getDisplayMatching(pet.getBounds()).workArea),
    );
  };
  const placePet = (position?: { x: number; y: number }) => {
    if (!pet || pet.isDestroyed()) return;
    const area = position
      ? screen.getDisplayNearestPoint(position).workArea
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const height = scottyPixels[config.size] + 72;
    const bounds = clampScotty(
      {
        x: position?.x ?? area.x + area.width - 256,
        y: position?.y ?? area.y + area.height - height - 24,
        width: 224,
        height,
      },
      area,
    );
    pet.setBounds(bounds);
    config.position = { x: bounds.x, y: bounds.y };
    placePanel();
  };
  const publish = () => {
    if (disposed) return;
    const next = state();
    for (const window of [pet, panel]) {
      if (window && !window.isDestroyed()) window.webContents.send('sia:scotty:changed', next);
    }
    if (!next.available) {
      drag = undefined;
      pet?.hide();
      panel?.hide();
    } else if (petReady && pet && !pet.isDestroyed() && !pet.isVisible()) pet.showInactive();
  };
  const schedulePublish = () => {
    if (!allowed()) publish();
    if (queued || disposed) return;
    queued = setTimeout(() => {
      queued = undefined;
      publish();
      void ensurePet().catch(() => undefined);
    }, 100);
  };
  const unsubscribe = controller.subscribe(schedulePublish);
  async function load(window: BrowserWindow, route: 'scotty' | 'scotty-panel') {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        rendererDevUrl
          ? window.loadURL(`${rendererDevUrl}#${route}`)
          : window.loadFile(join(import.meta.dirname, '../renderer/index.html'), {
              hash: route,
            }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error('Scotty took too long to open. Try again in Settings → Scotty.'),
              ),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  function makeWindow(title: string, width: number, height: number): BrowserWindow {
    const window = new BrowserWindow({
      title,
      width,
      height,
      ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      hasShadow: false,
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/scotty.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        backgroundThrottling: false,
      },
    });
    // A nonactivating panel can join other apps' full-screen Spaces without
    // transforming Sia into a Dock-less accessory app. Normal NSWindows cannot.
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: process.platform === 'darwin',
    });
    window.setAlwaysOnTop(true, 'status');
    window.on('page-title-updated', (event) => event.preventDefault());
    return window;
  }
  async function ensurePet(): Promise<void> {
    if (!allowed() || !config.enabled) return;
    if (opening) return opening;
    if (pet && !pet.isDestroyed()) return;
    opening = (async () => {
      const window = makeWindow('Scotty — Sia', 224, scottyPixels[config.size] + 72);
      pet = window;
      petReady = false;
      window.once('ready-to-show', () => {
        petReady = true;
        publish();
      });
      window.setIgnoreMouseEvents(true, { forward: true });
      window.on('closed', () => {
        if (pet === window) {
          pet = undefined;
          petReady = false;
        }
      });
      window.webContents.on('context-menu', () => {
        Menu.buildFromTemplate([
          {
            label: 'Open tasks',
            click: () => {
              void expand(true).catch(() => undefined);
            },
          },
          {
            label: 'Reset position',
            click: () => {
              void configure({ operation: 'resetPosition' });
            },
          },
          { type: 'separator' },
          {
            label: 'Hide Scotty',
            click: () => {
              void configure({ operation: 'hide' });
            },
          },
        ]).popup({ window });
      });
      placePet(config.position);
      try {
        await load(window, 'scotty');
        petReady = true;
      } catch (error) {
        if (!window.isDestroyed()) window.destroy();
        if (pet === window) pet = undefined;
        config.enabled = false;
        if (!disposed) persist();
        throw error;
      }
      if (!disposed && !window.isDestroyed()) publish();
    })().finally(() => {
      opening = undefined;
    });
    return opening;
  }
  async function expand(open: boolean) {
    if (!open) {
      panel?.hide();
      return;
    }
    if (!allowed() || !config.enabled) throw new Error('Open Sia to continue.');
    if (!panel || panel.isDestroyed()) {
      const window = makeWindow('Scotty tasks — Sia', 376, 548);
      panel = window;
      window.on('closed', () => {
        if (panel === window) panel = undefined;
      });
      try {
        await load(window, 'scotty-panel');
      } catch (error) {
        if (!window.isDestroyed()) window.destroy();
        if (panel === window) panel = undefined;
        throw error;
      }
    }
    if (!allowed() || !config.enabled || !panel || panel.isDestroyed()) return;
    placePanel();
    publish();
    panel.show();
    panel.focus();
  }
  async function configure(raw: ScottyCommand): Promise<ScottySettings> {
    const command = scottyCommand.parse(raw);
    if (command.operation === 'status') return settings();
    if (disposed) throw new Error('Sia is closing.');
    if (command.operation === 'show') config.enabled = true;
    if (command.operation === 'hide') config.enabled = false;
    if (command.operation === 'size') config.size = command.size;
    if (command.operation === 'motion') config.motion = command.enabled;
    if (command.operation === 'resetPosition') delete config.position;
    persist();
    if (!config.enabled) {
      tasks.clear();
      publish();
      return settings();
    }
    await ensurePet();
    placePet(command.operation === 'resetPosition' ? undefined : config.position);
    persist();
    publish();
    return settings();
  }
  const channels = ['state', 'action', 'expand', 'hide', 'open', 'move', 'nudge'] as const;
  for (const channel of channels)
    ipcMain.handle(`sia:scotty:${channel}`, async (event, raw) => {
      const fromPet =
        pet && !pet.isDestroyed() && event.senderFrame === pet.webContents.mainFrame;
      const fromPanel =
        panel && !panel.isDestroyed() && event.senderFrame === panel.webContents.mainFrame;
      if (!fromPet && !fromPanel) throw new Error('Blocked Scotty request.');
      if (channel === 'state') return state();
      if (channel === 'hide') return configure({ operation: 'hide' });
      if (!allowed() || !config.enabled)
        throw new Error('Open Sia and unlock your Mac to continue.');
      if (channel === 'open') {
        panel?.hide();
        openSia();
        return;
      }
      if (channel === 'expand') return expand(z.boolean().parse(raw));
      if (channel === 'move') {
        if (!fromPet || !pet) throw new Error('Only Scotty can be dragged.');
        const phase = z.enum(['start', 'update', 'end']).parse(raw);
        if (phase === 'start') {
          drag = { cursor: screen.getCursorScreenPoint(), origin: pet.getBounds() };
          pet.setIgnoreMouseEvents(false);
          return;
        }
        if (!drag) return;
        const cursor = screen.getCursorScreenPoint();
        placePet({
          x: drag.origin.x + cursor.x - drag.cursor.x,
          y: drag.origin.y + cursor.y - drag.cursor.y,
        });
        if (phase === 'end') {
          drag = undefined;
          persist();
        }
        return;
      }
      if (channel === 'nudge') {
        const delta = z
          .object({
            dx: z.number().int().min(-80).max(80),
            dy: z.number().int().min(-80).max(80),
          })
          .strict()
          .parse(raw);
        if (pet && !pet.isDestroyed()) {
          const bounds = pet.getBounds();
          placePet({ x: bounds.x + delta.dx, y: bounds.y + delta.dy });
          persist();
        }
        return;
      }
      if (!fromPanel) throw new Error('Open Scotty’s task tray to continue.');
      if (sending) throw new Error('Your request is already being sent.');
      sending = true;
      try {
        const result = await tasks.act(
          raw,
          controller,
          settings(),
          () => {
            panel?.hide();
            openSia();
          },
          () => allowed() && config.enabled,
        );
        publish();
        return result;
      } finally {
        sending = false;
      }
    });
  const interactive = (event: Electron.IpcMainEvent, value: unknown) => {
    if (
      pet &&
      !pet.isDestroyed() &&
      event.senderFrame === pet.webContents.mainFrame &&
      typeof value === 'boolean' &&
      !drag
    )
      pet.setIgnoreMouseEvents(!value, { forward: true });
  };
  ipcMain.on('sia:scotty:interactive', interactive);
  const displaysChanged = () => {
    if (pet && !pet.isDestroyed()) {
      placePet(config.position);
      persist();
    }
  };
  screen.on('display-added', displaysChanged);
  screen.on('display-removed', displaysChanged);
  screen.on('display-metrics-changed', displaysChanged);
  return {
    configure,
    initialize() {
      void ensurePet().catch(() =>
        console.error('Scotty could not open. Re-enable him in Settings → Scotty.'),
      );
    },
    suspend(value: boolean) {
      suspended = value;
      if (value) tasks.clear();
      publish();
      if (!value) void ensurePet().catch(() => undefined);
    },
    dispose() {
      disposed = true;
      if (queued) clearTimeout(queued);
      unsubscribe();
      tasks.clear();
      pet?.destroy();
      panel?.destroy();
      for (const channel of channels) ipcMain.removeHandler(`sia:scotty:${channel}`);
      ipcMain.removeListener('sia:scotty:interactive', interactive);
      screen.removeListener('display-added', displaysChanged);
      screen.removeListener('display-removed', displaysChanged);
      screen.removeListener('display-metrics-changed', displaysChanged);
    },
  };
}
