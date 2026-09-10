import { ComputerAccessMode } from './ComputerAccessMode';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import { automationApps, automationStatusLabel } from '../../shared/mac-permissions';
import type { ReactNode } from 'react';
import type { RendererApi, RendererSnapshot } from '../types';
import { BrowserWindowPicker } from './BrowserWindowPicker';
import ui from '../ui.module.css';
import styles from './Onboarding.module.css';

type SetupProps = {
  snapshot: RendererSnapshot;
  api: RendererApi;
  pending: boolean;
  run(action: () => Promise<unknown>): Promise<void>;
};

export function SetupConnections({ snapshot, api, pending, run }: SetupProps) {
  const google = snapshot.apps.filter(({ id }) => id !== 'slack');
  const googleReady =
    google.length > 0 && google.every((app) => app.status === 'connected' && app.enabled);
  const slack = snapshot.apps.find(({ id }) => id === 'slack');
  const cloudReady =
    snapshot.cloudAuth.state === 'signed-in' &&
    snapshot.cloudAuth.features?.connectors !== false;
  const connecting = snapshot.apps.some((app) => app.status === 'connecting');
  const enableGoogle = async () => {
    if (google.every((app) => app.status === 'connected')) {
      for (const app of google.filter((app) => !app.enabled))
        await api.setAppEnabled(app.id, true);
    } else await api.connectGoogleApps();
  };
  return (
    <>
      <ComputerAccessMode
        computer={snapshot.computer}
        disabled={pending}
        change={(mode) => void run(() => api.setComputerAccessMode(mode))}
      />
      <MacAutomationPermissions
        permissions={snapshot.computer.automation}
        request={(app) => api.requestAutomationPermission(app)}
        refresh={() => api.refreshComputerPermissions()}
        disabled={pending}
      />
      <SetupRow
        title="Google Workspace"
        detail="Gmail, Drive, Docs, Sheets, and Slides. Sign in once to connect your Google account."
      >
        <button
          className={ui.secondaryButton}
          disabled={pending || connecting || !cloudReady || googleReady}
          onClick={() => void run(enableGoogle)}
        >
          {googleReady ? 'Connected' : connecting ? 'Finish sign-in' : 'Connect Google'}
        </button>
      </SetupRow>
      {googleReady && google.some((app) => app.googleAccess !== 'read_write') ? (
        <button
          className={styles.link}
          disabled={pending || connecting}
          onClick={() => void run(() => api.upgradeGoogleApps())}
        >
          Allow Google edits and sends too
        </button>
      ) : null}
      <SetupRow
        title="Slack"
        detail="Connect your workspace so Sia can search conversations and help with messages."
      >
        <button
          className={ui.secondaryButton}
          disabled={
            pending ||
            connecting ||
            !cloudReady ||
            (slack?.status === 'connected' && slack.enabled)
          }
          onClick={() =>
            void run(() =>
              slack?.status === 'connected'
                ? api.setAppEnabled('slack', true)
                : api.connectApp('slack'),
            )
          }
        >
          {slack?.status === 'connected' && slack.enabled ? 'Connected' : 'Connect Slack'}
        </button>
      </SetupRow>
      {!cloudReady ? (
        <p className={styles.note} role="status">
          Direct Google and Slack connections are unavailable{' '}
          {snapshot.cloudAuth.state === 'unconfigured'
            ? 'in this local build'
            : 'until your Sia account has connector access'}
          . You can use their websites through your signed-in browser with Use my Mac.
        </p>
      ) : null}
      {connecting ? (
        <p className={styles.note} role="status">
          Finish sign-in in the browser, then return here. This page updates when the connection
          is confirmed.
        </p>
      ) : null}
      {snapshot.apps.some((app) => app.status === 'error') ? (
        <p className={styles.error} role="alert">
          An app connection needs another sign-in. Retry its Connect button.
        </p>
      ) : null}
      <SetupRow
        title="Apple Messages"
        detail="For searching message history, allow Sia Full Disk Access in Privacy & Security. Enable the switch yourself, then return here. Sia will restart next."
      >
        <button
          className={ui.secondaryButton}
          disabled={pending || snapshot.computer.messagesAccess === 'unavailable'}
          onClick={() =>
            void run(() =>
              snapshot.computer.messagesAccess === 'ready'
                ? api.openMessages()
                : api.setupMessages(),
            )
          }
        >
          {snapshot.computer.messagesAccess === 'ready' ? 'Open Messages' : 'Set up Messages'}
        </button>
      </SetupRow>
      <p className={styles.note}>
        Messages history:{' '}
        {snapshot.computer.messagesAccess === 'ready'
          ? 'Available'
          : snapshot.computer.messagesAccess === 'unavailable'
            ? 'Unavailable on this device'
            : 'Needs Full Disk Access'}
        . Opening Messages also lets you check that you are signed in.
      </p>
      <SetupRow
        title="Optional Chrome connection"
        detail="After restarting Sia, choose your Chrome window and open the sites you want help with. Keep that window open and signed in."
      >
        <span className={styles.status}>Next, after restart</span>
      </SetupRow>
      <p className={styles.note}>
        You can continue without an account you do not use. We will list any missing access
        before you finish.
      </p>
    </>
  );
}

