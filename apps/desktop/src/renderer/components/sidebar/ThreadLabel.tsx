import { PushPin } from '@phosphor-icons/react';
import { memo } from 'react';
import type { ThreadSummary } from '../../types';
import styles from '../Sidebar.module.css';
import navigation from '../navigation.module.css';

/** Snapshots rebuild every thread object, so compare only what the label shows. */
export const ThreadLabel = memo(
  ThreadLabelContent,
  ({ thread: a }, { thread: b }) =>
    a.title === b.title &&
    a.status === b.status &&
    a.unread === b.unread &&
    a.pinned === b.pinned &&
    threadStateLabel(a) === threadStateLabel(b) &&
    Boolean(a.draft?.trim()) === Boolean(b.draft?.trim()),
);

function ThreadLabelContent({ thread }: { thread: ThreadSummary }) {
  const draft = Boolean(thread.draft?.trim());
  const state = threadStateLabel(thread);
  const signal = threadSignal(thread);
  return (
    <span
      className={styles.threadCopy}
      data-thread-draft={draft || undefined}
      data-thread-unread={thread.unread || undefined}
    >
      <span className={`${styles.threadTitle} ${navigation.taskTitle}`} title={thread.title}>
        {thread.pinned ? (
          <PushPin
            className={navigation.taskPin}
            size={11}
            weight="fill"
            aria-hidden="true"
            data-testid="thread-pinned"
          />
        ) : null}
        {thread.title}
      </span>
      {draft || state ? (
        <span className={navigation.taskMeta} data-signal={signal}>
          {draft ? <strong>Draft</strong> : null}
          {state ? <span>{state}</span> : null}
        </span>
      ) : null}
      {signal ? (
        <i className={navigation.taskSignal} data-signal={signal} aria-hidden="true" />
      ) : null}
    </span>
  );
}

/** The dot at a row's end: what, if anything, the conversation wants from the person. */
function threadSignal(
  thread: ThreadSummary,
): 'working' | 'needs-you' | 'problem' | 'unread' | undefined {
  if (thread.status === 'running' || thread.status === 'queued') return 'working';
  if (thread.status === 'waiting') return 'needs-you';
  if (thread.status === 'error') return 'problem';
  return thread.unread ? 'unread' : undefined;
}

function threadStateLabel(thread: ThreadSummary) {
  // Say what a running conversation is doing now, so work in the background is never a mystery.
  if (thread.status === 'running')
    return thread.preview?.active
      ? thread.preview.label === 'Latest activity'
        ? thread.preview.text
        : 'Writing the reply'
      : 'Working';
  if (thread.status === 'waiting') return 'Waiting for you';
  if (thread.status === 'queued') return 'Queued';
  if (thread.status === 'error') return 'Needs attention';
  if (thread.unread) return 'Unread';
  return undefined;
}
