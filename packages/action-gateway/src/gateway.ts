import { isAbsolute, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ProviderId, ToolDescriptor } from '@sia/protocol';
import { actionTargetDigest, OneShotGrantStore } from './grants.js';
import type { LeaseResource, TurnLease } from './leases.js';
import {
  ACTION_TOOL_DESCRIPTORS,
  getActionToolDescriptor,
  isActionToolName,
  parseActionArguments,
  type ActionToolName,
} from './tools.js';

export const actionOutcomeSchema = z.enum([
  'verified',
  'accepted_unverified',
  'needs_foreground',
  'refused',
  'stale',
]);
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>;

export const actionExecutionResultSchema = z
  .object({
    outcome: actionOutcomeSchema,
    summary: z.string().min(1),
    data: z.unknown().optional(),
    images: z
      .array(
        z
          .object({
            mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
            dataBase64: z.string().min(1),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    reason: z.string().optional(),
    verification: z
      .object({
        snapshotId: z.string().optional(),
        evidence: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ActionExecutionResult = z.infer<typeof actionExecutionResultSchema>;

export interface ActionContext {
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly provider: ProviderId;
  readonly workspace: string;
  /** Host-pinned per turn; model arguments cannot authorize foreground fallback. */
  readonly backgroundOnly?: boolean;
  /** Host-pinned per turn and inherited by nested skill actions; never a model argument. */
  readonly allowedTools?: ReadonlySet<string>;
  readonly lease?: TurnLease;
  readonly signal?: AbortSignal;
}

export interface ActionInvocation {
  readonly name: string;
  readonly arguments: unknown;
  readonly context: ActionContext;
  readonly oneShotGrantId?: string;
}

export interface ActionInvocationNotice {
  readonly name: string;
  readonly context: ActionContext;
}

export type ActionInvocationObserver = (
  invocation: ActionInvocationNotice,
) => void | Promise<void>;

export interface ActionResultNotice extends ActionInvocationNotice {
  readonly result: ActionExecutionResult;
  /** Validated arguments of the executed action, for host-side trajectory logging. */
  readonly arguments?: Readonly<Record<string, unknown>>;
}

export type ActionResultObserver = (notice: ActionResultNotice) => void | Promise<void>;

export interface ValidatedActionInvocation {
  readonly name: ActionToolName;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly context: ActionContext;
  readonly descriptor: ToolDescriptor;
  /** Present only after this exact invocation passed the interactive broker. */
  readonly approvalId?: string;
}

export interface ActionBackend {
  invoke(request: ValidatedActionInvocation): Promise<ActionExecutionResult>;
}

export type AuthorizationDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'approval'; readonly reason: string }
  | { readonly decision: 'deny'; readonly reason: string };

export interface ActionAuthorizationPolicy {
  evaluate(
    request: ValidatedActionInvocation,
  ): Promise<AuthorizationDecision> | AuthorizationDecision;
}

export interface ApprovalRequest {
  readonly id: string;
  readonly sessionId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly tool: ToolDescriptor;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly targetDigest: string;
  readonly reason: string;
}

export interface ApprovalBroker {
  requestApproval(
    request: ApprovalRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly approved: boolean }>;
}

const SENSITIVE_APP =
  /(?:1password|bitwarden|lastpass|dashlane|keychain|password|terminal|iterm|warp|alacritty|system settings|system preferences|com\.apple\.security|com\.google\.chrome|chrome|safari|firefox|arc)/i;
const SENSITIVE_ROLE = /(?:secure|password)/i;
const SENSITIVE_PATH =
  /(?:^|\/)(?:\.ssh|\.aws|\.gnupg|Library\/Keychains)(?:\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|\.env)(?:\.|$)/i;

function pathLooksSensitive(value: unknown): boolean {
  return typeof value === 'string' && SENSITIVE_PATH.test(normalize(value));
}

function defaultSafetyDecision(
  request: ValidatedActionInvocation,
): AuthorizationDecision | undefined {
  const args = request.arguments;
  if (args.private === true)
    return {
      decision: 'deny',
      reason: 'Private or incognito browser windows are never available to agents',
    };
  if (typeof args.target_role === 'string' && SENSITIVE_ROLE.test(args.target_role)) {
    return {
      decision: 'deny',
      reason: 'Secure and password fields are never available to agents',
    };
  }
  if (request.name.startsWith('computer_') && request.name !== 'computer_list') {
    const app = `${String(args.app_id ?? '')} ${String(args.app_name ?? '')}`;
    if (SENSITIVE_APP.test(app))
      return {
        decision: 'deny',
        reason: 'This application must not be controlled through generic computer tools',
      };
  }
  if (request.name === 'browser_navigate' || request.name === 'computer_open_url') {
    const url = new URL(String(args.url));
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password)
      return { decision: 'deny', reason: 'Only HTTP and HTTPS navigation is allowed' };
  }
  if (request.name === 'browser_upload') {
    const paths = Array.isArray(args.file_paths) ? args.file_paths : [];
    if (paths.some((path) => !isAbsolute(String(path)) || pathLooksSensitive(path))) {
      return {
        decision: 'deny',
        reason: 'One or more upload paths are relative or security-sensitive',
      };
    }
  }
  if (request.name === 'drive_upload') {
    if (!isAbsolute(String(args.file_path)) || pathLooksSensitive(args.file_path)) {
      return { decision: 'deny', reason: 'Upload path is relative or security-sensitive' };
    }
  }
  return undefined;
}

export interface DefaultActionAuthorizationPolicyOptions {
  /**
   * When it returns true, computer_* and browser_* actions run without an interactive
   * approval (hard safety denials still apply). Other mutations still cross the host
   * authorization broker, which can authorize them automatically in autonomous mode.
   */
  readonly trustLocalActions?: () => boolean;
}

export function isLocalActionToolName(name: string): boolean {
  return name.startsWith('computer_') || name.startsWith('browser_');
}

export class DefaultActionAuthorizationPolicy implements ActionAuthorizationPolicy {
  readonly #trustLocalActions: () => boolean;

  constructor(options: DefaultActionAuthorizationPolicyOptions = {}) {
    this.#trustLocalActions = options.trustLocalActions ?? (() => false);
  }

  evaluate(request: ValidatedActionInvocation): AuthorizationDecision {
    const safety = defaultSafetyDecision(request);
    if (safety) return safety;
    if (!request.descriptor.annotations.requiresApproval) return { decision: 'allow' };
    if (isLocalActionToolName(request.name) && this.#trustLocalActions()) {
      return { decision: 'allow' };
    }
    return { decision: 'approval', reason: 'This operation changes external or local state' };
  }
}

function resourceFor(request: ValidatedActionInvocation): LeaseResource | undefined {
  const args = request.arguments;
  if (request.name.startsWith('browser_') && typeof args.tab_id === 'string') {
    return { kind: 'browser_tab', id: args.tab_id };
  }
  if (request.name === 'computer_action' && typeof args.window_id === 'string') {
    return { kind: 'app_window', id: args.window_id };
  }
  return undefined;
}

export class ActionGateway {
  readonly #backend: ActionBackend;
  readonly #policy: ActionAuthorizationPolicy;
  readonly #approvals: ApprovalBroker | undefined;
  readonly #grants: OneShotGrantStore;
  readonly #onInvocation: ActionInvocationObserver | undefined;
  readonly #onResult: ActionResultObserver | undefined;
  readonly #isToolAvailable: ((name: ActionToolName) => boolean) | undefined;

  constructor(options: {
    readonly backend: ActionBackend;
    readonly policy?: ActionAuthorizationPolicy;
    readonly approvals?: ApprovalBroker;
    readonly grants?: OneShotGrantStore;
    readonly onInvocation?: ActionInvocationObserver;
    readonly onResult?: ActionResultObserver;
    readonly isToolAvailable?: (name: ActionToolName) => boolean;
  }) {
    this.#backend = options.backend;
    this.#policy = options.policy ?? new DefaultActionAuthorizationPolicy();
    this.#approvals = options.approvals;
    this.#grants = options.grants ?? new OneShotGrantStore();
    this.#onInvocation = options.onInvocation;
    this.#onResult = options.onResult;
    this.#isToolAvailable = options.isToolAvailable;
  }

  listTools(): readonly ToolDescriptor[] {
    return this.#isToolAvailable
      ? ACTION_TOOL_DESCRIPTORS.filter(({ name }) =>
          this.#isToolAvailable!(name as ActionToolName),
        )
      : ACTION_TOOL_DESCRIPTORS;
  }

  async invoke(invocation: ActionInvocation): Promise<ActionExecutionResult> {
    if (
      invocation.context.allowedTools &&
      !invocation.context.allowedTools.has(invocation.name)
    )
      return refused(
        'This tool is unavailable for the selected Mac route. Use this turn’s provided tools; changing settings cannot expand a running skill’s access.',
      );
    if (!isActionToolName(invocation.name))
      return refused(`Tool ${invocation.name} is not exposed by Sia`);
    if (this.#isToolAvailable && !this.#isToolAvailable(invocation.name)) {
      return refused(`Tool ${invocation.name} is unavailable for this account`);
    }
    try {
      await this.#onInvocation?.({ name: invocation.name, context: invocation.context });
    } catch {
      return refused('Action invocation could not be recorded safely');
    }
    const descriptor = getActionToolDescriptor(invocation.name)!;
    let parsed: Readonly<Record<string, unknown>>;
    try {
      parsed = parseActionArguments(invocation.name, invocation.arguments) as Readonly<
        Record<string, unknown>
      >;
    } catch (error) {
      return refused(
        error instanceof Error ? `Invalid arguments: ${error.message}` : 'Invalid arguments',
      );
    }
    const request: ValidatedActionInvocation = {
      name: invocation.name,
      arguments: parsed,
      context: invocation.context,
      descriptor,
    };
    const hardSafety = defaultSafetyDecision(request);
    if (hardSafety?.decision === 'deny') return refused(hardSafety.reason);

    if (request.context.backgroundOnly && request.arguments.delivery === 'foreground')
      return {
        outcome: 'needs_foreground',
        summary:
          'This request is set to pause when foreground control is needed. No foreground input or opening was dispatched. Explain the blocker; the user can enable brief foreground control in Settings → Computer for a new request.',
        reason: 'Background fallback is set to pause for this turn.',
      };

    const authorization = await this.#policy.evaluate(request);
    let approvedRequestId: string | undefined;
    if (authorization.decision === 'deny') return refused(authorization.reason);
    if (authorization.decision === 'approval') {
      const targetDigest = actionTargetDigest(request.name, request.arguments);
      if (invocation.oneShotGrantId) {
        const consumed = this.#grants.consume({
          id: invocation.oneShotGrantId,
          sessionId: invocation.context.sessionId,
          toolName: request.name,
          targetDigest,
        });
        if (!consumed)
          return refused(
            'The one-shot approval is missing, expired, already used, or belongs to another action',
          );
      } else {
        if (!this.#approvals)
          return refused('This action requires approval, but no approval broker is available');
        const approvalId = randomUUID();
        const decision = await this.#approvals.requestApproval(
          {
            id: approvalId,
            sessionId: request.context.sessionId,
            threadId: request.context.threadId,
            turnId: request.context.turnId,
            tool: descriptor,
            arguments: request.arguments,
            targetDigest,
            reason: authorization.reason,
          },
          request.context.signal,
        );
        if (!decision.approved) return refused('User denied the action');
        approvedRequestId = approvalId;
        const grant = this.#grants.issue({
          sessionId: request.context.sessionId,
          toolName: request.name,
          targetDigest,
          ttlMs: 60_000,
        });
        if (
          !this.#grants.consume({
            id: grant.id,
            sessionId: request.context.sessionId,
            toolName: request.name,
            targetDigest,
          })
        ) {
          return refused('Approval expired before execution');
        }
      }
    }

    const resource = resourceFor(request);
    if (resource && invocation.context.lease && !invocation.context.lease.holds(resource)) {
      try {
        await invocation.context.lease.acquire(resource, invocation.context.signal);
      } catch (error) {
        return refused(
          error instanceof Error ? error.message : 'Could not acquire action resource',
        );
      }
    }
    try {
      if (invocation.context.signal?.aborted)
        return refused('Action cancelled before execution');
      const result = actionExecutionResultSchema.parse(
        await this.#backend.invoke({
          ...request,
          ...(approvedRequestId ? { approvalId: approvedRequestId } : {}),
        }),
      );
      try {
        await this.#onResult?.({
          name: request.name,
          context: request.context,
          arguments: request.arguments,
          result,
        });
      } catch {
        // Research/telemetry is downstream of an already executed action and
        // must never rewrite its verified result or trigger a duplicate retry.
      }
      return result;
    } catch (error) {
      return refused(
        error instanceof Error
          ? `Action backend failed: ${error.message}`
          : 'Action backend failed',
      );
    }
  }
}

function refused(reason: string): ActionExecutionResult {
  return { outcome: 'refused', summary: reason, reason };
}

/** True when a path is inside a workspace; useful for host-side persistent grants. */
export function isPathInsideWorkspace(candidate: string, workspace: string): boolean {
  const normalizedWorkspace = normalize(workspace);
  const normalizedCandidate = normalize(candidate);
  return (
    normalizedCandidate === normalizedWorkspace ||
    normalizedCandidate.startsWith(`${normalizedWorkspace}${sep}`)
  );
}
