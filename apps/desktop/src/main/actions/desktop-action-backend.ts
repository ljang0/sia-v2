import type {
  ActionBackend,
  ActionExecutionResult,
  TurnLease,
  ValidatedActionInvocation,
} from '@sia/action-gateway';
import { sweepStaleBrowserVaults } from './browser-uploads.js';
import { DesktopActionSession } from './desktop-action-session.js';
import type { DesktopActionBackendOptions } from './types.js';
import { WindowOperations } from './window-operations.js';

/** Owns isolated background-turn grants and the shared physical-window operation queue. */
export class DesktopActionBackend implements ActionBackend {
  readonly #windowOperations = new WindowOperations();
  readonly #default: DesktopActionSession;
  readonly #turns = new Map<TurnLease, DesktopActionSession>();
  #connection:
    | { value: unknown; sessionId?: string; window?: { pid: number; windowId: number } }
    | undefined;

  constructor(private readonly options: DesktopActionBackendOptions) {
    this.#default = new DesktopActionSession(options, this.#windowOperations);
    void sweepStaleBrowserVaults();
  }

  acceptBrowserState(
    value: unknown,
    sessionId?: string,
    window?: { pid: number; windowId: number },
  ): void {
    this.#connection = {
      value,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(window ? { window } : {}),
    };
    for (const session of this.#sessions())
      session.acceptBrowserState(value, sessionId, window);
  }

  resetBrowserCapabilities(): void {
    this.#connection = undefined;
    for (const session of this.#sessions()) session.resetBrowserCapabilities();
  }

  trustedApprovalTarget(
    toolName: string,
    args: Readonly<Record<string, unknown>>,
  ): string | undefined {
    for (const session of this.#sessions()) {
      const target = session.trustedApprovalTarget(toolName, args);
      if (target) return target;
    }
    return undefined;
  }

  invoke(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const lease = request.context.lease;
    if (!lease || !request.context.backgroundOnly) return this.#default.invoke(request);
    let session = this.#turns.get(lease);
    if (!session) {
      session = new DesktopActionSession(this.options, this.#windowOperations);
      const connection = this.#connection;
      if (connection)
        session.acceptBrowserState(connection.value, connection.sessionId, connection.window);
      this.#turns.set(lease, session);
      const owned = session;
      lease.onRelease(() => {
        owned.dispose();
        this.#turns.delete(lease);
      });
    }
    return session.invoke(request);
  }

  *#sessions(): Generator<DesktopActionSession> {
    yield this.#default;
    yield* this.#turns.values();
  }
}
