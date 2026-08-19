import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  DownloadSimple,
  LockKey,
  Pause,
  Play,
  ShieldCheck,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import { ResearchConsentDialog } from './ResearchConsentDialog';

interface PrivacySettingsProps {
  snapshot: RendererSnapshot;
  onSetCapturePaused(paused: boolean): Promise<void>;
  onExport(): Promise<void>;
  onDelete(): Promise<void>;
}

export function PrivacySettings({
  snapshot,
  onSetCapturePaused,
  onExport,
  onDelete,
}: PrivacySettingsProps) {
  const [pending, setPending] = useState<'capture' | 'export'>();
  const [error, setError] = useState<string>();
  const paused = snapshot.research.capture === 'paused';
  const captureLabel = !snapshot.research.consented
    ? 'Not enabled'
    : snapshot.research.capture === 'sync-pending'
      ? 'Sync pending'
      : paused
        ? 'Paused'
        : 'Recording';

  const run = async (kind: 'capture' | 'export', action: () => Promise<void>) => {
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, 'Research settings could not be updated.'));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <SettingsSectionHeader
      title="Privacy & research"
      description="Research capture is visible and separate from provider or connected-app permissions."
    >
      <InlineSettingsError message={error} />
      <section className={styles.captureSettings} aria-label="Research capture">
        <div>
          <div className={styles.rowTitleLine}>
            <strong>Research capture</strong>
            <span
              className={`${styles.stateLabel} ${
                !snapshot.research.consented
                  ? styles.state_unavailable
                  : paused
                    ? styles.state_paused
                    : styles.state_ready
              }`}
            >
              {captureLabel}
            </span>
          </div>
          <p>
            Stores prompts, responses, privacy-bounded coding trajectory metadata, and at most
            one screenshot from an explicitly permitted non-sensitive app snapshot. It is not
            used for model training.
          </p>
        </div>
        {!snapshot.research.consented ? (
          <ResearchConsentDialog
            cloudAvailable={snapshot.cloudAuth.state !== 'unconfigured'}
            onAccept={() => onSetCapturePaused(false)}
          />
        ) : (
          <button
            type="button"
            className={paused ? styles.primaryButton : styles.secondaryButton}
            disabled={pending === 'capture'}
            onClick={() => void run('capture', () => onSetCapturePaused(!paused))}
          >
            {paused ? (
              <Play size={15} weight="fill" aria-hidden="true" />
            ) : (
              <Pause size={15} weight="fill" aria-hidden="true" />
            )}
            {pending === 'capture' ? 'Updating...' : paused ? 'Resume' : 'Pause'}
          </button>
        )}
      </section>

      <div className={styles.privacyFacts}>
        <div>
          <LockKey size={17} aria-hidden="true" />
          <div>
            <strong>Capture filters</strong>
            <p>
              Sia excludes browser and connected-app turns, authentication surfaces, mutations,
              provider reasoning, tool arguments/results, command output, diffs, paths, and
              recognized secret patterns. Screenshots are accepted only from the first read-only
              computer snapshot in an eligible turn. Other secrets may not be detected.
            </p>
          </div>
        </div>
        <div>
          <ShieldCheck size={17} aria-hidden="true" />
          <div>
            <strong>Your controls</strong>
            <p>
              Pause collection, export local records, or delete your research data.{' '}
              {snapshot.cloudAuth.state === 'unconfigured'
                ? 'Cloud sync is not configured, so captures stay encrypted on this Mac. '
                : 'Deletion also requests removal of active cloud research copies. '}
              Unsynced records are retained; synced local copies roll off after 90 days or
              earlier if encrypted research storage reaches 128 MB. Deletion turns capture off
              and resets consent.
            </p>
          </div>
        </div>
      </div>

      {snapshot.research.consented && snapshot.research.pendingItems ? (
        <div className={styles.inlineWarning} role="status">
          <WarningCircle size={15} aria-hidden="true" />
          {snapshot.research.pendingItems} research items are waiting for a secure connection.
        </div>
      ) : null}

      <div className={styles.privacyActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={pending === 'export'}
          onClick={() => void run('export', onExport)}
        >
          <DownloadSimple size={16} aria-hidden="true" />
          {pending === 'export' ? 'Exporting...' : 'Export local records'}
        </button>
        <DeleteResearchDialog
          cloudAvailable={snapshot.cloudAuth.state !== 'unconfigured'}
          onDelete={onDelete}
        />
      </div>
    </SettingsSectionHeader>
  );
}

function DeleteResearchDialog({
  cloudAvailable,
  onDelete,
}: {
  cloudAvailable: boolean;
  onDelete(): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (deleting) return;
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <AlertDialog.Trigger asChild>
        <button type="button" className={styles.dangerButton}>
          <Trash size={16} aria-hidden="true" />
          Delete research data
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.dialogOverlay} />
        <AlertDialog.Content className={styles.alertDialogContent}>
          <AlertDialog.Title>Delete your research data?</AlertDialog.Title>
          <AlertDialog.Description>
            {cloudAvailable
              ? 'This removes local captures, requests deletion of active cloud copies, turns research capture off, and resets consent. Encrypted backups expire within 30 days.'
              : 'This removes local captures from this Mac, turns research capture off, and resets consent.'}
          </AlertDialog.Description>
          {error ? (
            <div ref={errorRef} tabIndex={-1}>
              <InlineSettingsError message={error} />
            </div>
          ) : null}
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={styles.secondaryButton} disabled={deleting}>
                Cancel
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                setError(undefined);
                try {
                  await onDelete();
                  setOpen(false);
                } catch (cause) {
                  setError(errorMessage(cause, 'Research data could not be deleted.'));
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? 'Deleting...' : 'Delete data'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
