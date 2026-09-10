import { ComputerAccessMode } from '../ComputerAccessMode';
import { MacAutomationPermissions } from '../MacAutomationPermissions';
import type { AutomationApp } from '../../../shared/mac-permissions';
import { Browser, Desktop, Notebook, ShieldCheck } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { BrowserWindowPicker } from '../BrowserWindowPicker';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

export function ComputerSettings({
  snapshot,
  onAttachBrowser,
  onOpenBrowserSite,
  onDetachBrowser,
  onRequestPermissions,
  onRequestAutomation,
  onRefreshPermissions,
  onSetComputerAccessMode,
  onSetComputerTrust,
  onSetTrajectoryLog,
  onRevealTrajectories,
}: {
  snapshot: RendererSnapshot;
  onAttachBrowser(windowId?: number): Promise<void>;
  onOpenBrowserSite(url: string): Promise<void>;
  onDetachBrowser(): Promise<void>;
  onRequestPermissions(): Promise<void>;
  onRequestAutomation?(app: AutomationApp): Promise<void>;
  onRefreshPermissions?(): Promise<void>;
  onSetComputerAccessMode?(mode: 'mac' | 'connected'): Promise<void>;
  onSetComputerTrust(trust: 'auto' | 'ask'): Promise<void>;
  onSetTrajectoryLog(enabled: boolean): Promise<void>;
  onRevealTrajectories(): Promise<void>;
}) {
  const [pending, setPending] = useState<'computer' | 'browser' | 'site' | 'trust' | 'log'>();
  const trusted = snapshot.computer.trust === 'auto';
  const [error, setError] = useState<string>();
  const [site, setSite] = useState('');
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';

  const run = async (
    kind: 'computer' | 'browser' | 'site' | 'trust' | 'log',
    action: () => Promise<void>,
  ) => {
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

  const openSite = (event: FormEvent) => {
    event.preventDefault();
    const url = site.trim();
    if (!url) return;
    void run('site', async () => {
      await onOpenBrowserSite(url);
      setSite('');
    });
  };

  return (
    <SettingsSectionHeader
      title="Computer access"
      description="Grant only what a task needs. Changes ask for confirmation by default, and every computer action stays reviewable."
    >
      <InlineSettingsError message={error} />
      {onSetComputerAccessMode ? (
        <ComputerAccessMode
          computer={snapshot.computer}
          disabled={Boolean(pending)}
          change={(mode) => void run('computer', () => onSetComputerAccessMode(mode))}
        />
      ) : null}
      {onRequestAutomation && onRefreshPermissions ? (
        <MacAutomationPermissions
          permissions={snapshot.computer.automation}
          request={onRequestAutomation}
          refresh={onRefreshPermissions}
          disabled={Boolean(pending)}
        />
      ) : null}
      {!snapshot.browser.attached &&
      snapshot.browser.status === 'error' &&
      snapshot.browser.snapshotLabel ? (
        <InlineSettingsError message={snapshot.browser.snapshotLabel} />
      ) : null}
      <div className={styles.accessGroup}>
        <div className={styles.accessRow}>
          <Desktop size={20} aria-hidden="true" />
          <div>
            <strong>Mac computer use</strong>
            <p>
              Accessibility: {snapshot.computer.accessibility}. Screen Recording:{' '}
              {snapshot.computer.screenRecording}.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() => void run('computer', onRequestPermissions)}
          >
            {pending === 'computer' ? 'Opening...' : computerReady ? 'Review access' : 'Set up'}
          </button>
        </div>
        <div className={styles.accessRow}>
          <Browser size={20} aria-hidden="true" />
          <div>
            <strong>
              Authenticated Chrome{snapshot.computer.accessMode === 'mac' ? ' (optional)' : ''}
            </strong>
            <p>
              {snapshot.browser.attached
                ? `Attached to ${snapshot.browser.profileName}.${trusted ? ' Any site in this window is available.' : ' Only granted origins are available.'}`
                : trusted
                  ? snapshot.computer.chromeConnection === 'enabled'
                    ? 'Choose a window to finish setup. Chrome may ask you once to Allow remote debugging; that browser security step cannot be skipped.'
                    : 'Choose a window to finish setup. If Sia just enabled Chrome access, restart Chrome once before connecting.'
                  : 'Choose a signed-in Chrome window; approve Chrome once if it asks. That browser security step cannot be skipped.'}
            </p>
          </div>
          <button
            type="button"
            className={
              snapshot.browser.attached ? styles.textButtonDanger : styles.secondaryButton
            }
            disabled={Boolean(pending)}
            onClick={() =>
              void run(
                'browser',
                snapshot.browser.attached ? onDetachBrowser : () => onAttachBrowser(),
              )
            }
          >
            {pending === 'browser'
              ? snapshot.browser.attached
                ? 'Detaching...'
                : 'Attaching...'
              : snapshot.browser.attached
                ? 'Detach'
                : snapshot.browser.availableWindows.length
                  ? 'Refresh'
                  : 'Choose window'}
          </button>
        </div>
        {!snapshot.browser.attached && snapshot.browser.availableWindows.length ? (
          <div className={styles.browserSettingsPicker}>
            <div>
              <strong>Choose a Chrome window</strong>
              <p>Only the selected window will be available to Sia.</p>
            </div>
            <BrowserWindowPicker
              windows={snapshot.browser.availableWindows}
              pending={pending === 'browser'}
              onSelect={(windowId) => void run('browser', () => onAttachBrowser(windowId))}
            />
          </div>
        ) : null}
        {snapshot.browser.attached ? (
          <form className={styles.browserOpenSite} onSubmit={openSite}>
            <div>
              <strong>Open a site in this profile</strong>
              <p>The site opens in the attached signed-in Chrome and grants only its origin.</p>
            </div>
            <input
              value={site}
              onChange={(event) => setSite(event.target.value)}
              placeholder="mail.google.com"
              aria-label="Website address"
              autoComplete="off"
              spellCheck={false}
              disabled={Boolean(pending)}
              data-testid="browser-open-site-input"
            />
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={Boolean(pending) || !site.trim()}
              data-testid="browser-open-site"
            >
              {pending === 'site' ? 'Opening…' : 'Open'}
            </button>
          </form>
        ) : null}
      </div>
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
                ? 'Native commands run with full local access. macOS permissions still apply; complete sign-ins yourself. Changes to this setting apply to the next task.'
                : 'macOS permissions and protected fields still apply. Executable skills still ask for source review.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={trusted}
            aria-label="Bypass action approvals"
            className={styles.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() =>
              void run('trust', () => onSetComputerTrust(trusted ? 'ask' : 'auto'))
            }
            data-testid="computer-trust-toggle"
          >
            {pending === 'trust' ? 'Saving…' : trusted ? 'Turn off' : 'Turn on'}
          </button>
        </div>
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
            disabled={Boolean(pending)}
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
      <div className={styles.settingsNote}>
        Sia restores your previous app after each action. Sensitive surfaces (password fields,
        private windows, security prompts) are always off-limits, whichever mode is on.
      </div>
    </SettingsSectionHeader>
  );
}
