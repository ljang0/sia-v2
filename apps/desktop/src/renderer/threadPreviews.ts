import type { TimelineItemView } from '../shared/bridge';
import { activityLabel } from '../shared/activity-label';
import { plainText } from '../shared/plain-text';
import type { ThreadSummary } from './types';

/** Summaries come from the existing snapshot; hovering never selects or reads a task. */
export function threadPreviews(items: readonly TimelineItemView[]) {
  const requests = new Map<string, TimelineItemView>();
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
          text: clip(text),
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
function clip(text: string) {
  return text.length > 420 ? `${text.slice(0, 417)}…` : text;
}
