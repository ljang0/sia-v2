import { Check, CloudSlash, Copy, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { useAppController } from '../useAppController';
import styles from '../ui.module.css';

type AppController = ReturnType<typeof useAppController>;

export function WorkspaceNotice({ app }: { app: AppController }) {
  const [copied, setCopied] = useState(false);

  if (app.actionIssue) {
    const diagnostic = [
      `Sia support ID: ${app.actionIssue.supportId}`,
      `Time: ${app.actionIssue.lastSeenAt}`,
      `Occurrences: ${app.actionIssue.count}`,
      `Thread: ${app.snapshot?.selectedThreadId ?? 'none'}`,
      `Message: ${app.actionIssue.message}`,
    ].join('\n');
    return (
      <div className={styles.actionError} role="alert" data-testid="diagnostic-tray">
        <WarningCircle size={16} aria-hidden="true" />
        <span className={styles.actionErrorCopy}>
          <span>{app.actionIssue.message}</span>
          <small>
            Support ID {app.actionIssue.supportId}
            {app.actionIssue.count > 1 ? ` · repeated ${app.actionIssue.count} times` : ''}
          </small>
        </span>
        <span className={styles.actionErrorActions}>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(diagnostic)
                .then(() => setCopied(true))
                .catch(() => undefined);
            }}
          >
            {copied ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy details'}
          </button>
          <button type="button" onClick={app.clearActionError}>
            Dismiss
          </button>
        </span>
      </div>
    );
  }

  if (app.snapshot?.startupNotice && !app.startupNoticeDismissed) {
    return (
      <div className={styles.actionError} role="status">
        <WarningCircle size={16} aria-hidden="true" />
        <span>
          <strong>{app.snapshot.startupNotice.title}.</strong>{' '}
          {app.snapshot.startupNotice.detail}
        </span>
        <button type="button" onClick={app.dismissStartupNotice}>
          Dismiss
        </button>
      </div>
    );
  }

  if (app.snapshot?.connection === 'offline' && app.snapshot.cloudAuth.state === 'signed-in') {
    return (
      <div className={styles.offlineBanner} role="status">
        <CloudSlash size={16} aria-hidden="true" />
        <span>
          <strong>Sia cloud is offline.</strong> Local work is still available; sync and
          connected apps will resume when the connection returns.
        </span>
      </div>
    );
  }

  return null;
}
