import { useState } from 'react';
import type { RendererSnapshot, ThreadDetail } from '../types';
import { BrowserWindowPicker } from './BrowserWindowPicker';
import styles from './BrowserTaskRecovery.module.css';
import ui from '../ui.module.css';
import { errorMessage } from '../plainErrors';

export function browserTaskRequest(thread: ThreadDetail): string | undefined {
  const index = thread.events.findLastIndex(
    (event) => event.type === 'message' && event.role === 'user',
  );
  if (index < 0) return undefined;
  const browserAttempt = thread.events
    .slice(index + 1)
    .some((event) => event.type === 'activity' && event.toolName?.startsWith('browser_'));
  return browserAttempt ? thread.events[index]!.id : undefined;
}

export function BrowserTaskRecovery({
  accessMode,
  thread,
  browser,
  connect,
}: {
  accessMode?: 'mac' | 'connected' | undefined;
  thread: ThreadDetail;
  browser: RendererSnapshot['browser'];
  connect(threadId: string, userMessageId: string, windowId?: number): Promise<void>;
}) {
  const userMessageId = browserTaskRequest(thread);
  const [started, setStarted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const busy = ['running', 'queued', 'waiting'].includes(thread.status);
  if (accessMode === 'mac' || !userMessageId || (browser.attached && !started)) return null;
  const run = async (windowId?: number) => {
    setStarted(true);
    setPending(true);
    setError(undefined);
    try {
      await connect(thread.id, userMessageId, windowId);
    } catch (cause) {
      setError(errorMessage(cause, 'Chrome could not connect. Try again.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className={styles.card} aria-label="Continue with Chrome">
      <div>
        <strong>Connect Chrome to continue</strong>
        <p>
          Choose the window with the website for this task open. Sia will continue this
          conversation once it connects—you don’t need to repeat your request.
        </p>
      </div>
      <button
        type="button"
        className={ui.secondaryButton}
        disabled={pending || busy || browser.status === 'attaching'}
        onClick={() => void run()}
      >
        {pending || browser.status === 'attaching'
          ? 'Connecting to Chrome…'
          : browser.attached
            ? 'Continue request'
            : 'Connect Chrome & continue'}
      </button>
      {started && browser.availableWindows.length && !browser.attached ? (
        <>
          <p>Only the selected window will be available to Sia.</p>
          <BrowserWindowPicker
            windows={browser.availableWindows}
            pending={pending || busy}
            onSelect={(windowId) => void run(windowId)}
          />
        </>
      ) : null}
      {pending ? (
        <p role="status">
          If Chrome asks to allow remote debugging, confirm its prompt, then return here.
        </p>
      ) : null}
      {error || (started && browser.status === 'error' && browser.snapshotLabel) ? (
        <p role="alert" className={styles.error}>
          {error ?? browser.snapshotLabel}
        </p>
      ) : null}
    </section>
  );
}
