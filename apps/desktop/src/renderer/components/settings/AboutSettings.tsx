import { ArrowClockwise, DownloadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { SettingsSectionHeader } from './SettingsShared';

export function AboutSettings({
  updates,
  onOpenFeedback,
  onCheckForUpdates,
  onOpenUpdateDownload,
}: {
  updates: RendererSnapshot['updates'];
  onOpenFeedback?: (() => void) | undefined;
  onCheckForUpdates(): Promise<void>;
  onOpenUpdateDownload(): Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <SettingsSectionHeader
      title="About Sia"
      description="Version information and desktop updates."
    >
      <div className={styles.settingsList}>
        <div className={styles.settingsRow}>
          <div className={styles.providerGlyph} aria-hidden="true">
            <ArrowClockwise size={18} />
          </div>
          <div className={styles.settingsRowBody}>
            <div className={styles.rowTitleLine}>
              <strong>Desktop app</strong>
              <span className={styles.stateLabel}>v{updates.currentVersion}</span>
            </div>
            <p>{updates.detail}</p>
            {updates.latestVersion ? (
              <div className={styles.rowMeta}>Latest release: {updates.latestVersion}</div>
            ) : null}
          </div>
          {updates.status === 'available' ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void onOpenUpdateDownload()}
            >
              <DownloadSimple size={15} aria-hidden="true" />
              Download
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={updates.status === 'unconfigured' || pending}
              onClick={() => {
                setPending(true);
                void onCheckForUpdates().finally(() => setPending(false));
              }}
            >
              {pending ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </div>
      </div>
      {onOpenFeedback ? (
        <button type="button" className={styles.textButton} onClick={onOpenFeedback}>
          Send feedback
        </button>
      ) : null}
    </SettingsSectionHeader>
  );
}
