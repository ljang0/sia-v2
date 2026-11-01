import { expect, it, vi } from 'vitest';
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

// BrowserRefusal is the producer envelope; action dispatch additionally projects
// it into ActionResult.error before the SDK returns it to the host.
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

it.each([
  [
    "the chosen point's browsing context could not be checked; no input was sent",
    'browser_point_context_unavailable',
  ],
  [
    "the link's browsing context could not be checked; no input was sent",
    'browser_link_context_unavailable',
  ],
])('preserves guard diagnostics through native ActionResult projection: %s', (hint, code) => {
  const { value } = decodeDriverResult(
    'browser_click',
    {},
    {
      rawJson: '{}',
      structuredJson: JSON.stringify({
        effect: 'refused',
        error: { code: 'browser_action_unavailable', hint },
        summary: 'private page data must not escape',
      }),
    },
    { started: 0, completed: 0 },
  );
  const result = actionResult({ value, images: [] }, 'Input delivered');
  expect(result.outcome).toBe('refused');
  expect(result.reason).toBe(code);
  expect(result.data).toMatchObject({ blocker_code: code, input_not_sent: true });
  expect(JSON.stringify(result)).not.toContain('private page data');
});

it.each([
  ['popup has no matching window', 'popup_window_unmatched'],
  ['popup process is unavailable', 'popup_process_unavailable'],
  ['popup scan limit exceeded', 'popup_scan_limit'],
  ['layer lies outside composite', 'popup_composite_bounds'],
  ['unknown private failure', 'capture_unavailable'],
])('logs a bounded capture reason without native content: %s', (reason, hint) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    decodeDriverResult(
      'get_window_state',
      { include_screenshot: true },
      {
        rawJson: JSON.stringify({
          screenshot_error: {
            code: 'px_capture_unavailable',
            reason: `${reason}: private path`,
          },
          elements: [{ label: 'popup window identity is ambiguous: private menu text' }],
        }),
      },
      { started: 0, completed: 0 },
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `[sia:cua-capture] screenshot_missing hint=${hint}`,
    );
  } finally {
    warn.mockRestore();
  }
});

it.each(['root', 'snapshot'] as const)(
  'retains the bounded capture diagnostic when the driver throws a %s refusal',
  (shape) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refusal = {
      code: 'px_capture_unavailable',
      reason: 'popup scan limit exceeded: private path',
    };
    try {
      expect(() =>
        decodeDriverResult(
          'get_window_state',
          { include_screenshot: true },
          {
            errorCode: 'px_capture_unavailable',
            rawJson: '{}',
            structuredJson: JSON.stringify({
              ...(shape === 'root' ? refusal : { screenshot_error: refusal }),
              elements: [{ label: 'popup window identity is ambiguous: private menu text' }],
            }),
          },
          { started: 0, completed: 0 },
        ),
      ).toThrow('CUA refused: px_capture_unavailable');
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        '[sia:cua-capture] screenshot_missing hint=popup_scan_limit',
      );
    } finally {
      warn.mockRestore();
    }
  },
);
