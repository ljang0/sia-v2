import { CloudSlash, WarningCircle } from '@phosphor-icons/react';
import type { useAppController } from '../useAppController';
import styles from '../ui.module.css';
import { Conversation } from './Conversation';

type AppController = ReturnType<typeof useAppController>;

export function WorkspaceNotice({ app }: { app: AppController }) {
  if (app.actionError) {
    return (
      <div className={styles.actionError} role="alert">
        <WarningCircle size={16} aria-hidden="true" />
        <span>{app.actionError}</span>
        <button type="button" onClick={app.clearActionError}>
          Dismiss
        </button>
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

export function AppSkeleton() {
  return (
    <div className={styles.appShell} aria-label="Loading Sia" aria-busy="true">
      <aside className={styles.sidebar}>
        <div className={styles.sidebarSkeleton}>
          <span />
          <span />
          <span />
          <span />
        </div>
      </aside>
      <section className={styles.workspace}>
        <Conversation
          loading
          onSend={async () => undefined}
          onStop={async () => undefined}
          onRetry={async () => undefined}
          onResolveApproval={async () => undefined}
        />
      </section>
    </div>
  );
}
