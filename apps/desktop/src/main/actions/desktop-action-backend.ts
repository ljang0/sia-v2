import type {
  ActionBackend,
  ActionExecutionResult,
  ValidatedActionInvocation,
} from '@sia/action-gateway';
import { workspaceFileAction } from './background-files.js';
import { isConnectionReconnectRequired } from '../cloud/cloud-client.js';
import { macExecutionTools } from './mac-execution.js';
import { MacWindowHistory } from './mac-window-history.js';
import { classifyFailure, refused } from './action-results.js';
import { trustedApprovalTarget } from './approval-target.js';
import { BrowserActions } from './browser-actions.js';
import { sweepStaleBrowserVaults } from './browser-uploads.js';
import { ComputerInput } from './computer-input.js';
import { ComputerInventory } from './computer-inventory.js';
import { ComputerObservation } from './computer-observation.js';
import { ConnectorActions } from './connector-actions.js';
import { ActionBackendContext } from './context.js';
import { asRecord } from './driver-records.js';
import { MessagesActions } from './messages-actions.js';
import { ScheduleActions } from './schedule-actions.js';
import type { DesktopActionBackendOptions } from './types.js';

/**
 * Translates Sia's small canonical tool surface into CUA and cloud calls.
 *
 * CUA target ids, element tokens, and target-specific arguments stay in this
 * trusted main-process object. Models only receive Sia-minted snapshot and
 * element references, so a ref cannot be replayed against another window/tab.
 * Each tool family is delegated to the collaborator that owns it.
 */
export class DesktopActionBackend implements ActionBackend {
  readonly #ctx: ActionBackendContext;
  readonly #inventory: ComputerInventory;
  readonly #observation: ComputerObservation;
  readonly #input: ComputerInput;
  readonly #browser: BrowserActions;
  readonly #connectors: ConnectorActions;
  readonly #messages: MessagesActions;
  readonly #schedules: ScheduleActions;
  readonly #recoveryFailures = new Map<string, number>();
  readonly #macWindows = new MacWindowHistory();

  constructor(options: DesktopActionBackendOptions) {
    this.#ctx = new ActionBackendContext(options);
    this.#inventory = new ComputerInventory(this.#ctx);
    this.#observation = new ComputerObservation(this.#ctx, this.#inventory);
    this.#input = new ComputerInput(this.#ctx, this.#inventory, this.#observation);
    this.#browser = new BrowserActions(this.#ctx, this.#inventory);
    this.#connectors = new ConnectorActions(this.#ctx);
    this.#messages = new MessagesActions(options.messages, options.openFullDiskAccessSettings);
    this.#schedules = new ScheduleActions(options.schedules);
    void sweepStaleBrowserVaults();
  }

  /** Indexes a trusted browser_prepare/get_browser_state result without exposing target ids. */
  acceptBrowserState(value: unknown, sessionId?: string): void {
    this.#ctx.browser.accept(value, sessionId);
  }

  /** Called when the trusted host detaches the browser or its grant expires. */
  resetBrowserCapabilities(): void {
    this.#ctx.browser.reset();
  }

  /** The approval card's description of an exact, still-current action target. */
  trustedApprovalTarget(
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): string | undefined {
    return trustedApprovalTarget(
      this.#ctx.computer,
      this.#ctx.browser,
      toolName,
      argumentsValue,
    );
  }

