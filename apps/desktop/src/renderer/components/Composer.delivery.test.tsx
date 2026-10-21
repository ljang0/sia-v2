// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

afterEach(cleanup);

it.each(['accepted', 'failed'] as const)(
  'preserves the next draft while a send is %s, and prevents duplicate submission',
  async (outcome) => {
    const delivery = Promise.withResolvers<void>();
    const onSend = vi.fn(() => delivery.promise);
    const onDraftChange = vi.fn();
    render(<Composer onSend={onSend} onStop={() => undefined} onDraftChange={onDraftChange} />);
    const field = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(field, { target: { value: 'First request' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: 'Enter' });
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send.getAttribute('aria-busy')).toBe('true');
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'My next thought' } });
    await act(async () => {
      if (outcome === 'accepted') delivery.resolve();
      else delivery.reject(new Error('Connection lost'));
    });
    expect(onSend).toHaveBeenCalledExactlyOnceWith('First request', []);
    expect((field as HTMLTextAreaElement).value).toBe('My next thought');
    expect(onDraftChange).toHaveBeenLastCalledWith('My next thought');
    expect(send.getAttribute('aria-busy')).toBeNull();
    expect((send as HTMLButtonElement).disabled).toBe(false);
  },
);

it('keeps question replies available alongside a guarded stop action', async () => {
  const cancel = Promise.withResolvers<void>();
  const onStop = vi.fn(() => cancel.promise);
  const onSend = vi.fn();
  render(<Composer stoppable running={false} onSend={onSend} onStop={onStop} />);
  const stop = screen.getByRole('button', { name: 'Stop' });
  fireEvent.click(stop);
  fireEvent.click(stop);
  expect(stop.getAttribute('aria-busy')).toBe('true');
  expect(stop.textContent).toContain('Stopping');
  expect(onStop).toHaveBeenCalledOnce();
  const field = screen.getByRole('textbox', { name: 'Message' });
  fireEvent.change(field, { target: { value: 'Use the work calendar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('Use the work calendar', []));
  await act(async () => cancel.resolve());
  expect(stop.getAttribute('aria-busy')).toBeNull();
});

it('reports a failed stop without losing the draft or preventing a retry', async () => {
  const onStop = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue(undefined);
  render(
    <Composer running initialValue="Keep this thought" onSend={vi.fn()} onStop={onStop} />,
  );
  const stop = screen.getByRole('button', { name: 'Stop' });
  fireEvent.click(stop);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('try Stop again'),
  );
  expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(
    'Keep this thought',
  );
  fireEvent.click(stop);
  await waitFor(() => expect(onStop).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('alert')).toBeNull();
});
