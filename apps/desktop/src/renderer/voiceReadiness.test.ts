import { describe, expect, it } from 'vitest';
import { voiceOptionLabel } from './voiceReadiness';

describe('voice picker labels', () => {
  it('shows stock voices by name and marks only a personal voice', () => {
    expect(voiceOptionLabel({ name: 'Aria', category: 'premade' })).toBe('Aria');
    expect(voiceOptionLabel({ name: 'Aria' })).toBe('Aria');
    expect(voiceOptionLabel({ name: 'Me', category: 'cloned' })).toBe('Me · Your voice');
  });
});
