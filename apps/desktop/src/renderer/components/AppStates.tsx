import { Archive, Check, CloudSlash, Copy, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { ARCHIVE_UNDO_MS, type useAppController } from '../useAppController';
import { plainError } from '../plainErrors';
import styles from '../ui.module.css';

type AppController = ReturnType<typeof useAppController>;

export function WorkspaceNotice({
  app,
  deviceOffline = false,
}: {
  app: AppController;
  /** The Mac itself is offline; the offline banner already says so. */
  deviceOffline?: boolean;
}) {
  // An action error must not hide a pending Undo, so the two can show together.
  return (
    <>
      {app.actionIssue ? <ActionIssueNotice app={app} /> : null}
      {app.archivedThreadId ? (
        <ArchiveUndoNotice
          key={app.archivedThreadId}
          onUndo={app.undoArchive}
          onDismiss={app.dismissArchived}
        />
      ) : null}
      {!app.actionIssue && !app.archivedThreadId ? (
        <AmbientNotice app={app} deviceOffline={deviceOffline} />
      ) : null}
    </>
  );
}

function ActionIssueNotice({ app }: { app: AppController }) {
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
          <span>{actionIssueText(app.actionIssue.message)}</span>
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

  return null;
}

/** Offers Undo for a while. The countdown pauses while the pointer or focus is on it. */
function ArchiveUndoNotice({ onUndo, onDismiss }: { onUndo(): void; onDismiss(): void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(ARCHIVE_UNDO_MS);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const paused = hovered || focused;
  useEffect(() => {
    if (paused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused]);
  return (
    <div
      className={`${styles.actionError} ${styles.undoNotice}`}
      role="status"
      data-paused={paused || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      }}
    >
      <Archive size={16} aria-hidden="true" />
      <span>Conversation archived</span>
      <span className={styles.actionErrorActions}>
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

function AmbientNotice({ app, deviceOffline }: { app: AppController; deviceOffline: boolean }) {
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

  if (
    !deviceOffline &&
    app.snapshot?.connection === 'offline' &&
    app.snapshot.cloudAuth.state === 'signed-in'
  ) {
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

/**
 * Our own action errors are already written for people; only a raw transport failure
 * (the Mac lost its connection mid-request) is rewritten. Copy details keeps the original.
 */
function actionIssueText(message: string): string {
  const plain = plainError(message);
  return plain?.kind === 'network' ? plain.message : message;
}
