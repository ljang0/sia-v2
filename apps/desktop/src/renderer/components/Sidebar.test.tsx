// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

describe('thread navigation', () => {
  it('derives agent presence from real thread state', () => {
    const agents = structuredClone(demoSnapshot.agents);
    agents[0]!.threads[0]!.status = 'running';
    const { container } = render(
      <Sidebar
        agents={agents}
        selectedAgentId={agents[0]!.id}
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-presence="working"]')).toBeTruthy();
  });

  it('routes Activity and Archived to distinct destinations', () => {
    const onOpenActivity = vi.fn();
    const onOpenArchived = vi.fn();

    render(
      <Sidebar
        agents={demoSnapshot.agents}
        selectedAgentId="agent-work"
        selectedThreadId="thread-research"
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenActivity={onOpenActivity}
        onOpenArchived={onOpenArchived}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('activity-center-toggle'));
    fireEvent.click(screen.getByTestId('archived-threads-toggle'));
    expect(onOpenActivity).toHaveBeenCalledOnce();
    expect(onOpenArchived).toHaveBeenCalledOnce();
  });

  it('shows draft, unread, work state, and recency without changing thread labels', () => {
    const agents = structuredClone(demoSnapshot.agents);
    agents[0]!.threads[0]!.draft = 'Outline the release note before sending';
    agents[0]!.threads[1]!.unread = true;
    agents[0]!.threads[1]!.status = 'waiting';

    const { container } = render(
      <Sidebar
        agents={agents}
        selectedAgentId={agents[0]!.id}
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Outline the release note before sending')).toBeTruthy();
    expect(screen.getByText('Waiting for you')).toBeTruthy();
    expect(container.querySelector('time[datetime]')).toBeTruthy();
    expect(screen.getByRole('button', { name: agents[0]!.threads[0]!.title })).toBeTruthy();
  });

  it('searches, renames, and confirms deletion of an idle thread', async () => {
    const onRenameThread = vi.fn().mockResolvedValue(undefined);
    const onDeleteThread = vi.fn().mockResolvedValue(undefined);
    const agents = structuredClone(demoSnapshot.agents);
    const template = agents[0]!.threads[0]!;
    agents[0]!.threads.push(
      ...Array.from({ length: 3 }, (_, index) => ({
        ...template,
        id: `extra-thread-${index}`,
        title: `Extra thread ${index + 1}`,
      })),
    );

    render(
      <Sidebar
        agents={agents}
        selectedAgentId="agent-work"
        selectedThreadId="thread-research"
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={onRenameThread}
        onDeleteThread={onDeleteThread}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a thread' }), {
      target: { value: 'inbox' },
    });

    expect(screen.getByRole('button', { name: 'Triage today’s inbox' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Weekly research update' })).toBeNull();

    const menu = screen.getByRole('button', {
      name: 'Thread actions for Triage today’s inbox',
    });
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));

    const rename = screen.getByRole('textbox', { name: 'Rename Triage today’s inbox' });
    fireEvent.change(rename, { target: { value: 'Morning inbox' } });
    fireEvent.submit(rename.closest('form')!);

    await waitFor(() =>
      expect(onRenameThread).toHaveBeenCalledWith('thread-inbox', 'Morning inbox'),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Thread actions for Triage today’s inbox' }),
      ).toBeTruthy(),
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Thread actions for Triage today’s inbox' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByRole('alertdialog', { name: 'Delete this thread?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete thread' }));
    await waitFor(() => expect(onDeleteThread).toHaveBeenCalledWith('thread-inbox'));
  });
});
