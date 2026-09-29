// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer, LONG_PASTE_CHARACTERS } from './Composer';

function clipboard(files: File[], text = ''): DataTransfer {
  return {
    files: files as unknown as FileList,
    getData: (type: string) => (type === 'text/plain' ? text : ''),
  } as unknown as DataTransfer;
}

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

  it('attaches a pasted screenshot or long text, even while a task runs, and leaves short text alone', async () => {
    const onPasteFiles = vi.fn();
    render(
      <Composer
        running
        acceptingAttachments
        onPasteFiles={onPasteFiles}
        onSend={() => undefined}
        onStop={() => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Message' });
    const screenshot = new File([new Uint8Array([0x89, 0x50])], 'image.png', {
      type: 'image/png',
    });
    fireEvent.paste(input, { clipboardData: clipboard([screenshot]) });
    expect(onPasteFiles).toHaveBeenLastCalledWith([screenshot]);

    const long = 'x'.repeat(LONG_PASTE_CHARACTERS + 1);
    fireEvent.paste(input, { clipboardData: clipboard([], long) });
    const [textFile] = onPasteFiles.mock.lastCall![0] as File[];
    expect(textFile).toMatchObject({ name: 'Pasted text.txt', type: 'text/plain' });
    expect(await textFile!.text()).toBe(long);

    // Cells copied from a spreadsheet carry a picture of themselves; that paste stays text.
    const cells = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });
    fireEvent.paste(input, { clipboardData: clipboard([cells], 'Q1\t42') });
    // A Finder copy names its files in the text, so it still attaches.
    const copied = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.paste(input, { clipboardData: clipboard([copied], 'photo.jpg') });
    fireEvent.paste(input, { clipboardData: clipboard([], 'short note') });
    expect(onPasteFiles).toHaveBeenCalledTimes(3);
    expect(onPasteFiles).toHaveBeenLastCalledWith([copied]);
  });
});
