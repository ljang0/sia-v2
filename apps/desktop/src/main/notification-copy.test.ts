import { describe, expect, it } from 'vitest';
import { turnFinishedNotice } from './notification-copy';

describe('turnFinishedNotice', () => {
  it('previews the reply as plain text', () => {
    expect(
      turnFinishedNotice({
        title: 'Plan dinner',
        outcome: 'complete',
        reply: 'Here is **tonight’s plan**:\n\n- Pasta\n- Salad',
      }),
    ).toEqual({ title: 'Done: Plan dinner', body: 'Here is tonight’s plan: Pasta Salad' });
  });

  it('clips a long reply and falls back when there is no text', () => {
    const long = turnFinishedNotice({
      title: 'Notes',
      outcome: 'complete',
      reply: 'word '.repeat(80),
    });
    expect(long.body.length).toBeLessThanOrEqual(140);
    expect(long.body.endsWith('…')).toBe(true);
    expect(turnFinishedNotice({ title: 'Notes', outcome: 'complete' }).body).toBe(
      'Your result is ready. Click to see it in Sia.',
    );
  });

  it('says plainly when a task stopped early', () => {
    expect(
      turnFinishedNotice({ title: 'Book a table', outcome: 'failed', reply: 'Partial' }),
    ).toEqual({
      title: 'Needs a look: Book a table',
      body: 'Sia stopped before finishing. Click to see what happened and try again.',
    });
  });
});
