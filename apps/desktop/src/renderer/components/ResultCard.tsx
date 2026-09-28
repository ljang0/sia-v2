import { Check } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import styles from './result-card.module.css';

/** Presentation of a finished reply, not a claim that every requested action succeeded. */
export function ResultCard({ children }: { children: ReactNode }) {
  return (
    <section className={styles.card} aria-label="Task result" data-task-result>
      <div className={styles.heading}>
        <span className={styles.check}>
          <Check size={14} weight="bold" aria-hidden="true" />
        </span>
        <span>Reply ready</span>
      </div>
      {children}
    </section>
  );
}
