import { ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  RATING_COMMENT_MAX_CHARS,
  RATING_REASON_LABELS,
  type RatingReason,
  reasonsFor,
  type SubmitRatingInput,
  type TaskRatingValue,
} from '../../shared/bridge/ratings';
import { plainText, clipText } from '../../shared/plain-text';
import type { TaskRatingState } from '../types';
import buttons from '../styles/buttons.module.css';
import styles from './Conversation.module.css';

export type ReplyRating = 'up' | 'down';

export type RateTaskInput = Omit<SubmitRatingInput, 'threadId'>;

/**
 * Thumbs on the final reply of a finished task. A tap records the rating at once; "Tell us
 * more" adds reasons and a short note, which is shown before it is sent. The support draft
 * stays one link away.
 */
export function TaskRatingButtons({
  state,
  onRate,
  onSendFeedback,
}: {
  state: TaskRatingState;
  onRate(input: RateTaskInput): Promise<void>;
  onSendFeedback?: ((rating: ReplyRating) => void) | undefined;
}) {
  const [chosen, setChosen] = useState<TaskRatingValue | undefined>(state.rating);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setChosen(state.rating), [state.rating]);

  const rate = (rating: TaskRatingValue) => {
    const previous = chosen;
    setChosen(rating);
    setSaved(false);
    void onRate({ turnId: state.turnId, rating }).then(
      () => setSaved(true),
      () => setChosen(previous),
    );
  };

  return (
    <span className={styles.taskRating}>
      <button
        type="button"
        className={styles.messageActionButton}
        onClick={() => rate('good')}
        aria-label="Good result"
        aria-pressed={chosen === 'good'}
        title="This went well"
        data-chosen={chosen === 'good' ? 'true' : undefined}
      >
        <ThumbsUp
          size={16}
          weight={chosen === 'good' ? 'fill' : 'regular'}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        className={styles.messageActionButton}
        onClick={() => rate('bad')}
        aria-label="Bad result"
        aria-pressed={chosen === 'bad'}
        title="This didn’t go well"
        data-chosen={chosen === 'bad' ? 'true' : undefined}
      >
        <ThumbsDown
          size={16}
          weight={chosen === 'bad' ? 'fill' : 'regular'}
          aria-hidden="true"
        />
      </button>
      {chosen ? (
        <span className={styles.taskRatingStatus}>
          <span role="status">{saved ? 'Thanks, saved.' : ''}</span>
          <button type="button" className={styles.taskRatingMore} onClick={() => setOpen(true)}>
            Tell us more
          </button>
        </span>
      ) : null}
      {open && chosen ? (
        <TaskRatingPopover
          rating={chosen}
          initialReasons={state.rating === chosen ? (state.reasons ?? []) : []}
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            await onRate({ turnId: state.turnId, rating: chosen, ...input });
            setSaved(true);
            setOpen(false);
          }}
          onSendFeedback={
            onSendFeedback
              ? () => {
                  setOpen(false);
                  onSendFeedback(chosen === 'good' ? 'up' : 'down');
                }
              : undefined
          }
        />
      ) : null}
    </span>
  );
}

function TaskRatingPopover({
  rating,
  initialReasons,
  onClose,
  onSubmit,
  onSendFeedback,
}: {
  rating: TaskRatingValue;
  initialReasons: readonly RatingReason[];
  onClose(): void;
  onSubmit(input: { reasons: RatingReason[]; comment?: string }): Promise<void>;
  onSendFeedback?: (() => void) | undefined;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [reasons, setReasons] = useState<RatingReason[]>([...initialReasons]);
  const [comment, setComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const note = comment.trim();
  const send = () => {
    setBusy(true);
    setError(undefined);
    void onSubmit({ reasons, ...(note ? { comment: note } : {}) }).catch(() => {
      setBusy(false);
      setError('Sia couldn’t save that. Try again.');
    });
  };

  return (
    <div
      ref={panel}
      className={styles.taskRatingPopover}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="task-rating-popover"
    >
      {reviewing ? (
        <>
          <h3 id={titleId}>Send this note?</h3>
          <blockquote className={styles.taskRatingQuote}>{note}</blockquote>
          <p className={styles.taskRatingPrivacy}>
            Your note goes to Sia with your rating and the AI and engine that did the task. Your
            conversation, files, and screen are not sent.
          </p>
          <div className={styles.taskRatingActions}>
            <button
              type="button"
              className={buttons.secondaryButton}
              onClick={() => setReviewing(false)}
            >
              Edit
            </button>
            <button
              type="button"
              className={buttons.primaryButton}
              disabled={busy}
              onClick={send}
            >
              Send
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 id={titleId}>{rating === 'good' ? 'What went well?' : 'What went wrong?'}</h3>
          <div className={styles.taskRatingReasons} role="group" aria-label="Reasons">
            {reasonsFor(rating).map((reason) => {
              const selected = reasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  className={styles.taskRatingReason}
                  aria-pressed={selected}
                  onClick={() =>
                    setReasons((current) =>
                      selected
                        ? current.filter((value) => value !== reason)
                        : [...current, reason],
                    )
                  }
                >
                  {RATING_REASON_LABELS[reason]}
                </button>
              );
            })}
          </div>
          <label className={styles.taskRatingComment}>
            <span>Anything else? (optional)</span>
            <textarea
              value={comment}
              rows={3}
              maxLength={RATING_COMMENT_MAX_CHARS}
              onChange={(change) => setComment(change.target.value)}
            />
            <small>
              {comment.length}/{RATING_COMMENT_MAX_CHARS}. Please leave out passwords and
              private details.
            </small>
          </label>
          <div className={styles.taskRatingActions}>
            {onSendFeedback ? (
              <button type="button" className={styles.taskRatingMore} onClick={onSendFeedback}>
                Send feedback to the Sia team
              </button>
            ) : null}
            <button
              type="button"
              className={buttons.primaryButton}
              disabled={busy}
              onClick={() => (note ? setReviewing(true) : send())}
            >
              {note ? 'Review note' : 'Save'}
            </button>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className={styles.taskRatingError}>
          {error}
        </p>
      ) : null}
    </div>
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
