import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { refused } from './action-results.js';
import type { DesktopActionBackendOptions } from './types.js';

/** Searches, reads and sends Apple Messages through the local Messages integration. */
export class MessagesActions {
  #fullDiskAccessSettingsOpened = false;

  constructor(
    private readonly messages: DesktopActionBackendOptions['messages'],
    private readonly openFullDiskAccessSettings: (() => Promise<void>) | undefined,
  ) {}

  async run(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const messages = this.messages;
    if (!messages) return refused('Apple Messages is unavailable on this Mac.');
    const args = request.arguments;
    if (request.name === 'messages_send') {
      // Same fail-closed contract as connector mutations: the exact send must have crossed
      // the host authorization boundary, whether authorization was automatic or interactive.
      if (!request.approvalId) {
        return refused('This message send is missing its exact action authorization.');
      }
      await messages.send(String(args.recipient), String(args.text));
      return {
        outcome: 'verified',
        summary: `Sent the iMessage to ${String(args.recipient)}.`,
        verification: {
          evidence: 'The signed-in Messages app accepted the send via Apple events.',
        },
      };
    }
    const limit = Math.min(
      Number(args.limit) || (request.name === 'messages_search' ? 20 : 30),
      100,
    );
    let rows: unknown[];
    try {
      rows =
        request.name === 'messages_search'
          ? messages.search(typeof args.query === 'string' ? args.query : undefined, limit)
          : messages.readThread(String(args.chat_id), limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Messages could not be read.';
      if (/Full Disk Access/i.test(message) && this.openFullDiskAccessSettings) {
        // The grant itself is user-only by macOS design; the most automatic legal flow is
        // opening the exact settings pane so the person only flips the switch.
        if (!this.#fullDiskAccessSettingsOpened) {
          this.#fullDiskAccessSettingsOpened = true;
          void this.openFullDiskAccessSettings().catch(() => undefined);
        }
        return refused(
          `${message} System Settings has been opened at the Full Disk Access pane — turn on Sia (or the app Sia was launched from during development), then ask again.`,
        );
      }
      return refused(message);
    }
    return {
      outcome: 'verified',
      summary: `Read ${rows.length} local message${rows.length === 1 ? '' : 's'} from the Messages transcript.`,
      data: { messages: rows },
      verification: { evidence: 'Read directly from the local Messages database.' },
    };
  }
}
