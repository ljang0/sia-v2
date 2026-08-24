import {
  ArrowSquareOut,
  Browser,
  ChatCircleText,
  CircleNotch,
  EnvelopeSimple,
  FileText,
  FolderSimple,
  GoogleLogo,
  PlugsConnected,
  Presentation,
  Table,
} from '@phosphor-icons/react';
import { useState } from 'react';
import type { AppConnection, RendererSnapshot } from '../../types';
import styles from '../../ui.module.css';
import { BrowserWindowPicker } from '../BrowserWindowPicker';
import { CloudAccountSettings } from './CloudAccountSettings';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

export function AppsSettings({
  snapshot,
  onConnectGoogle,
  onConnectAll,
  onConnect,
  onSetEnabled = async () => undefined,
  onDisconnect,
  onStartCloudSignIn,
  onCompleteCloudSignIn,
  onBeginAdminMfa = async () => {
    throw new Error('Authenticator setup is unavailable in this build.');
  },
  onCompleteAdminMfa = async () => {
    throw new Error('Authenticator setup is unavailable in this build.');
  },
  onSignOutCloud,
  onDeleteCloudAccount,
  onAttachBrowser = async () => undefined,
  onDetachBrowser = async () => undefined,
  onOpenMessages = async () => undefined,
  onReviewComputerAccess = () => undefined,
}: {
  snapshot: RendererSnapshot;
  onConnectGoogle?(): Promise<void>;
  /** Deprecated compatibility hook for pre-unified settings tests and embedders. */
  onConnectAll?(): Promise<void>;
  onConnect(app: AppConnection['id']): Promise<void>;
  onSetEnabled?(app: AppConnection['id'], enabled: boolean): Promise<void>;
  /** Deprecated: provider selection now happens through the Google and Slack buttons. */
  onConnectSelected?(apps: AppConnection['id'][]): Promise<void>;
  onDisconnect(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
  onStartCloudSignIn(email: string): Promise<void>;
  onCompleteCloudSignIn(code: string): Promise<void>;
  onBeginAdminMfa?(): Promise<{ secretCode: string }>;
  onCompleteAdminMfa?(code: string): Promise<void>;
  onSignOutCloud(): Promise<void>;
  onDeleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<void>;
  onAttachBrowser?(windowId?: number): Promise<void>;
  onDetachBrowser?(): Promise<void>;
  onOpenMessages?(): Promise<void>;
  onReviewComputerAccess?(): void;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const connectedCount = snapshot.apps.filter(
    ({ id, status, enabled }) =>
      status === 'connected' && (id === 'slack' || enabled !== false),
  ).length;
  const googleApps = snapshot.apps.filter(({ id }) => id !== 'slack');
  const slack = snapshot.apps.find(({ id }) => id === 'slack');
  const googleEnabledCount = googleApps.filter(
    ({ status, enabled }) => status === 'connected' && enabled !== false,
  ).length;
  const activeGoogleGrants = new Set(
    googleApps
      .filter(({ status, connectionId }) => status === 'connected' && Boolean(connectionId))
      .map(({ connectionId }) => connectionId!),
  );
  const googleConnected =
    activeGoogleGrants.size === 1 &&
    googleApps.every(
      ({ status, connectionId }) => status === 'connected' && Boolean(connectionId),
    );
  const googleNeedsUpgrade = activeGoogleGrants.size > 0 && !googleConnected;
  const googleGrant = googleConnected ? googleApps[0] : undefined;
  const slackConnected = slack?.status === 'connected';
  const setupActive = snapshot.apps.some(({ status }) => status === 'connecting');
  const connectorsEnabled = snapshot.cloudAuth.features?.connectors !== false;
  const cloudReady = snapshot.cloudAuth.state === 'signed-in' && connectorsEnabled;
  const run = async (key: string, action: () => Promise<void>, fallback: string) => {
    setPending(key);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, fallback));
    } finally {
      setPending(undefined);
    }
  };
  const connectGoogle = onConnectGoogle ?? onConnectAll ?? (async () => undefined);

  if (snapshot.cloudAuth.state === 'unconfigured') {
    return (
      <SettingsSectionHeader
        title="Connected apps"
        description="Optional cloud connections can be added later. They are not required for local work."
      >
        <div className={styles.cloudLocalSummary}>
          <div className={styles.cloudIdentityHeader}>
            <div>
              <strong>Local mode is ready</strong>
              <p>
                Codex, workspace files, signed-in Chrome, computer use, Git, terminals, and
                schedules work without a Sia account or cloud credits.
              </p>
            </div>
          </div>
          <div className={styles.cloudUnavailable} role="status">
            Gmail, Drive, Docs, Sheets, Slides, Slack, and cloud sync will appear here after a
            cloud service is configured.
          </div>
        </div>
        <LocalIntegrations
          snapshot={snapshot}
          pending={pending}
          run={run}
          onAttachBrowser={onAttachBrowser}
          onDetachBrowser={onDetachBrowser}
          onOpenMessages={onOpenMessages}
          onReviewComputerAccess={onReviewComputerAccess}
        />
      </SettingsSectionHeader>
    );
  }

  return (
    <SettingsSectionHeader
      title="Connected apps"
      description="Optional API connections make background work faster and more reliable. Chat, web search, schedules, and computer use work without them."
    >
      <CloudAccountSettings
        cloudAuth={snapshot.cloudAuth}
        onStartCloudSignIn={onStartCloudSignIn}
        onCompleteCloudSignIn={onCompleteCloudSignIn}
        onBeginAdminMfa={onBeginAdminMfa}
        onCompleteAdminMfa={onCompleteAdminMfa}
        onSignOutCloud={onSignOutCloud}
        onDeleteCloudAccount={onDeleteCloudAccount}
      />
      {!connectorsEnabled ? (
        <div className={styles.inlineWarning} role="status">
          Connected apps are paused by the alpha operator. Existing grants can still be
          disconnected.
        </div>
      ) : null}
      <LocalIntegrations
        snapshot={snapshot}
        pending={pending}
        run={run}
        onAttachBrowser={onAttachBrowser}
        onDetachBrowser={onDetachBrowser}
        onOpenMessages={onOpenMessages}
        onReviewComputerAccess={onReviewComputerAccess}
      />
      <div className={styles.connectionSetup}>
        <div className={styles.connectionSetupIntro}>
          <div className={styles.connectionSetupHeader}>
            <strong>Optional API connections</strong>
            <span className={styles.connectionSetupProgress}>
              {connectedCount} of {snapshot.apps.length} ready
            </span>
          </div>
          <p>
            Connect either provider or both. Google uses one account approval for Gmail, Drive,
            Docs, Sheets, and Slides. Slack uses one workspace approval. Nothing is bulk copied
            into Sia.
          </p>
        </div>
        <div className={styles.connectionGroups}>
          <section className={styles.connectionGroup} data-connected={googleConnected}>
            <span className={styles.connectionGroupIcon} aria-hidden="true">
              <GoogleLogo size={20} weight="bold" />
            </span>
            <div className={styles.connectionGroupBody}>
              <strong>Google Workspace</strong>
              <span>Gmail, Drive, Docs, Sheets, and Slides</span>
              <span className={styles.connectionGroupStatus}>
                {googleConnected
                  ? `${googleEnabledCount} of ${googleApps.length} services available`
                  : googleNeedsUpgrade
                    ? 'Older connections found - upgrade with one approval'
                    : 'One secure Google approval'}
              </span>
            </div>
            {!googleConnected ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={Boolean(pending) || !cloudReady || setupActive}
                onClick={() =>
                  run(
                    'connect-google',
                    connectGoogle,
                    'Google Workspace could not be connected.',
                  )
                }
              >
                {pending === 'connect-google' || setupActive ? (
                  <CircleNotch className={styles.spin} size={16} aria-hidden="true" />
                ) : (
                  <GoogleLogo size={16} weight="bold" aria-hidden="true" />
                )}
                {setupActive
                  ? 'Finish in browser'
                  : pending === 'connect-google'
                    ? 'Opening...'
                    : googleNeedsUpgrade
                      ? 'Upgrade Google'
                      : 'Connect Google'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.textButtonDanger}
                disabled={Boolean(pending) || !cloudReady}
                onClick={() =>
                  run(
                    'disconnect-google',
                    () => onDisconnect(googleGrant!.id, googleGrant!.connectionId),
                    'Google Workspace could not be disconnected.',
                  )
                }
              >
                {pending === 'disconnect-google' ? 'Disconnecting...' : 'Disconnect Google'}
              </button>
            )}
          </section>
          {slack ? (
            <section className={styles.connectionGroup} data-connected={slackConnected}>
              <span className={styles.connectionGroupIcon} aria-hidden="true">
                <PlugsConnected size={20} />
              </span>
              <div className={styles.connectionGroupBody}>
                <strong>Slack</strong>
                <span>Choose a workspace in your browser - no plugin or API key</span>
                <span className={styles.connectionGroupStatus}>
                  {slackConnected ? 'Connected' : 'One secure Slack approval'}
                </span>
              </div>
              {!slackConnected ? (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={Boolean(pending) || !cloudReady || setupActive}
                  onClick={() =>
                    run(
                      'connect-slack',
                      () => onConnect('slack'),
                      'Slack could not be connected.',
                    )
                  }
                >
                  {pending === 'connect-slack' || setupActive ? (
                    <CircleNotch className={styles.spin} size={16} aria-hidden="true" />
                  ) : (
                    <PlugsConnected size={16} aria-hidden="true" />
                  )}
                  {setupActive
                    ? 'Finish in browser'
                    : pending === 'connect-slack'
                      ? 'Opening...'
                      : 'Connect Slack'}
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
      <InlineSettingsError message={error} />
      <div className={styles.settingsList}>
        {snapshot.apps.map((app) => (
          <AppRow
            key={app.id}
            app={app}
            cloudState={snapshot.cloudAuth.state}
            setupActive={setupActive}
            pending={pending}
            onConnect={() =>
              run(
                `connect-${app.id}`,
                () => onConnect(app.id),
                `${appName(app.id)} could not be connected.`,
              )
            }
            onSetEnabled={(enabled) =>
              run(
                `set-enabled-${app.id}`,
                () => onSetEnabled(app.id, enabled),
                `${appName(app.id)} access could not be changed.`,
              )
            }
            onDisconnect={() =>
              run(
                `disconnect-${app.id}`,
                () => onDisconnect(app.id, app.connectionId),
                `${appName(app.id)} could not be disconnected.`,
              )
            }
          />
        ))}
      </div>
      <div className={styles.settingsNote}>
        You can disconnect any app without affecting core Sia features. OAuth opens in your
        browser, and Sia never places connector keys or account tokens in the renderer.
      </div>
    </SettingsSectionHeader>
  );
}

function AppRow({
  app,
  cloudState,
  setupActive,
  pending,
  onConnect,
  onSetEnabled,
  onDisconnect,
}: {
  app: AppConnection;
  cloudState: RendererSnapshot['cloudAuth']['state'];
  setupActive: boolean;
  pending?: string | undefined;
  onConnect(): void;
  onSetEnabled(enabled: boolean): void;
  onDisconnect(): void;
}) {
  const icons = {
    gmail: EnvelopeSimple,
    drive: FolderSimple,
    docs: FileText,
    sheets: Table,
    slides: Presentation,
    slack: PlugsConnected,
  };
  const Icon = icons[app.id];
  const appEnabled = app.enabled !== false;
  const busy =
    pending === `connect-${app.id}` ||
    pending === `disconnect-${app.id}` ||
    pending === `set-enabled-${app.id}`;
  const cloudReady = cloudState === 'signed-in';
  const disabledReason =
    cloudState === 'unconfigured'
      ? 'Cloud apps are unavailable in this build'
      : 'Sign in to Sia cloud first';
  return (
    <div className={styles.settingsRow}>
      <span className={styles.appGlyph} data-app={app.id}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className={styles.settingsRowBody}>
        <div className={styles.rowTitleLine}>
          <strong>{app.name}</strong>
          <span
            className={`${styles.stateLabel} ${
              app.status === 'connected' && !appEnabled
                ? styles.connection_disconnected
                : styles[`connection_${app.status}`]
            }`}
          >
            {app.status === 'connected'
              ? app.id !== 'slack' && !appEnabled
                ? 'Off'
                : 'Connected'
              : app.status === 'connecting'
                ? 'Connecting'
                : app.status === 'error'
                  ? 'Needs attention'
                  : 'Not connected'}
          </span>
        </div>
        <p>{app.description}</p>
        <div className={styles.permissionSummary}>{app.permissions.join('; ')}</div>
        {app.account ? <div className={styles.rowMeta}>{app.account}</div> : null}
      </div>
      {app.status === 'connected' && app.id !== 'slack' ? (
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy || !cloudReady}
          aria-pressed={appEnabled}
          aria-label={`${appEnabled ? 'Disable' : 'Enable'} ${appName(app.id)}`}
          onClick={() => onSetEnabled(!appEnabled)}
        >
          {busy ? 'Updating...' : appEnabled ? 'On' : 'Off'}
        </button>
      ) : app.status === 'connected' ||
        app.status === 'connecting' ||
        app.status === 'error' ? (
        <button
          type="button"
          className={
            app.status === 'error'
              ? styles.secondaryButton
              : app.status === 'connecting'
                ? styles.secondaryButton
                : styles.textButtonDanger
          }
          disabled={busy || !cloudReady}
          title={!cloudReady ? disabledReason : undefined}
          onClick={app.status === 'error' ? onConnect : onDisconnect}
          aria-label={`${app.status === 'error' ? 'Reconnect' : app.status === 'connecting' ? 'Cancel setup for' : 'Disconnect'} ${appName(app.id)}`}
        >
          {busy
            ? app.status === 'error'
              ? 'Reconnecting...'
              : 'Disconnecting...'
            : app.status === 'connecting'
              ? 'Cancel setup'
              : app.status === 'error'
                ? 'Reconnect'
                : 'Disconnect'}
        </button>
      ) : (
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy || setupActive || !cloudReady}
          title={!cloudReady ? disabledReason : undefined}
          onClick={onConnect}
          aria-label={`Connect ${appName(app.id)}`}
        >
          <ArrowSquareOut size={15} aria-hidden="true" />
          {busy ? 'Connecting...' : 'Connect'}
        </button>
      )}
    </div>
  );
}

