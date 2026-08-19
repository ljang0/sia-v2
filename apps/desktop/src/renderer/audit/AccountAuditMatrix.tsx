import { CloudAccountSettings } from '../components/settings/CloudAccountSettings';
import { PrivacySettings } from '../components/settings/PrivacySettings';
import { demoSnapshot } from '../demo';
import styles from '../ui.module.css';

const noop = async () => undefined;

export function AccountAuditMatrix() {
  return (
    <>
      <section className={styles.auditSection}>
        <h2>Cloud account states</h2>
        <div className={styles.auditAccountGrid}>
          <AuditCell title="Signed out">
            <CloudAccountSettings
              cloudAuth={{ state: 'signed-out' }}
              onStartCloudSignIn={noop}
              onCompleteCloudSignIn={noop}
              onSignOutCloud={noop}
              onDeleteCloudAccount={noop}
            />
          </AuditCell>
          <AuditCell title="Code sent">
            <CloudAccountSettings
              cloudAuth={{ state: 'code-sent', email: 'lawrence@example.com' }}
              onStartCloudSignIn={noop}
              onCompleteCloudSignIn={noop}
              onSignOutCloud={noop}
              onDeleteCloudAccount={noop}
            />
          </AuditCell>
          <AuditCell title="Signed in">
            <CloudAccountSettings
              cloudAuth={{ state: 'signed-in', email: 'lawrence@example.com' }}
              onStartCloudSignIn={noop}
              onCompleteCloudSignIn={noop}
              onSignOutCloud={noop}
              onDeleteCloudAccount={noop}
            />
          </AuditCell>
          <AuditCell title="Unconfigured">
            <CloudAccountSettings
              cloudAuth={{ state: 'unconfigured' }}
              onStartCloudSignIn={noop}
              onCompleteCloudSignIn={noop}
              onSignOutCloud={noop}
              onDeleteCloudAccount={noop}
            />
          </AuditCell>
        </div>
      </section>

      <section className={styles.auditSection}>
        <h2>Research consent</h2>
        <div className={styles.auditNarrowColumn}>
          <PrivacySettings
            snapshot={{
              ...structuredClone(demoSnapshot),
              research: {
                ...structuredClone(demoSnapshot.research),
                consented: false,
                capture: 'paused',
              },
            }}
            onSetCapturePaused={noop}
            onExport={noop}
            onDelete={noop}
          />
        </div>
      </section>
    </>
  );
}

function AuditCell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.auditAccountCell}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
