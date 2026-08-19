import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CheckCircle, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import styles from '../../ui.module.css';
import { errorMessage } from './SettingsShared';

interface ResearchConsentDialogProps {
  onAccept(): Promise<void>;
  onDecline?(): Promise<void>;
  autoOpen?: boolean;
  cloudAvailable?: boolean;
  showTrigger?: boolean;
}

export function ResearchConsentDialog({
  onAccept,
  onDecline,
  autoOpen = false,
  cloudAvailable = false,
  showTrigger = true,
}: ResearchConsentDialogProps) {
  const [open, setOpen] = useState(autoOpen);
  const [saving, setSaving] = useState<'accept' | 'decline'>();
  const [error, setError] = useState<string>();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const decide = async (decision: 'accept' | 'decline') => {
    setSaving(decision);
    setError(undefined);
    try {
      if (decision === 'accept') await onAccept();
      else await onDecline?.();
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause, 'Your research choice could not be saved.'));
    } finally {
      setSaving(undefined);
    }
  };

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      {showTrigger ? (
        <AlertDialog.Trigger asChild>
          <button type="button" className={styles.primaryButton}>
            Review & enable
          </button>
        </AlertDialog.Trigger>
      ) : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.dialogOverlay} />
        <AlertDialog.Content className={styles.alertDialogContent}>
          <AlertDialog.Title>Help improve Sia?</AlertDialog.Title>
          <AlertDialog.Description>
            Research participation supports this early release. Your choice starts off and can
            be changed later in Access.
          </AlertDialog.Description>

          <div className={styles.consentSummary}>
            <div>
              <CheckCircle size={17} aria-hidden="true" />
              <p>
                <strong>If you join</strong>
                Prompts, responses, safe coding progress, and one permitted non-sensitive
                screenshot per eligible turn may be stored.
              </p>
            </div>
            <div>
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                <strong>Always excluded</strong>
                Browser and connected-app content, sign-in screens, secrets, reasoning,
                commands, output, diffs, and paths.
              </p>
            </div>
          </div>

          <div className={styles.consentFootnote}>
            <p className={styles.consentFactsLabel}>What happens to the data</p>
            <ul className={styles.consentFacts}>
              <li>Research data is not used for model training.</li>
              <li>
                {cloudAvailable
                  ? 'Cloud copies expire after 90 days. Unsynced local records are retained.'
                  : 'Cloud sync is not configured, so captures stay encrypted on this Mac. If you add cloud later, existing captures remain local and only new eligible captures can sync.'}
              </li>
              <li>
                Local storage is bounded: records roll off after 90 days or earlier at the 128
                MB or 500-batch limit.
              </li>
              <li>
                Other secrets may not be detected, so do not capture private documents. You can
                pause, export, or delete your data at any time. Deleting resets consent.
              </li>
            </ul>
          </div>

          {error ? (
            <div ref={errorRef} className={styles.dialogError} role="alert" tabIndex={-1}>
              <WarningCircle size={16} aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={Boolean(saving)}
              onClick={() => void decide('decline')}
            >
              {saving === 'decline' ? 'Saving...' : 'Use without sharing'}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={Boolean(saving)}
              onClick={() => void decide('accept')}
            >
              {saving === 'accept' ? 'Joining...' : 'Join research'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
