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

/**
 * The desktop conversation's frame for every assistant reply. The frame never changes the
 * reply's box, so a reply keeps its place while it streams, when it becomes the result, and
 * when the next message is sent. Only the card's paint fades, through CSS transitions, so the
 * arrival plays when a turn finishes and not when a finished thread is opened again.
 */
export function ReplySurface({
  ready,
  children,
}: {
  /** This reply is the finished result of the latest turn. */
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.surface}
      role={ready ? 'region' : undefined}
      aria-label={ready ? 'Task result' : undefined}
      data-task-result={ready ? '' : undefined}
      data-ready={ready ? 'true' : undefined}
    >
      {children}
    </div>
  );
}

/** The “Reply ready” mark in a reply's header line; visible only while its frame is ready. */
export function ReplyReadyMark({ ready }: { ready: boolean }) {
  return (
    <span className={styles.readyMark} aria-hidden={ready ? undefined : true}>
      <Check size={11} weight="bold" aria-hidden="true" />
      Reply ready
    </span>
  );
}
