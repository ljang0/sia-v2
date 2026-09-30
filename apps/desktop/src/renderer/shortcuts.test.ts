import { describe, expect, it } from 'vitest';
import { demoSnapshot } from './demo';
import { conversationForShortcut, sidebarAgentOrder, sidebarThreadOrder } from './shortcuts';

describe('sidebar order', () => {
  it('lists pinned conversations first and keeps each part in recency order', () => {
    const threads = [
      { id: 'a', pinned: false },
      { id: 'b', pinned: true },
      { id: 'c' },
      { id: 'd', pinned: true },
    ];
    expect(sidebarThreadOrder(threads).map(({ id }) => id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('returns the same list when nothing moves, so memoized rows stay put', () => {
    const none = [{ id: 'a' }, { id: 'b', pinned: false }];
    const all = [
      { id: 'a', pinned: true },
      { id: 'b', pinned: true },
    ];
    expect(sidebarThreadOrder(none)).toBe(none);
    expect(sidebarThreadOrder(all)).toBe(all);
  });

  it('⌘1–9 follow the pinned order the sidebar shows', () => {
    const agents = structuredClone(demoSnapshot.agents);
    const first = sidebarAgentOrder(agents)[0]!;
    const unpinnedFirst = conversationForShortcut(agents, 1);
    expect(unpinnedFirst).toBe(first.threads[0]!.id);

    const later = first.threads.at(-1)!;
    later.pinned = true;
    expect(conversationForShortcut(agents, 1)).toBe(later.id);
    expect(conversationForShortcut(agents, 2)).toBe(first.threads[0]!.id);
  });
});
