import type { ValidatedActionInvocation } from '@sia/action-gateway';
import type { CuaAuthorizationContext } from '../mac/cua-service.js';
import { BrowserGrants } from './browser-grants.js';
import { ComputerGrants } from './computer-grants.js';
import { actionExecutionId } from './action-execution.js';
import { resultRefusal } from './action-results.js';
import type { DesktopActionBackendOptions } from './types.js';

/**
 * What every action collaborator shares: the host options, the turn's computer and browser
 * grants, and the single authorized route to Cua Driver.
 */
export class ActionBackendContext {
  readonly computer = new ComputerGrants();
  readonly browser: BrowserGrants;
  readonly macBrowserAccess: () => boolean;
  readonly macBackgroundControl: () => boolean;
  readonly hostPid: number;

  constructor(readonly options: DesktopActionBackendOptions) {
    this.macBrowserAccess = options.macBrowserAccess ?? (() => false);
    this.macBackgroundControl = options.macBackgroundControl ?? (() => false);
    this.browser = new BrowserGrants(
      options.browserSessionId ?? 'sia-browser',
      options.isBrowserOriginAllowed,
    );
    this.hostPid = options.hostPid ?? process.pid;
  }

  async callCua(
    request: ValidatedActionInvocation,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const context: CuaAuthorizationContext = {
      kind: 'turn',
      threadId: request.context.threadId,
      turnId: request.context.turnId,
      executionId: actionExecutionId(request.context),
      ...(request.context.backgroundOnly !== undefined
        ? { backgroundOnly: request.context.backgroundOnly }
        : {}),
    };
    const expire = (): void => {
      // A late failure from an old call must not revoke a newly selected window.
      if (this.browser.attached && args.session === this.browser.sessionId) {
        const sessionId = this.browser.sessionId;
        this.browser.reset();
        this.options.onBrowserSessionEnded?.(sessionId);
      }
    };
    try {
      const result = await this.options.cua.call(tool, args, context, request.context.signal);
      if (resultRefusal(result)?.reason === 'session_ended') expire();
      return result;
    } catch (error) {
      if (error instanceof Error && /^(?:CUA refused: )?session_ended$/.test(error.message))
        expire();
      throw error;
    }
  }
}
