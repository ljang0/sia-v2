import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  prepare,
  children,
  needsPreparation = false,
  onBusyChange,
}: {
  permissions: AutomationPermissions | undefined;
  request(app: AutomationApp): Promise<void>;
  refresh(): Promise<void>;
  disabled?: boolean;
  prepare?(): Promise<void>;
  needsPreparation?: boolean;
  children?: ReactNode;
  onBusyChange?(busy: boolean): void;
}) {
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const needed = automationApps.filter(
    ({ id }) => !['ready', 'unavailable'].includes(permissions?.[id] ?? 'needs_permission'),
  );
  const run = async (checkOnly: boolean) => {
    if (busy.current) return;
    busy.current = true;
    onBusyChange?.(true);
    setError(undefined);
    const failures: string[] = [];
    try {
      if (!checkOnly) {
        if (prepare && needsPreparation) {
          setPending('Mac and voice access');
          try {
            await prepare();
          } catch (cause) {
            failures.push(cause instanceof Error ? cause.message : 'Mac and voice access');
          }
        }
        for (const { id, name } of needed) {
          if (!mounted.current) break;
          setPending(name);
          try {
            await request(id);
          } catch {
            failures.push(name);
          }
        }
      }
      setPending('check');
      await refresh();
      if (failures.length)
        setError(
          `Setup needs attention: ${failures.join('; ')}. Allowed permissions are kept; retry only the missing access.`,
        );
    } catch {
      setError('Could not check access. Return from System Settings and try again.');
    } finally {
      busy.current = false;
      onBusyChange?.(false);
      setPending(undefined);
    }
  };
  return (
    <section aria-label="Mac app permissions">
      <h3>{prepare ? 'Your access checklist' : 'Mac app access'}</h3>
      <p className={styles.note}>
        All supported Mac apps are included. One setup action walks through missing access.
        macOS still asks separately for some permissions. Already allowed access is skipped.
      </p>
      <div className={styles.siteButtons}>
        <button
          className={ui.primaryButton}
          disabled={disabled || Boolean(pending) || (!needed.length && !needsPreparation)}
          onClick={() => void run(false)}
        >
          {pending && pending !== 'check'
            ? 'Setting up access…'
            : prepare
              ? 'Allow all required access'
              : 'Allow all Mac apps'}
        </button>
        <button
          className={styles.link}
          disabled={disabled || Boolean(pending)}
          onClick={() => void run(true)}
        >
          Check access
        </button>
      </div>
      {pending ? (
        <p className={styles.note} role="status">
          {pending === 'check'
            ? 'Checking access without requesting permissions…'
            : `Finish the ${pending} permission prompt, then return here.`}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <ul className={styles.accessList}>
        {children}
        {automationApps.map(({ id, name, detail }) => {
          const status = permissions?.[id] ?? 'needs_permission';
          return (
            <li className={styles.permission} key={id}>
              <div>
                <strong>{name}</strong>
                <p>{detail}</p>
              </div>
              <span className={status === 'ready' ? styles.ready : styles.status}>
                {automationStatusLabel[status]}
              </span>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>
        If access was denied, enable it in System Settings → Privacy &amp; Security. Missing
        access stays visible; checking this list does not request it again.
      </p>
    </section>
  );
}
