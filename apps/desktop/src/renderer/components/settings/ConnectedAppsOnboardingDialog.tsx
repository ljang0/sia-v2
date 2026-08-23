import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Check,
  CheckCircle,
  CircleNotch,
  GoogleLogo,
  PlugsConnected,
  WarningCircle,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { AppConnection } from '../../types';
import styles from '../../ui.module.css';
import { ConnectionAppChooser } from './ConnectionAppChooser';
import { errorMessage } from './SettingsShared';

export function ConnectedAppsOnboardingDialog({
  open,
  apps,
  onConnectAll,
  onConnectSelected,
  onOpenSettings,
  onDone,
}: {
  open: boolean;
  apps: readonly AppConnection[];
  onConnectAll(): Promise<void>;
  onConnectSelected(apps: AppConnection['id'][]): Promise<void>;
  onOpenSettings(): void;
  onDone(): void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [selected, setSelected] = useState(
    () => new Set<AppConnection['id']>(apps.map(({ id }) => id)),
  );
  const [requestedSelection, setRequestedSelection] = useState<Set<AppConnection['id']>>();
  const connectedCount = apps.filter(({ status }) => status === 'connected').length;
  const googleApps = apps.filter(({ id }) => id !== 'slack');
  const googleConnectedCount = googleApps.filter(({ status }) => status === 'connected').length;
  const googleConnected = googleConnectedCount === googleApps.length;
  const slack = apps.find(({ id }) => id === 'slack');
  const slackConnected = slack?.status === 'connected';
  const allConnected = connectedCount === apps.length;
  const setupActive = apps.some(({ status }) => status === 'connecting');
  const needsRecovery = apps.some(({ status }) => status === 'error');

  useEffect(() => {
    if (open && allConnected) onDone();
  }, [allConnected, onDone, open]);

  useEffect(() => {
    if (
      open &&
      requestedSelection?.size &&
      [...requestedSelection].every(
        (id) => apps.find((app) => app.id === id)?.status === 'connected',
      )
    ) {
      onDone();
    }
  }, [apps, onDone, open, requestedSelection]);

  useEffect(() => {
    if (open) return;
    setChooserOpen(false);
    setRequestedSelection(undefined);
    setSelected(new Set(apps.map(({ id }) => id)));
  }, [apps, open]);

  const connect = async () => {
    setPending(true);
    setError(undefined);
    try {
      await onConnectAll();
    } catch (cause) {
      setError(errorMessage(cause, 'Work apps could not be connected.'));
    } finally {
      setPending(false);
    }
  };

  const connectSelected = async () => {
    const connectionIds = apps
      .filter(({ id, status }) => selected.has(id) && status !== 'connected')
      .map(({ id }) => id);
    if (connectionIds.length === 0) return;
    setPending(true);
    setError(undefined);
    setRequestedSelection(new Set(connectionIds));
    try {
      await onConnectSelected(connectionIds);
    } catch (cause) {
      setRequestedSelection(undefined);
      setError(errorMessage(cause, 'The selected apps could not be connected.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onDone()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content
          className={`${styles.dialogContent} ${styles.connectionOnboardingDialog}`}
        >
          <div className={styles.connectionOnboardingHeader}>
            <span className={styles.onboardingStep}>Set up Sia · 2 of 2</span>
            <div className={styles.connectionOnboardingTitle}>
              <span className={styles.connectionOnboardingMark} aria-hidden="true">
                <PlugsConnected size={21} />
              </span>
              <div>
                <Dialog.Title>Connect your work apps</Dialog.Title>
                <Dialog.Description>
                  {chooserOpen
                    ? 'Choose the apps you want now. You can add or remove connections later.'
                    : 'One start. Sia opens every remaining approval in order and resumes where you left off.'}
                </Dialog.Description>
              </div>
            </div>
          </div>

          <div className={styles.connectionOnboardingBody}>
            <div className={styles.recordingConfirmation} role="status">
              <CheckCircle size={18} weight="fill" aria-hidden="true" />
              <div>
                <strong>Research recording is on</strong>
                <p>
                  Eligible connection events and future app actions enter your local trajectory
                  and encrypted AWS research stream. Google Workspace action turns, OAuth URLs,
                  codes, and tokens are excluded.
                </p>
              </div>
            </div>

            <div className={styles.onboardingProgressBlock}>
              <div>
                <strong>Setup progress</strong>
                <span>
                  {connectedCount} of {apps.length} apps ready
                </span>
              </div>
              <progress
                className={styles.onboardingProgressTrack}
                max={apps.length}
                value={connectedCount}
              />
            </div>

            {!chooserOpen ? (
              <div className={styles.onboardingConnectionGroups} aria-label="Connection status">
                <section data-status={googleConnected ? 'connected' : 'disconnected'}>
                  <span className={styles.onboardingProviderIcon} aria-hidden="true">
                    {googleConnected ? (
                      <Check size={15} weight="bold" />
                    ) : (
                      <GoogleLogo size={18} weight="bold" />
                    )}
                  </span>
                  <div>
                    <strong>Google Workspace</strong>
                    <span>Gmail, Drive, Docs, Sheets, and Slides</span>
                    <small>
                      {googleConnectedCount} of {googleApps.length} connected
                    </small>
                  </div>
                  {googleConnected ? (
                    <span className={styles.connectionCompleteLabel}>Connected</span>
                  ) : null}
                </section>
                <section data-status={slackConnected ? 'connected' : 'disconnected'}>
                  <span className={styles.onboardingProviderIcon} aria-hidden="true">
                    {slackConnected ? (
                      <Check size={15} weight="bold" />
                    ) : (
                      <PlugsConnected size={18} />
                    )}
                  </span>
                  <div>
                    <strong>Slack</strong>
                    <span>Browser approval only - no API key or plugin</span>
                    <small>{slackConnected ? 'Connected' : 'Included in guided setup'}</small>
                  </div>
                  {slackConnected ? (
                    <span className={styles.connectionCompleteLabel}>Connected</span>
                  ) : null}
                </section>
              </div>
            ) : null}

            {error ? (
              <div className={styles.dialogError} role="alert">
                <WarningCircle size={16} aria-hidden="true" />
                {error}
              </div>
            ) : null}

            <div className={styles.connectionOnboardingActions}>
              {needsRecovery ? (
                <button type="button" className={styles.primaryButton} onClick={onOpenSettings}>
                  Review connection
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : googleConnected && slackConnected ? (
                <button type="button" className={styles.primaryButton} onClick={onDone}>
                  Continue to Sia
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : chooserOpen ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={pending || setupActive}
                  onClick={() => setChooserOpen(false)}
                >
                  Back
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={pending || setupActive}
                    onClick={() => void connect()}
                  >
                    {pending || setupActive ? (
                      <CircleNotch className={styles.spin} size={16} aria-hidden="true" />
                    ) : (
                      <ArrowRight size={16} aria-hidden="true" />
                    )}
                    {setupActive
                      ? 'Finish approvals in browser'
                      : pending
                        ? 'Opening browser...'
                        : 'Connect work apps'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={pending || setupActive}
                    aria-expanded={false}
                    onClick={() => setChooserOpen(true)}
                  >
                    Choose apps
                  </button>
                </>
              )}
              <button type="button" className={styles.textButton} onClick={onDone}>
                Set up later
              </button>
            </div>
            {chooserOpen && !needsRecovery && !allConnected ? (
              <ConnectionAppChooser
                apps={apps}
                selected={selected}
                busy={pending || setupActive}
                disabled={needsRecovery}
                onChange={setSelected}
                onConnect={() => void connectSelected()}
              />
            ) : null}
            <p className={styles.connectionOnboardingFootnote}>
              One Sia click starts the sequence. Google and Slack still show their own secure
              approval screens; Sia verifies each approval before opening the next.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
