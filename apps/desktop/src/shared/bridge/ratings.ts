// Pick and rate: the person's rating of one finished task (docs/arena-ratings.md).
// Mirrors `@sia/protocol/ratings`; the main process asserts they match at compile time.

export const TASK_RATINGS = ['good', 'bad'] as const;
export type TaskRatingValue = (typeof TASK_RATINGS)[number];

export const GOOD_RATING_REASONS = ['did_it_right', 'fast', 'careful'] as const;
export const BAD_RATING_REASONS = [
  'wrong_result',
  'got_stuck',
  'too_slow',
  'unsafe_or_asked_too_much',
  'did_not_finish',
] as const;
export const RATING_REASONS = [...GOOD_RATING_REASONS, ...BAD_RATING_REASONS] as const;
export type RatingReason = (typeof RATING_REASONS)[number];

export const RATING_COMMENT_MAX_CHARS = 500;

/** Plain wording for each reason, shared by the desktop and phone pages. */
export const RATING_REASON_LABELS: Record<RatingReason, string> = {
  did_it_right: 'Did it right',
  fast: 'Fast',
  careful: 'Careful',
  wrong_result: 'Wrong result',
  got_stuck: 'Got stuck',
  too_slow: 'Too slow',
  unsafe_or_asked_too_much: 'Unsafe or asked too much',
  did_not_finish: 'Didn’t finish',
};

export function reasonsFor(rating: TaskRatingValue): readonly RatingReason[] {
  return rating === 'good' ? GOOD_RATING_REASONS : BAD_RATING_REASONS;
}

/** What the renderer may send. The route and task facts come from the main process. */
export interface SubmitRatingInput {
  threadId: string;
  turnId: string;
  rating: TaskRatingValue;
  reasons?: RatingReason[];
  comment?: string;
}

/** A finished task in the snapshot: it can be rated, and shows the current rating if any. */
export interface TurnRatingView {
  rating?: TaskRatingValue;
  reasons?: RatingReason[];
  /** The person added a comment; the text itself stays in local storage. */
  commented?: true;
}
