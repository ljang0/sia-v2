import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import type { DesktopController } from './controller.js';
import { LauncherSession } from './launcher-state.js';

export const launcherInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('new'),
      agentId: z.string().uuid(),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('reply'),
      sessionId: z.string().uuid(),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
]);

/** Notch HotkeyManager's hotkey lifecycle, using Electron's native registration.
 * Independent of the voice helper and its TCC permissions. */
export function createCommandLauncher(
  controller: DesktopController,
  openSia: () => void | Promise<void>,
  rendererDevUrl?: string,
) {
  let window: BrowserWindow | undefined;
  let sending = false;
  let opening = false;
  let disposed = false;
  let suspended = false;
  let activationContext: string | undefined;
  const session = new LauncherSession();
  const state = () => session.view(controller.taskSnapshot());
  const publish = () => {
    if (disposed || !window || window.isDestroyed()) return;
    const next = state();
    const area = screen.getDisplayMatching(window.getBounds()).workArea;
    const height = Math.min(
      next.task ? (next.task.response.length > 700 ? 440 : 340) : 208,
      area.height - 40,
    );
    if (window.getSize()[1] !== height) window.setSize(560, height);
    window.webContents.send('sia:launcher:changed', next);
  };
  // A hidden panel is refreshed by show(); skip rebuilding its state on every streamed token.
  const unsubscribe = controller.subscribe(() => {
    if (window && !window.isDestroyed() && window.isVisible()) publish();
  });
  const channels = ['state', 'send', 'dismiss', 'open', 'cancel', 'new'] as const;
  for (const channel of channels)
    ipcMain.handle(`sia:launcher:${channel}`, async (event, raw) => {
      if (!window || window.isDestroyed() || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('Blocked launcher request.');
      if (channel === 'dismiss') {
        activationContext = undefined;
        window.hide();
        return;
      }
      if (channel === 'open') {
        if (raw !== undefined)
          await controller.invoke('threads.select', {
            threadId: session.target(z.string().uuid().parse(raw), controller.taskSnapshot()),
          });
        await openSia();
        window.hide();
        return;
      }
      if (channel === 'state') return state();
      if (suspended) throw new Error('Unlock your Mac to use Sia.');
      if (channel === 'cancel' || channel === 'new') {
        const threadId = session.target(
          z.string().uuid().parse(raw),
          controller.taskSnapshot(),
        );
        if (channel === 'cancel') await controller.invoke('threads.cancel', { threadId });
        else {
          session.clear();
          publish();
        }
        return;
      }
      if (sending) throw new Error('Your request is already being sent.');
      const input = launcherInput.parse(raw);
      sending = true;
      try {
        // Canonical sign-in, model admission, thread-pinning and authorization routes.
        let threadId: string;
        if (input.kind === 'reply') {
          threadId = session.target(input.sessionId, controller.taskSnapshot());
          const status = state().task?.status;
          if (status === 'running' || status === 'waiting')
            throw new Error('Wait for this request to finish.');
        } else {
          ({ threadId } = await controller.invoke('threads.create', {
            agentId: input.agentId,
            title: input.text.slice(0, 80),
          }));
        }
        controller.sendLauncherTurn({ threadId, text: input.text }, activationContext);
        activationContext = undefined;
        session.bind(threadId);
        publish();
      } catch {
        throw new Error(
          'Could not send this request. Open Sia to check your agent and sign-in, then try again.',
        );
      } finally {
        sending = false;
      }
      return undefined;
    });
  async function show() {
    if (disposed || opening) return;
    if (suspended) return;
    opening = true;
    try {
      activationContext = await controller.captureLauncherContext();
      if (disposed || suspended) {
        activationContext = undefined;
        return;
      }
      if (!window || window.isDestroyed()) {
        window = new BrowserWindow({
          width: 560,
          height: 208,
          title: 'Ask Sia',
          frame: false,
          resizable: false,
          show: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          backgroundColor: '#f8f9f8',
          roundedCorners: true,
          webPreferences: {
            preload: join(import.meta.dirname, '../preload/launcher.js'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            devTools: !app.isPackaged,
          },
        });
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event) => event.preventDefault());
        window.on('blur', () => {
          activationContext = undefined;
          window?.hide();
        });
        window.on('closed', () => {
          window = undefined;
        });
        if (rendererDevUrl) await window.loadURL(`${rendererDevUrl}#launcher`);
        else
          await window.loadFile(join(import.meta.dirname, '../renderer/index.html'), {
            hash: 'launcher',
          });
      }
      if (disposed || suspended || !window || window.isDestroyed()) return;
      const { x, y, width, height } = screen.getDisplayNearestPoint(
        screen.getCursorScreenPoint(),
      ).workArea;
      window.setPosition(Math.round(x + (width - 560) / 2), Math.round(y + 20));
      publish();
      window.setPosition(
        Math.round(x + (width - 560) / 2),
        Math.round(
          y + Math.min(height * 0.22, Math.max(20, height - window.getSize()[1]! - 20)),
        ),
      );
      window.show();
      window.focus();
    } finally {
      opening = false;
    }
  }
  async function toggle() {
    if (window?.isVisible()) window.hide();
    else await show();
  }
  const registered = globalShortcut.register('Command+E', () => {
    void toggle().catch(() => console.error('Sia command panel could not open.'));
  });
  return {
    registered,
    toggle,
    suspend(value: boolean) {
      suspended = value;
      if (value) {
        activationContext = undefined;
        session.clear();
        publish();
        window?.hide();
      }
    },
    dispose() {
      activationContext = undefined;
      disposed = true;
      unsubscribe();
      if (registered) globalShortcut.unregister('Command+E');
      window?.destroy();
      window = undefined;
      for (const channel of channels) ipcMain.removeHandler(`sia:launcher:${channel}`);
    },
  };
}
