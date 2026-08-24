import type { ToolName } from './contracts.js';
import { CloudError, isRecord } from './domain.js';
import type { ComposioConfig } from './ports.js';

/** Schemas audited against the public Composio toolkit catalog on 2026-08-24. */
const COMPOSIO_GMAIL_TOOL_VERSION = '20260817_00';
const COMPOSIO_DRIVE_TOOL_VERSION = '20260821_00';

export const COMPOSIO_TOOL_SLUGS = {
  'mail.search': 'GMAIL_FETCH_EMAILS',
  'mail.read_thread': 'GMAIL_FETCH_MESSAGE_BY_THREAD_ID',
  'mail.create_draft': 'GMAIL_CREATE_EMAIL_DRAFT',
  'mail.send': 'GMAIL_SEND_EMAIL',
  'drive.search': 'GOOGLEDRIVE_FIND_FILE',
  'drive.read': 'GOOGLEDRIVE_GET_FILE_METADATA',
  'drive.upload': 'GOOGLEDRIVE_UPLOAD_FILE',
  'drive.share': 'GOOGLEDRIVE_CREATE_PERMISSION',
  'docs.create': 'GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN',
  'docs.read': 'GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT',
  'docs.append': 'GOOGLEDOCS_INSERT_TEXT_ACTION',
  'sheets.create': 'GOOGLESHEETS_CREATE_GOOGLE_SHEET1',
  'sheets.read': 'GOOGLESHEETS_VALUES_GET',
  'sheets.update': 'GOOGLESHEETS_VALUES_UPDATE',
  'sheets.append': 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND',
  'slides.create': 'GOOGLESLIDES_CREATE_SLIDES_MARKDOWN',
  'slides.read': 'GOOGLESLIDES_PRESENTATIONS_GET',
  'slides.append': 'GOOGLESLIDES_PRESENTATIONS_BATCH_UPDATE',
  'slack.search': 'SLACK_SEARCH_MESSAGES',
  'slack.find_users': 'SLACK_FIND_USERS',
  'slack.open_dm': 'SLACK_OPEN_DM',
  'slack.read_thread': 'SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION',
  'slack.post': 'SLACK_SEND_MESSAGE',
} as const satisfies Record<ToolName, string>;

export const COMPOSIO_TOOL_VERSIONS = {
  'mail.search': COMPOSIO_GMAIL_TOOL_VERSION,
  'mail.read_thread': COMPOSIO_GMAIL_TOOL_VERSION,
  'mail.create_draft': COMPOSIO_GMAIL_TOOL_VERSION,
  'mail.send': COMPOSIO_GMAIL_TOOL_VERSION,
  'drive.search': COMPOSIO_DRIVE_TOOL_VERSION,
  'drive.read': COMPOSIO_DRIVE_TOOL_VERSION,
  'drive.upload': COMPOSIO_DRIVE_TOOL_VERSION,
  'drive.share': COMPOSIO_DRIVE_TOOL_VERSION,
  'docs.create': '20260818_00',
  'docs.read': '20260818_00',
  'docs.append': '20260818_00',
  'sheets.create': '20260813_00',
  'sheets.read': '20260813_00',
  'sheets.update': '20260813_00',
  'sheets.append': '20260813_00',
  'slides.create': '20260819_00',
  'slides.read': '20260819_00',
  'slides.append': '20260819_00',
  'slack.search': '20260819_00',
  'slack.find_users': '20260819_00',
  'slack.open_dm': '20260819_00',
  'slack.read_thread': '20260819_00',
  'slack.post': '20260819_00',
} as const satisfies Record<ToolName, string>;

