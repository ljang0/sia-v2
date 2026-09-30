/** Mac access state for Use my Mac tasks. */

import type { ComputerPermissionsView } from '../../shared/bridge.js';

export function backgroundControlUnavailable(
  access: ComputerPermissionsView,
): string | undefined {
  if (access.status === 'ready') return undefined;
  if (access.status === 'needs_permission') {
    // Only a permission skipped during setup reaches here; name it plainly.
    if (access.relaunchFor?.length)
      return 'Mac access is turned on, but Sia needs to reopen before it can use it. Quit and reopen Sia, then press Continue task.';
    const missing = [
      access.accessibility ? '' : 'control your Mac (Accessibility)',
      access.screenRecording ? '' : 'see your screen (Screen Recording)',
    ].filter(Boolean);
    return `To work in the background, Sia needs permission to ${missing.join(' and ')}. Allow it in Settings → Computer, then press Continue task.`;
  }
  return 'Working in the background isn’t available on this Mac right now. Choose On my screen in Settings → Computer, then press Continue task.';
}
