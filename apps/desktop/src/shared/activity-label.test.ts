import { describe, expect, it } from 'vitest';
import { activityLabel, completedActivityLabel } from './activity-label';

describe('completedActivityLabel', () => {
  it('turns running labels into finished ones', () => {
    expect(completedActivityLabel(activityLabel(undefined, 'command'))).toBe('Ran a command');
    expect(completedActivityLabel(activityLabel('drive_search'))).toBe('Found files');
    expect(completedActivityLabel(activityLabel('mail_send'))).toBe('Sent your mail');
    expect(completedActivityLabel(activityLabel('runtime.start'))).toBe('Got ready');
    expect(completedActivityLabel('Something else')).toBe('Something else');
  });
});