function LocalIntegrations({
  snapshot,
  pending,
  run,
  onAttachBrowser,
  onDetachBrowser,
  onOpenMessages,
  onReviewComputerAccess,
}: {
  snapshot: RendererSnapshot;
  pending?: string | undefined;
  run(key: string, action: () => Promise<void>, fallback: string): Promise<void>;
  onAttachBrowser(windowId?: number): Promise<void>;
  onDetachBrowser(): Promise<void>;
  onOpenMessages(): Promise<void>;
  onReviewComputerAccess(): void;
}) {
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';
  const browserBusy = pending === 'local-chrome';
  const messagesBusy = pending === 'local-messages';

  return (
    <div className={styles.integrationSubsection}>
      <header>
        <strong>On this Mac</strong>
        <p>Use accounts already signed in on this Mac without copying passwords or cookies.</p>
      </header>
      <div className={styles.settingsList}>
        <div className={styles.settingsRow}>
          <span className={styles.appGlyph} data-app="chrome">
            <Browser size={20} aria-hidden="true" />
          </span>
          <div className={styles.settingsRowBody}>
            <div className={styles.rowTitleLine}>
              <strong>Signed-in Chrome</strong>
              <span
                className={`${styles.stateLabel} ${
                  snapshot.browser.attached
                    ? styles.connection_connected
                    : styles.connection_disconnected
                }`}
              >
                {snapshot.browser.attached
                  ? 'Attached'
                  : computerReady
                    ? 'Ready to choose'
                    : 'Needs Mac access'}
              </span>
            </div>
            <p>
              Reuses one window you explicitly choose. Sia never copies cookies or controls a
              sign-in page.
            </p>
            {snapshot.browser.attached ? (
              <div className={styles.rowMeta}>{snapshot.browser.profileName}</div>
            ) : null}
          </div>
          <button
            type="button"
            className={
              snapshot.browser.attached ? styles.textButtonDanger : styles.secondaryButton
            }
            disabled={browserBusy}
            onClick={() => {
              if (!computerReady) {
                onReviewComputerAccess();
                return;
              }
              void run(
                'local-chrome',
                snapshot.browser.attached ? onDetachBrowser : () => onAttachBrowser(),
                'Chrome could not be updated.',
              );
            }}
          >
            {browserBusy
              ? 'Updating...'
              : snapshot.browser.attached
                ? 'Detach'
                : computerReady
                  ? 'Choose window'
                  : 'Set up'}
          </button>
        </div>
        {!snapshot.browser.attached &&
        computerReady &&
        snapshot.browser.availableWindows.length ? (
          <div className={styles.browserSettingsPicker}>
            <div>
              <strong>Choose a Chrome window</strong>
              <p>Only the selected signed-in window becomes available to Sia.</p>
            </div>
            <BrowserWindowPicker
              windows={snapshot.browser.availableWindows}
              pending={browserBusy}
              onSelect={(windowId) =>
                void run(
                  'local-chrome',
                  () => onAttachBrowser(windowId),
                  'Chrome could not be attached.',
                )
              }
            />
          </div>
        ) : null}
        <div className={styles.settingsRow}>
          <span className={styles.appGlyph} data-app="messages">
            <ChatCircleText size={20} aria-hidden="true" />
          </span>
          <div className={styles.settingsRowBody}>
            <div className={styles.rowTitleLine}>
              <strong>Messages</strong>
              <span className={`${styles.stateLabel} ${styles.connection_disconnected}`}>
                Uses this Mac
              </span>
            </div>
            <p>
              Opens Apple Messages with its existing account. Sia does not copy message history;
              every computer action remains visible in the local activity log.
            </p>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={messagesBusy}
            onClick={() =>
              void run(
                'local-messages',
                async () => {
                  await onOpenMessages();
                  if (!computerReady) onReviewComputerAccess();
                },
                'Messages could not be opened.',
              )
            }
          >
            {messagesBusy ? 'Opening...' : computerReady ? 'Open Messages' : 'Open & set up'}
          </button>
        </div>
      </div>
    </div>
  );
}

const appName = (id: AppConnection['id']) =>
  ({
    gmail: 'Gmail',
    drive: 'Google Drive',
    docs: 'Google Docs',
    sheets: 'Google Sheets',
    slides: 'Google Slides',
    slack: 'Slack',
  })[id];
