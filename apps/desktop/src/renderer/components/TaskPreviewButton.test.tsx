// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskPreviewButton } from './TaskPreviewButton';
import { demoSnapshot } from '../demo';
afterEach(cleanup);
it('previews the existing result on keyboard focus without selecting or marking a task read', () => {
  const onSelect = vi.fn();
  const thread = {
    ...demoSnapshot.agents[0]!.threads[0]!,
    unread: true,
    preview: { label: 'Latest reply' as const, text: 'The verified course list.' },
  };
  render(
    <TaskPreviewButton thread={thread} selected={false} className="" onSelect={onSelect}>
      Task
    </TaskPreviewButton>,
  );
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip').textContent).toContain('The verified course list.');
  expect(onSelect).not.toHaveBeenCalled();
  expect(thread.unread).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledOnce();
});
it('closes previews when scrolling and prioritizes an unsent draft', () => {
  const thread = {
    ...demoSnapshot.agents[0]!.threads[0]!,
    draft: 'Remember this unsent request',
  };
  render(
    <TaskPreviewButton thread={thread} selected className="" onSelect={vi.fn()}>
      Task
    </TaskPreviewButton>,
  );
  fireEvent.focus(screen.getByRole('button'));
  expect(screen.getByRole('tooltip').textContent).toContain('Remember this unsent request');
  fireEvent.scroll(window);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
