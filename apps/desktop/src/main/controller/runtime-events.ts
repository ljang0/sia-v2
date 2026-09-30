/** Provider runtime events as they reach the desktop controller. */

import type { ThreadEventEnvelope } from '@sia/protocol';

export function isStreamingDelta(event: ThreadEventEnvelope): boolean {
  return (
    ((event.type === 'message' || event.type === 'reasoning') &&
      event.payload.delta === true) ||
    // Command output and patch progress repeat the running tool; its terminal phase commits.
    (event.type === 'tool' && event.payload.phase === 'started')
  );
}
