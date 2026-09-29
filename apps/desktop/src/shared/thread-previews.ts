import type { ThreadPreview, TimelineItemView } from './bridge';
import { activityLabel } from './activity-label';
import { clipText, plainText } from './plain-text';

/** Remembers each message's summary until its text changes, so long histories are not re-parsed. */
export type ThreadPreviewMemo = WeakMap<
  TimelineItemView,
  {
    kind: TimelineItemView['kind'];
    text: string | undefined;
    preview: ThreadPreview | undefined;
  }
>;

function itemPreview(
  item: TimelineItemView,
  memo: ThreadPreviewMemo | undefined,
): ThreadPreview | undefined {
  if (item.kind === 'activity')
    return {
      label: 'Latest activity',
      text: activityLabel(item.toolName, item.activity?.kind),
    };
  if (item.kind !== 'user' && item.kind !== 'assistant') return undefined;
  const cached = memo?.get(item);
  if (cached && cached.kind === item.kind && cached.text === item.text) return cached.preview;
  const text = item.text && plainText(item.text);
  const preview: ThreadPreview | undefined = text
    ? { label: item.kind === 'user' ? 'Request' : 'Latest reply', text: clipText(text, 420) }
    : undefined;
  memo?.set(item, { kind: item.kind, text: item.text, preview });
  return preview;
}

/** Summaries come from the existing snapshot; hovering never selects or reads a task. */
export function threadPreviews(
  timeline: readonly TimelineItemView[],
  memo?: ThreadPreviewMemo,
): Map<string, ThreadPreview> {
  const byThread = new Map<string, TimelineItemView[]>();
  const requests = new Map<string, TimelineItemView>();
  for (const item of timeline) {
    // A queued follow-up is not the thread's request until it starts.
    if (item.kind === 'user' && item.status === 'pending') continue;
    let items = byThread.get(item.threadId);
    if (!items) byThread.set(item.threadId, (items = []));
    items.push(item);
    if (item.kind === 'user' && item.sequence > (requests.get(item.threadId)?.sequence ?? -1))
      requests.set(item.threadId, item);
  }
  const previews = new Map<string, ThreadPreview>();
  for (const [threadId, items] of byThread) {
    const request = requests.get(threadId);
    const candidates = request
      ? items.filter(
          (item) =>
            item.sequence >= request.sequence &&
            !(request.turnId && item.turnId && request.turnId !== item.turnId),
        )
      : items;
    // The newest summarizable item wins; the stable sort keeps timeline order for equal sequences.
    const newestFirst = candidates.toSorted((left, right) => right.sequence - left.sequence);
    for (const item of newestFirst) {
      const preview = itemPreview(item, memo);
      if (preview) {
        previews.set(threadId, preview);
        break;
      }
    }
  }
  return previews;
}
