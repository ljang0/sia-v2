import { describe, expect, it, vi } from 'vitest';
import { viewMenu } from './app-menu.js';

type Item = {
  role?: string;
  type?: string;
  label?: string;
  accelerator?: string;
  visible?: boolean;
  click?: () => void;
};
const items = (options: Parameters<typeof viewMenu>[0]) => viewMenu(options).submenu as Item[];
const roles = (options: Parameters<typeof viewMenu>[0]) =>
  items(options)
    .filter((item) => item.visible !== false)
    .map((item) => item.role ?? item.label ?? item.type);

describe('View menu', () => {
  it('keeps only text size and full screen in a packaged build', () => {
    expect(roles({ packaged: true, developerTools: false })).toEqual([
      'Actual Size',
      'Make Text Bigger',
      'Make Text Smaller',
      'separator',
      'togglefullscreen',
    ]);
  });

  it('maps ⌘0, ⌘+ (and ⌘=), and ⌘− to text size steps instead of page zoom', () => {
    const onTextSize = vi.fn();
    const menu = items({ packaged: true, developerTools: false, onTextSize });
    expect(menu.some((item) => /zoom/i.test(item.role ?? ''))).toBe(false);
    const byAccelerator = (accelerator: string) =>
      menu.find((item) => item.accelerator === accelerator)!;
    byAccelerator('CommandOrControl+0').click!();
    byAccelerator('CommandOrControl+Plus').click!();
    byAccelerator('CommandOrControl+=').click!();
    byAccelerator('CommandOrControl+-').click!();
    expect(onTextSize.mock.calls).toEqual([[0], [1], [1], [-1]]);
  });

  it('adds Reload when developer tools are on, and DevTools only in development', () => {
    expect(roles({ packaged: true, developerTools: true }).slice(0, 4)).toEqual([
      'reload',
      'forceReload',
      'separator',
      'Actual Size',
    ]);
    expect(roles({ packaged: false, developerTools: false }).slice(0, 4)).toEqual([
      'reload',
      'forceReload',
      'toggleDevTools',
      'separator',
    ]);
  });
});
