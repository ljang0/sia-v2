import type { CSSProperties } from 'react';
import styles from './VoiceWave.module.css';

/**
 * A small live waveform for listening states. `level` is the microphone level from 0 to 4;
 * without one (a phone's own dictation reports none) the bars sway gently on their own.
 */
export function VoiceWave({
  level,
  className,
}: {
  level?: number | undefined;
  className?: string;
}) {
  const measured = level !== undefined;
  const value = measured ? Math.max(0, Math.min(4, level)) / 4 : 0.5;
  return (
    <span
      className={`${styles.wave} ${className ?? ''}`}
      data-measured={measured}
      data-testid="voice-wave"
      style={{ '--voice-level': value } as CSSProperties}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
