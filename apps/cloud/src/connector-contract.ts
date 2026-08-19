import type { ToolName } from './contracts.js';
import { CloudError, isRecord } from './domain.js';
import type { ComposioConfig } from './ports.js';

/** Schemas audited against the public Composio toolkit catalog on 2026-08-13. */
export const COMPOSIO_TOOL_VERSION = '20260721_00';

export const COMPOSIO_TOOL_SLUGS = {
  'mail.search': 'GMAIL_FETCH_EMAILS',
  'mail.read_thread': 'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
  'mail.create_draft': 'GMAIL_CREATE_EMAIL_DRAFT',
  'mail.send': 'GMAIL_SEND_EMAIL',
  'drive.search': 'GOOGLEDRIVE_FIND_FILE',
  'drive.read': 'GOOGLEDRIVE_GET_FILE_METADATA',
  'drive.upload': 'GOOGLEDRIVE_UPLOAD_FILE',
  'drive.share': 'GOOGLEDRIVE_CREATE_PERMISSION',
  'slack.search': 'SLACK_SEARCH_MESSAGES',
  'slack.read_thread': 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION',
  'slack.post': 'SLACK_SEND_MESSAGE',
} as const satisfies Record<ToolName, string>;

export function assertComposioContract(config: ComposioConfig, tool?: ToolName): void {
  if (config.toolVersion !== COMPOSIO_TOOL_VERSION) {
    throw new CloudError(
      503,
      'connector_contract_mismatch',
      `Connector toolkit version must be ${COMPOSIO_TOOL_VERSION}`,
    );
  }
  const tools = tool ? [tool] : (Object.keys(COMPOSIO_TOOL_SLUGS) as ToolName[]);
  for (const canonical of tools) {
    if (config.toolSlugs[canonical] !== COMPOSIO_TOOL_SLUGS[canonical]) {
      throw new CloudError(
        503,
        'connector_contract_mismatch',
        `Connector mapping for ${canonical} is not supported by this release`,
      );
    }
  }
}

/**
 * Validates Sia's canonical input and returns only provider fields audited for
 * the pinned tool schema. Unknown fields always fail closed.
 */
export function mapCanonicalConnectorInput(
  tool: Exclude<ToolName, 'drive.upload'>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  switch (tool) {
    case 'mail.search': {
      exactKeys(input, ['query', 'limit'], ['query']);
      return {
        query: boundedString(input.query, 'query', 8_000),
        max_results:
          input.limit === undefined ? 20 : boundedInteger(input.limit, 'limit', 1, 100),
        include_payload: false,
        verbose: false,
      };
    }
    case 'mail.read_thread': {
      exactKeys(input, ['resource_id'], ['resource_id']);
      return { thread_id: opaqueId(input.resource_id, 'resource_id') };
    }
    case 'mail.create_draft': {
      const message = validateMail(input, true);
      return {
        recipient_email: message.to[0],
        ...(message.to.length > 1 ? { extra_recipients: message.to.slice(1) } : {}),
        ...(message.cc === undefined ? {} : { cc: message.cc }),
        subject: message.subject,
        body: message.body,
        is_html: false,
        ...(message.threadId === undefined ? {} : { thread_id: message.threadId }),
      };
    }
    case 'mail.send': {
      const message = validateMail(input, false);
      if (message.threadId !== undefined) {
        throw new CloudError(
          400,
          'connector_feature_not_supported',
          'Sending into an existing Gmail thread is not supported by the pinned send tool',
        );
      }
      return {
        recipient_email: message.to[0],
        ...(message.to.length > 1 ? { extra_recipients: message.to.slice(1) } : {}),
        ...(message.cc === undefined ? {} : { cc: message.cc }),
        subject: message.subject,
        body: message.body,
        is_html: false,
      };
    }
    case 'drive.search': {
      exactKeys(input, ['query', 'limit'], ['query']);
      return {
        q: boundedString(input.query, 'query', 8_000),
        pageSize: input.limit === undefined ? 20 : boundedInteger(input.limit, 'limit', 1, 100),
      };
    }
    case 'drive.read': {
      exactKeys(input, ['resource_id'], ['resource_id']);
      return { fileId: opaqueId(input.resource_id, 'resource_id') };
    }
    case 'drive.share': {
      exactKeys(
        input,
        ['resource_id', 'recipient', 'role'],
        ['resource_id', 'recipient', 'role'],
      );
      const role = input.role;
      if (role !== 'reader' && role !== 'commenter' && role !== 'writer') {
        invalid('role must be reader, commenter, or writer');
      }
      return {
        file_id: opaqueId(input.resource_id, 'resource_id'),
        email_address: email(input.recipient, 'recipient'),
        role,
        type: 'user',
        send_notification_email: true,
      };
    }
    case 'slack.search': {
      exactKeys(input, ['query', 'limit'], ['query']);
      return {
        query: boundedString(input.query, 'query', 8_000),
        count: input.limit === undefined ? 20 : boundedInteger(input.limit, 'limit', 1, 100),
        auto_paginate: false,
      };
    }
    case 'slack.read_thread': {
      exactKeys(input, ['resource_id'], ['resource_id']);
      const resource = opaqueId(input.resource_id, 'resource_id');
      const match = /^([CGD][A-Z0-9]+):(\d{6,}\.\d{6})$/.exec(resource);
      if (!match?.[1] || !match[2]) {
        invalid('resource_id must be a Slack channel ID and root timestamp joined by a colon');
      }
      return { channel: match[1], ts: match[2], limit: 100 };
    }
    case 'slack.post': {
      exactKeys(input, ['channel_id', 'text', 'thread_id'], ['channel_id', 'text']);
      const threadId = optionalOpaqueId(input.thread_id, 'thread_id');
      return {
        channel: opaqueId(input.channel_id, 'channel_id'),
        markdown_text: boundedString(input.text, 'text', 40_000),
        ...(threadId === undefined ? {} : { thread_ts: threadId }),
      };
    }
  }
}

