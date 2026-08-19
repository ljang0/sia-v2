import styles from '../ui.module.css';

export type SiaMarkState =
  'idle' | 'working' | 'waiting' | 'listening' | 'speaking' | 'complete' | 'error';

interface SiaMarkProps {
  className?: string | undefined;
  state?: SiaMarkState | undefined;
  level?: number | undefined;
  live?: boolean | undefined;
}

export function SiaMark({ className, state, level, live = false }: SiaMarkProps) {
  return (
    <span
      className={`${styles.siaMark} ${className ?? ''}`}
      data-sia-presence={live ? '' : undefined}
      data-state={state}
      data-level={level}
      aria-hidden="true"
    >
      <span className={styles.siaMarkOrbit}>
        <span className={styles.siaMarkCore} />
      </span>
    </span>
  );
}
