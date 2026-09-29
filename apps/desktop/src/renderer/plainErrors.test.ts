import { describe, expect, it } from 'vitest';
import { plainError } from './plainErrors';

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
