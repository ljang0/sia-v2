import { WarningCircle } from '@phosphor-icons/react';
import styles from '../../ui.module.css';

export function SettingsSectionHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.settingsSection}>
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function InlineSettingsError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <div className={styles.settingsError} role="alert">
      <WarningCircle size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
