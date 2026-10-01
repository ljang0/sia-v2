import type { ValidatedActionInvocation } from '@sia/action-gateway';
import type { CuaAuthorizationContext } from '../mac/cua-service.js';
import { BrowserGrants } from './browser-grants.js';
import { ComputerGrants } from './computer-grants.js';
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

  callCua(
    request: ValidatedActionInvocation,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const context: CuaAuthorizationContext = {
      kind: 'turn',
      threadId: request.context.threadId,
      turnId: request.context.turnId,
    };
    return this.options.cua.call(tool, args, context, request.context.signal);
  }
}
