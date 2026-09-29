import { describe, expect, it } from 'vitest';
import { STARTER_INSTRUCTIONS, recentThreads, timeGreeting, welcomePrompts } from './welcome';
import type { AgentSummary, ThreadSummary } from './types';

describe('personal welcome', () => {
  it('prioritizes attention, excludes the current and archived threads, and leaves source order intact', () => {
    const base: ThreadSummary = {
      id: 'current',
      agentId: 'a',
      title: 'Current',
      updatedAt: '2026-09-25',
      status: 'idle',
    };
    const threads = [
      base,
      { ...base, id: 'newer', title: 'Newer', updatedAt: '2026-09-26' },
      { ...base, id: 'waiting', status: 'waiting' as const },
      { ...base, id: 'archived', archivedAt: '2026-09-24' },
      { ...base, id: 'empty', title: 'New thread' },
    ];
    const before = structuredClone(threads);
    expect(recentThreads(threads, 'current').map((thread) => thread.id)).toEqual([
      'waiting',
      'newer',
    ]);
    expect(threads).toEqual(before);
  });
  it('uses local time and explicit purpose without assuming Codex users want coding tasks', () => {
    expect(timeGreeting(new Date(2026, 8, 25, 9))).toBe('Good morning');
    expect(timeGreeting(new Date(2026, 8, 25, 15))).toBe('Good afternoon');
    expect(timeGreeting(new Date(2026, 8, 25, 20))).toBe('Good evening');
    const agent = {
      name: 'Testing1',
      instructions: 'Help me with everyday work.',
      provider: 'codex',
    } as AgentSummary;
    expect(welcomePrompts(agent)[0]?.prompt).toContain('plan today');
    // Each suggestion has a short title to scan and the full request it sends.
    for (const item of welcomePrompts(agent))
      expect(item.title.length).toBeLessThan(item.prompt.length);
    expect(welcomePrompts({ ...agent, provider: 'claude' })).toEqual(welcomePrompts(agent));
    expect(
      welcomePrompts({ ...agent, instructions: 'Help with my software repository.' })[0]
        ?.prompt,
    ).toContain('current changes');
    // The onboarding starter mentions research as one example; it is not a stated purpose.
    expect(
      welcomePrompts({ ...agent, instructions: STARTER_INSTRUCTIONS })[0]?.prompt,
    ).toContain('plan today');
  });
});
