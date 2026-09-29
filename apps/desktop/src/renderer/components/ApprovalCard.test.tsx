// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalEvent } from '../types';
import { ApprovalCard } from './ApprovalCard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ApprovalCard', () => {
  it('shows the exact foreground target and resolves only after a deliberate click', () => {
    const resolve = vi.fn();
    const event: ApprovalEvent = {
      id: 'approval-focus',
      type: 'approval',
      status: 'pending',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-focus',
        kind: 'foreground',
        title: 'Use Chrome in the foreground',
        reason: 'The target cannot be activated exactly in the background.',
        appName: 'Google Chrome',
        target: 'Click Submit feedback on research.sia.dev',
        restoresFocusTo: 'Notes',
      },
    };

    render(<ApprovalCard event={event} onResolve={resolve} />);

    expect(screen.getByText('Click Submit feedback on research.sia.dev')).toBeTruthy();
    expect(screen.getByText('Focus returns to Notes when the action finishes.')).toBeTruthy();
    expect(resolve).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Take over briefly' }));
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith('approval-focus', 'approve');
  });

  it('shows connector account, destination, and outgoing content', () => {
    const event: ApprovalEvent = {
      id: 'approval-post',
      type: 'approval',
      status: 'pending',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-post',
        kind: 'connector',
        title: 'Post a Slack message',
        app: 'Slack',
        account: 'Sia workspace',
        action: 'Post',
        destination: '#alpha-research',
        preview: 'The browser checks passed.',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      },
    };

    render(<ApprovalCard event={event} onResolve={() => undefined} />);

    expect(screen.getByText('Sia workspace')).toBeTruthy();
    expect(screen.getByText('#alpha-research')).toBeTruthy();
    expect(screen.getByText('The browser checks passed.')).toBeTruthy();
  });

  it('does not mislabel browser and file approvals as connector writes', () => {
    const event: ApprovalEvent = {
      id: 'approval-browser',
      type: 'approval',
      status: 'pending',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-browser',
        kind: 'action',
        title: 'Attach Chrome profile',
        category: 'Browser',
        summary: 'Attach the running Personal profile',
        target: 'Google Chrome, Personal',
        reversible: true,
      },
    };

    render(<ApprovalCard event={event} onResolve={() => undefined} />);

    expect(screen.getByText('Review this browser action before Sia continues.')).toBeTruthy();
    expect(screen.getByText('Google Chrome, Personal')).toBeTruthy();
    expect(
      screen.getByText(
        'This approval applies only to the target shown. Sia does not provide an automatic undo.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/reversible record/i)).toBeNull();
    expect(screen.queryByText(/Gmail will make/i)).toBeNull();
  });

  it('does not describe local computer input as leaving the Mac', () => {
    const event: ApprovalEvent = {
      id: 'approval-computer',
      type: 'approval',
      status: 'pending',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-computer',
        kind: 'action',
        title: 'Approve Computer Action',
        category: 'Tool',
        summary: 'This operation changes local state',
        target: 'TextEdit, window “Untitled”: set text area',
        dataLeaving: 'Replacement text',
        dataLabel: 'Text or keys used in this action',
        reversible: false,
      },
    };

    render(<ApprovalCard event={event} onResolve={() => undefined} />);

    expect(screen.getByText('Text or keys used in this action')).toBeTruthy();
    expect(screen.queryByText('Data leaving your Mac')).toBeNull();
  });

  it('ticks the connector preview countdown and closes expired approval controls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    const event: ApprovalEvent = {
      id: 'approval-expiring',
      type: 'approval',
      status: 'pending',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-expiring',
        kind: 'connector',
        title: 'Send a Gmail draft',
        app: 'Gmail',
        account: 'lawrence@example.com',
        action: 'Send draft',
        destination: 'team@example.com',
        preview: 'Status update',
        expiresAt: '2026-08-13T00:01:30.000Z',
      },
    };

    render(<ApprovalCard event={event} onResolve={vi.fn()} />);
    expect(screen.getByText('Preview expires in 2 minutes')).toBeTruthy();

    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText('Preview expires in 1 minute')).toBeTruthy();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Preview expired')).toBeTruthy();
    expect(screen.getByText('expired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('drops the preview countdown once the person has answered', () => {
    const event: ApprovalEvent = {
      id: 'approval-answered',
      type: 'approval',
      status: 'approved',
      timestamp: '2026-08-13T00:00:00.000Z',
      request: {
        id: 'approval-answered',
        kind: 'connector',
        title: 'Create a Gmail draft',
        app: 'Gmail',
        account: 'lawrence@example.com',
        action: 'Create draft',
        destination: 'team@example.com',
        preview: 'Status update',
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    };
    render(<ApprovalCard event={event} onResolve={vi.fn()} />);
    expect(screen.getByText('approved')).toBeTruthy();
    expect(screen.queryByText(/Preview expire/)).toBeNull();
  });

  it('shows a native shell command in a monospace block', () => {
    render(
      <ApprovalCard
        event={nativeApproval('Run a command: git push --force origin main')}
        onResolve={vi.fn()}
      />,
    );
    const command = screen.getByText('git push --force origin main');
    expect(command.tagName).toBe('CODE');
    expect(command.closest('pre')).toBeTruthy();
    expect(screen.getByText('Run this command')).toBeTruthy();
    expect(screen.queryByText(/Run a command:/)).toBeNull();
  });

  it('takes focus onto the card, not Approve, only when focus has nowhere better to be', () => {
    const { unmount } = render(
      <ApprovalCard event={nativeApproval('Change notes.md')} onResolve={vi.fn()} />,
    );
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Allow Mac action' }),
    );
    unmount();

    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    render(<ApprovalCard event={nativeApproval('Change notes.md')} onResolve={vi.fn()} />);
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('leaves focus with someone typing in the composer', () => {
    const composer = document.createElement('div');
    composer.setAttribute('data-companion-composer', '');
    const input = document.createElement('textarea');
    input.setAttribute('data-composer-input', '');
    composer.append(input);
    document.body.append(composer);
    input.focus();
    input.value = 'Half a sentence';
    const { unmount } = render(
      <ApprovalCard event={nativeApproval('Change notes.md')} onResolve={vi.fn()} />,
    );
    expect(document.activeElement).toBe(input);
    unmount();

    // An empty composer is not someone typing: the new request takes focus.
    input.value = '';
    input.focus();
    render(<ApprovalCard event={nativeApproval('Change notes.md')} onResolve={vi.fn()} />);
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'Allow Mac action' }),
    );
    composer.remove();
  });
});

function nativeApproval(summary: string): ApprovalEvent {
  return {
    id: 'approval-native',
    type: 'approval',
    status: 'pending',
    timestamp: '2026-08-13T00:00:00.000Z',
    request: {
      id: 'approval-native',
      kind: 'action',
      title: 'Allow Mac action',
      category: 'Tool',
      summary,
      target: 'This Mac',
      reversible: false,
    },
  };
}
