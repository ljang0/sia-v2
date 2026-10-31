import { describe, expect, it } from 'vitest';
import { classifyFailure, inputWasRefused, resultRefusal } from './action-results.js';

it('distinguishes an exhausted browser read timeout from permission denial or safe input replay', () => {
  const error = new Error('CUA refused: browser_observation_timeout');
  const result = classifyFailure(error);
  expect(result).toMatchObject({
    outcome: 'refused',
    data: { blocker_code: 'browser_observation_timeout' },
  });
  expect(result.summary).toContain('does not mean permission was denied');
  expect(result.summary).toContain('do not repeat setup or replay');
  expect(inputWasRefused(error)).toBe(false);
  expect(result.data).not.toHaveProperty('input_not_sent');
});

it('explains a host authorization failure without treating uncertain input as safe to replay', () => {
  const error = new Error('CUA refused: authorization_host_failed');
  expect(classifyFailure(error)).toMatchObject({
    outcome: 'refused',
    data: { blocker_code: 'authorization_host_failed' },
  });
  expect(classifyFailure(error).summary).toContain('do not repeat setup or replay');
  expect(inputWasRefused(error)).toBe(false);
});

describe('driver refusal envelopes', () => {
  it.each(['browser_consent_required', 'browser_requires_setup', 'future_policy_gate'])(
    'preserves an explicit refusal even when %s does not resemble an error',
    (code) => {
      expect(resultRefusal({ status: 'refused', refusal: { code } })).toMatchObject({
        outcome: 'refused',
        reason: code,
      });
    },
  );

  it('refuses a code-less refused status rather than treating it as an observation', () => {
    expect(resultRefusal({ status: 'refused' })?.outcome).toBe('refused');
  });

  it('leaves successful observations unchanged', () => {
    expect(resultRefusal({ status: 'ok', prepared: true })).toBeUndefined();
    expect(resultRefusal({ elements: [{ code: 'normal_page_content' }] })).toBeUndefined();
  });
});

it('recovers a refused new-context link through a separate observed-URL navigation', () => {
  const error = new Error('CUA refused: browser_new_context_refused');
  expect(inputWasRefused(error)).toBe(true);
  expect(classifyFailure(error)).toMatchObject({
    outcome: 'refused',
    data: { blocker_code: 'browser_new_context_refused', input_not_sent: true },
  });
  expect(classifyFailure(error).summary).toContain('computer_open_url');
  expect(
    resultRefusal({ status: 'refused', refusal: { code: 'browser_new_context_refused' } }),
  ).toMatchObject({
    outcome: 'refused',
    data: { input_not_sent: true },
  });
});
