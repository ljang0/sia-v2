import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CheckCircle, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import styles from '../../ui.module.css';
import {} from './SettingsShared';
import { errorMessage } from '../../plainErrors';

interface ResearchConsentDialogProps {
  onAccept(): Promise<void>;
  onDecline?(): Promise<void>;
  autoOpen?: boolean;
  cloudAvailable?: boolean;
  showTrigger?: boolean;
  researchRequired?: boolean;
}

export function ResearchConsentDialog({
  onAccept,
  onDecline,
  autoOpen = false,
  cloudAvailable = false,
  showTrigger = true,
  researchRequired = false,
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
      else if (onDecline) await onDecline();
      else if (researchRequired) {
        throw new Error('Sign out from Connections to decline the research release.');
      }
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
        if (researchRequired && !next) return;
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
        <AlertDialog.Content className={`${styles.alertDialogContent} ${styles.consentDialog}`}>
          {researchRequired ? (
            <span className={styles.onboardingStep}>Sia research alpha</span>
          ) : null}
          <AlertDialog.Title>Join the Sia research release?</AlertDialog.Title>
          <AlertDialog.Description>
            This release records the raw activity Sia observes so researchers can understand
            complete agent behavior. Review this before participating.
          </AlertDialog.Description>

          <div className={styles.consentSummary}>
            <div>
              <CheckCircle size={17} aria-hidden="true" />
              <p>
                <strong>If you join</strong>
                Raw prompts, responses, surfaced reasoning, commands and output, tool
                arguments/results, approvals, browser/computer activity, and captured images are
                uploaded in an organized event stream, except for turns that use a Google
                Workspace connector.
              </p>
            </div>
            <div>
              <ShieldCheck size={17} aria-hidden="true" />
              <p>
                <strong>Outside the capture surface</strong>
                Sia does not obtain provider credentials, Chrome cookies, Keychain contents, or
                hidden credentials outside the task. Google Workspace API data and every turn
                that invokes a Google Workspace connector are excluded from research uploads.
              </p>
            </div>
          </div>

          <div className={styles.consentFootnote}>
            <p className={styles.consentFactsLabel}>What happens to the data</p>
            <ul className={styles.consentFacts}>
              <li>Research data is not used for model training.</li>
              <li>
                Authorized research administrators can inspect eligible raw turns. Google
                Workspace connector turns are never placed in that archive.
              </li>
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
                Raw task content can contain private or secret information. Do not use this
                research release for material you do not agree to share. You can export or
                delete your data at any time.{' '}
                {researchRequired
                  ? 'Sign out to stop new capture.'
                  : 'Local participants can pause capture.'}{' '}
                Deleting resets consent.
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
              {saving === 'decline'
                ? 'Saving...'
                : researchRequired
                  ? 'Decline & sign out'
                  : 'Use without sharing'}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={Boolean(saving)}
              onClick={() => void decide('accept')}
            >
              {saving === 'accept' ? 'Joining...' : 'Join research release'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
