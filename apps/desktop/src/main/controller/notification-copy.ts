import { clipText, plainText } from '../../shared/plain-text.js';

/**
 * What macOS shows when a task ends while Sia is in the background: the conversation's name,
 * then the start of the reply so the person can tell at a glance whether to open it.
 */
export function turnFinishedNotice(input: {
  title: string;
  outcome: 'complete' | 'failed';
  reply?: string | undefined;
}): { title: string; body: string } {
  const preview = clipText(plainText(input.reply ?? ''), 140);
  if (input.outcome === 'complete')
    return {
      title: `Done: ${input.title}`,
      body: preview || 'Your result is ready. Click to see it in Sia.',
    };
  return {
    title: `Needs a look: ${input.title}`,
    body: 'Sia stopped before finishing. Click to see what happened and try again.',
  };
}
