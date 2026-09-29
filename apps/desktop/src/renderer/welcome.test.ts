import { describe, expect, it } from 'vitest';
import {
  STARTER_INSTRUCTIONS,
  recentThreads,
  timeAgo,
  timeGreeting,
  welcomePrompts,
} from './welcome';
import type { AgentSummary, AppConnection, ThreadSummary } from './types';

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
    const now = new Date(2026, 8, 25, 9);
    expect(welcomePrompts(agent, { now })[0]?.prompt).toContain('plan today');
    expect(welcomePrompts({ ...agent, provider: 'claude' }, { now })).toEqual(
      welcomePrompts(agent, { now }),
    );
    // Each suggestion has a short title to scan and the full request it sends.
    for (const item of welcomePrompts(agent, { now }))
      expect(item.title.length).toBeLessThan(item.prompt.length);
    expect(
      welcomePrompts({ ...agent, instructions: 'Help with my software repository.' })[0]
        ?.prompt,
    ).toContain('current changes');
    // The onboarding starter mentions research as one example; it is not a stated purpose.
    expect(
      welcomePrompts({ ...agent, instructions: STARTER_INSTRUCTIONS }, { now })[0]?.prompt,
    ).toContain('plan today');
  });

  it('fits suggestions to the time of day and the apps that are connected', () => {
    const agent = { name: 'Sia', instructions: STARTER_INSTRUCTIONS } as AgentSummary;
    const app = (id: AppConnection['id'], status: AppConnection['status'] = 'connected') =>
      ({
        id,
        name: id,
        description: '',
        status,
        enabled: true,
        permissions: [],
      }) as AppConnection;
    const titles = (now: Date, apps: AppConnection[] = []) =>
      welcomePrompts(agent, { now, apps }).map((prompt) => prompt.title);

    expect(titles(new Date(2026, 8, 25, 8))).toEqual([
      'Plan my day',
      'Summarize a page',
      'Find a file',
    ]);
    expect(titles(new Date(2026, 8, 25, 14))[0]).toBe('Clear my to-do list');
    // Late at night is still the evening, not the morning.
    expect(titles(new Date(2026, 8, 25, 1))[0]).toBe('Wrap up today');
    expect(titles(new Date(2026, 8, 25, 21), [app('gmail'), app('docs')])).toEqual([
      'Wrap up today',
      'Triage my inbox',
      'Summarize a document',
    ]);
    // Apps that are not connected, or are turned off, are not suggested.
    expect(
      titles(new Date(2026, 8, 25, 21), [
        app('gmail', 'error'),
        { ...app('slack'), enabled: false },
      ]),
    ).toEqual(['Wrap up today', 'Summarize a page', 'Find a file']);
  });

  it('says how long ago in plain words', () => {
    const now = new Date(2026, 8, 25, 15, 0);
    expect(timeAgo(new Date(2026, 8, 25, 14, 59, 40).toISOString(), now)).toBe('Just now');
    expect(timeAgo(new Date(2026, 8, 25, 14, 48).toISOString(), now)).toBe('12 min ago');
    expect(timeAgo(new Date(2026, 8, 25, 9, 0).toISOString(), now)).toBe('6 hr ago');
    expect(timeAgo(new Date(2026, 8, 24, 22, 0).toISOString(), now)).toBe('Yesterday');
    expect(timeAgo(new Date(2026, 8, 12, 9).toISOString(), now)).toMatch(/12/);
  });
});
