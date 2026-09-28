import { useState } from 'react';
import type { AppConnection, RendererSnapshot } from '../types';
import ui from '../ui.module.css';
import styles from './ConnectionChecklist.module.css';

export function ConnectionChecklist({
  snapshot,
  pending,
  connect,
  cancel,
}: {
  snapshot: RendererSnapshot;
  pending: boolean;
  connect(apps: ('google' | 'slack')[]): Promise<void>;
  cancel(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
}) {
  const [selected, setSelected] = useState({ google: true, slack: true });
  const connecting = snapshot.apps.find((app) => app.status === 'connecting');
  const cloudReady =
    snapshot.cloudAuth.state === 'signed-in' &&
    snapshot.cloudAuth.features?.connectors !== false;
  const unavailable =
    snapshot.cloudAuth.state === 'unconfigured'
      ? 'Unavailable in this build'
      : snapshot.cloudAuth.state !== 'signed-in'
        ? 'Sign in to connect'
        : 'Not enabled for this account';
  const choices = [
    {
      id: 'google' as const,
      name: 'Google Workspace',
      detail: 'Gmail, Drive, Docs, Sheets, and Slides. Read access.',
      apps: snapshot.apps.filter((app) => app.id !== 'slack'),
    },
    {
      id: 'slack' as const,
      name: 'Slack',
      detail: 'Search and work with your messages.',
      apps: snapshot.apps.filter((app) => app.id === 'slack'),
    },
  ].map((choice) => ({
    ...choice,
    ready: choice.apps.length > 0 && choice.apps.every((app) => app.status === 'connected'),
    connecting: choice.apps.some((app) => app.status === 'connecting'),
    needsRepair: choice.apps.some((app) => app.status === 'error' && app.connectionId),
  }));
  const missing = choices
    .filter((app) => selected[app.id] && !app.ready && !app.needsRepair)
    .map((app) => app.id);
  return (
    <div className={styles.checklist}>
      <fieldset disabled={pending || Boolean(connecting)}>
        <legend>Choose your connections</legend>
        <p className={styles.note}>Choose your accounts, then approve each sign-in.</p>
        {choices.map(({ id, name, detail, ready, connecting: approving, needsRepair }) => (
          <label className={styles.choice} key={id}>
            <input
              type="checkbox"
              checked={ready || selected[id]}
              disabled={ready || needsRepair || !cloudReady}
              onChange={(event) => setSelected({ ...selected, [id]: event.target.checked })}
            />
            <span className={styles.description}>
              <strong>{name}</strong>
              <span>{detail}</span>
            </span>
            <span className={ready ? styles.ready : styles.status}>
              {ready
                ? 'Connected'
                : approving
                  ? 'Awaiting approval'
                  : needsRepair
                    ? 'Needs attention'
                    : cloudReady
                      ? 'Not connected'
                      : unavailable}
            </span>
          </label>
        ))}
        <button
          className={ui.primaryButton}
          disabled={!cloudReady || !missing.length}
          onClick={() => void connect(missing)}
        >
          {connecting ? 'Finish account approval…' : 'Connect selected apps'}
        </button>
      </fieldset>
      {connecting ? (
        <div className={styles.pending}>
          <p className={styles.note} role="status">
            Finish sign-in in the browser. Sia connects your selected accounts in order. If you
            closed the approval page, cancel and try again.
          </p>
          <button
            className={ui.secondaryButton}
            disabled={pending}
            onClick={() => void cancel(connecting.id, connecting.connectionId)}
          >
            Cancel connection setup
          </button>
        </div>
      ) : null}
      {!cloudReady ? (
        <p className={styles.note} role="status">
          {unavailable}. You can use signed-in websites with Use my Mac.
        </p>
      ) : null}
      {snapshot.apps.some((app) => app.status === 'error') ? (
        <p className={styles.error} role="alert">
          An account connection needs attention. Review it in Settings → Connections. Connected
          accounts are kept.
        </p>
      ) : null}
    </div>
  );
}
