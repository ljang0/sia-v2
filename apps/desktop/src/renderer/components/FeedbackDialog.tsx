import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import styles from '../ui.module.css';

interface FeedbackDialogProps {
  open: boolean;
  threadId?: string | undefined;
  /** Starting text, such as a draft about a rated reply. */
  initialMessage?: string | undefined;
  onOpenChange(open: boolean): void;
  onSubmit(message: string, includeDiagnostics: boolean): Promise<void>;
}

export function FeedbackDialog({
  open,
  threadId,
  initialMessage,
  onOpenChange,
  onSubmit,
}: FeedbackDialogProps) {
  const [message, setMessage] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(initialMessage ?? '');
    setIncludeDiagnostics(false);
    setSending(false);
  }, [open, initialMessage]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={`${styles.alertDialogContent} ${styles.feedbackDialog}`}>
          <Dialog.Title>Send feedback</Dialog.Title>
          <Dialog.Description>
            Sia opens a draft in your mail app. Nothing is uploaded or sent until you review it.
          </Dialog.Description>
          <label className={styles.localField}>
            <span>What should we improve?</span>
            <textarea
              autoFocus
              rows={7}
              maxLength={10_000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what happened, what you expected, or what felt awkward."
            />
          </label>
          <label className={styles.forkIsolationOption}>
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(event) => setIncludeDiagnostics(event.target.checked)}
            />
            <span>
              <strong>Include basic diagnostics</strong>
              <small>
                Adds the app version, provider states{threadId ? ', and current thread ID' : ''}
                . No transcript or file contents.
              </small>
            </span>
          </label>
          <div className={styles.dialogActions}>
            <Dialog.Close asChild>
              <button type="button" className={styles.secondaryButton} disabled={sending}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={sending || !message.trim()}
              onClick={() => {
                setSending(true);
                void onSubmit(message.trim(), includeDiagnostics).then(
                  () => onOpenChange(false),
                  () => setSending(false),
                );
              }}
            >
              {sending ? 'Opening…' : 'Review in mail'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
