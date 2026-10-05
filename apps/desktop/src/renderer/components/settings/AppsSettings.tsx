import {
  Browser,
  ChatCircleText,
  ChatsCircle,
  CheckCircle,
  CircleNotch,
  GithubLogo,
  GoogleLogo,
  MicrosoftOutlookLogo,
  NotionLogo,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { useConfirmDialog } from '../ConfirmDialog';
import type { AppConnection, RendererSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import settings from './SettingsShared.module.css';
import primitives from '../../styles/primitives.module.css';
import styles from './AppsSettings.module.css';
import { ConnectionChecklist } from '../ConnectionChecklist';
import { BrowserWindowPicker } from '../BrowserWindowPicker';
import { CloudAccountSettings } from './CloudAccountSettings';
import { InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import { errorMessage } from '../../plainErrors';
import { isGoogleConnection, isLocalConnection } from '../../../shared/bridge/connections';

export function AppsSettings({
  snapshot,
  onConnectSelected,
  onConnectGoogle,
  onUpgradeGoogle = async () => undefined,
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
  onConnectSelected(apps: ('google' | 'slack')[]): Promise<void>;
  onConnectGoogle(): Promise<void>;
  onUpgradeGoogle?(): Promise<void>;
  onConnect(app: AppConnection['id']): Promise<void>;
  onSetEnabled?(app: AppConnection['id'], enabled: boolean): Promise<void>;
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
  const [confirm, confirmDialog] = useConfirmDialog();
  const googleApps = snapshot.apps.filter(({ id }) => isGoogleConnection(id));
  const slack = snapshot.apps.find(({ id }) => id === 'slack');
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
  const googleError = googleApps.find(({ status }) => status === 'error');
  const googleGrant = googleConnected ? googleApps[0] : undefined;
  const googleAccess = googleApps.some(({ googleAccess }) => googleAccess === 'read_write')
    ? 'read_write'
    : 'read_only';
  const googleUpgrading = googleApps.some(({ upgrading }) => upgrading);
  const slackConnected = slack?.status === 'connected';
  const setupActive = snapshot.apps.some(
    ({ id, status }) => !isLocalConnection(id) && status === 'connecting',
  );
  const connectorsEnabled = snapshot.cloudAuth.features?.connectors !== false;
  const accountReady = snapshot.cloudAuth.state === 'signed-in';
  const cloudReady = accountReady && connectorsEnabled;
  // Once both apps are connected, the checklist only repeats the rows below, so it steps aside.
  const allConnected = googleConnected && slackConnected;
  const connectorAvailability = !connectorsEnabled
    ? 'Not enabled for this account'
    : !accountReady
      ? 'Sign in to connect'
      : allConnected
        ? 'All connected'
        : 'Available for this account';
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
        title="Connections"
        description="Connect apps, your browser, and this Mac here. Google Workspace and Slack need Sia cloud."
      >
        <div className={settings.cloudLocalSummary}>
          <div className={settings.cloudIdentityHeader}>
            <div>
              <strong>Cloud connections unavailable</strong>
              <p>This build does not have a Sia cloud service configured.</p>
            </div>
          </div>
          <div className={settings.cloudUnavailable} role="status">
            Google Workspace and Slack will appear after cloud service is configured.
          </div>
        </div>
        {confirmDialog}
        <InlineSettingsError message={error} />
        <MacConnectedApps
          snapshot={snapshot}
          pending={pending}
          disabled={false}
          run={run}
          confirm={confirm}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
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
      title="Connections"
      description="Every connection is optional. Connect the apps you want help with: your mail, calendar, files, notes, code, and messages. Google starts read-only."
    >
      {confirmDialog}
      {snapshot.cloudAuth.state !== 'signed-in' ? (
        <CloudAccountSettings
          cloudAuth={snapshot.cloudAuth}
          onStartCloudSignIn={onStartCloudSignIn}
          onCompleteCloudSignIn={onCompleteCloudSignIn}
          onBeginAdminMfa={onBeginAdminMfa}
          onCompleteAdminMfa={onCompleteAdminMfa}
          onSignOutCloud={onSignOutCloud}
          onDeleteCloudAccount={onDeleteCloudAccount}
        />
      ) : null}
      {!connectorsEnabled ? (
        <div className={settings.inlineWarning} role="status">
          Work app connections are not enabled for this account yet. Existing connections can
          still be disconnected.
        </div>
      ) : null}
      <InlineSettingsError message={error} />
      <div className={styles.connectionSetup}>
        <div className={styles.connectionSetupIntro}>
          <div className={styles.connectionSetupHeader}>
            <strong>Work apps</strong>
            <span className={styles.connectionSetupProgress} role="status">
              {connectorAvailability}
            </span>
          </div>
          <p>
            {allConnected
              ? 'Both are connected. Choose which Google services your agents can use below.'
              : 'Connect only what you need. Your workspace administrator may need to approve either connection.'}
          </p>
        </div>
        {allConnected ? null : (
          <ConnectionChecklist
            snapshot={snapshot}
            pending={Boolean(pending)}
            connect={(apps) =>
              run(
                'connect-selected',
                () => onConnectSelected(apps),
                'The selected apps could not be connected.',
              )
            }
            cancel={(app, grant) =>
              run(
                'cancel-setup',
                () => onDisconnect(app, grant),
                'Connection setup could not be cancelled.',
              )
            }
          />
        )}
        {googleConnected ||
        googleError ||
        googleNeedsUpgrade ||
        slackConnected ||
        slack?.status === 'error' ? (
          <div className={styles.connectionGroups}>
            {googleConnected || googleError || googleNeedsUpgrade ? (
              <section className={styles.connectionGroup} data-connected={googleConnected}>
                <span className={styles.connectionGroupIcon} aria-hidden="true">
                  <GoogleLogo size={20} weight="bold" />
                </span>
                <div className={styles.connectionGroupBody}>
                  <strong>Google Workspace</strong>
                  <span>
                    {googleError
                      ? googleError.description
                      : 'Gmail, Calendar, Drive, Docs, Sheets, Slides, and Tasks'}
                  </span>
                  <span className={styles.connectionGroupStatus}>
                    {googleConnected ? <CheckCircle size={13} aria-hidden="true" /> : null}
                    {googleConnected
                      ? googleUpgrading
                        ? 'Read access stays on. Finish editor approval in your browser'
                        : googleAccess === 'read_write'
                          ? 'Editing enabled'
                          : 'Read-only access'
                      : googleError
                        ? 'Needs attention'
                        : 'Older connections found — upgrade with one approval'}
                  </span>
                </div>
                {!googleConnected ? (
                  <button
                    type="button"
                    className={buttons.primaryButton}
                    disabled={Boolean(pending) || !cloudReady || setupActive}
                    onClick={() =>
                      run(
                        'connect-google',
                        googleError ? () => onConnect(googleError.id) : onConnectGoogle,
                        'Google Workspace could not be connected.',
                      )
                    }
                  >
                    {pending === 'connect-google' || setupActive ? (
                      <CircleNotch className={primitives.spin} size={16} aria-hidden="true" />
                    ) : (
                      <GoogleLogo size={16} weight="bold" aria-hidden="true" />
                    )}
                    {setupActive
                      ? 'Finish in browser'
                      : pending === 'connect-google'
                        ? 'Opening…'
                        : googleError
                          ? `Reconnect ${appName(googleError.id)}`
                          : 'Upgrade Google'}
                  </button>
                ) : (
                  <div className={styles.connectionGroupActions}>
                    {googleAccess === 'read_only' ? (
                      <button
                        type="button"
                        className={`${buttons.secondaryButton} ${styles.connectionAction}`}
                        disabled={Boolean(pending) || !cloudReady || googleUpgrading}
                        onClick={() =>
                          run(
                            'upgrade-google',
                            onUpgradeGoogle,
                            'Google editing and sending could not be enabled.',
                          )
                        }
                      >
                        {googleUpgrading
                          ? 'Finish in browser'
                          : pending === 'upgrade-google'
                            ? 'Opening…'
                            : 'Enable editing'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${buttons.textButtonDanger} ${styles.connectionAction}`}
                      disabled={Boolean(pending) || !accountReady || googleUpgrading}
                      aria-label="Disconnect Google Workspace"
                      onClick={() =>
                        confirm({
                          title: 'Disconnect Google?',
                          description:
                            'Sia won’t be able to read or send from Google until you connect again.',
                          confirmLabel: 'Disconnect',
                          onConfirm: () =>
                            run(
                              'disconnect-google',
                              () => onDisconnect(googleGrant!.id, googleGrant!.connectionId),
                              'Google Workspace could not be disconnected.',
                            ),
                        })
                      }
                    >
                      {pending === 'disconnect-google'
                        ? 'Disconnecting…'
                        : 'Disconnect Google Workspace'}
                    </button>
                  </div>
                )}
              </section>
            ) : null}
            {slack && (slackConnected || slack.status === 'error') ? (
              <section className={styles.connectionGroup} data-connected={slackConnected}>
                <span className={styles.connectionGroupIcon} aria-hidden="true">
                  <ChatsCircle size={20} />
                </span>
                <div className={styles.connectionGroupBody}>
                  <strong>Slack</strong>
                  <span>Messages and channels in the workspace you approved</span>
                  <span className={styles.connectionGroupStatus}>
                    {slackConnected ? <CheckCircle size={13} aria-hidden="true" /> : null}
                    {slackConnected ? 'Connected' : 'One secure Slack approval'}
                  </span>
                </div>
                {!slackConnected ? (
                  <button
                    type="button"
                    className={buttons.primaryButton}
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
                      <CircleNotch className={primitives.spin} size={16} aria-hidden="true" />
                    ) : (
                      <ChatsCircle size={16} aria-hidden="true" />
                    )}
                    {setupActive
                      ? 'Finish in browser'
                      : pending === 'connect-slack'
                        ? 'Opening…'
                        : 'Reconnect Slack'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={buttons.textButtonDanger}
                    disabled={Boolean(pending) || !accountReady}
                    aria-label="Disconnect Slack"
                    onClick={() =>
                      confirm({
                        title: 'Disconnect Slack?',
                        description:
                          'Sia won’t be able to read or post in Slack until you connect again.',
                        confirmLabel: 'Disconnect',
                        onConfirm: () =>
                          run(
                            'disconnect-slack',
                            () => onDisconnect('slack', slack.connectionId),
                            'Slack could not be disconnected.',
                          ),
                      })
                    }
                  >
                    {pending === 'disconnect-slack' ? 'Disconnecting…' : 'Disconnect Slack'}
                  </button>
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
      {googleConnected ? (
        <div className={styles.googleServiceAccess} aria-label="Google Workspace services">
          <div>
            <strong>Available to agents</strong>
            <span>Turn Google services on or off without changing the connection.</span>
          </div>
          <div className={styles.googleServiceToggles}>
            {googleApps.map((app) => {
              const enabled = app.enabled !== false;
              return (
                <button
                  key={app.id}
                  type="button"
                  className={styles.googleServiceToggle}
                  data-enabled={enabled}
                  aria-pressed={enabled}
                  aria-label={`${enabled ? 'Disable' : 'Enable'} ${app.name}`}
                  disabled={Boolean(pending) || !accountReady}
                  onClick={() =>
                    run(
                      `set-enabled-${app.id}`,
                      () => onSetEnabled(app.id, !enabled),
                      `${appName(app.id)} access could not be changed.`,
                    )
                  }
                >
                  <span>{app.name}</span>
                  <small>
                    {pending === `set-enabled-${app.id}` ? 'Updating' : enabled ? 'On' : 'Off'}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <MacConnectedApps
        snapshot={snapshot}
        pending={pending}
        disabled={!accountReady}
        run={run}
        confirm={confirm}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
      {googleNeedsUpgrade ? (
        <div className={styles.legacyConnectionCleanup}>
          <strong>Older Google grants</strong>
          <p>Remove these individually, or upgrade to one Workspace approval.</p>
          {googleApps
            .filter(({ status }) => status !== 'disconnected')
            .map((app) => (
              <LegacyGrantRow
                key={app.id}
                app={app}
                pending={pending === `disconnect-${app.id}`}
                disabled={Boolean(pending) || !accountReady}
                onDisconnect={() =>
                  confirm({
                    title: `Disconnect ${appName(app.id)}?`,
                    description: `Sia won’t be able to use ${appName(app.id)} until you connect again.`,
                    confirmLabel: 'Disconnect',
                    onConfirm: () =>
                      run(
                        `disconnect-${app.id}`,
                        () => onDisconnect(app.id, app.connectionId),
                        `${appName(app.id)} could not be disconnected.`,
                      ),
                  })
                }
              />
            ))}
        </div>
      ) : null}
      <div className={settings.settingsNote}>
        You can disconnect any app without affecting core Sia features. Account approval opens
        in your browser. You control which account and workspace Sia can use.
      </div>
      <details className={settings.settingsDisclosure}>
        <summary>
          <span>Other ways to connect</span>
          <small>Chrome and Messages on this Mac</small>
        </summary>
        <div className={settings.settingsDisclosureBody}>
          <LocalIntegrations
            snapshot={snapshot}
            pending={pending}
            run={run}
            onAttachBrowser={onAttachBrowser}
            onDetachBrowser={onDetachBrowser}
            onOpenMessages={onOpenMessages}
            onReviewComputerAccess={onReviewComputerAccess}
          />
        </div>
      </details>
      {snapshot.cloudAuth.state === 'signed-in' ? (
        <details className={settings.settingsDisclosure}>
          <summary>
            <span>Account</span>
            <small>{snapshot.cloudAuth.email ?? 'Signed in'}</small>
          </summary>
          <div className={settings.settingsDisclosureBody}>
            <CloudAccountSettings
              cloudAuth={snapshot.cloudAuth}
              onStartCloudSignIn={onStartCloudSignIn}
              onCompleteCloudSignIn={onCompleteCloudSignIn}
              onBeginAdminMfa={onBeginAdminMfa}
              onCompleteAdminMfa={onCompleteAdminMfa}
              onSignOutCloud={onSignOutCloud}
              onDeleteCloudAccount={onDeleteCloudAccount}
            />
          </div>
        </details>
      ) : null}
    </SettingsSectionHeader>
  );
}

function LegacyGrantRow({
  app,
  pending,
  disabled,
  onDisconnect,
}: {
  app: AppConnection;
  pending: boolean;
  disabled: boolean;
  onDisconnect(): void;
}) {
  return (
    <div className={styles.legacyConnectionRow}>
      <span>{app.name}</span>
      <span>{app.account ?? 'Older grant'}</span>
      <button
        type="button"
        className={buttons.textButtonDanger}
        disabled={disabled}
        onClick={onDisconnect}
        aria-label={`Disconnect legacy ${appName(app.id)}`}
      >
        {pending ? 'Disconnecting…' : 'Disconnect'}
      </button>
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
    <div className={settings.integrationSubsection}>
      <header>
        <strong>On this Mac</strong>
        <p>Use accounts already signed in on this Mac without copying passwords or cookies.</p>
      </header>
      <div className={settings.settingsList}>
        <div className={settings.settingsRow}>
          <span className={styles.appGlyph} data-app="chrome">
            <Browser size={20} aria-hidden="true" />
          </span>
          <div className={settings.settingsRowBody}>
            <div className={settings.rowTitleLine}>
              <strong>Signed-in Chrome</strong>
              <span
                className={`${settings.stateLabel} ${
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
              snapshot.browser.attached ? buttons.textButtonDanger : buttons.secondaryButton
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
              ? 'Updating…'
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
        <div className={settings.settingsRow}>
          <span className={styles.appGlyph} data-app="messages">
            <ChatCircleText size={20} aria-hidden="true" />
          </span>
          <div className={settings.settingsRowBody}>
            <div className={settings.rowTitleLine}>
              <strong>Messages</strong>
              <span className={`${settings.stateLabel} ${styles.connection_disconnected}`}>
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
            className={buttons.secondaryButton}
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
            {messagesBusy ? 'Opening…' : computerReady ? 'Open Messages' : 'Open & set up'}
          </button>
        </div>
      </div>
    </div>
  );
}

const appName = (id: AppConnection['id']) =>
  ({
    gmail: 'Gmail',
    calendar: 'Google Calendar',
    drive: 'Google Drive',
    docs: 'Google Docs',
    sheets: 'Google Sheets',
    slides: 'Google Slides',
    tasks: 'Google Tasks',
    slack: 'Slack',
    outlook: 'Outlook',
    notion: 'Notion',
    github: 'GitHub',
  })[id];

const MAC_APPS = [
  {
    id: 'outlook',
    icon: MicrosoftOutlookLogo,
    detail: 'Read, search, draft, send, and organize Outlook mail',
    signIn: 'Sign in with Microsoft in your browser',
  },
  {
    id: 'notion',
    icon: NotionLogo,
    detail: 'Search, read, and add to the pages you choose to share',
    signIn: 'Choose which pages to share in your browser',
  },
  {
    id: 'github',
    icon: GithubLogo,
    detail: 'Repositories, files, issues, and pull requests',
    signIn: 'Approve with a short code on GitHub',
  },
] as const;

/** Outlook, Notion, and GitHub sign in from this Mac; their sign-in stays on this Mac. */
function MacConnectedApps({
  snapshot,
  pending,
  disabled,
  run,
  confirm,
  onConnect,
  onDisconnect,
}: {
  snapshot: RendererSnapshot;
  pending: string | undefined;
  disabled: boolean;
  run(key: string, action: () => Promise<void>, fallback: string): Promise<void>;
  confirm: ReturnType<typeof useConfirmDialog>[0];
  onConnect(app: AppConnection['id']): Promise<void>;
  onDisconnect(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
}) {
  return (
    <div className={styles.moreApps}>
      <div className={styles.moreAppsHeader}>
        <strong>More apps</strong>
        <p>These sign in from this Mac. Sia keeps their sign-in in your Mac’s Keychain.</p>
      </div>
      <div className={styles.connectionGroups}>
        {MAC_APPS.map(({ id, icon: Icon, detail, signIn }) => {
          const app = snapshot.apps.find((candidate) => candidate.id === id);
          if (!app) return null;
          const name = appName(id);
          const connected = app.status === 'connected';
          const connecting = app.status === 'connecting';
          const available = app.available !== false;
          const busy = pending === `connect-${id}` || pending === `disconnect-${id}`;
          return (
            <section key={id} className={styles.connectionGroup} data-connected={connected}>
              <span className={styles.connectionGroupIcon} aria-hidden="true">
                <Icon size={20} />
              </span>
              <div className={styles.connectionGroupBody}>
                <strong>{name}</strong>
                <span>{app.status === 'error' ? app.description : detail}</span>
                <span className={styles.connectionGroupStatus}>
                  {connected ? <CheckCircle size={13} aria-hidden="true" /> : null}
                  {connected
                    ? (app.account ?? 'Connected')
                    : connecting
                      ? app.userCode
                        ? 'Enter this code on GitHub'
                        : 'Finish signing in in your browser'
                      : app.status === 'error'
                        ? 'Needs attention'
                        : available
                          ? signIn
                          : 'Not available in this version yet'}
                </span>
                {connecting && app.userCode ? (
                  <code
                    className={styles.deviceCode}
                    aria-label={`GitHub code ${app.userCode}`}
                  >
                    {app.userCode}
                  </code>
                ) : null}
              </div>
              {connected ? (
                <button
                  type="button"
                  className={buttons.textButtonDanger}
                  disabled={Boolean(pending) || disabled}
                  aria-label={`Disconnect ${name}`}
                  onClick={() =>
                    confirm({
                      title: `Disconnect ${name}?`,
                      description: `Sia won’t be able to use ${name} until you connect again. This removes the sign-in saved on this Mac.`,
                      confirmLabel: 'Disconnect',
                      onConfirm: () =>
                        run(
                          `disconnect-${id}`,
                          () => onDisconnect(id, app.connectionId),
                          `${name} could not be disconnected.`,
                        ),
                    })
                  }
                >
                  {pending === `disconnect-${id}` ? 'Disconnecting…' : 'Disconnect'}
                </button>
              ) : connecting ? (
                <button
                  type="button"
                  className={buttons.secondaryButton}
                  disabled={busy}
                  onClick={() =>
                    run(
                      `disconnect-${id}`,
                      () => onDisconnect(id),
                      'Sign-in could not be cancelled.',
                    )
                  }
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className={buttons.primaryButton}
                  disabled={Boolean(pending) || disabled || !available}
                  onClick={() =>
                    run(`connect-${id}`, () => onConnect(id), `${name} could not be connected.`)
                  }
                >
                  {pending === `connect-${id}` ? (
                    <CircleNotch className={primitives.spin} size={16} aria-hidden="true" />
                  ) : (
                    <Icon size={16} aria-hidden="true" />
                  )}
                  {pending === `connect-${id}`
                    ? 'Opening…'
                    : app.status === 'error'
                      ? `Reconnect ${name}`
                      : `Connect ${name}`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
