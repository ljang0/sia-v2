import { ComputerAccessMode } from './ComputerAccessMode';
import { automationApps, automationStatusLabel } from '../../shared/mac-permissions';
import { useState, type ReactNode } from 'react';
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
  const [selected, setSelected] = useState({ google: true, slack: true });
  const google = snapshot.apps.filter(({ id }) => id !== 'slack');
  const googleReady =
    google.length > 0 && google.every((app) => app.status === 'connected' && app.enabled);
  const slackReady = snapshot.apps.some(
    (app) => app.id === 'slack' && app.status === 'connected' && app.enabled,
  );
  const cloudReady =
    snapshot.cloudAuth.state === 'signed-in' &&
    snapshot.cloudAuth.features?.connectors !== false;
  const connecting = snapshot.apps.some((app) => app.status === 'connecting');
  const choices = [
    {
      id: 'google' as const,
      name: 'Google Workspace',
      detail: 'Gmail, Drive, Docs, Sheets, and Slides. One Google sign-in for read access.',
      ready: googleReady,
    },
    {
      id: 'slack' as const,
      name: 'Slack',
      detail: 'Search conversations and help with messages in your workspace.',
      ready: slackReady,
    },
  ];
  const missing = choices.filter((app) => selected[app.id] && !app.ready).map((app) => app.id);
  return (
    <>
      <fieldset className={styles.connectorChecklist} disabled={pending || connecting}>
        <legend>Choose your connections</legend>
        <p className={styles.note}>
          Connections are optional and selected to start. Uncheck anything you do not use, then
          connect once. Each provider still asks you to approve its account access.
        </p>
        {choices.map(({ id, name, detail, ready }) => (
          <label className={styles.permission} key={id}>
            <input
              type="checkbox"
              checked={selected[id]}
              disabled={ready || !cloudReady}
              onChange={(event) => setSelected({ ...selected, [id]: event.target.checked })}
            />
            <span className={styles.connectorDescription}>
              <strong>{name}</strong>
              <span>{detail}</span>
            </span>
            <span className={ready ? styles.ready : styles.status}>
              {ready ? 'Connected' : cloudReady ? 'Not connected' : 'Unavailable in this build'}
            </span>
          </label>
        ))}
        <button
          className={ui.primaryButton}
          disabled={!cloudReady || !missing.length}
          onClick={() => void run(() => api.connectSelectedApps(missing))}
        >
          {connecting ? 'Finish account approval…' : 'Connect selected apps'}
        </button>
      </fieldset>
      {googleReady && google.some((app) => app.googleAccess !== 'read_write') ? (
        <button
          className={styles.link}
          disabled={pending || connecting}
          onClick={() => void run(() => api.upgradeGoogleApps())}
        >
          Allow Google edits and sends too
        </button>
      ) : null}
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
          Finish sign-in in the browser. Sia connects the selected accounts in order and updates
          this checklist as each approval finishes.
        </p>
      ) : null}
      {snapshot.apps.some((app) => app.status === 'error') ? (
        <p className={styles.error} role="alert">
          An account connection did not finish. Review its status in Settings → Connections
          before retrying. Connected accounts are kept.
        </p>
      ) : null}
      <p className={styles.note}>Manage existing connections in Settings → Connections.</p>
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
    {
      label: 'Messages history',
      ready: snapshot.computer.messagesAccess === 'ready',
      detail: 'Full Disk Access',
    },
  ];
  if (snapshot.computer.accessMode === 'mac' && snapshot.computer.trust === 'auto') {
    return [
      ...core,
      ...automationApps.map(({ id, name }) => ({
        label: `${name} automation`,
        ready: ['ready', 'unavailable'].includes(
          snapshot.computer.automation?.[id] ?? 'needs_permission',
        ),
        detail: automationStatusLabel[snapshot.computer.automation?.[id] ?? 'needs_permission'],
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
