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
import { ConnectionAppChooser } from './ConnectionAppChooser';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

export function AppsSettings({
  snapshot,
  onConnectAll,
  onConnect,
  onConnectSelected = async (apps) => {
    for (const app of apps) await onConnect(app);
  },
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
  onConnectAll(): Promise<void>;
  onConnect(app: AppConnection['id']): Promise<void>;
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
  const [chooserOpen, setChooserOpen] = useState(false);
  const [selected, setSelected] = useState(
    () => new Set<AppConnection['id']>(snapshot.apps.map(({ id }) => id)),
  );
  const connectedCount = snapshot.apps.filter(({ status }) => status === 'connected').length;
  const googleApps = snapshot.apps.filter(({ id }) => id !== 'slack');
  const slack = snapshot.apps.find(({ id }) => id === 'slack');
  const googleConnectedCount = googleApps.filter(({ status }) => status === 'connected').length;
  const googleConnected = googleConnectedCount === googleApps.length;
  const slackConnected = slack?.status === 'connected';
  const allConnected = connectedCount === snapshot.apps.length;
  const setupActive = snapshot.apps.some(({ status }) => status === 'connecting');
  const connectionNeedsRecovery = snapshot.apps.some(({ status }) => status === 'error');
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
      description="Connect once, then Sia can search, draft, post, upload, and share without interrupting an autonomous run."
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
      <div className={styles.connectionSetup}>
        <div className={styles.connectionSetupIntro}>
          <div className={styles.connectionSetupHeader}>
            <strong>Bring your tools into Sia</strong>
            <span className={styles.connectionSetupProgress}>
              {connectedCount} of {snapshot.apps.length} ready
            </span>
          </div>
          <p>
            One click starts Google Workspace and Slack in order. Each provider still shows its
            own secure approval page, and nothing is bulk copied into Sia.
          </p>
        </div>
        {!chooserOpen ? (
          <div className={styles.connectionGroups}>
            <section className={styles.connectionGroup} data-connected={googleConnected}>
              <span className={styles.connectionGroupIcon} aria-hidden="true">
                <GoogleLogo size={20} weight="bold" />
              </span>
              <div className={styles.connectionGroupBody}>
                <strong>Google Workspace</strong>
                <span>Gmail, Drive, Docs, Sheets, and Slides</span>
                <span className={styles.connectionGroupStatus}>
                  {googleConnectedCount} of {googleApps.length} connected
                </span>
              </div>
            </section>
            {slack ? (
              <section className={styles.connectionGroup} data-connected={slackConnected}>
                <span className={styles.connectionGroupIcon} aria-hidden="true">
                  <PlugsConnected size={20} />
                </span>
                <div className={styles.connectionGroupBody}>
                  <strong>Slack</strong>
                  <span>Browser approval only - no API key or plugin</span>
                  <span className={styles.connectionGroupStatus}>
                    {slackConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        {!allConnected ? (
          <div className={styles.connectionOnboardingActions}>
            {chooserOpen ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={Boolean(pending) || setupActive}
                onClick={() => setChooserOpen(false)}
              >
                Back
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    pending === 'connect-all' ||
                    !cloudReady ||
                    setupActive ||
                    connectionNeedsRecovery
                  }
                  title={
                    !cloudReady
                      ? 'Sign in to Sia cloud first'
                      : connectionNeedsRecovery
                        ? 'Review the app connection that needs attention first'
                        : undefined
                  }
                  onClick={() =>
                    run('connect-all', onConnectAll, 'Work apps could not be connected.')
                  }
                >
                  {pending === 'connect-all' || setupActive ? (
                    <CircleNotch className={styles.spin} size={16} aria-hidden="true" />
                  ) : (
                    <PlugsConnected size={16} aria-hidden="true" />
                  )}
                  {setupActive
                    ? 'Finish approvals in browser'
                    : pending === 'connect-all'
                      ? 'Opening browser...'
                      : 'Connect work apps'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={
                    Boolean(pending) || !cloudReady || setupActive || connectionNeedsRecovery
                  }
                  aria-expanded={false}
                  onClick={() => setChooserOpen(true)}
                >
                  Choose apps
                </button>
              </>
            )}
          </div>
        ) : null}
        {chooserOpen && !allConnected ? (
          <ConnectionAppChooser
            apps={snapshot.apps}
            selected={selected}
            busy={pending === 'connect-selected' || setupActive}
            disabled={!cloudReady || connectionNeedsRecovery}
            onChange={setSelected}
            onConnect={() => {
              const apps = snapshot.apps
                .filter(({ id, status }) => selected.has(id) && status !== 'connected')
                .map(({ id }) => id);
              void run(
                'connect-selected',
                () => onConnectSelected(apps),
                'The selected apps could not be connected.',
              );
            }}
          />
        ) : null}
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
        OAuth opens in your browser. Sia never places connector keys or account tokens in the
        renderer.
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

function AppRow({
  app,
  cloudState,
  setupActive,
  pending,
  onConnect,
  onDisconnect,
}: {
  app: AppConnection;
  cloudState: RendererSnapshot['cloudAuth']['state'];
  setupActive: boolean;
  pending?: string | undefined;
  onConnect(): void;
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
  const busy = pending === `connect-${app.id}` || pending === `disconnect-${app.id}`;
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
          <span className={`${styles.stateLabel} ${styles[`connection_${app.status}`]}`}>
            {app.status === 'connected'
              ? 'Connected'
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
      {app.status === 'connected' || app.status === 'connecting' || app.status === 'error' ? (
        <button
          type="button"
          className={
            app.status === 'connecting' ? styles.secondaryButton : styles.textButtonDanger
          }
          disabled={busy || !cloudReady}
          title={!cloudReady ? disabledReason : undefined}
          onClick={onDisconnect}
          aria-label={`${app.status === 'connecting' ? 'Cancel setup for' : 'Disconnect'} ${appName(app.id)}`}
        >
          {busy
            ? 'Disconnecting...'
            : app.status === 'connecting'
              ? 'Cancel setup'
              : app.status === 'error'
                ? 'Disconnect saved grant'
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
