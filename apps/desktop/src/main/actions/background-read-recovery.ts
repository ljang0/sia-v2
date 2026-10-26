import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import type { WindowSnapshotCapability } from './computer-grants.js';
import { asRecord } from './driver-records.js';
import { actionExecutionId } from './action-execution.js';

interface ReadRecovery {
  readonly appId: string;
  readonly windowId: string;
  readonly url: string | undefined;
  readonly signal: AbortSignal | undefined;
  remaining: number;
}

/** Stop input after a focus conflict, while allowing bounded reconciliation of a passive scroll. */
export class BackgroundReadRecovery {
  readonly #turns = new Map<string, ReadRecovery>();
  readonly #leases = new WeakMap<object, ReadRecovery>();

  #key(request: ValidatedActionInvocation): string {
    const { sessionId, threadId, turnId } = request.context;
    return JSON.stringify([sessionId, threadId, turnId, actionExecutionId(request.context)]);
  }

  prepare(
    request: ValidatedActionInvocation,
  ): { request: ValidatedActionInvocation } | { result: ActionExecutionResult } {
    const recovery = request.context.lease
      ? this.#leases.get(request.context.lease)
      : this.#turns.get(this.#key(request));
    if (!recovery) return { request };
    if (request.name === 'computer_snapshot') {
      if (
        recovery.remaining > 0 &&
        request.arguments.app_id === recovery.appId &&
        request.arguments.window_id === recovery.windowId
      ) {
        recovery.remaining--;
        return {
          request: {
            ...request,
            arguments: {
              ...request.arguments,
              ...(recovery.url ? { expected_url: recovery.url } : {}),
            },
          },
        };
      }
      return {
        result: {
          outcome: 'refused',
          summary:
            'Read-only recovery permits two fresh reads of the original window only. Report any remaining gap; computer input stays paused for this turn.',
        },
      };
    }
    if (
      [
        'computer_action',
        'computer_open_app',
        'computer_open_url',
        'mac_automation',
        'skill_run',
      ].includes(request.name) ||
      (request.name.startsWith('browser_') && request.name !== 'browser_tabs')
    )
      return {
        result: {
          outcome: 'needs_foreground',
          summary:
            'Computer input is paused for this turn. No further input was sent. Finish from the verified observations or ask the person to continue.',
          data: { background_interrupted: true, input_paused_for_turn: true },
        },
      };
    return { request };
  }

  observe(
    request: ValidatedActionInvocation,
    before: WindowSnapshotCapability | undefined,
    result: ActionExecutionResult,
  ): ActionExecutionResult {
    const data = asRecord(result.data);
    if (
      !request.context.backgroundOnly ||
      request.name !== 'computer_action' ||
      request.arguments.action !== 'scroll' ||
      !before ||
      before.protectedControls ||
      before.id !== request.arguments.snapshot_id ||
      before.appId !== request.arguments.app_id ||
      before.publicWindowId !== request.arguments.window_id ||
      result.outcome !== 'needs_foreground' ||
      data?.background_other_app_changed !== true ||
      data.background_interrupted !== true
    )
      return result;
    for (const [key, entry] of this.#turns) if (entry.signal?.aborted) this.#turns.delete(key);
    // Never drop an active restriction to make room. Fall back to the ordinary pause.
    if (!request.context.lease && this.#turns.size >= 256) return result;
    const recovery: ReadRecovery = {
      appId: before.appId,
      windowId: before.publicWindowId,
      url: before.browserUrl,
      signal: request.context.signal,
      remaining: 2,
    };
    if (request.context.lease) this.#leases.set(request.context.lease, recovery);
    else this.#turns.set(this.#key(request), recovery);
    return {
      ...result,
      summary:
        'Focus moved to another app during a background scroll. Further computer input is paused. You may read this exact window twice to reconcile the scroll and finish the answer if the evidence is sufficient; do not replay input.',
      data: { ...data, computer_read_only_recovery: true, input_paused_for_turn: true },
    };
  }
}
