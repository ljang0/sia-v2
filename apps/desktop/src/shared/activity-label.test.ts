import { describe, expect, it } from 'vitest';
import { activityLabel, completedActivityLabel } from './activity-label';

describe('completedActivityLabel', () => {
  it('turns running labels into finished ones', () => {
    expect(completedActivityLabel(activityLabel(undefined, 'command'))).toBe(
      'Ran a step on your Mac',
    );
    expect(completedActivityLabel(activityLabel('drive_search'))).toBe('Found files');
    expect(completedActivityLabel(activityLabel('mail_send'))).toBe('Sent your mail');
    expect(completedActivityLabel(activityLabel('runtime.start'))).toBe('Got ready');
    expect(completedActivityLabel('Something else')).toBe('Something else');
  });
});
