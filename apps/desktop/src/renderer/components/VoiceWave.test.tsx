// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VoiceWave } from './VoiceWave';

describe('VoiceWave', () => {
  afterEach(cleanup);

  it('maps the microphone level onto the bars and clamps it', () => {
    const { getByTestId, rerender } = render(<VoiceWave level={2} />);
    const wave = getByTestId('voice-wave');
    expect(wave.style.getPropertyValue('--voice-level')).toBe('0.5');
    expect(wave.dataset.measured).toBe('true');
    rerender(<VoiceWave level={9} />);
    expect(wave.style.getPropertyValue('--voice-level')).toBe('1');
  });

  it('sways on its own when no level is measured', () => {
    const { getByTestId } = render(<VoiceWave />);
    expect(getByTestId('voice-wave').dataset.measured).toBe('false');
    expect(getByTestId('voice-wave').children).toHaveLength(5);
  });
});
