import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  isSensitiveLocalPath,
  type ActionExecutionResult,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import {
  isConnectionReconnectRequired,
  type PreparedActionResult,
} from '../cloud/cloud-client.js';
import { refused } from './action-results.js';
import { requiredString, withoutKey } from './arguments.js';
import type { ActionBackendContext } from './context.js';
import type { ConnectorApp } from './types.js';
import type { LocalConnectionId } from '../../shared/bridge.js';
import { connectorAppForTool as appForTool } from '../controller/connection-ids.js';
import { ConnectorRequestError } from '../connectors/http.js';
import { appLabel } from '../connectors/local-connectors.js';

const CONNECTOR_TOOLS = {
  mail_search: 'mail.search',
  mail_read_thread: 'mail.read_thread',
  mail_create_draft: 'mail.create_draft',
  mail_send: 'mail.send',
  drive_search: 'drive.search',
  drive_read: 'drive.read',
  drive_upload: 'drive.upload',
  drive_share: 'drive.share',
  docs_create: 'docs.create',
  docs_read: 'docs.read',
  docs_append: 'docs.append',
  sheets_create: 'sheets.create',
  sheets_read: 'sheets.read',
  sheets_update: 'sheets.update',
  sheets_append: 'sheets.append',
  slides_create: 'slides.create',
  slides_read: 'slides.read',
  slides_append: 'slides.append',
  slack_search: 'slack.search',
  slack_find_users: 'slack.find_users',
  slack_open_dm: 'slack.open_dm',
  slack_read_thread: 'slack.read_thread',
  slack_post: 'slack.post',
  calendar_list_events: 'calendar.list_events',
  calendar_read_event: 'calendar.read_event',
  calendar_create_event: 'calendar.create_event',
  calendar_update_event: 'calendar.update_event',
  calendar_delete_event: 'calendar.delete_event',
  tasks_list: 'tasks.list',
  tasks_create: 'tasks.create',
  tasks_update: 'tasks.update',
} as const;

/** Tools served by apps this Mac signs in to directly. */
const LOCAL_CONNECTOR_TOOLS = [
  'outlook_search',
  'outlook_read',
  'outlook_create_draft',
  'outlook_send',
  'outlook_reply',
  'outlook_move',
  'outlook_mark',
  'notion_search',
  'notion_fetch',
  'notion_create_page',
  'notion_edit_page',
  'notion_comment',
  'github_search',
  'github_read_file',
  'github_read_issue',
  'github_create_issue',
  'github_comment',
  'github_create_pull_request',
] as const;

export type CloudConnectorTool = keyof typeof CONNECTOR_TOOLS;
export type LocalConnectorTool = (typeof LOCAL_CONNECTOR_TOOLS)[number];
export type ConnectorTool = CloudConnectorTool | LocalConnectorTool;

function isLocalConnectorTool(name: ConnectorTool): name is LocalConnectorTool {
  return (LOCAL_CONNECTOR_TOOLS as readonly string[]).includes(name);
}

const MAX_CONNECTOR_UPLOAD_BYTES = 5_000_000;
const CONNECTOR_UPLOAD_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rtf': 'application/rtf',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

/**
 * Google Workspace and Slack tools through the Sia control plane, where reads execute directly
 * and mutations commit only the exact previewed input, under the action's approval. Outlook,
 * Notion, and GitHub run through the local connector service with the approved input.
 */
export class ConnectorActions {
  constructor(private readonly ctx: ActionBackendContext) {}

