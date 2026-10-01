import { afterEach, expect, it, vi } from 'vitest';
import { requestMicrophonePermission } from './microphone-permission.js';

const native = vi.hoisted(() => ({
  status: vi.fn(() => 'granted'),
  ask: vi.fn(async () => true),
  focus: vi.fn(),
  open: vi.fn(async () => {}),
}));
vi.mock('electron', () => ({
  app: { focus: native.focus },
  systemPreferences: { getMediaAccessStatus: native.status, askForMediaAccess: native.ask },
  shell: { openExternal: native.open },
}));
afterEach(() => vi.clearAllMocks());

it.runIf(process.platform === 'darwin').each([
  ['granted', true, false, false],
  ['not-determined', true, true, false],
  ['not-determined', false, true, true],
  ['denied', false, false, true],
] as const)(
  'recovers microphone status %s (accepted: %s)',
  async (status, accepted, asks, opens) => {
    native.status.mockReturnValue(status);
    native.ask.mockResolvedValue(accepted);
    await requestMicrophonePermission();
    expect(native.ask).toHaveBeenCalledTimes(asks ? 1 : 0);
    expect(native.focus).toHaveBeenCalledTimes(asks ? 1 : 0);
    expect(native.open).toHaveBeenCalledTimes(opens ? 1 : 0);
    if (asks) expect(native.ask).toHaveBeenCalledWith('microphone');
    if (opens)
      expect(native.open).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      );
  },
);
