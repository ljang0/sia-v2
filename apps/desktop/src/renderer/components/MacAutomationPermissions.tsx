import { useState } from 'react';
import {
  automationApps,
  automationStatusLabel,
  type AutomationApp,
  type AutomationPermissions,
} from '../../shared/mac-permissions';
import ui from '../ui.module.css';
import styles from './Onboarding.module.css';

export function MacAutomationPermissions({
  permissions,
  request,
  refresh,
  disabled = false,
}: {
  permissions: AutomationPermissions | undefined;
  request(app: AutomationApp): Promise<void>;
  refresh(): Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const run = async (action: () => Promise<void>) => {
    setError(undefined);
    try {
      await action();
    } catch {
      setError(
        'Permission setup could not finish. Try again, then check Privacy & Security → Automation.',
      );
    } finally {
      setPending(undefined);
    }
  };
  const ask = async (app: AutomationApp) => {
    setPending(automationApps.find((entry) => entry.id === app)!.name);
    await request(app);
  };
  const needed = automationApps.filter(
    ({ id }) => !['ready', 'unavailable'].includes(permissions?.[id] ?? 'needs_permission'),
  );
  return (
    <section aria-label="Mac app permissions">
      <h3>Connect your Mac apps</h3>
      <p className={styles.note}>
        Allow Sia to control Mac apps, keyboard input and your browser before your first task.
        macOS asks separately for each app. This may open the app, but does not read your
        content or send anything.
      </p>
      {automationApps.map(({ id, name, detail }) => {
        const status = permissions?.[id] ?? 'needs_permission';
        return (
          <div className={styles.permission} key={id}>
            <div>
              <strong>{name}</strong>
              <p>{detail}</p>
              <p>{automationStatusLabel[status]}</p>
            </div>
            <button
              className={ui.secondaryButton}
              disabled={
                disabled || Boolean(pending) || status === 'unavailable' || status === 'ready'
              }
              onClick={() => void run(() => ask(id))}
            >
              {pending === name
                ? 'Waiting for macOS…'
                : status === 'ready'
                  ? `${name} allowed`
                  : status === 'denied'
                    ? `Review ${name} access`
                    : `Allow ${name}`}
            </button>
          </div>
        );
      })}
      <div className={styles.siteButtons}>
        <button
          className={ui.secondaryButton}
          disabled={disabled || Boolean(pending) || !needed.length}
          onClick={() =>
            void run(async () => {
              for (const { id } of needed) await ask(id);
            })
          }
        >
          Set up all Mac apps
        </button>
        <button
          className={styles.link}
          disabled={disabled || Boolean(pending)}
          onClick={() =>
            void run(async () => {
              setPending('check');
              await refresh();
            })
          }
        >
          Recheck app access
        </button>
      </div>
      {pending ? (
        <p className={styles.note} role="status">
          {pending === 'check'
            ? 'Checking app access…'
            : `Finish the ${pending} permission prompt, then return here.`}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.note}>
        If you previously chose Don’t Allow, enable the app under System Settings → Privacy &
        Security → Automation. You can skip apps you do not use; missing access will stay
        visible in your setup review.
      </p>
    </section>
  );
}
