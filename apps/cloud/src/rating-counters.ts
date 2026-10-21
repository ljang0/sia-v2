import type { TaskRatingRecord } from '@sia/protocol/ratings';
import type { RatingAggregateKey, StoredTaskRating } from './ports.js';

/** Flat counters one rating adds to its day's roll-up. Replacing a rating subtracts the old. */
export function ratingCounters(
  record: Pick<TaskRatingRecord, 'rating' | 'reasons' | 'comment' | 'task'>,
): Record<string, number> {
  const counters: Record<string, number> = {
    ratings: 1,
    [record.rating]: 1,
    [`outcome_${record.task.outcome}`]: 1,
    durationMsTotal: record.task.durationMs,
    stepsTotal: record.task.stepCount,
  };
  for (const reason of record.reasons) counters[`reason_${reason}`] = 1;
  if (record.comment) counters.comments = 1;
  if (record.task.usedComputer) counters.usedComputer = 1;
  if (record.task.usedBrowser) counters.usedBrowser = 1;
  return counters;
}

export function ratingUpdate(
  rating: StoredTaskRating,
  previous?: StoredTaskRating,
): {
  key: RatingAggregateKey;
  deltas: Record<string, number>;
} {
  const deltas = ratingCounters(rating.record);
  if (previous)
    for (const [name, value] of Object.entries(ratingCounters(previous.record)))
      deltas[name] = (deltas[name] ?? 0) - value;
  return {
    key: {
      labId: rating.labId,
      labName: rating.record.route.lab.name,
      provider: rating.record.route.provider,
      day: rating.day,
      model: rating.model,
      harnessId: rating.harnessId,
    },
    deltas: Object.fromEntries(Object.entries(deltas).filter(([, value]) => value !== 0)),
  };
}
