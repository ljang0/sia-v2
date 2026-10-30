import { describe, expect, it } from 'vitest';
import { resultRefusal } from './action-results.js';

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
