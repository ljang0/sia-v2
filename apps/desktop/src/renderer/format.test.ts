import { describe, expect, it } from 'vitest';
import { agentInitials } from './agentIdentity';
import { formatBytes } from './format';
import { errorMessage } from './plainErrors';

describe('shared renderer formats', () => {
  it('formats file sizes with one decimal place', () => {
    expect(formatBytes(812)).toBe('812 B');
    expect(formatBytes(3_482)).toBe('3.4 KB');
    expect(formatBytes(1_258_291)).toBe('1.2 MB');
  });

  it('reads up to two initials from an agent name', () => {
    expect(agentInitials('  research   helper bot ')).toBe('RH');
    expect(agentInitials('')).toBe('');
  });

  it('uses an error message or a plain fallback', () => {
    expect(errorMessage(new Error('Chrome is closed.'), 'Try again.')).toBe(
      'Chrome is closed.',
    );
    expect(errorMessage('boom', 'Try again.')).toBe('Try again.');
  });
});
