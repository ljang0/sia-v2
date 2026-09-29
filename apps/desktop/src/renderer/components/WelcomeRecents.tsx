import { ArrowRight } from '@phosphor-icons/react';
import type { ThreadSummary } from '../types';
import { threadDisplayTitle } from '../threadTitle';
import { timeAgo } from '../welcome';
import styles from './welcome-recents.module.css';

const STATUS: Partial<Record<ThreadSummary['status'], string>> = {
  waiting: 'Needs you',
  error: 'Needs attention',
  running: 'Working',
  queued: 'Queued',
};

export function WelcomeRecents({
  threads,
  onOpen,
}: {
  threads: readonly ThreadSummary[];
  onOpen?: ((id: string) => void) | undefined;
}) {
  if (!threads.length || !onOpen) return null;
  return (
    <section className={styles.recents} aria-label="Pick up where you left off">
      <h3>Pick up where you left off</h3>
      <div className={styles.list}>
        {threads.map((thread) => {
          const status = STATUS[thread.status];
          const preview = thread.draft?.trim()
            ? 'You have an unsent draft here.'
            : thread.preview?.text;
          return (
            <button
              key={thread.id}
              type="button"
              data-status={thread.status}
              onClick={() => onOpen(thread.id)}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.copy}>
                <strong>{threadDisplayTitle(thread.title)}</strong>
                {preview ? <span className={styles.preview}>{preview}</span> : null}
              </span>
              <span className={styles.meta}>
                {status ? <span className={styles.status}>{status}</span> : null}
                <time dateTime={thread.updatedAt}>{timeAgo(thread.updatedAt)}</time>
              </span>
              <ArrowRight className={styles.arrow} size={14} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
