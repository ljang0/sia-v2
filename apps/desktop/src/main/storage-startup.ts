import type { BrowserWindow } from 'electron';

// Paint an explanation before synchronous Keychain calls can wait for a system
// prompt. This inert page has no scripts, forms, links, or credential fields.
export async function showStorageStartup(window: BrowserWindow): Promise<void> {
  const painted = new Promise<void>((resolve) => window.once('ready-to-show', () => resolve()));
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Sia</title><style>
:root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: light-dark(#fafaf8, #191b1a); color: light-dark(#252824, #eeeeeb); }
main { max-width: 420px; padding: 48px; }
.brand { font-size: 22px; font-weight: 600; margin-bottom: 32px; }
h1 { font-size: 28px; font-weight: 550; letter-spacing: -.6px; }
p { font-size: 15px; line-height: 1.6; color: light-dark(#656962, #b5b8b0); }
small { display: block; margin-top: 24px; line-height: 1.5; color: light-dark(#656962, #b5b8b0); }
</style></head><body><main aria-label="Opening Sia">
<div class="brand">sia</div><h1>Opening your secure workspace…</h1>
<p>Sia uses its own Keychain encryption key to protect your saved conversations and settings.</p>
<p>If macOS asks, allow Sia to use that key to continue.</p>
<small>Your Mac password stays with macOS. Sia never sees it.</small>
</main></body></html>`)}`,
  );
  await painted;
}
