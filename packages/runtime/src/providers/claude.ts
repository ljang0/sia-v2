import type {
  ProviderAccount,
  ProviderAdapter,
  ProviderProbeResult,
  ProviderRequestResponse,
  ProviderSession,
  ProviderSessionOptions,
  ProviderTurnInput,
  ThreadEventEnvelope,
} from '@sia/protocol';

export const CLAUDE_DISABLED_REASON =
  'Claude is disabled in the external alpha pending supported third-party authorization and distribution clearance.';

/**
 * Capability descriptor for the planned Agent SDK adapter. It intentionally has
 * no Claude SDK dependency and cannot start a production session.
 */
export class ClaudeDisabledAdapter implements ProviderAdapter {
  readonly id = 'claude' as const;
  readonly productionEnabled = false;

  async probe(_signal?: AbortSignal): Promise<ProviderProbeResult> {
    return { available: false, supported: false, reason: CLAUDE_DISABLED_REASON };
  }

  async account(_signal?: AbortSignal): Promise<ProviderAccount> {
    return { state: 'unauthenticated', billing: 'api' };
  }

  async createSession(
    _options: ProviderSessionOptions,
    _signal?: AbortSignal,
  ): Promise<ProviderSession> {
    throw new Error(CLAUDE_DISABLED_REASON);
  }

  async *sendTurn(
    _session: ProviderSession,
    _input: ProviderTurnInput,
    _signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    throw new Error(CLAUDE_DISABLED_REASON);
  }

  async cancelTurn(_session: ProviderSession, _turnId: string): Promise<void> {
    throw new Error(CLAUDE_DISABLED_REASON);
  }

  async respondToRequest(
    _session: ProviderSession,
    _response: ProviderRequestResponse,
  ): Promise<void> {
    throw new Error(CLAUDE_DISABLED_REASON);
  }

  async dispose(): Promise<void> {}
}

export function createClaudeAdapter(): ClaudeDisabledAdapter {
  return new ClaudeDisabledAdapter();
}
