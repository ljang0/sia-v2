import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';

type ObservedWindow = {
  app_id: string;
  window_id: string;
  title?: string;
  browser_origin?: string;
};

/** Bounded recovery hints, isolated to a turn; no screen text or images are retained. */
export class MacWindowHistory {
  readonly #turns = new Map<string, Map<string, ObservedWindow>>();

  observe(
    request: ValidatedActionInvocation,
    result: ActionExecutionResult,
  ): ActionExecutionResult {
    if (!['computer_snapshot', 'computer_action'].includes(request.name)) return result;
    const data =
      result.data && typeof result.data === 'object'
        ? (result.data as Record<string, unknown>)
        : {};
    const turn = JSON.stringify([
      request.context.sessionId,
      request.context.threadId,
      request.context.turnId,
    ]);
    if (
      !['verified', 'accepted_unverified'].includes(result.outcome) ||
      data.observation_pending === true ||
      data.loading === true
    )
      return {
        ...result,
        data: {
          ...data,
          previously_observed_windows: [...(this.#turns.get(turn)?.values() ?? [])],
        },
      };

    const appId = data.app_id ?? request.arguments.app_id;
    const windowId = data.window_id ?? request.arguments.window_id;
    if (typeof appId !== 'string' || typeof windowId !== 'string') return result;
    let windows = this.#turns.get(turn);
    if (!windows) {
      windows = new Map();
      this.#turns.set(turn, windows);
      if (this.#turns.size > 8) this.#turns.delete(this.#turns.keys().next().value!);
    }
    const target = JSON.stringify([appId, windowId]);
    windows.delete(target);
    windows.set(target, {
      app_id: appId,
      window_id: windowId,
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
      ...(typeof data.browser_origin === 'string'
        ? { browser_origin: data.browser_origin }
        : {}),
    });
    if (windows.size > 6) windows.delete(windows.keys().next().value!);
    return result;
  }
}