export function assertComposioContract(config: ComposioConfig, tool?: ToolName): void {
  const tools = tool ? [tool] : (Object.keys(COMPOSIO_TOOL_SLUGS) as ToolName[]);
  for (const canonical of tools) {
    if (config.toolSlugs[canonical] !== COMPOSIO_TOOL_SLUGS[canonical]) {
      throw new CloudError(
        503,
        'connector_contract_mismatch',
        `Connector mapping for ${canonical} is not supported by this release`,
      );
    }
    if (config.toolVersions[canonical] !== COMPOSIO_TOOL_VERSIONS[canonical]) {
      throw new CloudError(
        503,
        'connector_contract_mismatch',
        `Connector version for ${canonical} must be ${COMPOSIO_TOOL_VERSIONS[canonical]}`,
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
    case 'docs.create': {
      exactKeys(input, ['title', 'markdown'], ['title']);
      return {
        title: boundedString(input.title, 'title', 512),
        markdown_text:
          input.markdown === undefined
            ? ''
            : boundedString(input.markdown, 'markdown', 500_000, true),
      };
    }
    case 'docs.read': {
      exactKeys(input, ['document_id'], ['document_id']);
      return {
        document_id: googleResourceId(input.document_id, 'document_id', 'document'),
        include_tables: true,
        include_tabs_content: true,
      };
    }
    case 'docs.append': {
      exactKeys(input, ['document_id', 'text'], ['document_id', 'text']);
      return {
        document_id: googleResourceId(input.document_id, 'document_id', 'document'),
        text_to_insert: boundedString(input.text, 'text', 500_000),
        append_to_end: true,
      };
    }
    case 'sheets.create': {
      exactKeys(input, ['title', 'folder_id'], ['title']);
      return {
        title: boundedString(input.title, 'title', 512),
        ...(input.folder_id === undefined
          ? {}
          : { folder_id: opaqueId(input.folder_id, 'folder_id') }),
      };
    }
    case 'sheets.read': {
      exactKeys(
        input,
        ['spreadsheet_id', 'range', 'start_row', 'end_row'],
        ['spreadsheet_id', 'range', 'start_row', 'end_row'],
      );
      const startRow = boundedInteger(input.start_row, 'start_row', 1, 10_000_000);
      const endRow = boundedInteger(input.end_row, 'end_row', startRow, 10_000_000);
      if (endRow - startRow > 499) invalid('sheet reads are limited to 500 rows');
      return {
        spreadsheet_id: googleResourceId(
          input.spreadsheet_id,
          'spreadsheet_id',
          'spreadsheets',
        ),
        range: boundedString(input.range, 'range', 512),
        start_row: startRow,
        end_row: endRow,
        major_dimension: 'ROWS',
        value_render_option: 'FORMATTED_VALUE',
        date_time_render_option: 'FORMATTED_STRING',
      };
    }
    case 'sheets.update': {
      exactKeys(
        input,
        ['spreadsheet_id', 'range', 'values', 'value_input_option'],
        ['spreadsheet_id', 'range', 'values', 'value_input_option'],
      );
      return {
        spreadsheet_id: googleResourceId(
          input.spreadsheet_id,
          'spreadsheet_id',
          'spreadsheets',
        ),
        range: boundedString(input.range, 'range', 512),
        values: sheetValues(input.values),
        major_dimension: 'ROWS',
        auto_expand_sheet: true,
        value_input_option: sheetInputOption(input.value_input_option),
        include_values_in_response: false,
      };
    }
    case 'sheets.append': {
      exactKeys(
        input,
        ['spreadsheet_id', 'range', 'values', 'value_input_option'],
        ['spreadsheet_id', 'range', 'values', 'value_input_option'],
      );
      const range = boundedString(input.range, 'range', 512);
      if (!range.includes('!')) invalid('append range must include an exact sheet name');
      return {
        spreadsheetId: googleResourceId(input.spreadsheet_id, 'spreadsheet_id', 'spreadsheets'),
        range,
        values: sheetValues(input.values, true),
        majorDimension: 'ROWS',
        insertDataOption: 'INSERT_ROWS',
        valueInputOption: sheetInputOption(input.value_input_option),
        includeValuesInResponse: false,
      };
    }
    case 'slides.create': {
      exactKeys(input, ['title', 'markdown'], ['title', 'markdown']);
      return {
        title: boundedString(input.title, 'title', 512),
        markdown_text: boundedString(input.markdown, 'markdown', 500_000),
      };
    }
    case 'slides.read': {
      exactKeys(input, ['presentation_id'], ['presentation_id']);
      return {
        presentationId: googleResourceId(
          input.presentation_id,
          'presentation_id',
          'presentation',
        ),
        fields:
          'presentationId,title,slides(objectId,pageElements(objectId,title,description,shape(shapeType,text)))',
      };
    }
    case 'slides.append': {
      exactKeys(input, ['presentation_id', 'markdown'], ['presentation_id', 'markdown']);
      return {
        presentationId: googleResourceId(
          input.presentation_id,
          'presentation_id',
          'presentation',
        ),
        markdown_text: boundedString(input.markdown, 'markdown', 500_000),
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
    case 'slack.find_users': {
      exactKeys(input, ['query', 'limit'], ['query']);
      return {
        search_query: boundedString(input.query, 'query', 512),
        limit: input.limit === undefined ? 20 : boundedInteger(input.limit, 'limit', 1, 100),
        exact_match: false,
        include_bots: false,
        include_deleted: false,
        include_restricted: true,
      };
    }
    case 'slack.open_dm': {
      exactKeys(input, ['user_id'], ['user_id']);
      const userId = opaqueId(input.user_id, 'user_id');
      if (!/^[UW][A-Z0-9]+$/.test(userId)) {
        invalid('user_id must be an exact Slack user ID');
      }
      return { users: userId, return_im: true, prevent_creation: false };
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

function sheetInputOption(value: unknown): 'RAW' | 'USER_ENTERED' {
  if (value !== 'RAW' && value !== 'USER_ENTERED') {
    invalid('value_input_option must be RAW or USER_ENTERED');
  }
  return value;
}

function sheetValues(
  value: unknown,
  allowNull = false,
): Array<Array<string | number | boolean | null>> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    invalid('values must contain 1-500 rows');
  }
  let cells = 0;
  const rows = value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0 || row.length > 100) {
      invalid(`values row ${rowIndex + 1} must contain 1-100 cells`);
    }
    cells += row.length;
    return row.map((cell) => {
      if (
        typeof cell !== 'string' &&
        typeof cell !== 'boolean' &&
        (typeof cell !== 'number' || !Number.isFinite(cell)) &&
        !(allowNull && cell === null)
      ) {
        invalid('sheet cells must be finite numbers, strings, booleans, or allowed nulls');
      }
      if (typeof cell === 'string' && cell.length > 50_000) {
        invalid('sheet cell text is too long');
      }
      return cell as string | number | boolean | null;
    });
  });
  if (cells > 5_000) invalid('sheet writes are limited to 5,000 cells');
  return rows;
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

function googleResourceId(
  value: unknown,
  label: string,
  resourcePath: 'document' | 'spreadsheets' | 'presentation',
): string {
  const candidate = boundedString(value, label, 2_048).trim();
  if (!candidate.includes('://')) return opaqueId(candidate, label);
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    invalid(`${label} must be a Google resource id or URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'docs.google.com' ||
    url.username ||
    url.password
  ) {
    invalid(`${label} must be a Google resource id or URL`);
  }
  const segments = url.pathname.split('/').filter(Boolean);
  const marker = segments.findIndex((segment, index) => {
    if (resourcePath === 'document')
      return segment === 'document' && segments[index + 1] === 'd';
    if (resourcePath === 'presentation') {
      return segment === 'presentation' && segments[index + 1] === 'd';
    }
    return segment === 'spreadsheets' && segments[index + 1] === 'd';
  });
  const id = marker < 0 ? undefined : segments[marker + 2];
  if (!id) invalid(`${label} URL does not contain a resource id`);
  try {
    return opaqueId(decodeURIComponent(id), label);
  } catch {
    invalid(`${label} URL contains an invalid resource id`);
  }
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
