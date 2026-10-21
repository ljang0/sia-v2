// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createDemoRendererApi } from '../demo/api';
import { demoSnapshot } from '../demo/snapshot';
import { replyFeedbackDraft } from './ReplyFeedback';

afterEach(cleanup);

describe('reply feedback', () => {
  it('drafts feedback that quotes the rated reply', () => {
    expect(replyFeedbackDraft('down', '**Done.** I filed the report.')).toBe(
      [
        'This reply wasn’t right.',
        '',
        'Reply: “Done. I filed the report.”',
        '',
        'What should Sia have done instead? ',
      ].join('\n'),
    );
    expect(replyFeedbackDraft('up', '')).toBe('This reply was helpful.\n\nWhat worked well: ');
  });

  function finishedTaskSnapshot() {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.activeThread = {
      ...snapshot.activeThread!,
      status: 'idle',
      route: { lab: 'Meta', model: 'Llama 5', engine: 'Codex' },
      events: [
        {
          id: 'reply-0',
          type: 'message',
          role: 'assistant',
          content: 'Opening the airline site.',
          timestamp: '2026-08-13T00:00:00.000Z',
        },
        {
          id: 'reply-1',
          type: 'message',
          role: 'assistant',
          content: 'Your flight is booked for Friday.',
          timestamp: '2026-08-13T00:00:01.000Z',
          taskRating: { turnId: 'turn-1' },
        },
      ],
    };
    return snapshot;
  }

  it('records a rating from the thumbs on a finished task’s final reply', async () => {
    const snapshot = finishedTaskSnapshot();
    const api = createDemoRendererApi(snapshot);
    const rate = vi.spyOn(api, 'rateTask');
    render(<App api={api} />);

    // Only the final reply of the finished task can be rated.
    expect(await screen.findAllByRole('button', { name: 'Bad result' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Bad result' }));
    await waitFor(() =>
      expect(rate).toHaveBeenCalledWith({
        threadId: snapshot.activeThread!.id,
        turnId: 'turn-1',
        rating: 'bad',
      }),
    );
    expect(await screen.findByText('Thanks, saved.')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Bad result' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    // No support email draft opens for a rating.
    expect(screen.queryByRole('textbox', { name: 'What should we improve?' })).toBeNull();
    expect(screen.getByTestId('thread-route').textContent).toBe('Meta · Llama 5 · Codex');
  });

  it('adds reasons and a note that is shown before it is sent', async () => {
    const snapshot = finishedTaskSnapshot();
    const api = createDemoRendererApi(snapshot);
    const rate = vi.spyOn(api, 'rateTask');
    render(<App api={api} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bad result' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell us more' }));
    const popover = await screen.findByRole('dialog', { name: 'What went wrong?' });
    expect(popover).toBeTruthy();
    // Reasons match the rating.
    expect(screen.queryByRole('button', { name: 'Fast' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Got stuck' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Anything else/ }), {
      target: { value: 'It picked the wrong date' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review note' }));
    expect(await screen.findByRole('dialog', { name: 'Send this note?' })).toBeTruthy();
    expect(screen.getByText('It picked the wrong date')).toBeTruthy();
    expect(rate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(rate).toHaveBeenLastCalledWith({
        threadId: snapshot.activeThread!.id,
        turnId: 'turn-1',
        rating: 'bad',
        reasons: ['got_stuck'],
        comment: 'It picked the wrong date',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the support feedback draft one step away', async () => {
    const snapshot = finishedTaskSnapshot();
    const api = createDemoRendererApi(snapshot);
    const compose = vi.spyOn(api, 'composeFeedback');
    render(<App api={api} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bad result' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell us more' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send feedback to the Sia team' }),
    );
    const field = (await screen.findByRole('textbox', {
      name: 'What should we improve?',
    })) as HTMLTextAreaElement;
    expect(field.value).toContain('This reply wasn’t right.');
    expect(field.value).toContain('Your flight is booked for Friday.');

    fireEvent.click(screen.getByRole('button', { name: 'Review in mail' }));
    await waitFor(() =>
      expect(compose).toHaveBeenCalledWith(
        expect.stringContaining('Your flight is booked for Friday.'),
        snapshot.activeThread!.id,
        false,
      ),
    );
  });
});
