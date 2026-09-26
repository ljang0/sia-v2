import { useEffect, useState, type ReactNode } from 'react';
import type { Appearance } from './effects/appearance';
import styles from './startup.module.css';

export function StartupTransition({
  ready,
  appearance,
  children,
}: {
  ready: boolean;
  appearance?: Appearance | undefined;
  children?: ReactNode;
}) {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!ready || finished) return;
    if (
      appearance === 'calm' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setFinished(true);
      return;
    }
    // The app is available immediately; this only retires the decorative curtain.
    // A timer also clears it when animation events are suppressed in a hidden window.
    const timeout = window.setTimeout(() => setFinished(true), 240);
    return () => window.clearTimeout(timeout);
  }, [ready, finished, appearance]);

  return (
    <>
      {children}
      {!finished && (
        <div
          className={styles.startup}
          data-sia-startup
          data-ready={ready}
          data-appearance={appearance}
          aria-hidden={ready || undefined}
          onAnimationEnd={(event) => {
            if (ready && event.target === event.currentTarget) setFinished(true);
          }}
        >
          <div className={styles.blob} aria-hidden="true" />
          <div className={styles.brand} aria-hidden="true">
            Sia
          </div>
          <div
            className={styles.loading}
            role="status"
            aria-label="Loading Sia"
            aria-busy={!ready}
          >
            <span>Loading</span>
            <span className={styles.wordmark}>Sia</span>
            <span className={styles.pulse} aria-hidden="true" />
          </div>
        </div>
      )}
    </>
  );
}
