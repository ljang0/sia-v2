import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  actionDigest,
  canonicalJson,
  derivedClassification,
  redactSensitive,
} from '../src/domain.js';

describe('canonical integrity values', () => {
  it('is independent of object insertion order and bound to the user/action', () => {
    const first = actionDigest('a', 'u', 'c', 'slack.post', { text: 'hello', channel: 'one' });
    const reordered = actionDigest('a', 'u', 'c', 'slack.post', {
      channel: 'one',
      text: 'hello',
    });
    const otherUser = actionDigest('a', 'other', 'c', 'slack.post', {
      channel: 'one',
      text: 'hello',
    });
    assert.equal(first, reordered);
    assert.notEqual(first, otherUser);
    assert.equal(canonicalJson({ z: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"z":1}');
  });
});

describe('research redaction and taint', () => {
  it('redacts sensitive keys and recognizable credentials recursively', () => {
    const result = redactSensitive({
      nested: { password: 'do-not-store', note: 'Bearer abcdefghijklmnop' },
      safe: 'hello',
    });
    assert.deepEqual(result.value, {
      nested: { password: '[REDACTED]', note: '[REDACTED]' },
      safe: 'hello',
    });
    assert.equal(result.redactions.length, 2);
  });

  it('can only lower eligibility as taints accumulate', () => {
    assert.equal(derivedClassification([]), 'research_allowed');
    assert.equal(derivedClassification(['connector_data']), 'operational_only');
    assert.equal(derivedClassification(['authenticated_private_page']), 'operational_only');
    assert.equal(derivedClassification(['credential']), 'excluded');
    assert.equal(
      derivedClassification(['authentication_surface', 'connector_data']),
      'excluded',
    );
  });
});
