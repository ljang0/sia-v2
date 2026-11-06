import type { RendererApi, RendererSnapshot } from '../types';
import { BrowserWindowPicker } from './BrowserWindowPicker';
import buttons from '../styles/buttons.module.css';
import styles from './Onboarding.module.css';

/** Browser access is part of Mac setup, before the first background browser task. */
export function SetupBrowserAccess({
  browser,
  api,
  busy,
  run,
  onSkip,
}: {
  browser: RendererSnapshot['browser'];
  api: RendererApi;
  busy: boolean;
  run(action: () => Promise<unknown>): Promise<void>;
  onSkip(): void;
}) {
  const pending = busy || browser.status === 'attaching';
  return (
    <section className={styles.providerSetup} aria-labelledby="setup-browser-title">
      <h2 id="setup-browser-title">Use Chrome in the background</h2>
      <p className={styles.note}>
        Choose the window Sia should use for websites. This lets Sia confirm Chrome’s connection
        prompt for that window. Chrome may appear briefly during setup; afterward, Sia can work
        in the background while you use another app.
      </p>
      {browser.snapshotLabel && browser.status === 'error' ? (
        <p role="alert" className={styles.error}>
          {browser.snapshotLabel}
        </p>
      ) : null}
      {browser.attached ? (
        <p className={styles.note}>
          Open the website you want to use in the chosen window, then check the connection
          again.
        </p>
      ) : null}
      {browser.availableWindows.length ? (
        <BrowserWindowPicker
          windows={browser.availableWindows}
          pending={pending}
          onSelect={(windowId) => void run(() => api.attachBrowser(windowId))}
        />
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={buttons.primaryButton}
          disabled={pending}
          onClick={() => void run(() => api.attachBrowser())}
        >
          {pending
            ? 'Connecting Chrome…'
            : browser.attached
              ? 'Check Chrome again'
              : 'Set up Chrome'}
        </button>
        <button type="button" className={styles.link} disabled={pending} onClick={onSkip}>
          Continue without Chrome
        </button>
      </div>
      <p className={styles.note}>
        Only the chosen window is connected. You can disconnect it anytime in Access.
      </p>
    </section>
  );
}
