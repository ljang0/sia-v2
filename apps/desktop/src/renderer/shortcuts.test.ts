import { describe, expect, it } from 'vitest';
import { demoSnapshot } from './demo/snapshot';
import {
  conversationForShortcut,
  listedThreads,
  sidebarAgentOrder,
  sidebarThreadOrder,
} from './shortcuts';
import { UNTITLED_THREAD_TITLE } from '../shared/plain-text';

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

  it('lists an untouched conversation only while it is open', () => {
    const thread = (id: string, extra: object = {}) => ({
      id,
      title: UNTITLED_THREAD_TITLE,
      status: 'idle' as const,
      ...extra,
    });
    const threads = [
      thread('empty'),
      thread('drafted', { draft: 'Remind me to' }),
      thread('sent', { preview: { label: 'Request', text: 'Plan my week' } }),
      thread('named', { title: 'Trip notes' }),
      thread('working', { status: 'running' as const }),
    ];
    expect(listedThreads(threads).map(({ id }) => id)).toEqual([
      'drafted',
      'sent',
      'named',
      'working',
    ]);
    expect(listedThreads(threads, 'empty').map(({ id }) => id)).toContain('empty');

    const agents = structuredClone(demoSnapshot.agents);
    const first = sidebarAgentOrder(agents)[0]!;
    first.threads.unshift({ ...thread('left-behind'), agentId: first.id, updatedAt: '' });
    expect(conversationForShortcut(agents, 1)).not.toBe('left-behind');
    expect(conversationForShortcut(agents, 1, 'left-behind')).toBe('left-behind');
  });
});
