import { record, stringAt } from '../events.js';
import type { JsonRpcPeer } from '../json-rpc.js';
import type { ActiveTurn } from './codex-turn-events.js';

const IDLE_MS = 180_000;
const MAX_RUN_MS = 3_600_000;

/** Silence is not failure: native commands and host tools can work without output. */
export function watchMacTurn(input: {
  active: ActiveTurn;
  peer: { request(...args: Parameters<JsonRpcPeer['request']>): Promise<unknown> };
  current(): boolean;
  cancel(): Promise<void>;
  fail(error: Error): void;
}): () => void {
  const { active } = input;
  const started = Date.now();
  let checkedAt = started;
  let executionMs = 0;
  const probe = new AbortController();
  let checking = false;
  let stopping = false;
  const stop = async (code: string, message: string) => {
    if (!input.current() || stopping || probe.signal.aborted) return;
    stopping = true;
    active.watchdogCode = code;
    active.watchdogError = message;
    try {
      await input.cancel();
    } finally {
      input.fail(new Error(message));
    }
  };
  const check = async () => {
    if (!input.current() || stopping) return;
    const now = Date.now();
    const elapsed = now - checkedAt;
    checkedAt = now;
    if (active.approvalPending || active.userInputPending) {
      active.lastActivity = now;
      return;
    }
    executionMs += elapsed;
    if (executionMs >= MAX_RUN_MS) {
      await stop(
        'mac_turn_timeout',
        'The Mac task reached its one-hour time limit and was stopped. Start a new task to continue.',
      );
      return;
    }
    if (checking) return;
    if (active.nativeWorkPending.size || (active.dynamicToolsPending ?? 0) > 0) {
      active.lastActivity = Date.now();
      return;
    }
    const lastActivity = active.lastActivity ?? started;
    if (Date.now() - lastActivity < IDLE_MS) return;
    checking = true;
    try {
      // Read metadata only: no history, model turn, terminal command, or app action.
      const response = await input.peer.request(
        'thread/read',
        {
          threadId: active.session.nativeId,
          includeTurns: false,
        },
        { timeoutMs: 10_000, signal: probe.signal },
      );
      if (!input.current() || probe.signal.aborted || active.lastActivity !== lastActivity)
        return;
      const status = record(record(response).thread).status;
      if (stringAt(status, ['type']) === 'active') {
        active.lastActivity = Date.now();
        return;
      }
      await stop(
        'mac_turn_inactive',
        'The Mac task stopped responding. Codex no longer reports it as active, so it was cancelled.',
      );
    } catch {
      if (input.current() && active.lastActivity === lastActivity)
        await stop(
          'mac_turn_unreachable',
          'The Mac task stopped responding and its connection could not be verified. It was cancelled.',
        );
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(() => {
    void check().catch(() => undefined);
  }, 5_000);
  timer.unref();
  return () => {
    clearInterval(timer);
    probe.abort();
  };
}
