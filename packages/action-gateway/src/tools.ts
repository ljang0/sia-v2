import type { ToolDescriptor } from '@sia/protocol';
import { z } from 'zod';

const id = z.string().trim().min(1).max(512);
const optionalId = id.optional();
const object = (
  properties: Record<string, unknown>,
  required: readonly string[] = [],
): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const string = (
  description: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ type: 'string', description, ...extra });
const accountSelector = (app: 'gmail' | 'drive' | 'slack'): Record<string, unknown> =>
  string(`Stable ${app} account selector`, { enum: [app] });

const computerList = z.object({}).strict();
const computerSnapshot = z.object({ app_id: id, window_id: id }).strict();
const computerAction = z
  .object({
    app_id: id,
    window_id: id,
    snapshot_id: id,
    action: z.enum(['click', 'type', 'set', 'scroll', 'key']),
    element_ref: id,
    text: z.string().max(20_000).optional(),
    value: z
      .string()
      .trim()
      .regex(
        /^(?:[a-z0-9]|enter|return|tab|escape|up|down|left|right|space|delete|home|end|pageup|pagedown|f(?:[1-9]|1[0-2]))$/i,
      )
      .optional(),
    modifiers: z
      .array(z.enum(['cmd', 'shift', 'option', 'ctrl', 'fn']))
      .max(5)
      .optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    amount: z.number().int().positive().max(10_000).optional(),
    target_role: z.string().max(128).optional(),
  })
  .strict();
const browserTabs = z.object({}).strict();
const browserSnapshot = z.object({ tab_id: id }).strict();
const browserNavigate = z
  .object({ tab_id: id, url: z.url().max(8_192), private: z.boolean().optional() })
  .strict();
const browserAction = z
  .object({
    tab_id: id,
    snapshot_id: id,
    action: z.enum(['click', 'type', 'scroll']),
    element_ref: id,
    text: z.string().max(20_000).optional(),
    direction: z.enum(['up', 'down', 'left', 'right']).optional(),
    amount: z.number().int().positive().max(10_000).optional(),
    origin: z.string().max(2_048),
    private: z.boolean().optional(),
    target_role: z.string().max(128).optional(),
  })
  .strict();
const browserUpload = z
  .object({
    tab_id: id,
    snapshot_id: id,
    element_ref: id,
    file_paths: z.array(z.string().min(1)).min(1).max(20),
    origin: z.string().max(2_048),
    private: z.boolean().optional(),
  })
  .strict();
const accountQuery = (app: 'gmail' | 'drive' | 'slack') =>
  z
    .object({
      account_id: z.literal(app),
      query: z.string().min(1).max(8_000),
      limit: z.number().int().positive().max(100).default(20),
    })
    .strict();
const accountResource = (app: 'gmail' | 'drive' | 'slack') =>
  z.object({ account_id: z.literal(app), resource_id: id }).strict();
const mailDraft = z
  .object({
    account_id: z.literal('gmail'),
    to: z.array(z.email()).min(1).max(50),
    cc: z.array(z.email()).max(50).optional(),
    subject: z.string().max(998),
    body: z.string().max(1_000_000),
    thread_id: optionalId,
  })
  .strict();
const mailSend = z
  .object({
    account_id: z.literal('gmail'),
    to: z.array(z.email()).min(1).max(50),
    cc: z.array(z.email()).max(50).optional(),
    subject: z.string().max(998),
    body: z.string().max(1_000_000),
  })
  .strict();
const driveUpload = z
  .object({
    account_id: z.literal('drive'),
    file_path: z.string().min(1),
    parent_id: optionalId,
    name: z.string().max(512).optional(),
  })
  .strict();
const driveShare = z
  .object({
    account_id: z.literal('drive'),
    resource_id: id,
    recipient: z.email(),
    role: z.enum(['reader', 'commenter', 'writer']),
  })
  .strict();
const slackPost = z
  .object({
    account_id: z.literal('slack'),
    channel_id: id,
    text: z.string().min(1).max(40_000),
    thread_id: optionalId,
  })
  .strict();
