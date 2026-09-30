import { ArrowCounterClockwise, Tray } from '@phosphor-icons/react';
import { useEffect, useId, useRef } from 'react';
import buttons from '../../styles/buttons.module.css';
import styles from '../../ui.module.css';

interface ArchivedThread {
  id: string;
  title: string;
  agentName: string;
  archivedAt: string;
}

interface ArchivedThreadsSectionProps {
  threads: readonly ArchivedThread[];
  focusOnMount?: boolean | undefined;
  onOpen(threadId: string): void;
  onRestore(threadId: string): Promise<void> | void;
}

export function ArchivedThreadsSection({
  threads,
  focusOnMount,
  onOpen,
  onRestore,
}: ArchivedThreadsSectionProps) {
  const titleId = useId();
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusOnMount) return;
    section.current?.focus({ preventScroll: true });
    section.current?.scrollIntoView?.({ block: 'start' });
  }, [focusOnMount]);

  return (
    <section
      ref={section}
      id="archived-threads"
      className={styles.archivedThreads}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className={styles.localSurfaceHeader}>
        <h2 id={titleId}>Archived</h2>
        <Tray size={16} aria-hidden="true" />
      </div>
      {threads.length ? (
        <div className={styles.archivedList}>
          {threads.map((thread) => (
            <article key={thread.id}>
              <button type="button" onClick={() => onOpen(thread.id)}>
                <strong>{thread.title}</strong>
                <span>
                  {thread.agentName} · {formatDate(thread.archivedAt)}
                </span>
              </button>
              <button
                type="button"
                className={buttons.iconButtonSmall}
                onClick={() => void onRestore(thread.id)}
                aria-label={`Restore ${thread.title}`}
              >
                <ArrowCounterClockwise size={14} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.localEmpty}>
          Nothing archived. Conversations you archive will rest here.
        </p>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}