  async run(
    request: ValidatedActionInvocation,
    name: ConnectorTool,
  ): Promise<ActionExecutionResult> {
    if (isLocalConnectorTool(name)) return this.#runLocal(request, name);
    if (!this.ctx.options.cloud || this.ctx.options.cloud.configured === false) {
      return refused('Sia cloud services are not configured for connected-app tools.');
    }
    const accountSelector = requiredString(request.arguments.account_id, 'account_id');
    const connectorApp = connectorAppForTool(name);
    if (request.descriptor.annotations.requiresApproval && !request.approvalId) {
      return refused('This connector mutation is missing its exact action authorization.');
    }
    const connectionId = this.ctx.options.resolveConnectionId?.(
      connectorApp,
      accountSelector,
      request.approvalId,
    );
    if (!connectionId) {
      return refused(connectorBrowserFallback(connectorApp));
    }
    const input =
      name === 'drive_upload'
        ? await this.#stageDriveUpload(request, connectionId)
        : withoutKey(request.arguments, 'account_id');
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    if (request.context.backgroundOnly && request.arguments.delivery === 'foreground')
      return {
        outcome: 'needs_foreground',
        summary:
          'This request is set to pause when foreground control is needed. No foreground input or opening was dispatched. Explain the blocker; the user can enable brief foreground control in Settings → Computer for a new request.',
        reason: 'Background fallback is set to pause for this turn.',
      };
    try {
      const prepared = await this.ctx.options.cloud.prepareAction(
        {
          connectionId,
          tool: CONNECTOR_TOOLS[name],
          input,
        },
        request.context.signal,
      );
      if (prepared.status === 'executed') return connectorReadResult(name, prepared);
      if (!request.descriptor.annotations.requiresApproval) {
        return refused(
          'The connected app tried to turn a read-only request into a mutation without approval.',
        );
      }
      if (!isDeepStrictEqual(prepared.preview, input)) {
        return refused(
          'The connected app returned a preview that did not exactly match the approved action.',
        );
      }
      if (request.context.signal?.aborted) return refused('Action cancelled before commit.');
      const committed = await this.ctx.options.cloud.commitAction(
        {
          actionId: prepared.actionId,
          digest: prepared.digest,
          input,
        },
        request.context.signal,
      );
      return {
        outcome: 'verified',
        summary:
          committed.status === 'already_completed'
            ? `${humanToolName(name)} was already completed; it was not repeated.`
            : `${humanToolName(name)} completed through the connected app.`,
        ...(committed.result === undefined ? {} : { data: committed.result }),
        verification: {
          evidence: `Cloud action ${committed.actionId} passed digest verification and idempotent commit.`,
        },
      };
    } catch (error) {
      if (isConnectionReconnectRequired(error)) {
        this.ctx.options.onConnectionReconnectRequired?.(connectorApp, connectionId);
      }
      throw error;
    }
  }

  async #runLocal(
    request: ValidatedActionInvocation,
    name: LocalConnectorTool,
  ): Promise<ActionExecutionResult> {
    const service = this.ctx.options.localConnectors;
    if (!service) return refused('Connected apps are unavailable in this build.');
    const app = connectorAppForTool(name);
    if (request.descriptor.annotations.requiresApproval && !request.approvalId) {
      return refused('This connector mutation is missing its exact action authorization.');
    }
    const connectionId = this.ctx.options.resolveConnectionId?.(
      app,
      requiredString(request.arguments.account_id, 'account_id'),
      request.approvalId,
    );
    if (!connectionId) return refused(connectorBrowserFallback(app));
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    try {
      const data = await service.execute(
        app as LocalConnectionId,
        connectionId,
        name,
        withoutKey(request.arguments, 'account_id'),
        request.context.signal,
      );
      return {
        outcome: 'verified',
        summary: `${humanToolName(name)} completed through ${appLabel(app as LocalConnectionId)}.`,
        data,
        verification: {
          evidence: `${appLabel(app as LocalConnectionId)} accepted the request from this Mac's connection.`,
        },
      };
    } catch (error) {
      if (error instanceof ConnectorRequestError) {
        if (error.reconnectRequired) {
          this.ctx.options.onConnectionReconnectRequired?.(app, connectionId);
        }
        return refused(error.message);
      }
      throw error;
    }
  }

  async #stageDriveUpload(
    request: ValidatedActionInvocation,
    connectionId: string,
  ): Promise<Record<string, unknown>> {
    if (!this.ctx.options.cloud?.stageConnectorFile) {
      throw new Error('Sia cloud file staging is unavailable.');
    }
    const filePath = requiredString(request.arguments.file_path, 'file_path');
    if (!isAbsolute(filePath)) throw new Error('The approved upload path must be absolute.');
    const resolvedPath = await realpath(filePath);
    if (isSensitiveLocalPath(filePath) || isSensitiveLocalPath(resolvedPath)) {
      throw new Error('Security-sensitive files cannot be uploaded through connector tools.');
    }
    const source = await open(resolvedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let fileInfo;
    try {
      fileInfo = await source.stat();
      const pathHandle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!sameFileIdentity(fileInfo, await pathHandle.stat())) {
          throw new Error('The approved Drive upload changed before it was opened.');
        }
      } finally {
        await pathHandle.close();
      }
      if (!fileInfo.isFile())
        throw new Error('The approved Drive upload must be a regular file.');
      if (fileInfo.size < 1 || fileInfo.size > MAX_CONNECTOR_UPLOAD_BYTES) {
        throw new Error(
          `Drive uploads must be between 1 byte and ${MAX_CONNECTOR_UPLOAD_BYTES} bytes.`,
        );
      }
    } catch (error) {
      await source.close();
      throw error;
    }
    const sourceName = basename(resolvedPath);
    const fileName =
      request.arguments.name === undefined
        ? sourceName
        : validateConnectorFileName(requiredString(request.arguments.name, 'name'));
    const mimeType = CONNECTOR_UPLOAD_MIME_BY_EXTENSION[extname(sourceName).toLowerCase()];
    if (!mimeType) {
      await source.close();
      throw new Error('That local file type is not supported for Drive upload.');
    }
    const remoteExtension = extname(fileName).toLowerCase();
    if (remoteExtension && CONNECTOR_UPLOAD_MIME_BY_EXTENSION[remoteExtension] !== mimeType) {
      await source.close();
      throw new Error('The requested Drive filename does not match the local file type.');
    }
    if (request.context.signal?.aborted) {
      await source.close();
      throw new Error('Drive upload was cancelled.');
    }
    const bytes = Buffer.alloc(fileInfo.size);
    let readResult;
    let finalFileInfo: typeof fileInfo;
    try {
      readResult = await source.read(bytes, 0, bytes.length, 0);
      finalFileInfo = await source.stat();
    } finally {
      await source.close();
    }
    if (readResult.bytesRead !== fileInfo.size || !sameStableFile(fileInfo, finalFileInfo)) {
      bytes.fill(0);
      throw new Error('The selected file changed while it was being read.');
    }
    const md5 = createHash('md5').update(bytes).digest('hex');
    const sha256 = createHash('sha256').update(bytes).digest('base64url');
    try {
      const file = await this.ctx.options.cloud.stageConnectorFile(
        {
          connectionId,
          fileName,
          mimeType,
          byteLength: bytes.byteLength,
          md5,
          sha256,
        },
        bytes,
        request.context.signal,
      );
      const parentId =
        request.arguments.parent_id === undefined
          ? undefined
          : requiredString(request.arguments.parent_id, 'parent_id');
      return { file, ...(parentId === undefined ? {} : { parent_id: parentId }) };
    } finally {
      bytes.fill(0);
    }
  }
}

