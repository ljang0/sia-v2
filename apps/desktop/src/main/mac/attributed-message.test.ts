import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeAttributedBody } from './attributed-message.js';

interface Fixture {
  name: string;
  text: string;
  repeat: number;
  archiveGzipBase64: string;
}

const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/messages/attributed-bodies.json', import.meta.url),
    'utf8',
  ),
) as Fixture[];
const archive = (fixture: Fixture) =>
  gunzipSync(Buffer.from(fixture.archiveGzipBase64, 'base64'));

describe('Foundation attributed message archives', () => {
  it.each(fixtures)(
    'reads the exact text in $name without attributes or length bytes',
    (fixture) => {
      expect(decodeAttributedBody(archive(fixture))).toBe(fixture.text.repeat(fixture.repeat));
    },
  );

  it('does not guess a message from a metadata-only or unsupported archive', () => {
    for (const input of [
      undefined,
      '',
      new Uint8Array(),
      Buffer.from('NSString YES __kIMMessagePartAttributeName'),
    ])
      expect(decodeAttributedBody(input)).toBeUndefined();
    const bytes = archive(fixtures[0]!);
    bytes[0] = 3;
    expect(decodeAttributedBody(bytes)).toBeUndefined();
  });

  it('rejects truncated text, invalid UTF-8 and an absent string terminator', () => {
    const bytes = archive(fixtures[0]!);
    const start = bytes.indexOf(Buffer.from('YES'));
    expect(start).toBeGreaterThan(0);
    expect(decodeAttributedBody(bytes.subarray(0, start + 2))).toBeUndefined();
    const invalidUtf8 = Buffer.from(bytes);
    invalidUtf8[start] = 0xff;
    expect(decodeAttributedBody(invalidUtf8)).toBeUndefined();
    const invalidEnd = Buffer.from(bytes);
    invalidEnd[start + 3] = 0;
    expect(decodeAttributedBody(invalidEnd)).toBeUndefined();
  });

  it('rejects impossible string references and oversized archives', () => {
    const bytes = archive(fixtures[0]!);
    // The first type must be defined; it cannot refer to a string absent from the table.
    bytes[16] = 0x92;
    expect(decodeAttributedBody(bytes)).toBeUndefined();
    expect(decodeAttributedBody(Buffer.alloc(2 * 1024 * 1024 + 1))).toBeUndefined();
  });
});
