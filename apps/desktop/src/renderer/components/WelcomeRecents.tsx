import { ArrowUpRight, ChatCircle } from '@phosphor-icons/react';
import type { ThreadSummary } from '../types';
import styles from './welcome-recents.module.css';

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
      <div className={styles.grid}>
        {threads.map((thread) => (
          <button key={thread.id} type="button" onClick={() => onOpen(thread.id)}>
            <span className={styles.meta}>
              <ChatCircle size={15} aria-hidden="true" />
              {thread.status === 'waiting'
                ? 'Needs you'
                : thread.status === 'error'
                  ? 'Needs attention'
                  : thread.status === 'running'
                    ? 'In progress'
                    : thread.status === 'queued'
                      ? 'Queued'
                      : 'Recent conversation'}
              <ArrowUpRight size={14} aria-hidden="true" />
            </span>
            <strong>{thread.title}</strong>
            <span className={styles.preview}>
              {thread.draft?.trim()
                ? 'You have a draft here.'
                : thread.preview?.text ||
                  'Open this conversation to pick up where you left off.'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
