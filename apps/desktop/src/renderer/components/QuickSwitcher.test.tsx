// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSummary } from '../types';
import { QuickSwitcher } from './QuickSwitcher';

afterEach(cleanup);

const agents: AgentSummary[] = [
  {
    id: 'agent-1',
    name: 'Release room',
    instructions: '',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/workspace',
    initials: 'RR',
    hue: 0,
    pinned: true,
    notificationsEnabled: true,
    threads: [
      {
        id: 'thread-1',
        agentId: 'agent-1',
        title: 'Alpha readiness',
        updatedAt: '2026-08-26T00:00:00.000Z',
        status: 'idle',
      },
    ],
  },
];

describe('QuickSwitcher resources', () => {
  it('searches message resources without replacing room navigation', async () => {
    const onSelectThread = vi.fn();
    render(
      <QuickSwitcher
        open
        agents={agents}
        actions={[]}
        onOpenChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectThread={onSelectThread}
        searchResources={async () => [
          {
            threadId: 'thread-1',
            threadTitle: 'Alpha readiness',
            archived: false,
            matches: [
              {
                itemId: 'message-1:file:file-1',
                excerpt: 'release-spec.pdf',
                label: 'release-spec.pdf',
                timestamp: '2026-08-26T00:00:00.000Z',
                kind: 'file',
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Search rooms and actions' }), {
      target: { value: 'release spec' },
    });
    const result = await screen.findByRole('option', { name: /release-spec.pdf/ });
    fireEvent.click(result);
    await waitFor(() => expect(onSelectThread).toHaveBeenCalledWith('thread-1', false));
  });
});
