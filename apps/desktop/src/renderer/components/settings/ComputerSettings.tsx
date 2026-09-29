import { ComputerAccessMode } from '../ComputerAccessMode';
import { useConfirmDialog } from '../ConfirmDialog';
import { SetupMacAccess, type MacSetupApi } from '../SetupMacAccess';
import { Notebook, ShieldCheck } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

export function ComputerSettings({
  snapshot,
  onReviewConnections,
  macSetupApi,
  onSetComputerAccessMode,
  onSetComputerTrust,
  onSetTrajectoryLog,
  onRevealTrajectories,
}: {
  snapshot: RendererSnapshot;
  onReviewConnections(): void;
  macSetupApi: MacSetupApi;
  onSetComputerAccessMode?(
    mode: 'mac' | 'connected',
    background?: boolean,
    backgroundFallback?: 'pause' | 'foreground',
  ): Promise<void>;
  onSetComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  onSetTrajectoryLog(enabled: boolean): Promise<void>;
  onRevealTrajectories(): Promise<void>;
}) {
  const [pending, setPending] = useState<'computer' | 'trust' | 'log'>();
  const trusted = snapshot.computer.trust === 'auto';
  const [error, setError] = useState<string>();
  const [settingUp, setSettingUp] = useState(false);
  const [confirm, confirmDialog] = useConfirmDialog();
  const busy = Boolean(pending) || settingUp;

  const run = async (kind: 'computer' | 'trust' | 'log', action: () => Promise<void>) => {
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, 'Computer access could not be updated.'));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <SettingsSectionHeader
      title="Computer access"
      description="Choose where Sia works and whether actions need your confirmation."
    >
      <InlineSettingsError message={error} />
      {onSetComputerAccessMode ? (
        <ComputerAccessMode
          computer={snapshot.computer}
          disabled={busy}
          showBackgroundOption
          change={(mode, background, backgroundFallback) =>
            void run('computer', () =>
              onSetComputerAccessMode(mode, background, backgroundFallback),
            )
          }
        />
      ) : null}
      <div className={styles.accessGroup}>
        <div className={styles.accessRow}>
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <div className={styles.rowTitleLine}>
              <strong>Bypass action approvals</strong>
              {trusted ? <span className={styles.stateLabel}>Enabled</span> : null}
            </div>
            <p>
              {trusted
                ? 'On — Sia can click, type, send, post, upload, and schedule without asking for each action.'
                : 'Off — changes pause for confirmation. Searches, reads, and verification continue automatically.'}{' '}
              {snapshot.computer.accessMode === 'mac'
                ? snapshot.computer.backgroundControl
                  ? 'Your foreground recovery choice still applies.'
                  : 'Native commands have full local access. macOS permissions still apply.'
                : 'macOS permissions and protected fields still apply.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trusted}
            aria-label="Bypass action approvals"
            className={styles.secondaryButton}
            disabled={busy}
            onClick={() =>
              trusted
                ? void run('trust', () => onSetComputerTrust('ask'))
                : confirm({
                    title: 'Let Sia act without asking?',
                    description:
                      'Sia will click, type, send messages, post, upload, and schedule without showing you each action first. Mistakes can reach other people before you see them. You can turn this off at any time.',
                    confirmLabel: 'Act without asking',
                    cancelLabel: 'Keep asking me',
                    onConfirm: () => run('trust', () => onSetComputerTrust('auto')),
                  })
            }
            data-testid="computer-trust-toggle"
          >
            {pending === 'trust' ? 'Saving…' : trusted ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      </div>
      {confirmDialog}
      <SetupMacAccess
        snapshot={snapshot}
        api={macSetupApi}
        agentId={
          snapshot.selectedAgentId ??
          snapshot.voice.pushToTalk?.agentId ??
          snapshot.agents[0]?.id
        }
        disabled={Boolean(pending)}
        onBusyChange={setSettingUp}
        includeApps
      />
      {snapshot.computer.accessMode !== 'mac' && (
        <p className={styles.settingsNote}>
          Browser and work app connections are in{' '}
          <button type="button" className={styles.textButton} onClick={onReviewConnections}>
            Connections
          </button>
          .
        </p>
      )}
      <details className={styles.settingsDisclosure}>
        <summary>
          <span>Diagnostics</span> · Local log {snapshot.computer.trajectoryLog ? 'on' : 'off'}
        </summary>
        <div className={styles.accessGroup}>
          <div className={styles.accessRow}>
            <Notebook size={20} aria-hidden="true" />
            <div>
              <strong>Keep a full local log</strong>
              <p>
                {snapshot.computer.trajectoryLog
                  ? 'Eligible requests, replies, actions, approvals, and screenshots are saved on this Mac, per thread, for up to 90 days or 128 MB. Google Workspace connector turns are excluded.'
                  : 'Off — nothing beyond the thread transcript is kept.'}
                {snapshot.computer.trajectoryDirectory ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => void onRevealTrajectories()}
                    >
                      Show in Finder
                    </button>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={snapshot.computer.trajectoryLog}
              aria-label="Keep a full local log"
              className={styles.secondaryButton}
              disabled={busy}
              onClick={() =>
                void run('log', () => onSetTrajectoryLog(!snapshot.computer.trajectoryLog))
              }
              data-testid="trajectory-log-toggle"
            >
              {pending === 'log'
                ? 'Saving…'
                : snapshot.computer.trajectoryLog
                  ? 'Turn off'
                  : 'Turn on'}
            </button>
          </div>
        </div>
      </details>
    </SettingsSectionHeader>
  );
}
