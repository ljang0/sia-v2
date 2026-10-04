// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AttachmentPreview, ThreadDetail } from '../types';
import { Conversation } from './Conversation';

afterEach(cleanup);

const thread: ThreadDetail = {
  id: 'thread-1',
  agentId: 'agent-1',
  title: 'Receipts',
  updatedAt: '2026-09-28T10:00:00.000Z',
  status: 'idle',
  provider: 'codex',
  model: 'gpt-5.6-sol',
  workspace: '/tmp/workspace',
  events: [
    {
      id: 'ask',
      type: 'message',
      role: 'user',
      content: 'File these',
      timestamp: '2026-09-28T10:00:00.000Z',
      attachments: [
        { id: 'img-1', name: 'receipt.png', kind: 'image', bytes: 10 },
        { id: 'doc-1', name: 'notes.txt', kind: 'file', bytes: 10 },
      ],
    },
  ],
};

it('shows a thumbnail for a sent image and an icon for other files', async () => {
  const preview = vi.fn(async (id: string): Promise<AttachmentPreview> =>
    id === 'img-1'
      ? { kind: 'image', dataUrl: 'data:image/png;base64,cGl4ZWxz' }
      : { kind: 'unavailable', detail: 'No preview' },
  );
  render(
    <Conversation
      thread={thread}
      onSend={async () => undefined}
      onStop={async () => undefined}
      onRetry={async () => undefined}
      onResolveApproval={async () => undefined}
      onPreviewAttachment={preview}
    />,
  );
  const image = screen.getByRole('button', { name: /receipt\.png/ });
  await waitFor(() =>
    expect(image.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,cGl4ZWxz',
    ),
  );
  expect(screen.getByRole('button', { name: /notes\.txt/ }).querySelector('img')).toBeNull();
  expect(preview).toHaveBeenCalledTimes(1);
  expect(preview).toHaveBeenCalledWith('img-1');
});

it('warns above the composer once most of the plan usage window is used', () => {
  const props = {
    onSend: async () => undefined,
    onStop: async () => undefined,
    onRetry: async () => undefined,
    onResolveApproval: async () => undefined,
  };
  const view = render(
    <Conversation thread={{ ...thread, usageLimit: { usedPercent: 50 } }} {...props} />,
  );
  expect(screen.queryByTestId('usage-warning')).toBeNull();
  view.rerender(
    <Conversation thread={{ ...thread, usageLimit: { usedPercent: 86 } }} {...props} />,
  );
  expect(screen.getByTestId('usage-warning').textContent).toContain(
    'You’ve used 86% of your plan’s usage limit.',
  );
});

it('previews and opens generated assistant results through their host grant', async () => {
  const { fireEvent } = await import('@testing-library/react');
  const preview = vi.fn(async (): Promise<AttachmentPreview> => ({
    kind: 'text',
    content: 'food,25',
    format: 'csv',
    language: 'CSV',
  }));
  const open = vi.fn(async () => {});
  const reveal = vi.fn(async () => {});
  const result: ThreadDetail = {
    ...thread,
    events: [
      {
        id: 'result',
        type: 'message',
        role: 'assistant',
        content: 'Your report is ready.',
        timestamp: '2030-01-01',
        attachments: [
          {
            id: 'result-grant',
            name: 'Family résumé.csv',
            bytes: 7,
            kind: 'file',
            generated: true,
          },
        ],
      },
    ],
  };
  render(
    <Conversation
      thread={result}
      onSend={async () => {}}
      onStop={async () => {}}
      onRetry={async () => {}}
      onResolveApproval={async () => {}}
      onPreviewAttachment={preview}
      onOpenAttachment={open}
      onRevealAttachment={reveal}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Preview result: Family résumé.csv' }));
  await screen.findByText('food,25');
  expect(preview).toHaveBeenCalledWith('result-grant');
  expect(screen.getByText(/Saved result/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reveal in Finder' }));
  expect(open).toHaveBeenCalledWith('result-grant');
  expect(reveal).toHaveBeenCalledWith('result-grant');
});
