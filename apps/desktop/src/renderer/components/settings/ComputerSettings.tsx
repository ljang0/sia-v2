import { ComputerAccessMode } from '../ComputerAccessMode';
import { useConfirmDialog } from '../ConfirmDialog';
import { SetupMacAccess, type MacSetupApi } from '../SetupMacAccess';
import { Notebook, ShieldCheck } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import type { RendererSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import settings from './SettingsShared.module.css';
import styles from './ComputerSettings.module.css';
import { InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import { errorMessage } from '../../plainErrors';

export function ComputerSettings({
  snapshot,
  onReviewConnections,
  macSetupApi,
  onSetComputerAccessMode,
  onSetComputerTrust,
  onSetTrajectoryLog,
  onRevealTrajectories,
  startup,
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
  /** Open at login, shown near the top because schedules depend on it. */
  startup?: ReactNode;
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
      <div className={settings.accessGroup}>
        <div className={styles.accessRow}>
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <div className={settings.rowTitleLine}>
              <strong>Act without asking</strong>
              {trusted ? <span className={settings.stateLabel}>Enabled</span> : null}
            </div>
            <p>
              {trusted
                ? 'On. Sia clicks, types, sends, posts, uploads, and schedules without asking you each time.'
                : 'Off. Sia asks you before it changes anything. Searching, reading, and checking its work never need a yes.'}{' '}
              {snapshot.computer.accessMode === 'mac'
                ? snapshot.computer.backgroundControl
                  ? 'Your foreground recovery choice still applies.'
                  : 'Commands Sia runs can reach everything on this Mac. Your Mac’s privacy permissions still apply.'
                : 'Your Mac’s privacy permissions still apply, and protected fields stay off-limits.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trusted}
            aria-label="Act without asking"
            className={buttons.secondaryButton}
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
      {startup}
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
        <p className={settings.settingsNote}>
          Browser and work app connections are in{' '}
          <button type="button" className={buttons.textButton} onClick={onReviewConnections}>
            Connections
          </button>
          .
        </p>
      )}
      <details className={settings.settingsDisclosure}>
        <summary>
          <span>Details for troubleshooting</span>
        </summary>
        <div className={settings.accessGroup}>
          <div className={styles.accessRow}>
            <Notebook size={20} aria-hidden="true" />
            <div>
              <strong>Keep a full local log</strong>
              <p>
                {snapshot.computer.trajectoryLog
                  ? 'Most requests, replies, actions, approvals, and screenshots are saved on this Mac for each conversation, for up to 90 days or 128 MB. Anything that uses Google Workspace is left out.'
                  : 'Off. Only the conversation itself is kept.'}
                {snapshot.computer.trajectoryDirectory ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className={buttons.textButton}
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
              className={buttons.secondaryButton}
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
