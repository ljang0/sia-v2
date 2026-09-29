import { describe, expect, it } from 'vitest';
import { plainError, usageLeftText, usageWarningText } from './plainErrors';

describe('plainError', () => {
  it.each([
    ['stream disconnected before completion: error sending request', 'network'],
    ['fetch failed: getaddrinfo ENOTFOUND chatgpt.com', 'network'],
    ['connect ECONNREFUSED 127.0.0.1:443', 'network'],
    ['You have hit your usage limit. Try again in 3 hours.', 'usage'],
    ['429 Too Many Requests', 'usage'],
    ['unexpected status 401 Unauthorized: token expired', 'sign-in'],
    [
      'Your access token could not be refreshed: refresh token is invalid; please log in again',
      'sign-in',
    ],
  ])('explains %s as a %s problem', (raw, kind) => {
    const plain = plainError(raw);
    expect(plain?.kind).toBe(kind);
    expect(plain?.message).not.toContain(raw);
  });

  it('leaves other messages as they are', () => {
    expect(plainError('The browser needs a fresh window snapshot.')).toBeUndefined();
    // A server-side failure is not the person's connection.
    expect(
      plainError('Sia cloud request failed (503), request request-alpha12.'),
    ).toBeUndefined();
    expect(plainError('')).toBeUndefined();
    expect(plainError(undefined)).toBeUndefined();
  });
});

describe('plan usage limits', () => {
  // Local-time fixtures keep the wording independent of the test machine's zone.
  const now = new Date(2026, 8, 29, 13, 0);
  const later = new Date(2026, 8, 29, 15, 5).toISOString();
  const tomorrow = new Date(2026, 8, 30, 9, 0).toISOString();
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  it('says when a reached usage limit resets', () => {
    const plain = plainError('You have hit your usage limit.', { usageResetsAt: later, now });
    expect(plain?.message).toContain(`It resets at ${time(later)}.`);
    expect(
      plainError('429 Too Many Requests', { usageResetsAt: tomorrow, now })?.message,
    ).toContain(`resets tomorrow at ${time(tomorrow)}`);
    // A reset time already past says nothing about it.
    expect(
      plainError('429 Too Many Requests', {
        usageResetsAt: new Date(2026, 8, 29, 9).toISOString(),
        now,
      })?.message,
    ).toContain('for now');
  });

  it('shows what is left and warns from 80% used', () => {
    expect(usageLeftText({ usedPercent: 37, resetsAt: later }, now)).toBe(
      `63% left · resets at ${time(later)}`,
    );
    expect(usageLeftText({ usedPercent: 37 }, now)).toBe('63% left');
    expect(usageWarningText({ usedPercent: 79 }, now)).toBeUndefined();
    expect(usageWarningText({ usedPercent: 82, resetsAt: later }, now)).toBe(
      `You’ve used 82% of your plan’s usage limit. It resets at ${time(later)}.`,
    );
    expect(usageWarningText({ usedPercent: 100 }, now)).toBe(
      'You’ve reached your plan’s usage limit.',
    );
    expect(usageWarningText(undefined, now)).toBeUndefined();
  });
});
