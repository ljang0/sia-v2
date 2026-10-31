import { expect, it } from 'vitest';
import { classifyFailure, inputWasRefused } from '../actions/action-results.js';
import { decodeDriverResult } from './cua-results.js';

it.each([
  [
    "the chosen point's browsing context could not be checked",
    'browser_point_context_unavailable',
  ],
  ["the link's browsing context could not be checked", 'browser_link_context_unavailable'],
  ['unknown failure', 'browser_action_unavailable'],
])('keeps a bounded browser guard diagnostic without native content: %s', (message, code) => {
  let failure: unknown;
  try {
    decodeDriverResult(
      'browser_click',
      {},
      {
        errorCode: 'browser_action_unavailable',
        rawJson: JSON.stringify({ message, pageText: 'private page data must not escape' }),
      },
      { started: 0, completed: 0 },
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(`CUA refused: ${code}`);
  expect(inputWasRefused(failure)).toBe(true);
  const result = classifyFailure(failure);
  expect(result.outcome).toBe('refused');
  expect(JSON.stringify(result)).not.toContain('private page data');
  if (code !== 'browser_action_unavailable')
    expect(result.data).toMatchObject({ blocker_code: code, input_not_sent: true });
});
