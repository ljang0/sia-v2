import type { BrowserWindow } from 'electron';

type SetupWindow = Pick<
  BrowserWindow,
  'isDestroyed' | 'isMinimized' | 'restore' | 'show' | 'focus'
>;

/** Only explicit Chrome setup may activate Sia; ordinary background tasks never do. */
export async function returnAfterBrowserSetup(input: {
  window: SetupWindow;
  available(): boolean;
  activate(): void;
  isForeground(): Promise<boolean>;
}): Promise<void> {
  const error = () =>
    new Error(
      'Chrome connected, but Sia could not return to the front. Click Sia, then connect again to continue your saved task.',
    );
  const available = () => input.available() && !input.window.isDestroyed();
  if (!available()) throw error();
  if (input.window.isMinimized()) input.window.restore();
  input.window.show();
  input.activate();
  input.window.focus();

  // show/focus request activation; neither acknowledges the WindowServer handoff.
  // A bounded read also prevents an unresponsive native observer from hanging setup.
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(error());
    }, 1500);
  });
  try {
    await Promise.race([
      (async () => {
        while (!expired && available()) {
          const foreground = await input.isForeground();
          if (expired || !available()) throw error();
          if (foreground) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw error();
      })(),
      timeout,
    ]);
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}