const sites = [
  ['Gmail', 'https://mail.google.com'],
  ['Drive', 'https://drive.google.com'],
  ['Docs', 'https://docs.google.com/document/'],
  ['Sheets', 'https://docs.google.com/spreadsheets/'],
  ['Slides', 'https://docs.google.com/presentation/'],
  ['Slack', 'https://app.slack.com'],
] as const;

export function SetupBrowser({ snapshot, api, pending, run }: SetupProps) {
  if (snapshot.computer.accessMode === 'mac')
    return (
      <>
        <ComputerAccessMode
          computer={snapshot.computer}
          disabled={pending}
          change={(mode) => void run(() => api.setComputerAccessMode(mode))}
        />
        <SetupRow
          title="Use your existing browser"
          detail="Keep the website you want help with open in Safari or your supported browser. Sia will discover its window when you ask; no Chrome attachment is needed."
        >
          <button
            className={ui.secondaryButton}
            disabled={pending}
            onClick={() => void run(() => api.refreshComputerPermissions())}
          >
            Recheck Mac permissions
          </button>
        </SetupRow>
        <p className={styles.note}>
          Accessibility: {snapshot.computer.accessibility}. Screen Recording:{' '}
          {snapshot.computer.screenRecording}. Website sign-in is checked when a task runs. You
          can add structured Chrome access later in Settings → Computer.
        </p>
      </>
    );
  return (
    <>
      <SetupRow
        title="Connect your Chrome window"
        detail="Open a regular Chrome window with the account you want Sia to use. Choose it below, and accept Chrome’s Allow remote debugging prompt if shown."
      >
        <button
          className={ui.secondaryButton}
          disabled={pending}
          onClick={() => void run(() => api.attachBrowser())}
        >
          {snapshot.browser.attached ? 'Choose another window' : 'Choose Chrome window'}
        </button>
      </SetupRow>
      {!snapshot.browser.attached && snapshot.browser.availableWindows.length ? (
        <BrowserWindowPicker
          windows={snapshot.browser.availableWindows}
          pending={pending}
          onSelect={(windowId) => void run(() => api.attachBrowser(windowId))}
        />
      ) : null}
      {snapshot.browser.snapshotLabel ? (
        <p className={styles.note} role="status">
          {snapshot.browser.snapshotLabel}
        </p>
      ) : null}
      {snapshot.browser.attached ? (
        <>
          <p className={styles.ready} role="status">
            Connected to {snapshot.browser.profileName}
          </p>
          <p className={styles.note}>
            Open the sites you want Sia to use. Each button opens the site in your chosen Chrome
            window and grants its origin. Sign in yourself if needed.
          </p>
          <div className={styles.siteButtons}>
            {sites.map(([label, url]) => (
              <button
                key={label}
                className={ui.secondaryButton}
                disabled={pending}
                onClick={() => void run(() => api.openBrowserSite(url))}
              >
                Open {label}
              </button>
            ))}
          </div>
          <p className={styles.note}>
            A connection confirms access to the window, not that every website is signed in.
            Check your inbox is visible before asking Sia to summarize it.
          </p>
        </>
      ) : (
        <p className={styles.note}>
          If Chrome requests a restart, finish that first, reopen your signed-in window, then
          choose it again. Sia cannot accept Chrome’s security prompt for you.
        </p>
      )}
      <button
        className={styles.link}
        disabled={pending}
        onClick={() => void run(() => api.refreshComputerPermissions())}
      >
        Recheck Mac permissions
      </button>
    </>
  );
}

function SetupRow({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.permission}>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {children}
    </div>
  );
}

