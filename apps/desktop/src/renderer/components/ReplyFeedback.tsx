import { ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { plainText, clipText } from '../../shared/plain-text';
import styles from './Conversation.module.css';

export type ReplyRating = 'up' | 'down';

/** Thumbs next to Copy on a reply; each opens the feedback draft about that reply. */
export function ReplyFeedbackButtons({ onRate }: { onRate(rating: ReplyRating): void }) {
  return (
    <>
      <button
        type="button"
        className={styles.messageActionButton}
        onClick={() => onRate('up')}
        aria-label="Good reply"
        title="Good reply"
      >
        <ThumbsUp size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.messageActionButton}
        onClick={() => onRate('down')}
        aria-label="Bad reply"
        title="Bad reply"
      >
        <ThumbsDown size={14} aria-hidden="true" />
      </button>
    </>
  );
}

/** The feedback draft for a rated reply. The person reviews and edits it before anything is sent. */
export function replyFeedbackDraft(rating: ReplyRating, reply: string): string {
  const quote = clipText(plainText(reply ?? ''), 400);
  return [
    rating === 'up' ? 'This reply was helpful.' : 'This reply wasn’t right.',
    '',
    ...(quote ? [`Reply: “${quote}”`, ''] : []),
    rating === 'up' ? 'What worked well: ' : 'What should Sia have done instead? ',
  ].join('\n');
}
