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
  onSetComputerTrust,
  onSetTrajectoryLog,
  onRevealTrajectories,
}: {
  snapshot: RendererSnapshot;
  onAttachBrowser(windowId?: number): Promise<void>;
  onOpenBrowserSite(url: string): Promise<void>;
  onDetachBrowser(): Promise<void>;
  onRequestPermissions(): Promise<void>;
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
      description="Sia can operate your Mac and your signed-in Chrome directly. By default it acts without stopping for approval and keeps a full local log of everything it did, so you can review any run afterwards."
    >
      <InlineSettingsError message={error} />
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
            <strong>Authenticated Chrome</strong>
            <p>
              {snapshot.browser.attached
                ? `Attached to ${snapshot.browser.profileName}.${trusted ? ' Any site in this window is available.' : ' Only granted origins are available.'}`
                : trusted
                  ? 'Sia attaches to your frontmost Chrome window on its own the first time it needs the browser, and enables Chrome\u2019s remote-debugging toggle (chrome://inspect) when Chrome is closed so no prompt appears. Choose a window here to pin a specific one.'
                  : 'Open the signed-in Chrome window you want. If several are open, Sia lets you choose one.'}
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
            <strong>Ask before every action</strong>
            <p>
              {trusted
                ? 'Off — computer and browser actions run immediately and are written to the log.'
                : 'On — each computer or browser action pauses for your approval first.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!trusted}
            aria-label="Ask before every action"
            className={styles.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() =>
              void run('trust', () => onSetComputerTrust(trusted ? 'ask' : 'auto'))
            }
            data-testid="computer-trust-toggle"
          >
            {pending === 'trust' ? 'Saving…' : trusted ? 'Turn on' : 'Turn off'}
          </button>
        </div>
        <div className={styles.accessRow}>
          <Notebook size={20} aria-hidden="true" />
          <div>
            <strong>Keep a full local log</strong>
            <p>
              {snapshot.computer.trajectoryLog
                ? 'Every request, reply, action, approval, and screenshot is saved on this Mac, per thread.'
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