export function accessChecklist(snapshot: RendererSnapshot) {
  const ptt = snapshot.voice.pushToTalk;
  const browserReady =
    snapshot.browser.attached && snapshot.browser.tabs.some((tab) => tab.granted);
  const core = [
    {
      label: 'Mac apps',
      ready:
        snapshot.computer.accessibility === 'allowed' &&
        snapshot.computer.screenRecording === 'allowed',
      detail: 'Accessibility and Screen Recording',
    },
    {
      label: 'Fn dictation',
      ready:
        snapshot.voice.status === 'connected' &&
        snapshot.voice.dictationAvailable !== false &&
        Boolean(ptt?.enabled && ptt.accessibility && ptt.microphone),
      detail: 'Voice, microphone, and shortcut access',
    },
    {
      label:
        snapshot.computer.accessMode === 'mac' ? 'Browser window access' : 'Chrome websites',
      ready:
        snapshot.computer.accessMode === 'mac'
          ? snapshot.computer.accessibility === 'allowed' &&
            snapshot.computer.screenRecording === 'allowed'
          : browserReady,
      detail:
        snapshot.computer.accessMode === 'mac'
          ? 'Mac permissions granted; website sign-in is checked during the task'
          : 'A live window with a granted website',
    },
  ];
  if (snapshot.computer.accessMode === 'mac' && snapshot.computer.trust === 'auto') {
    return [
      ...core,
      ...automationApps
        .filter(({ id }) => ['system_events', 'safari', 'chrome'].includes(id))
        .map(({ id, name }) => ({
          label: `${name} automation`,
          ready: ['ready', 'unavailable'].includes(
            snapshot.computer.automation?.[id] ?? 'needs_permission',
          ),
          detail:
            automationStatusLabel[snapshot.computer.automation?.[id] ?? 'needs_permission'],
        })),
      {
        label: 'Full bypass',
        ready: true,
        detail: 'Task actions run without per-action approval. No service connections needed.',
      },
    ];
  }
  return [
    ...core,
    {
      label: 'Messages history',
      ready: snapshot.computer.messagesAccess === 'ready',
      detail: 'Full Disk Access',
    },
    ...automationApps.map(({ id, name }) => ({
      label: `${name} automation`,
      ready: snapshot.computer.automation?.[id] === 'ready',
      detail: automationStatusLabel[snapshot.computer.automation?.[id] ?? 'needs_permission'],
    })),
    ...snapshot.apps.map((app) => {
      const direct = app.status === 'connected' && app.enabled;
      const origin = {
        gmail: 'https://mail.google.com',
        drive: 'https://drive.google.com',
        docs: 'https://docs.google.com',
        sheets: 'https://docs.google.com',
        slides: 'https://docs.google.com',
        slack: 'https://app.slack.com',
      }[app.id];
      const browser =
        snapshot.browser.attached &&
        snapshot.browser.tabs.some((tab) => tab.granted && tab.origin === origin);
      return {
        label: app.name,
        ready: direct || browser,
        detail: direct
          ? 'Direct connection'
          : browser
            ? 'Chrome access; check website sign-in'
            : app.status === 'connected'
              ? 'Direct connection is turned off'
              : snapshot.computer.accessMode === 'mac'
                ? 'Optional direct connection; the signed-in website can be used through your Mac'
                : 'Connect directly or open its site in Chrome',
      };
    }),
  ];
}

export function SetupAccessReview({ snapshot }: { snapshot: RendererSnapshot }) {
  const checklist = accessChecklist(snapshot);
  const google = checklist.filter((item) =>
    snapshot.apps.some((app) => app.id !== 'slack' && app.name === item.label),
  );
  const rows = checklist.filter((item) => !google.includes(item));
  if (google.length)
    rows.splice(4, 0, {
      label: 'Google Workspace',
      ready: google.every((item) => item.ready),
      detail: `${google.filter((item) => item.ready).length} of ${google.length} ready · Gmail, Drive, Docs, Sheets, Slides`,
    });
  return (
    <aside className={styles.accessReview} aria-label="Access checklist">
      <span className={styles.eyebrow}>YOUR SETUP AT A GLANCE</span>
      <h2>Know what’s ready.</h2>
      <ul>
        {rows.map((item) => (
          <li key={item.label}>
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </div>
            <span className={item.ready ? styles.ready : styles.status}>
              {item.ready
                ? 'Ready'
                : snapshot.computer.accessMode === 'mac' &&
                    (item.label === 'Google Workspace' ||
                      snapshot.apps.some((app) => app.name === item.label))
                  ? 'Optional'
                  : 'Needs setup'}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Mac permissions let Sia work in supported apps. Window grants and action confirmations
        still apply. Passwords and security prompts remain yours to handle.
      </p>
    </aside>
  );
}
