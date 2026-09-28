import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { expect, it, vi } from 'vitest';
import { showStorageStartup } from './storage-startup.js';

const focusApp = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ app: { focus: focusApp } }));

it('paints and foregrounds the explanation before protected storage can block startup', async () => {
  const window = Object.assign(new EventEmitter(), {
    loadURL: vi.fn(async (_url: string) => {}),
    show: vi.fn(),
    focus: vi.fn(),
  });
  let complete = false;
  const startup = showStorageStartup(window as unknown as BrowserWindow).then(() => {
    complete = true;
  });
  await Promise.resolve();
  expect(complete).toBe(false);
  expect(window.show).not.toHaveBeenCalled();
  window.emit('ready-to-show');
  await startup;
  expect(window.show).toHaveBeenCalledOnce();
  expect(focusApp).toHaveBeenCalledExactlyOnceWith({ steal: true });
  expect(window.focus).toHaveBeenCalledOnce();
  const page = decodeURIComponent(window.loadURL.mock.calls[0]![0]);
  expect(page).toContain('Your Mac password stays with macOS.');
  expect(page).not.toMatch(/<(script|input|form)\b/i);
});
