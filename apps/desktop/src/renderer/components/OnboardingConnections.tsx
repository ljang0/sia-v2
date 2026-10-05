import { ConnectionChecklist } from './ConnectionChecklist';
import type { RendererApi, RendererSnapshot } from '../types';
import styles from './Onboarding.module.css';
import { isGoogleConnection } from '../../shared/bridge/connections';

type SetupProps = {
  snapshot: RendererSnapshot;
  api: RendererApi;
  pending: boolean;
  run(action: () => Promise<unknown>): Promise<void>;
};

export function SetupConnections({ snapshot, api, pending, run }: SetupProps) {
  const google = snapshot.apps.filter(({ id }) => isGoogleConnection(id));
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
