import type { CSSProperties } from 'react';
import sprite from '../assets/scotty/scotty.png';
import styles from './Scotty.module.css';
export type ScottyPose = 'idle' | 'trot' | 'working' | 'curious' | 'happy' | 'sleep';
const rows: Record<ScottyPose, number> = {
  idle: 0,
  trot: 1,
  working: 2,
  curious: 3,
  happy: 4,
  sleep: 5,
};
export function ScottySprite({
  pose = 'idle',
  size = 144,
  motion = true,
}: {
  pose?: ScottyPose;
  size?: number;
  motion?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={styles.sprite}
      data-pose={pose}
      data-animated={motion}
      style={
        {
          '--sprite-size': `${size}px`,
          '--sprite-row': rows[pose],
          backgroundImage: `url(${sprite})`,
        } as CSSProperties
      }
    />
  );
}
