import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  ArrowClockwise,
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
  const blocked = snapshot.research.capture === 'blocked';
  const uploadsPaused = snapshot.cloudAuth.features?.researchUploads === false;
  const captureLabel = uploadsPaused
    ? 'Not available'
    : !snapshot.research.consented
      ? 'Not enabled'
      : snapshot.research.capture === 'sync-pending'
        ? 'Sync pending'
        : blocked
          ? 'Action required'
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
      title="Privacy"
      description="Research participation is optional and separate from model or connection permissions."
    >
      <InlineSettingsError message={error} />
      {uploadsPaused ? (
        <div className={styles.inlineWarning} role="status">
          <WarningCircle size={15} aria-hidden="true" />
          <div>
            <strong>Research is not enabled for this account</strong>
            <p>
              Sia does not record or upload research while this operator or model-tester account
              is signed in.
            </p>
          </div>
        </div>
      ) : null}
      <section className={styles.captureSettings} aria-label="Research capture">
        <div>
          <div className={styles.rowTitleLine}>
            <strong>Research capture</strong>
            <span
              className={`${styles.stateLabel} ${
                !snapshot.research.consented
                  ? styles.state_unavailable
                  : paused || blocked
                    ? styles.state_paused
                    : styles.state_ready
              }`}
            >
              {captureLabel}
            </span>
          </div>
          <p>
            Stores the raw prompts, responses, surfaced reasoning, tool arguments/results,
            commands and output, browser/computer activity, and captured images Sia observes. It
            captures eligible tasks automatically after you join, including background computer
            control. It is not used for model training.
          </p>
        </div>
        {uploadsPaused ? (
          <span className={styles.stateLabel}>Not enabled for this account</span>
        ) : !snapshot.research.consented ? (
          <ResearchConsentDialog
            cloudAvailable={snapshot.cloudAuth.state !== 'unconfigured'}
            onAccept={() => onSetCapturePaused(false)}
          />
        ) : blocked ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={pending === 'capture'}
            onClick={() => void run('capture', () => onSetCapturePaused(false))}
          >
            <ArrowClockwise size={15} aria-hidden="true" />
            {pending === 'capture' ? 'Checking storage…' : 'Retry capture'}
          </button>
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

      <details className={styles.settingsDisclosure}>
        <summary>How research data is handled</summary>
        <div className={styles.privacyFacts}>
          <div>
            <LockKey size={17} aria-hidden="true" />
            <div>
              <strong>Raw research record</strong>
              <p>
                Authorized researchers can inspect complete ordered turns, including content
                from tools and apps used in the task. Provider credentials, Chrome cookies,
                Keychain contents, and hidden credentials outside Sia's task surface are never
                collected. Anything the task can observe may be included raw.
              </p>
            </div>
          </div>
          <div>
            <ShieldCheck size={17} aria-hidden="true" />
            <div>
              <strong>Your controls</strong>
              <p>
                Pause collection, export local records, or delete your research data.{' '}
                {snapshot.cloudAuth.state === 'signed-in'
                  ? 'Deletion also requests removal of active cloud research copies. '
                  : 'While signed out, captures stay encrypted on this Mac. '}
                {snapshot.cloudAuth.state === 'signed-in'
                  ? 'Unsynced records stay in an encrypted outbox until AWS acknowledges them. Synced local copies roll off after 90 days or earlier when the local cache reaches its target size. '
                  : 'Local-only records are never made eligible for a later upload. '}
                Deletion turns capture off and resets consent.
              </p>
            </div>
          </div>
        </div>
      </details>

      {blocked ? (
        <div className={styles.inlineError} role="alert">
          <WarningCircle size={15} aria-hidden="true" />
          <div>
            <strong>Research capture is blocked</strong>
            <p>
              {snapshot.research.blockedReason ??
                'Sia could not durably queue the raw record. New tasks are paused to prevent silent data loss.'}
            </p>
          </div>
        </div>
      ) : snapshot.research.consented && snapshot.research.pendingItems ? (
        <div className={styles.inlineWarning} role="status">
          <WarningCircle size={15} aria-hidden="true" />
          <div>
            <strong>
              {snapshot.research.pendingItems} research items ·{' '}
              {formatBytes(snapshot.research.pendingBytes)} queued
            </strong>
            <p>
              Waiting for a secure AWS acknowledgement
              {snapshot.research.oldestPendingAt
                ? ` since ${new Date(snapshot.research.oldestPendingAt).toLocaleString()}`
                : ''}
              .
              {snapshot.research.lastSyncError
                ? ` Last attempt: ${snapshot.research.lastSyncError}`
                : ''}
            </p>
          </div>
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
          {pending === 'export' ? 'Preparing export…' : 'Export research data'}
        </button>
        <DeleteResearchDialog
          cloudAvailable={snapshot.cloudAuth.state !== 'unconfigured'}
          onDelete={onDelete}
        />
      </div>
    </SettingsSectionHeader>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