const messagesSearch = z
  .object({
    query: z.string().max(512).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();
const messagesReadThread = z
  .object({
    chat_id: z.string().min(1).max(512),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
const messagesSend = z
  .object({
    recipient: z.string().min(3).max(256),
    text: z.string().min(1).max(10_000),
  })
  .strict();

export const actionInputSchemas = {
  computer_list: computerList,
  computer_snapshot: computerSnapshot,
  computer_action: computerAction,
  browser_tabs: browserTabs,
  browser_snapshot: browserSnapshot,
  browser_navigate: browserNavigate,
  browser_action: browserAction,
  browser_upload: browserUpload,
  mail_search: accountQuery('gmail'),
  mail_read_thread: accountResource('gmail'),
  mail_create_draft: mailDraft,
  mail_send: mailSend,
  drive_search: accountQuery('drive'),
  drive_read: accountResource('drive'),
  drive_upload: driveUpload,
  drive_share: driveShare,
  slack_search: accountQuery('slack'),
  slack_read_thread: accountResource('slack'),
  slack_post: slackPost,
  messages_search: messagesSearch,
  messages_read_thread: messagesReadThread,
  messages_send: messagesSend,
} as const;

export type ActionToolName = keyof typeof actionInputSchemas;
export type ActionArguments<N extends ActionToolName = ActionToolName> = z.infer<
  (typeof actionInputSchemas)[N]
>;

const descriptors: Record<ActionToolName, ToolDescriptor> = {
  computer_list: {
    name: 'computer_list',
    description:
      'List permitted applications and windows without changing them. Browsers (Chrome) are intentionally excluded here; use the browser_* tools to see or read the browser.',
    inputSchema: object({}),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  computer_snapshot: {
    name: 'computer_snapshot',
    description: 'Capture accessibility and pixel state for a permitted application window.',
    inputSchema: object(
      {
        app_id: string('Exact application id'),
        window_id: string('Exact window id'),
      },
      ['app_id', 'window_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  computer_action: {
    name: 'computer_action',
    description:
      'Perform one ref-first action against the exact captured application window. It never authorizes foreground takeover. "type" inserts only the new text at the current caret; never repeat existing field content. "set" replaces the entire editable value. For shortcuts, put one non-modifier key in value and list modifiers separately.',
    inputSchema: object(
      {
        app_id: string('Exact application id'),
        window_id: string('Exact window id'),
        snapshot_id: string('Fresh snapshot id'),
        action: string('Action', { enum: ['click', 'type', 'set', 'scroll', 'key'] }),
        element_ref: string('Element reference from the snapshot'),
        text: string(
          'For type: only new characters to insert at the caret. For set: the exact complete replacement value.',
        ),
        value: string('One non-modifier key; use modifiers for shortcuts'),
        modifiers: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', enum: ['cmd', 'shift', 'option', 'ctrl', 'fn'] },
          description: 'Modifier keys held with action key',
        },
        direction: string('Scroll direction', { enum: ['up', 'down', 'left', 'right'] }),
        amount: { type: 'integer', minimum: 1, maximum: 10000 },
        target_role: string('Accessibility role'),
      },
      ['app_id', 'window_id', 'snapshot_id', 'action', 'element_ref'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  browser_tabs: {
    name: 'browser_tabs',
    description:
      "List the signed-in browser's granted tabs. In trusted mode the host attaches Chrome automatically on first use; call this first for anything about Chrome or a web page the person is viewing.",
    inputSchema: object({}),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  browser_snapshot: {
    name: 'browser_snapshot',
    description: 'Read the accessible state of one granted browser tab.',
    inputSchema: object({ tab_id: string('Granted tab id') }, ['tab_id']),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  browser_navigate: {
    name: 'browser_navigate',
    description: 'Navigate a granted tab to an HTTPS or HTTP URL allowed by origin policy.',
    inputSchema: object(
      {
        tab_id: string('Granted tab id'),
        url: string('Destination URL', { format: 'uri' }),
        private: { type: 'boolean' },
      },
      ['tab_id', 'url'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  browser_action: {
    name: 'browser_action',
    description: 'Perform one ref-based action in a granted tab without raw JavaScript or CDP.',
    inputSchema: object(
      {
        tab_id: string('Granted tab id'),
        snapshot_id: string('Fresh browser snapshot id'),
        action: string('Action', {
          enum: ['click', 'type', 'scroll'],
        }),
        element_ref: string('Element reference'),
        text: string('Text to type'),
        direction: string('Scroll direction', { enum: ['up', 'down', 'left', 'right'] }),
        amount: { type: 'integer', minimum: 1, maximum: 10000 },
        origin: string('Current origin'),
        private: { type: 'boolean' },
        target_role: string('Accessible role'),
      },
      ['tab_id', 'snapshot_id', 'action', 'element_ref', 'origin'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  browser_upload: {
    name: 'browser_upload',
    description: 'Upload explicitly granted local files through an exact file input.',
    inputSchema: object(
      {
        tab_id: string('Granted tab id'),
        snapshot_id: string('Fresh snapshot id'),
        element_ref: string('File input reference'),
        file_paths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
        origin: string('Current origin'),
        private: { type: 'boolean' },
      },
      ['tab_id', 'snapshot_id', 'element_ref', 'file_paths', 'origin'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  mail_search: {
    name: 'mail_search',
    description: 'Search messages in a connected Gmail account.',
    inputSchema: object(
      {
        account_id: accountSelector('gmail'),
        query: string('Search query'),
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      ['account_id', 'query'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  mail_read_thread: {
    name: 'mail_read_thread',
    description: 'Read one Gmail thread by opaque id.',
    inputSchema: object(
      { account_id: accountSelector('gmail'), resource_id: string('Opaque thread id') },
      ['account_id', 'resource_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  mail_create_draft: {
    name: 'mail_create_draft',
    description: 'Prepare an email draft after showing an exact preview.',
    inputSchema: object(
      {
        account_id: accountSelector('gmail'),
        to: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          minItems: 1,
          maxItems: 50,
        },
        cc: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 },
        subject: string('Email subject'),
        body: string('Email body'),
        thread_id: string('Optional thread id'),
      },
      ['account_id', 'to', 'subject', 'body'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  mail_send: {
    name: 'mail_send',
    description: 'Send an email only after showing the exact recipients, subject, and body.',
    inputSchema: object(
      {
        account_id: accountSelector('gmail'),
        to: {
          type: 'array',
          items: { type: 'string', format: 'email' },
          minItems: 1,
          maxItems: 50,
        },
        cc: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 },
        subject: string('Email subject'),
        body: string('Email body'),
      },
      ['account_id', 'to', 'subject', 'body'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  drive_search: {
    name: 'drive_search',
    description: 'Search a connected Google Drive account.',
    inputSchema: object(
      {
        account_id: accountSelector('drive'),
        query: string('Search query'),
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      ['account_id', 'query'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  drive_read: {
    name: 'drive_read',
    description: 'Read metadata for one Drive resource by opaque id.',
    inputSchema: object(
      { account_id: accountSelector('drive'), resource_id: string('Opaque resource id') },
      ['account_id', 'resource_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  drive_upload: {
    name: 'drive_upload',
    description: 'Upload an explicitly approved local file to Drive.',
    inputSchema: object(
      {
        account_id: accountSelector('drive'),
        file_path: string('Approved local path'),
        parent_id: string('Opaque parent folder id'),
        name: string('Optional remote name'),
      },
      ['account_id', 'file_path'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  drive_share: {
    name: 'drive_share',
    description: 'Share a Drive resource with one reviewed recipient and role.',
    inputSchema: object(
      {
        account_id: accountSelector('drive'),
        resource_id: string('Opaque resource id'),
        recipient: string('Recipient', { format: 'email' }),
        role: string('Role', { enum: ['reader', 'commenter', 'writer'] }),
      },
      ['account_id', 'resource_id', 'recipient', 'role'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  slack_search: {
    name: 'slack_search',
    description: 'Search messages in a connected Slack workspace.',
    inputSchema: object(
      {
        account_id: accountSelector('slack'),
        query: string('Search query'),
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      ['account_id', 'query'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  slack_read_thread: {
    name: 'slack_read_thread',
    description:
      'Read one Slack thread using the channel id and root timestamp returned by search, joined with a colon.',
    inputSchema: object(
      {
        account_id: accountSelector('slack'),
        resource_id: string('Channel id and root timestamp, e.g. C012ABC:1723500000.000100'),
      },
      ['account_id', 'resource_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  slack_post: {
    name: 'slack_post',
    description: 'Post a reviewed message to a Slack channel or thread.',
    inputSchema: object(
      {
        account_id: accountSelector('slack'),
        channel_id: string('Opaque channel id'),
        text: string('Message text'),
        thread_id: string('Optional thread id'),
      },
      ['account_id', 'channel_id', 'text'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  messages_search: {
    name: 'messages_search',
    description:
      "Read recent Apple Messages (iMessage/SMS) from this Mac's local transcript, newest first, optionally filtered by text or sender. Local only; requires Full Disk Access.",
    inputSchema: object(
      {
        query: string('Optional text or sender filter'),
        limit: string('Maximum rows (default 20)'),
      },
      [],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  messages_read_thread: {
    name: 'messages_read_thread',
    description: 'Read one Apple Messages conversation by chat id, oldest first.',
    inputSchema: object(
      {
        chat_id: string('Chat id from messages_search'),
        limit: string('Maximum rows (default 30)'),
      },
      ['chat_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  messages_send: {
    name: 'messages_send',
    description:
      'Send an iMessage through the signed-in Messages app. The exact recipient and text always pass an interactive approval first.',
    inputSchema: object(
      {
        recipient: string('Phone number, email, or exact contact handle'),
        text: string('Message text'),
      },
      ['recipient', 'text'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
};

export const ACTION_TOOL_DESCRIPTORS: readonly ToolDescriptor[] = Object.freeze(
  Object.values(descriptors).map((descriptor) => Object.freeze(descriptor)),
);

export function getActionToolDescriptor(name: string): ToolDescriptor | undefined {
  return descriptors[name as ActionToolName];
}

export function isActionToolName(name: string): name is ActionToolName {
  return Object.hasOwn(actionInputSchemas, name);
}

export function parseActionArguments<N extends ActionToolName>(
  name: N,
  value: unknown,
): ActionArguments<N> {
  return actionInputSchemas[name].parse(value) as ActionArguments<N>;
}
