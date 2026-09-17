import { ComputerAccessMode } from './ComputerAccessMode';
import { automationApps, automationStatusLabel } from '../../shared/mac-permissions';
import type { ReactNode } from 'react';
import { ConnectionChecklist } from './ConnectionChecklist';
import { dictationReady } from '../voiceReadiness';
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
  const googleReady = google.length > 0 && google.every((app) => app.status === 'connected');
  const connecting = snapshot.apps.some((app) => app.status === 'connecting');
  return (
    <>
      <ConnectionChecklist
        snapshot={snapshot}
        pending={pending}
        connect={(apps) => run(() => api.connectSelectedApps(apps))}
        cancel={(app, grant) => run(() => api.disconnectApp(app, grant))}
      />
      {googleReady && google.some((app) => app.googleAccess !== 'read_write') ? (
        <button
          className={styles.link}
          disabled={pending || connecting}
          onClick={() => void run(() => api.upgradeGoogleApps())}
        >
          Allow Google edits and sends too
        </button>
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

interface AccessItem {
  label: string;
  ready: boolean;
  available: boolean;
  optional: boolean;
  detail: string;
}

export function accessChecklist(snapshot: RendererSnapshot): AccessItem[] {
  const ptt = snapshot.voice.pushToTalk;
  const browserReady =
    snapshot.browser.attached && snapshot.browser.tabs.some((tab) => tab.granted);
  const core: AccessItem[] = [
    {
      label: 'Mac apps',
      available: true,
      optional: false,
      ready:
        snapshot.computer.accessibility === 'allowed' &&
        snapshot.computer.screenRecording === 'allowed',
      detail: 'Accessibility and Screen Recording',
    },
    {
      label: 'Fn dictation',
      ready: dictationReady(snapshot.voice),
      available: Boolean(ptt?.available) && snapshot.voice.dictationAvailable !== false,
      optional: false,
      detail:
        snapshot.voice.dictationDetail ?? 'Speech Recognition, microphone, and shortcut access',
    },
    {
      available: true,
      optional: false,
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
      available: Boolean(
        snapshot.computer.messagesAccess && snapshot.computer.messagesAccess !== 'unavailable',
      ),
      optional: false,
      ready: snapshot.computer.messagesAccess === 'ready',
      detail: 'Full Disk Access',
    },
  ];
  return [
    ...core,
    ...automationApps.map(({ id, name }) => ({
      label: `${name} automation`,
      available: snapshot.computer.automation?.[id] !== 'unavailable',
      optional: false,
      ready: snapshot.computer.automation?.[id] === 'ready',
      detail: automationStatusLabel[snapshot.computer.automation?.[id] ?? 'needs_permission'],
    })),
    ...(snapshot.computer.accessMode === 'mac' && snapshot.computer.trust === 'auto'
      ? [
          {
            label: 'Full bypass',
            ready: true,
            available: true,
            optional: false,
            detail: 'Task actions run without per-action approval.',
          },
        ]
      : []),
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
        available: true,
        optional: true,
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
      available: true,
      optional: true,
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
                : !item.available
                  ? 'Unavailable'
                  : item.optional
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
