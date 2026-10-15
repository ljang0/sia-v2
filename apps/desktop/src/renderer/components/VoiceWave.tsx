import type { CSSProperties } from 'react';
import styles from './VoiceWave.module.css';

/** Where a voice request is: hearing you, turning speech into a request, or understood. */
export type VoicePhase = 'listening' | 'processing' | 'recognised';

/**
 * A small live waveform for voice states. `level` is the microphone level from 0 to 4; without one
 * (a phone's own dictation reports none) the bars sway gently on their own. `processing` runs a
 * travelling pulse that ignores the level, and `recognised` settles the bars into a still line.
 */
export function VoiceWave({
  level,
  phase = 'listening',
  className,
}: {
  level?: number | undefined;
  phase?: VoicePhase;
  className?: string;
}) {
  const measured = level !== undefined;
  const value = measured ? Math.max(0, Math.min(4, level)) / 4 : 0.5;
  return (
    <span
      className={`${styles.wave} ${className ?? ''}`}
      data-measured={measured}
      data-phase={phase}
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
