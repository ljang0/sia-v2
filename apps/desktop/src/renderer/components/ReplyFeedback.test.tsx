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

  it('opens the feedback dialog prefilled from a reply’s thumbs', async () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.activeThread = {
      ...snapshot.activeThread!,
      status: 'idle',
      events: [
        {
          id: 'reply-1',
          type: 'message',
          role: 'assistant',
          content: 'Your flight is booked for Friday.',
          timestamp: '2026-08-13T00:00:00.000Z',
        },
      ],
    };
    const api = createDemoRendererApi(snapshot);
    const compose = vi.spyOn(api, 'composeFeedback');
    render(<App api={api} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Bad reply' }));
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
    expect(screen.getByRole('button', { name: 'Good reply' })).toBeTruthy();
  });
});
