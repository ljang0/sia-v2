import { Check, GlobeHemisphereWest } from '@phosphor-icons/react';
import type { PushToTalkView } from '../../shared/bridge';
import shared from './Onboarding.module.css';
import styles from './FnPractice.module.css';
import { useAppearance } from './effects/appearance';

/** A visual guide driven only by the native recorder, never by simulated key events. */
export function FnPractice({ voice }: { voice: PushToTalkView | undefined }) {
  const appearance = useAppearance();
  const phase = voice?.phase ?? 'idle';
  const transcript = voice?.practice ? voice.practiceTranscript : undefined;
  const completed = Boolean(transcript?.trim()) && phase === 'idle';
  const listening = phase === 'listening';
  const status = completed
    ? 'That’s your voice. You’re ready.'
    : phase === 'starting'
      ? 'Starting your microphone…'
      : listening
        ? 'Listening. Release Fn when you’re done.'
        : phase === 'transcribing'
          ? 'Turning your voice into words…'
          : 'Hold the Fn key on your keyboard, then speak.';
  return (
    <div
      className={styles.practice}
      data-phase={completed ? 'complete' : phase}
      data-appearance={appearance}
    >
      <div className={styles.keyboardScene} aria-hidden="true">
        <div className={styles.keyNeighbor}>control ⌃</div>
        <div className={styles.fnKey}>
          <div className={styles.keyWater}>
            <div className={styles.keyWave} />
            <div className={styles.keyWave} />
          </div>
          <span>fn</span>
          {completed ? <Check size={28} /> : <GlobeHemisphereWest size={28} />}
        </div>
        <div className={styles.keyNeighbor}>option ⌥</div>
      </div>
      <div className={styles.practiceStatus} role="status" aria-atomic="true">
        <span className={styles.recordingDot} aria-hidden="true" />
        {status}
      </div>
      <div className={styles.transcript}>
        <span className={shared.eyebrow}>YOUR WORDS</span>
        <p>{transcript || 'Try saying “Help me plan my day.”'}</p>
      </div>
      {voice?.detail && (
        <p className={shared.error} role="alert">
          {voice.detail}
        </p>
      )}
      <p className={shared.note}>
        This is just practice. Your words won’t start a task. Press Esc to cancel a recording.
      </p>
    </div>
  );
}
