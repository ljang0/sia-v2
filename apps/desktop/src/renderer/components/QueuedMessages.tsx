import { ArrowUp, Clock, X } from '@phosphor-icons/react';
import { useState } from 'react';
import type { MessageEvent } from '../types';
import { MotionList } from './MotionList';
import styles from './QueuedMessages.module.css';

interface QueuedMessagesProps {
  messages: readonly MessageEvent[];
  agentName?: string | undefined;
  onRemove?: ((messageId: string) => Promise<void>) | undefined;
  /** Adds the message to the task that is running now instead of waiting for it to end. */
  onSendNow?: ((messageId: string) => Promise<void>) | undefined;
}

/**
 * Follow-ups sent while the thread works. Each one starts, in order, when the current task ends.
 * The list stays mounted while empty so the first follow-up opens into place and the last one
 * folds away when Sia picks it up; the parent keys this by thread so switching threads is still.
 */
export function QueuedMessages({
  messages,
  agentName,
  onRemove,
  onSendNow,
}: QueuedMessagesProps) {
  const [removing, setRemoving] = useState<string>();
  const [sending, setSending] = useState<string>();
  const empty = !messages.length;
  return (
    <section
      className={styles.queue}
      aria-label={empty ? undefined : 'Queued messages'}
      data-empty={empty || undefined}
      data-testid={empty ? undefined : 'queued-messages'}
    >
      {empty ? null : (
        <header className={styles.heading}>
          <Clock size={13} aria-hidden="true" />
          {messages.length === 1
            ? `Queued · ${agentName ?? 'Sia'} will pick this up next`
            : `${messages.length} queued · ${agentName ?? 'Sia'} will pick these up in order`}
        </header>
      )}
      <div role={empty ? undefined : 'list'}>
        <MotionList items={messages} className={styles.list}>
          {(message) => (
            <div role="listitem" className={styles.item} data-testid="queued-message">
              <p className={styles.text}>{message.content}</p>
              {message.attachments?.length ? (
                <span className={styles.meta}>
                  {message.attachments.length === 1
                    ? '1 attachment'
                    : `${message.attachments.length} attachments`}
                </span>
              ) : null}
              {onSendNow ? (
                <button
                  type="button"
                  className={styles.sendNow}
                  title="Add this to what Sia is doing now"
                  data-testid="queued-send-now"
                  disabled={sending === message.id || removing === message.id}
                  onClick={() => {
                    setSending(message.id);
                    void onSendNow(message.id).finally(() => setSending(undefined));
                  }}
                >
                  <ArrowUp size={12} weight="bold" aria-hidden="true" />
                  {sending === message.id ? 'Sending…' : 'Send now'}
                </button>
              ) : null}
              {onRemove ? (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label="Remove queued message"
                  title="Remove"
                  disabled={removing === message.id || sending === message.id}
                  onClick={() => {
                    setRemoving(message.id);
                    void onRemove(message.id).finally(() => setRemoving(undefined));
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
        </MotionList>
      </div>
    </section>
  );
}
