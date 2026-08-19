// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

afterEach(cleanup);

describe('Composer attachments', () => {
  it('picks, removes, and sends attachment ids without requiring message text', async () => {
    const onPickAttachments = vi.fn();
    const onRemoveAttachment = vi.fn();
    const onSend = vi.fn(async () => undefined);
    render(
      <Composer
        attachments={[
          { id: 'file-1', name: 'release-notes.pdf', kind: 'file', sizeBytes: 2_048 },
        ]}
        acceptingAttachments
        onPickAttachments={onPickAttachments}
        onRemoveAttachment={onRemoveAttachment}
        onSend={onSend}
        onStop={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add files or images' }));
    expect(onPickAttachments).toHaveBeenCalledOnce();
    expect(screen.getByText('2 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove release-notes.pdf' }));
    expect(onRemoveAttachment).toHaveBeenCalledWith('file-1');

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', ['file-1']));
  });

  it('explains when the active model cannot accept attachments', () => {
    render(
      <Composer
        acceptingAttachments={false}
        onPickAttachments={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
      />,
    );

    const button = screen.getByRole('button', { name: 'Add files or images' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Attachments are unavailable for this model');
  });
});
