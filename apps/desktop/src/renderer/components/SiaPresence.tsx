import styles from './SiaMark.module.css';
import { SiaMark, type SiaMarkState } from './SiaMark';

export type SiaPresenceState = SiaMarkState;

export function SiaPresence({
  state,
  audioLevel = 0,
}: {
  state: SiaPresenceState;
  audioLevel?: number | undefined;
}) {
  const level = Math.max(0, Math.min(4, Math.round(audioLevel)));

  return <SiaMark className={styles.siaPresence} state={state} level={level} live />;
}
