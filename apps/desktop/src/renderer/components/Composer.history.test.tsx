// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

afterEach(cleanup);

function renderComposer(history: string[], onDraftChange = vi.fn()) {
  render(
    <Composer
      history={history}
      onDraftChange={onDraftChange}
      onSend={() => undefined}
      onStop={() => undefined}
    />,
  );
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
}

function caret(input: HTMLTextAreaElement, position: number) {
  input.setSelectionRange(position, position);
}

describe('Composer message history', () => {
  it('steps back and forward through sent messages from an empty box', () => {
    const input = renderComposer(['first', 'second', 'third']);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('third');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('second');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('first');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('second');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('');
  });

  it('Esc restores the empty draft and does not reach the window', () => {
    const input = renderComposer(['hello']);
    const windowEscape = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    window.addEventListener('keydown', windowEscape);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('hello');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(windowEscape).toHaveLastReturnedWith(true);

    // With nothing recalled, Esc is left for the app (it stops a running task).
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(windowEscape).toHaveLastReturnedWith(false);
    window.removeEventListener('keydown', windowEscape);
  });

  it('leaves a typed draft and multi-line editing alone', () => {
    const onDraftChange = vi.fn();
    const input = renderComposer(['older', 'line one\nline two'], onDraftChange);

    fireEvent.change(input, { target: { value: 'my own words' } });
    caret(input, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('my own words');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('line one\nline two');
    // The caret on the second line moves up within the message instead of recalling.
    caret(input, input.value.length);
    const up = fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(up).toBe(true);
    expect(input.value).toBe('line one\nline two');
    // From the first line, ↑ goes on to the older message.
    caret(input, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('older');
  });

  it('turns a recalled message into a draft once edited, and clearing ends recall', () => {
    const input = renderComposer(['first', 'second']);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.change(input, { target: { value: 'second, edited' } });
    caret(input, 0);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('second, edited');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('second, edited');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.value).toBe('');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.value).toBe('second');
  });

  it('does nothing without earlier messages or with modifier keys', () => {
    const empty = renderComposer([]);
    fireEvent.keyDown(empty, { key: 'ArrowUp' });
    expect(empty.value).toBe('');
    cleanup();

    const input = renderComposer(['sent']);
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(input, { key: 'ArrowUp', metaKey: true });
    expect(input.value).toBe('');
  });
});
