import { Check, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** How long the inline "Saved" note stays after a setting changes. */
const SAVED_NOTE_MS = 1800;

/**
 * A short-lived confirmation for settings that save as soon as they change. `flash()` shows the
 * note; it hides itself after a moment, and a newer change restarts the timer.
 */
export function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), SAVED_NOTE_MS);
  }, []);
  return [saved, flash];
}

/** The inline "Saved" note. The live region stays mounted so screen readers hear each save. */
export function SavedNote({ show }: { show: boolean }) {
  return (
    <span className={styles.savedNote} role="status" aria-live="polite">
      {show ? (
        <span>
          <Check size={12} weight="bold" aria-hidden="true" />
          Saved
        </span>
      ) : null}
    </span>
  );
}