export function validateCanonicalDriveUploadInput(input: Record<string, unknown>): void {
  exactKeys(input, ['file', 'parent_id'], ['file']);
  if (!isRecord(input.file)) invalid('file must be a staged file descriptor');
  exactKeys(
    input.file,
    ['uploadId', 'fileName', 'mimeType', 'byteLength', 'sha256'],
    ['uploadId', 'fileName', 'mimeType', 'byteLength', 'sha256'],
  );
  opaqueId(input.file.uploadId, 'file.uploadId', 128);
  boundedString(input.file.fileName, 'file.fileName', 255);
  boundedString(input.file.mimeType, 'file.mimeType', 127);
  boundedInteger(input.file.byteLength, 'file.byteLength', 1, 5_000_000);
  const sha256 = boundedString(input.file.sha256, 'file.sha256', 64);
  if (!/^[A-Za-z0-9_-]{43}$/.test(sha256)) invalid('file.sha256 is invalid');
  optionalOpaqueId(input.parent_id, 'parent_id');
}

function validateMail(input: Record<string, unknown>, allowThread: boolean) {
  exactKeys(input, ['to', 'cc', 'subject', 'body', 'thread_id'], ['to', 'subject', 'body']);
  const to = emailArray(input.to, 'to', 1, 50);
  const cc = input.cc === undefined ? undefined : emailArray(input.cc, 'cc', 0, 50);
  const threadId = optionalOpaqueId(input.thread_id, 'thread_id');
  if (!allowThread && threadId !== undefined) {
    return {
      to,
      cc,
      subject: boundedString(input.subject, 'subject', 998, true),
      body: boundedString(input.body, 'body', 1_000_000, true),
      threadId,
    };
  }
  return {
    to,
    cc,
    subject: boundedString(input.subject, 'subject', 998, true),
    body: boundedString(input.body, 'body', 1_000_000, true),
    threadId,
  };
}

function exactKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(input).find((key) => !allowedSet.has(key));
  if (unknown) invalid(`unknown connector field: ${unknown}`);
  const missing = required.find((key) => input[key] === undefined);
  if (missing) invalid(`missing connector field: ${missing}`);
}

function boundedString(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.length === 0)) {
    invalid(`${label} must be ${allowEmpty ? '0' : '1'}-${max} characters`);
  }
  return value;
}

function opaqueId(value: unknown, label: string, max = 512): string {
  return boundedString(value, label, max);
}

function optionalOpaqueId(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : opaqueId(value, label);
}

function boundedInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function email(value: unknown, label: string): string {
  const candidate = boundedString(value, label, 254);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate)) {
    invalid(`${label} must be an email address`);
  }
  return candidate;
}

function emailArray(value: unknown, label: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    invalid(`${label} must contain ${min}-${max} email addresses`);
  }
  return value.map((candidate, index) => email(candidate, `${label}[${index}]`));
}

function invalid(detail: string): never {
  throw new CloudError(400, 'invalid_connector_input', `Invalid connector input: ${detail}`);
}
