import { expect, it } from 'vitest';
import { actionResult, classifyFailure, inputWasRefused } from '../actions/action-results.js';
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

// BrowserRefusal::to_tool_result deliberately reports a structured refusal as
// a successful protocol response. The signed app uses this path, not errorCode.
it.each([
  [
    "the chosen point's browsing context could not be checked; no input was sent",
    'browser_point_context_unavailable',
  ],
  [
    "the link's browsing context could not be checked; no input was sent",
    'browser_link_context_unavailable',
  ],
  ['unknown failure', 'browser_action_unavailable'],
])('handles the native structured refusal envelope: %s', (message, code) => {
  const { value, nativeToolError } = decodeDriverResult(
    'browser_pointer',
    {},
    {
      rawJson: '{}',
      structuredJson: JSON.stringify({
        status: 'refused',
        refusal: {
          code: 'browser_action_unavailable',
          message,
          detail: { pageText: 'private page data must not escape' },
        },
      }),
    },
    { started: 0, completed: 0 },
  );
  expect(nativeToolError).toBe(false);
  const result = actionResult({ value, images: [] }, 'Input delivered');
  expect(result.outcome).toBe('refused');
  expect(result.reason).toBe(code);
  expect(inputWasRefused(new Error(code))).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private page data');
  if (code !== 'browser_action_unavailable') {
    expect(result.data).toMatchObject({ blocker_code: code, input_not_sent: true });
    expect(result.summary).toContain('Do not repeat this click');
  }
});