function connectorReadResult(
  name: ConnectorTool,
  prepared: Extract<PreparedActionResult, { status: 'executed' }>,
): ActionExecutionResult {
  return {
    outcome: 'verified',
    summary: `${humanToolName(name)} completed through the connected app.`,
    data: prepared.result,
    verification: {
      evidence: `Cloud execution ${prepared.executionId} completed through the selected connection.`,
    },
  };
}

function sameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function sameStableFile(
  left: {
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    mtimeMs: number;
    ctimeMs: number;
  },
  right: {
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    mtimeMs: number;
    ctimeMs: number;
  },
): boolean {
  return (
    sameFileIdentity(left, right) &&
    String(left.size) === String(right.size) &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function validateConnectorFileName(value: string): string {
  if (
    value.length > 255 ||
    value !== value.trim() ||
    value === '.' ||
    value === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('The requested Drive filename is invalid.');
  }
  return value;
}

function humanToolName(name: ConnectorTool): string {
  return name.replaceAll('_', ' ');
}

function connectorAppForTool(name: ConnectorTool): ConnectorApp {
  const app = appForTool(name);
  if (!app) throw new Error(`Unknown connector tool ${name}.`);
  return app;
}

function connectorBrowserFallback(app: ConnectorApp): string {
  const destinations = {
    gmail: ['Gmail', 'https://mail.google.com'],
    drive: ['Google Drive', 'https://drive.google.com'],
    docs: ['Google Docs', 'https://docs.google.com'],
    sheets: ['Google Sheets', 'https://sheets.google.com'],
    slides: ['Google Slides', 'https://slides.google.com'],
    calendar: ['Google Calendar', 'https://calendar.google.com'],
    tasks: ['Google Tasks', 'https://tasks.google.com'],
    slack: ['Slack', 'https://app.slack.com'],
    outlook: ['Outlook', 'https://outlook.office.com/mail'],
    notion: ['Notion', 'https://www.notion.so'],
    github: ['GitHub', 'https://github.com'],
  } as const satisfies Record<ConnectorApp, readonly [string, string]>;
  const [label, url] = destinations[app];
  return `${label} is not connected. Continue now in signed-in Chrome at ${url} with browser or computer use, handing control to the user if sign-in is required. For reliable API and background access, the user can connect it later in Settings > Connections; after connection use account_id "${app}".`;
}