  async invoke(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    // A late cancelled caller must not revoke a newer turn's active window refs.
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    if (
      [
        'computer_list',
        'computer_open_app',
        'computer_open_url',
        'computer_snapshot',
        'computer_action',
      ].includes(request.name)
    )
      this.#ctx.computer.session(request);
    const computerWrite =
      request.name === 'computer_action' || request.name === 'browser_action';
    const key = `${request.context.threadId}:${request.context.turnId}`;
    if (computerWrite && (this.#recoveryFailures.get(key) ?? 0) >= 2) {
      return refused(
        'Two control attempts failed in this turn. Stop retrying, explain the blocker, and ask the user to repair access or the target before a new request.',
      );
    }
    const rawResult = await this.#invoke(request);
    const result = this.#ctx.macBrowserAccess()
      ? this.#macWindows.observe(request, rawResult)
      : rawResult;
    if (computerWrite) {
      if (['stale', 'needs_foreground', 'refused'].includes(result.outcome)) {
        this.#recoveryFailures.set(key, (this.#recoveryFailures.get(key) ?? 0) + 1);
        if (this.#recoveryFailures.size > 256)
          this.#recoveryFailures.delete(this.#recoveryFailures.keys().next().value!);
        return {
          ...result,
          data: {
            ...(asRecord(result.data) ?? {}),
            recovery:
              'Observe the target again before a retry. Stop after two failed attempts; never replay a write with uncertain delivery.',
          },
        };
      }
      this.#recoveryFailures.delete(key);
    }
    return result;
  }

  async #invoke(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    if (
      this.#ctx.macBrowserAccess() &&
      request.name !== 'memory_vault' &&
      !macExecutionTools(this.#ctx.macBackgroundControl()).includes(request.name) &&
      !(this.#ctx.macBackgroundControl() && request.name === 'browser_tabs')
    )
      return refused(
        'This tool is unavailable for the selected Mac control route. Continue through its provided tools and the ordinary app interface; no Chrome connection is needed.',
      );
    try {
      switch (request.name) {
        case 'computer_list_files':
        case 'computer_read_file':
        case 'computer_write_file':
          return await workspaceFileAction(request);
        case 'assistant_library':
        case 'memory_learn':
        case 'memory_suggest':
        case 'memory_vault':
        case 'skill_save':
        case 'skill_run':
          return this.#ctx.options.assistantAction
            ? await this.#ctx.options.assistantAction(request)
            : refused('Assistant library actions are unavailable.');
        case 'mac_automation':
          if (!request.approvalId)
            return refused('Mac automation requires exact action approval.');
          return this.#ctx.options.macAutomation
            ? await this.#ctx.options.macAutomation(request.arguments, request.context.signal)
            : refused('Native app automation is unavailable.');
        case 'computer_list':
          return await this.#inventory.list(request);
        case 'computer_open_app':
          return await this.#inventory.openApp(request);
        case 'computer_open_url':
          return await this.#inventory.openUrl(request);
        case 'computer_snapshot':
          return await this.#observation.snapshot(request);
        case 'computer_action':
          return await this.#input.act(request);
        case 'browser_tabs':
          await this.#browser.attachOnDemand();
          return await this.#browser.tabs(request);
        case 'browser_snapshot':
          await this.#browser.attachOnDemand();
          return await this.#browser.snapshot(request);
        case 'browser_navigate':
          await this.#browser.attachOnDemand();
          return await this.#browser.navigate(request);
        case 'browser_action':
          await this.#browser.attachOnDemand();
          return await this.#browser.act(request);
        case 'browser_upload':
          await this.#browser.attachOnDemand();
          return await this.#browser.upload(request);
        case 'mail_search':
        case 'mail_read_thread':
        case 'mail_create_draft':
        case 'mail_send':
        case 'drive_search':
        case 'drive_read':
        case 'drive_upload':
        case 'drive_share':
        case 'docs_create':
        case 'docs_read':
        case 'docs_append':
        case 'sheets_create':
        case 'sheets_read':
        case 'sheets_update':
        case 'sheets_append':
        case 'slides_create':
        case 'slides_read':
        case 'slides_append':
        case 'slack_search':
        case 'slack_find_users':
        case 'slack_open_dm':
        case 'slack_read_thread':
        case 'slack_post':
        case 'calendar_list_events':
        case 'calendar_read_event':
        case 'calendar_create_event':
        case 'calendar_update_event':
        case 'calendar_delete_event':
        case 'tasks_list':
        case 'tasks_create':
        case 'tasks_update':
        case 'outlook_search':
        case 'outlook_read':
        case 'outlook_create_draft':
        case 'outlook_send':
        case 'outlook_reply':
        case 'outlook_move':
        case 'outlook_mark':
        case 'notion_search':
        case 'notion_fetch':
        case 'notion_create_page':
        case 'notion_edit_page':
        case 'notion_comment':
        case 'github_search':
        case 'github_read_file':
        case 'github_read_issue':
        case 'github_create_issue':
        case 'github_comment':
        case 'github_create_pull_request':
          return await this.#connectors.run(request, request.name);
        case 'messages_search':
        case 'messages_read_thread':
        case 'messages_send':
          return await this.#messages.run(request);
        case 'schedule_create':
        case 'schedule_list':
        case 'schedule_update':
        case 'schedule_delete':
          return this.#schedules.run(request);
      }
    } catch (error) {
      if (isConnectionReconnectRequired(error)) {
        return refused(
          'This connected app authorization expired. Reconnect it in Settings > Connections, then retry.',
        );
      }
      return classifyFailure(error);
    }
  }
}
