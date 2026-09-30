import {
  ArrowClockwise,
  ChatCircleText,
  CheckCircle,
  DownloadSimple,
} from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import styles from '../../ui.module.css';
import { SettingsSectionHeader } from './SettingsShared';

type Updates = RendererSnapshot['updates'];

/**
 * What the update row says, in plain words. Errors keep the main process's detail, which already
 * names the fix (for example, signing in); the other states describe themselves.
 */
function updateSummary(updates: Updates): string {
  switch (updates.status) {
    case 'unconfigured':
      return 'This test build doesn’t check for updates on its own. The Sia team sends new builds when they’re ready.';
    case 'idle':
      return 'Check any time. Sia never updates without asking you first.';
    case 'checking':
      return 'Looking for a newer version…';
    case 'current':
      return 'You’re on the latest version.';
    case 'available':
      return updates.latestVersion
        ? `Sia ${updates.latestVersion} is ready to download.`
        : 'A newer version is ready to download.';
    case 'error':
      return updates.detail;
  }
}

export function AboutSettings({
  updates,
  onOpenFeedback,
  onCheckForUpdates,
  onOpenUpdateDownload,
}: {
  updates: Updates;
  onOpenFeedback?: (() => void) | undefined;
  onCheckForUpdates(): Promise<void>;
  onOpenUpdateDownload(): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const checking = pending || updates.status === 'checking';

  return (
    <SettingsSectionHeader
      title="About Sia"
      description="Your version of Sia, updates, and a quick way to tell us what you think."
    >
      <div className={styles.settingsList}>
        <div className={styles.settingsRow}>
          <div
            className={styles.providerGlyph}
            data-ready={updates.status === 'current'}
            aria-hidden="true"
          >
            {updates.status === 'current' ? (
              <CheckCircle size={18} />
            ) : (
              <ArrowClockwise size={18} className={checking ? styles.spin : undefined} />
            )}
          </div>
          <div className={styles.settingsRowBody}>
            <div className={styles.rowTitleLine}>
              <strong>Sia for Mac</strong>
              <span className={styles.stateLabel}>Version {updates.currentVersion}</span>
            </div>
            <p role="status" aria-live="polite">
              {updateSummary(updates)}
            </p>
          </div>
          {updates.status === 'available' ? (
            <button
              type="button"
              className={buttons.primaryButton}
              onClick={() => void onOpenUpdateDownload()}
            >
              <DownloadSimple size={15} aria-hidden="true" />
              Download
            </button>
          ) : updates.status === 'unconfigured' ? null : (
            <button
              type="button"
              className={buttons.secondaryButton}
              disabled={checking}
              onClick={() => {
                setPending(true);
                void onCheckForUpdates().finally(() => setPending(false));
              }}
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
          )}
        </div>
        {onOpenFeedback ? (
          <div className={styles.settingsRow}>
            <div className={styles.providerGlyph} aria-hidden="true">
              <ChatCircleText size={18} />
            </div>
            <div className={styles.settingsRowBody}>
              <div className={styles.rowTitleLine}>
                <strong>Feedback</strong>
              </div>
              <p>Something confusing, broken, or delightful? We read every note.</p>
            </div>
            <button type="button" className={buttons.secondaryButton} onClick={onOpenFeedback}>
              Send feedback
            </button>
          </div>
        ) : null}
      </div>
    </SettingsSectionHeader>
  );
}
