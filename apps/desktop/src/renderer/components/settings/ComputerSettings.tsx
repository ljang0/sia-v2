import { Browser, Desktop } from '@phosphor-icons/react';
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
}: {
  snapshot: RendererSnapshot;
  onAttachBrowser(windowId?: number): Promise<void>;
  onOpenBrowserSite(url: string): Promise<void>;
  onDetachBrowser(): Promise<void>;
  onRequestPermissions(): Promise<void>;
}) {
  const [pending, setPending] = useState<'computer' | 'browser' | 'site'>();
  const [error, setError] = useState<string>();
  const [site, setSite] = useState('');
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';

  const run = async (kind: 'computer' | 'browser' | 'site', action: () => Promise<void>) => {
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
      description="Access lists origins granted through the current Chrome attachment, which you can revoke by detaching. macOS permissions remain managed in System Settings; this alpha does not show a complete window inventory."
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
                ? `Attached to ${snapshot.browser.profileName}. Only granted origins are available.`
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
      <div className={styles.settingsNote}>
        Foreground input always pauses for approval. Sia restores your previous app after the
        action.
      </div>
    </SettingsSectionHeader>
  );
}
