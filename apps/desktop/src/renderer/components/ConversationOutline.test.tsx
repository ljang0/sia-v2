// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThreadEvent } from '../types';
import { ConversationOutline, projectConversationOutline } from './ConversationOutline';

afterEach(cleanup);

const events: ThreadEvent[] = [
  {
    id: 'message-1',
    type: 'message',
    role: 'user',
    content: 'Map the release risks before changing anything.',
    timestamp: '2026-08-25T12:00:00.000Z',
  },
  {
    id: 'plan-1',
    type: 'activity',
    kind: 'plan',
    title: 'Release plan',
    status: 'running',
    timestamp: '2026-08-25T12:01:00.000Z',
    presentation: {
      kind: 'plan',
      steps: [
        { id: 'step-1', text: 'Check the build', status: 'completed' },
        { id: 'step-2', text: 'Run participant acceptance', status: 'in_progress' },
      ],
    },
  },
  {
    id: 'subagent-1',
    type: 'activity',
    kind: 'command',
    title: 'Parallel release review',
    status: 'complete',
    timestamp: '2026-08-25T12:02:00.000Z',
    presentation: {
      kind: 'subagent',
      subagentId: 'release-reviewer',
      name: 'Release reviewer',
      phase: 'completed',
      text: 'Validated the local evidence bundle.',
    },
  },
  {
    id: 'notice-1',
    type: 'notice',
    tone: 'info',
    title: 'Context compacted',
    detail: 'Older turns were summarized.',
  },
];

describe('ConversationOutline', () => {
  it('projects only existing messages and work activity without inventing events', () => {
    const outline = projectConversationOutline(events, 'Moss');

    expect(outline).toHaveLength(3);
    expect(outline[0]).toMatchObject({
      eventId: 'message-1',
      kind: 'message',
      label: 'You',
      preview: 'Map the release risks before changing anything.',
    });
    expect(outline[1]).toMatchObject({
      eventId: 'plan-1',
      kind: 'plan',
      preview: '1 of 2 steps finished',
      status: 'running',
    });
    expect(outline[1]?.steps).toEqual([
      { id: 'step-1', text: 'Check the build', status: 'completed' },
      { id: 'step-2', text: 'Run participant acceptance', status: 'in_progress' },
    ]);
    expect(outline[2]).toMatchObject({
      eventId: 'subagent-1',
      kind: 'subagent',
      label: 'Release reviewer',
      preview: 'Validated the local evidence bundle.',
      status: 'complete',
    });
  });

  it('reveals a compact outline and navigates plan steps to their source event', () => {
    const onNavigate = vi.fn();
    render(<ConversationOutline events={events} agentName="Moss" onNavigate={onNavigate} />);

    const trigger = screen.getByRole('button', { name: 'Thread outline' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('complementary', { name: 'Conversation outline' })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Conversation outline' })).toBeTruthy();
    expect(screen.getByText('1 message · 2 work notes')).toBeTruthy();
    expect(screen.getByText('How this conversation unfolded')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Run participant acceptance/ }));
    expect(onNavigate).toHaveBeenCalledWith('plan-1');
    expect(screen.queryByRole('complementary', { name: 'Conversation outline' })).toBeNull();
  });

  it('closes on Escape and returns focus to its trigger', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<ConversationOutline events={events} onNavigate={() => undefined} />);
    const trigger = screen.getByRole('button', { name: 'Thread outline' });

    fireEvent.click(trigger);
    expect(screen.getByRole('complementary', { name: 'Conversation outline' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('complementary', { name: 'Conversation outline' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
