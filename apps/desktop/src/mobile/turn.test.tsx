// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Turn } from './turn';
import { saveRemoteFile } from './api';
import type { RemoteTurn } from '../shared/phone-remote';

vi.mock('./api', () => ({
  remoteBase: new URL('https://phone.example.test/'),
  remoteTransport: 'relay',
  saveRemoteFile: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const turn: RemoteTurn = {
  id: 'task',
  text: 'Make a report',
  response: 'The report is ready.',
  status: 'done',
  steps: [],
  error: '',
  files: ['report.md'],
};

it('keeps a failed download in the conversation and retries without duplicate saves', async () => {
  const pending = Promise.withResolvers<void>();
  vi.mocked(saveRemoteFile)
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValue(undefined);
  render(<Turn turn={turn} agent="Sia" />);
  const file = screen.getByRole('link', { name: /report.md/ });
  fireEvent.click(file);
  fireEvent.click(file);
  expect(saveRemoteFile).toHaveBeenCalledTimes(1);
  expect(file.getAttribute('aria-busy')).toBe('true');
  await act(async () => pending.reject(new Error('Disconnected')));
  expect(screen.getByRole('alert').textContent).toContain('couldn’t be saved');
  expect(screen.getByText('The report is ready.')).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'try again' })));
  expect(saveRemoteFile).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not present finished commentary as still being written during a longer task', () => {
  const view = render(<Turn turn={{ ...turn, status: 'working', files: [] }} agent="Sia" />);
  expect(view.container.querySelector('[data-streaming]')).toBeNull();
  view.rerender(
    <Turn turn={{ ...turn, status: 'working', streaming: true, files: [] }} agent="Sia" />,
  );
  expect(view.container.querySelector('[data-streaming]')).toBeTruthy();
});
