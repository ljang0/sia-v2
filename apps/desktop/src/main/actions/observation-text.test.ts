import { expect, it } from 'vitest';
import { sanitizeElement, trustedDisplayText } from './driver-records.js';
import { browserUrlLooksSensitive } from './browser-urls.js';
import {
  observationRecordHasPrivateLinks,
  redactObservationLinks,
} from './observation-text.js';

it.each([
  'https://meeting.example/j/123?pwd=fixture-secret',
  'https://files.example/report?X-Amz-Signature=fixture-secret',
  'https://files.example/report?%74oken=fixture-secret',
  'https://fixture-secret@host.example/path',
  'https://host.example/path#access_token=fixture-secret',
  'https://host.example/path#%61ccess_token=fixture-secret',
  'https://host.example/path#pwd=fixture-secret%ZZ',
  'https://host.example/path?accessToken=fixture-secret',
  'https://host.example/path?sessionid=fixture-secret',
  'https://host.example/path?redirect=https%3A%2F%2Fmeeting.example%2F%3Fpwd%3Dfixture-secret',
  'zoommtg://meeting.example/join?confno=123&pwd=fixture-secret',
])('omits access-bearing links in display text before truncation: %s', (url) => {
  expect(redactObservationLinks(`Join ${url} then return.`)).toBe(
    'Join [private link omitted] then return.',
  );
  expect(trustedDisplayText(url)).toBe('[private link omitted]');
  expect(browserUrlLooksSensitive(url)).toBe(true);
  expect(
    JSON.stringify(
      sanitizeElement({ role: 'AXLink', label: url, value: url, description: url }),
    ),
  ).not.toContain('fixture-secret');
});

it('preserves ordinary prose, multiline layout and public query permalinks', () => {
  const text =
    'Noon meeting\nForecast https://weather.example/point?lat=40.4&lon=-79.9\nCode examples use pwd as a variable.';
  expect(redactObservationLinks(text)).toBe(text);
  expect(
    observationRecordHasPrivateLinks({
      href: 'https://meeting.example/?pwd=fixture-secret',
      label: 'Join',
    }),
  ).toBe(false);
});
