import type { TimelineItemView } from '../shared/bridge';
import { activityLabel } from '../shared/activity-label';
import { clipText, plainText } from '../shared/plain-text';
import type { ThreadSummary } from './types';

/** Summaries come from the existing snapshot; hovering never selects or reads a task. */
export function threadPreviews(timeline: readonly TimelineItemView[]) {
  const requests = new Map<string, TimelineItemView>();
  // A queued follow-up is not the thread's request until it starts.
  const items = timeline.filter((item) => !(item.kind === 'user' && item.status === 'pending'));
  for (const item of items) {
    if (item.kind === 'user' && item.sequence > (requests.get(item.threadId)?.sequence ?? -1))
      requests.set(item.threadId, item);
  }
  const latest = new Map<string, { sequence: number; preview: ThreadSummary['preview'] }>();
  for (const item of items) {
    const request = requests.get(item.threadId);
    if (
      request &&
      (item.sequence < request.sequence ||
        (request.turnId && item.turnId && request.turnId !== item.turnId))
    )
      continue;
    let preview: ThreadSummary['preview'];
    if (item.kind === 'user' || item.kind === 'assistant') {
      const text = item.text && plainText(item.text);
      if (text)
        preview = {
          label: item.kind === 'user' ? 'Request' : 'Latest reply',
          text: clipText(text, 420),
        };
    } else if (item.kind === 'activity') {
      preview = {
        label: 'Latest activity',
        text: activityLabel(item.toolName, item.activity?.kind),
      };
    }
    if (preview && item.sequence > (latest.get(item.threadId)?.sequence ?? -1)) {
      latest.set(item.threadId, { sequence: item.sequence, preview });
    }
  }
  return new Map([...latest].map(([id, value]) => [id, value.preview]));
}
