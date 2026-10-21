import { useState } from 'react';
import type { AppConnection, RendererSnapshot } from '../types';
import buttons from '../styles/buttons.module.css';
import styles from './ConnectionChecklist.module.css';
import {
  GOOGLE_CALENDAR_AND_TASKS_ENABLED,
  isGoogleConnection,
  isLocalConnection,
} from '../../shared/bridge/connections';

export function ConnectionChecklist({
  snapshot,
  pending,
  connect,
  cancel,
  reconnect,
}: {
  snapshot: RendererSnapshot;
  pending: boolean;
  connect(apps: ('google' | 'slack')[]): Promise<void>;
  cancel(app: AppConnection['id'], expectedConnectionId?: string): Promise<void>;
  reconnect(app: AppConnection['id']): Promise<void>;
}) {
  const [selected, setSelected] = useState({ google: true, slack: true });
  const connecting = snapshot.apps.find(
    (app) => !isLocalConnection(app.id) && app.status === 'connecting',
  );
  const cloudReady =
    snapshot.cloudAuth.state === 'signed-in' &&
    snapshot.cloudAuth.features?.connectors !== false;
  const unavailable =
    snapshot.cloudAuth.state === 'unconfigured'
      ? 'Not available in this version'
      : snapshot.cloudAuth.state !== 'signed-in'
        ? 'Sign in to connect'
        : 'Not enabled for this account';
  const choices = [
    {
      id: 'google' as const,
      name: 'Google Workspace',
      detail: GOOGLE_CALENDAR_AND_TASKS_ENABLED
        ? 'Gmail, Calendar, Drive, Docs, Sheets, Slides, and Tasks. Read only.'
        : 'Gmail, Drive, Docs, Sheets, and Slides. Read only.',
      apps: snapshot.apps.filter((app) => isGoogleConnection(app.id)),
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
            <span
              className={ready ? styles.ready : styles.status}
              data-approving={(!ready && approving) || undefined}
            >
              {ready
                ? 'Connected'
                : approving
                  ? 'Waiting for you'
                  : needsRepair
                    ? 'Needs attention'
                    : cloudReady
                      ? 'Not connected'
                      : unavailable}
            </span>
          </label>
        ))}
        <button
          className={buttons.primaryButton}
          disabled={!cloudReady || !missing.length}
          onClick={() => void connect(missing)}
        >
          {connecting ? 'Finish signing in…' : 'Connect selected apps'}
        </button>
      </fieldset>
      {connecting ? (
        <div className={styles.pending}>
          <p className={styles.note} role="status">
            Finish signing in in your web browser. Sia connects your accounts one at a time. If
            you closed the sign-in page, cancel and try again.
          </p>
          <button
            className={buttons.secondaryButton}
            disabled={pending}
            onClick={() => void cancel(connecting.id, connecting.connectionId)}
          >
            Cancel sign-in
          </button>
        </div>
      ) : null}
      {!cloudReady ? (
        <p className={styles.note} role="status">
          {unavailable}. With Use my Mac, Sia can still use websites you’re signed in to.
        </p>
      ) : null}
      {snapshot.apps.some((app) => app.status === 'error') ? (
        <div>
          <p className={styles.error} role="alert">
            An account needs to be reconnected. Your other accounts stay connected.
          </p>
          {choices
            .filter((choice) => choice.needsRepair)
            .map(({ id, name }) => (
              <button
                key={id}
                type="button"
                className={buttons.secondaryButton}
                disabled={!cloudReady || pending || Boolean(connecting)}
                onClick={() => void reconnect(id === 'google' ? 'gmail' : 'slack')}
              >
                Reconnect {name}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}
