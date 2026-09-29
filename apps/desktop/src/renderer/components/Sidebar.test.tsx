// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

describe('thread navigation', () => {
  it('fades the list bottom only while more conversations sit below the fold', () => {
    const { container } = render(
      <Sidebar
        agents={demoSnapshot.agents}
        selectedAgentId="agent-work"
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
    const list = container.querySelector<HTMLElement>('[class*="sidebarScroll"]')!;
    expect(list.hasAttribute('data-more-below')).toBe(false);
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 400 });
    fireEvent.scroll(list);
    expect(list.hasAttribute('data-more-below')).toBe(true);
    list.scrollTop = 500;
    fireEvent.scroll(list);
    expect(list.hasAttribute('data-more-below')).toBe(false);
    // Rows now sit under the section header, which draws its edge.
    expect(screen.getByText('Your agents').parentElement?.hasAttribute('data-scrolled')).toBe(
      true,
    );
  });

  it('explains the empty list before any agent exists', () => {
    render(
      <Sidebar
        agents={[]}
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
    expect(screen.getByText('No agents yet')).toBeTruthy();
  });

  it('names agent actions as agent actions', async () => {
    render(
      <Sidebar
        agents={demoSnapshot.agents}
        selectedAgentId="agent-work"
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={vi.fn()}
        onDeleteThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onDuplicateAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', {
      name: `Agent actions for ${demoSnapshot.agents[0]!.name}`,
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(await screen.findByRole('menuitem', { name: 'Edit agent' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicate agent' })).toBeTruthy();
    expect(screen.queryByText(/room/i)).toBeNull();
  });

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

  it('keeps Activity accessible without a separate Archived sidebar item', () => {
    const onOpenActivity = vi.fn();

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
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('activity-center-toggle'));
    expect(onOpenActivity).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Archived' })).toBeNull();
  });

  it('keeps draft and work cues in rows, with draft content and recency in the preview', () => {
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
    expect(screen.queryByText('Outline the release note before sending')).toBeNull();
    expect(screen.getAllByText('Waiting for you')).toHaveLength(2);
    expect(container.querySelector('[data-thread-unread="true"]')).toBeTruthy();
    expect(container.querySelector('time[datetime]')).toBeNull();
    const draft = screen.getByRole('button', { name: agents[0]!.threads[0]!.title });
    expect(draft.getAttribute('aria-description')).toBe('Waiting for you. Unsent draft');
    fireEvent.focus(draft);
    expect(screen.getByRole('tooltip').textContent).toContain(
      'Outline the release note before sending',
    );
    expect(screen.getByRole('tooltip').querySelector('time')?.dateTime).toBe(
      agents[0]!.threads[0]!.updatedAt,
    );
  });

  it('disables Fork while a thread is working and explains why', async () => {
    const agents = structuredClone(demoSnapshot.agents);
    const thread = agents[0]!.threads[0]!;
    thread.status = 'running';
    render(
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
        onForkThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    fireEvent.pointerDown(
      screen.getByRole('button', { name: `Thread actions for ${thread.title}` }),
      { button: 0, ctrlKey: false },
    );
    const fork = await screen.findByRole('menuitem', { name: 'Fork' });
    expect(fork.getAttribute('aria-disabled')).toBe('true');
    expect(fork.getAttribute('title')).toBe('Stop or finish the current task before forking.');
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

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a conversation' }), {
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
  it('saves a rename on click-away, cancels on Escape, and badges closed groups that need you', async () => {
    const onRenameThread = vi.fn().mockResolvedValue(undefined);
    const agents = structuredClone(demoSnapshot.agents);
    render(
      <Sidebar
        agents={agents}
        selectedAgentId="agent-work"
        collapsed={false}
        onToggle={vi.fn()}
        onSelectAgent={vi.fn()}
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onRenameThread={onRenameThread}
        onDeleteThread={vi.fn()}
        onCreateAgent={vi.fn()}
        onEditAgent={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );
    const openRename = async () => {
      fireEvent.pointerDown(
        screen.getByRole('button', { name: 'Thread actions for Triage today’s inbox' }),
        { button: 0, ctrlKey: false },
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
      return screen.getByRole('textbox', { name: 'Rename Triage today’s inbox' });
    };

    let rename = await openRename();
    fireEvent.change(rename, { target: { value: 'Ignored title' } });
    fireEvent.keyDown(rename, { key: 'Escape' });
    fireEvent.blur(rename);
    expect(onRenameThread).not.toHaveBeenCalled();

    rename = await openRename();
    fireEvent.change(rename, { target: { value: 'Morning inbox' } });
    fireEvent.blur(rename);
    await waitFor(() =>
      expect(onRenameThread).toHaveBeenCalledWith('thread-inbox', 'Morning inbox'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Research partner' }));
    expect(screen.getByRole('button', { name: 'Research partner, 1 need you' })).toHaveProperty(
      'title',
      'Research partner',
    );
  });
});
