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
type ConnectedAppSelector = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';
const accountSelector = (app: ConnectedAppSelector): Record<string, unknown> =>
  string(`Stable ${app} account selector`, { enum: [app] });
const sheetWriteInputSchema = (append: boolean): Record<string, unknown> =>
  object(
    {
      account_id: accountSelector('sheets'),
      spreadsheet_id: string('Spreadsheet id or full Google Sheets URL'),
      range: string(
        append
          ? 'Exact sheet-qualified append range, for example Sheet1!A:D'
          : 'Exact A1 destination range, for example Sheet1!A1:D20',
      ),
      values: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        description: 'Rows of cell values; no more than 5,000 total cells',
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: append
              ? ['string', 'number', 'boolean', 'null']
              : ['string', 'number', 'boolean'],
          },
        },
      },
      value_input_option: string('How Sheets interprets values', {
        enum: ['RAW', 'USER_ENTERED'],
        default: 'USER_ENTERED',
      }),
    },
    ['account_id', 'spreadsheet_id', 'range', 'values'],
  );

const computerList = z.object({}).strict();
const computerOpenApp = z.object({ application: z.literal('notes') }).strict();
const computerSnapshot = z.object({ app_id: id, window_id: id }).strict();
const computerAction = z
  .object({
    app_id: id,
    window_id: id,
    snapshot_id: id,
    action: z.enum(['click', 'type', 'set', 'scroll', 'key']),
    element_ref: id.optional(),
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
  .strict()
  .superRefine(({ action, element_ref }, context) => {
    if ((action === 'click' || action === 'set') && !element_ref) {
      context.addIssue({
        code: 'custom',
        path: ['element_ref'],
        message: `${action} requires an exact element reference`,
      });
    }
  });
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
const docsCreate = z
  .object({
    account_id: z.literal('docs'),
    title: z.string().trim().min(1).max(512),
    markdown: z.string().max(500_000).optional(),
  })
  .strict();
const docsRead = z.object({ account_id: z.literal('docs'), document_id: id }).strict();
const docsAppend = z
  .object({
    account_id: z.literal('docs'),
    document_id: id,
    text: z.string().min(1).max(500_000),
  })
  .strict();
const sheetCell = z.union([z.string().max(50_000), z.number().finite(), z.boolean()]);
const sheetValues = (append: boolean) =>
  z
    .array(
      z
        .array(append ? z.union([sheetCell, z.null()]) : sheetCell)
        .min(1)
        .max(100),
    )
    .min(1)
    .max(500)
    .superRefine((rows, context) => {
      if (rows.reduce((total, row) => total + row.length, 0) > 5_000) {
        context.addIssue({
          code: 'custom',
          message: 'Sheet writes are limited to 5,000 cells',
        });
      }
    });
const sheetsCreate = z
  .object({
    account_id: z.literal('sheets'),
    title: z.string().trim().min(1).max(512),
    folder_id: optionalId,
  })
  .strict();
const sheetsRead = z
  .object({
    account_id: z.literal('sheets'),
    spreadsheet_id: id,
    range: z.string().trim().min(1).max(512),
    start_row: z.number().int().min(1).max(10_000_000).default(1),
    end_row: z.number().int().min(1).max(10_000_000).default(500),
  })
  .strict()
  .superRefine(({ start_row, end_row }, context) => {
    if (end_row < start_row || end_row - start_row > 499) {
      context.addIssue({
        code: 'custom',
        path: ['end_row'],
        message: 'Sheet reads must cover 1-500 ascending rows',
      });
    }
  });
const sheetWriteBase = {
  account_id: z.literal('sheets'),
  spreadsheet_id: id,
  range: z.string().trim().min(1).max(512),
  value_input_option: z.enum(['RAW', 'USER_ENTERED']).default('USER_ENTERED'),
};
const sheetsUpdate = z.object({ ...sheetWriteBase, values: sheetValues(false) }).strict();
const sheetsAppend = z
  .object({ ...sheetWriteBase, values: sheetValues(true) })
  .strict()
  .refine(({ range }) => range.includes('!'), {
    path: ['range'],
    message: 'Append range must include the exact sheet name',
  });
const slidesCreate = z
  .object({
    account_id: z.literal('slides'),
    title: z.string().trim().min(1).max(512),
    markdown: z.string().min(1).max(500_000),
  })
  .strict();
const slidesRead = z.object({ account_id: z.literal('slides'), presentation_id: id }).strict();
const slidesAppend = z
  .object({
    account_id: z.literal('slides'),
    presentation_id: id,
    markdown: z.string().min(1).max(500_000),
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
const slackFindUsers = z
  .object({
    account_id: z.literal('slack'),
    query: z.string().trim().min(1).max(512),
    limit: z.number().int().positive().max(100).default(20),
  })
  .strict();
const slackOpenDm = z
  .object({
    account_id: z.literal('slack'),
    user_id: z
      .string()
      .trim()
      .regex(/^[UW][A-Z0-9]+$/),
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
const scheduleCadence = z.enum(['once', 'hourly', 'daily', 'weekly']);
const scheduleCreate = z
  .object({
    task: z.string().trim().min(1).max(20_000),
    cadence: scheduleCadence,
    first_run_at: z.string().trim().min(1).max(64).optional(),
    max_runs: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();
const scheduleList = z.object({}).strict();
const scheduleUpdate = z
  .object({
    schedule_id: id,
    task: z.string().trim().min(1).max(20_000).optional(),
    cadence: scheduleCadence.optional(),
    next_run_at: z.string().trim().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    max_runs: z.number().int().min(1).max(10_000).optional(),
  })
  .strict()
  .refine(
    ({ task, cadence, next_run_at, enabled, max_runs }) =>
      task !== undefined ||
      cadence !== undefined ||
      next_run_at !== undefined ||
      enabled !== undefined ||
      max_runs !== undefined,
    { message: 'Provide at least one schedule change' },
  );
const scheduleDelete = z.object({ schedule_id: id }).strict();

export const actionInputSchemas = {
  computer_list: computerList,
  computer_open_app: computerOpenApp,
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
  docs_create: docsCreate,
  docs_read: docsRead,
  docs_append: docsAppend,
  sheets_create: sheetsCreate,
  sheets_read: sheetsRead,
  sheets_update: sheetsUpdate,
  sheets_append: sheetsAppend,
  slides_create: slidesCreate,
  slides_read: slidesRead,
  slides_append: slidesAppend,
  slack_search: accountQuery('slack'),
  slack_find_users: slackFindUsers,
  slack_open_dm: slackOpenDm,
  slack_read_thread: accountResource('slack'),
  slack_post: slackPost,
  messages_search: messagesSearch,
  messages_read_thread: messagesReadThread,
  messages_send: messagesSend,
  schedule_create: scheduleCreate,
  schedule_list: scheduleList,
  schedule_update: scheduleUpdate,
  schedule_delete: scheduleDelete,
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
  computer_open_app: {
    name: 'computer_open_app',
    description:
      'Open a supported non-sensitive macOS app that is not currently running. Currently supports Apple Notes. After it opens, call computer_list to obtain fresh app and window ids before inspecting or acting.',
    inputSchema: object(
      {
        application: string('Supported application', { enum: ['notes'] }),
      },
      ['application'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: true },
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
      'Perform one action against the exact freshly captured application window. Prefer an element_ref. If an Electron or canvas app exposes no usable element, type, key, and scroll may omit element_ref to use the focused control in that exact window; click and set still require a ref. "type" inserts only new text at the current caret. "set" replaces the entire editable value. For shortcuts, put one non-modifier key in value and list modifiers separately.',
    inputSchema: object(
      {
        app_id: string('Exact application id'),
        window_id: string('Exact window id'),
        snapshot_id: string('Fresh snapshot id'),
        action: string('Action', { enum: ['click', 'type', 'set', 'scroll', 'key'] }),
        element_ref: string(
          'Element reference from the snapshot. Required for click and set; optional for type, key, and scroll when the exact window already has the intended focused control.',
        ),
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
      ['app_id', 'window_id', 'snapshot_id', 'action'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: true },
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
  docs_create: {
    name: 'docs_create',
    description:
      'Create a Google Doc from Markdown in the connected Docs account. Use headings, lists, tables, links, blockquotes, and code blocks naturally.',
    inputSchema: object(
      {
        account_id: accountSelector('docs'),
        title: string('Document title'),
        markdown: string('Optional initial Markdown content'),
      },
      ['account_id', 'title'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  docs_read: {
    name: 'docs_read',
    description:
      'Read the plain-text content of a Google Doc, including document tabs and tables. Formatting details are not returned.',
    inputSchema: object(
      {
        account_id: accountSelector('docs'),
        document_id: string('Google Doc id or full Docs URL'),
      },
      ['account_id', 'document_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  docs_append: {
    name: 'docs_append',
    description:
      'Append plain text to the end of an existing Google Doc. Read the document first when context matters.',
    inputSchema: object(
      {
        account_id: accountSelector('docs'),
        document_id: string('Google Doc id'),
        text: string('Exact text to append'),
      },
      ['account_id', 'document_id', 'text'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  sheets_create: {
    name: 'sheets_create',
    description: 'Create a Google Sheets spreadsheet, optionally in an exact Drive folder.',
    inputSchema: object(
      {
        account_id: accountSelector('sheets'),
        title: string('Spreadsheet title'),
        folder_id: string('Optional exact Google Drive folder id'),
      },
      ['account_id', 'title'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  sheets_read: {
    name: 'sheets_read',
    description:
      'Read up to 500 rows from an exact A1 range in Google Sheets. Responses use formatted cell values organized by rows.',
    inputSchema: object(
      {
        account_id: accountSelector('sheets'),
        spreadsheet_id: string('Spreadsheet id or full Google Sheets URL'),
        range: string('A1 range, for example Sheet1!A1:D100'),
        start_row: { type: 'integer', minimum: 1, maximum: 10_000_000, default: 1 },
        end_row: { type: 'integer', minimum: 1, maximum: 10_000_000, default: 500 },
      },
      ['account_id', 'spreadsheet_id', 'range'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  sheets_update: {
    name: 'sheets_update',
    description:
      'Replace a rectangular Google Sheets range with up to 5,000 cells. USER_ENTERED supports formulas and normal Sheets parsing; RAW preserves exact values.',
    inputSchema: sheetWriteInputSchema(false),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  sheets_append: {
    name: 'sheets_append',
    description:
      'Append up to 5,000 cells as new rows in an existing Google Sheets table. The range must name the exact sheet, for example Sheet1!A:D.',
    inputSchema: sheetWriteInputSchema(true),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  slides_create: {
    name: 'slides_create',
    description:
      'Create a Google Slides presentation from Markdown. Separate slides with a line containing ---. Supports bullets, tables, quotes, images, and two-column ||| layouts.',
    inputSchema: object(
      {
        account_id: accountSelector('slides'),
        title: string('Presentation title'),
        markdown: string('Complete Markdown slide deck'),
      },
      ['account_id', 'title', 'markdown'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  slides_read: {
    name: 'slides_read',
    description:
      'Read the title, ordered slide ids, element labels, and text from an existing Google Slides presentation.',
    inputSchema: object(
      {
        account_id: accountSelector('slides'),
        presentation_id: string('Presentation id from its URL'),
      },
      ['account_id', 'presentation_id'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  slides_append: {
    name: 'slides_append',
    description:
      'Append one or more Markdown-authored slides to an existing Google Slides presentation. Separate multiple new slides with ---.',
    inputSchema: object(
      {
        account_id: accountSelector('slides'),
        presentation_id: string('Presentation id'),
        markdown: string('Markdown for the new slide or slides'),
      },
      ['account_id', 'presentation_id', 'markdown'],
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
  slack_find_users: {
    name: 'slack_find_users',
    description:
      'Find Slack people by name, display name, or exact user ID. Select one exact returned user ID before opening a DM.',
    inputSchema: object(
      {
        account_id: accountSelector('slack'),
        query: string('Person name, display name, or Slack user ID'),
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      ['account_id', 'query'],
    ),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  slack_open_dm: {
    name: 'slack_open_dm',
    description:
      'Open or reuse a one-to-one Slack DM using an exact user ID returned by slack_find_users. Use the returned D-prefixed channel ID with slack_post.',
    inputSchema: object(
      {
        account_id: accountSelector('slack'),
        user_id: string('Exact Slack user ID, beginning with U or W'),
      },
      ['account_id', 'user_id'],
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
      'Send an iMessage through the signed-in Messages app. The exact recipient and text pass the host authorization boundary and are logged; confirmation mode shows a preview first.',
    inputSchema: object(
      {
        recipient: string('Phone number, email, or exact contact handle'),
        text: string('Message text'),
      },
      ['recipient', 'text'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  schedule_create: {
    name: 'schedule_create',
    description:
      'Create persisted future or recurring work in the current Sia thread. Use this when the person asks to do, check, monitor, search, or report something later or on a cadence. The task is sent back to the agent verbatim at each run. first_run_at must be an RFC 3339 timestamp with a UTC offset when supplied; recurring schedules otherwise begin one cadence interval from now, while a one-time schedule runs as soon as the current turn is idle.',
    inputSchema: object(
      {
        task: string('Exact self-contained task to run each time'),
        cadence: string('Run frequency', { enum: ['once', 'hourly', 'daily', 'weekly'] }),
        first_run_at: string('Optional RFC 3339 first-run timestamp with a UTC offset', {
          format: 'date-time',
        }),
        max_runs: {
          type: 'integer',
          minimum: 1,
          maximum: 10_000,
          description: 'Optional safety limit; the schedule pauses after this many runs',
        },
      },
      ['task', 'cadence'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  schedule_list: {
    name: 'schedule_list',
    description: 'List persisted scheduled work owned by the current Sia thread.',
    inputSchema: object({}),
    annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
  },
  schedule_update: {
    name: 'schedule_update',
    description:
      'Change, pause, or resume scheduled work owned by the current Sia thread. next_run_at must be an RFC 3339 timestamp with a UTC offset.',
    inputSchema: object(
      {
        schedule_id: string('Schedule id returned by schedule_list or schedule_create'),
        task: string('Replacement self-contained task'),
        cadence: string('Replacement run frequency', {
          enum: ['once', 'hourly', 'daily', 'weekly'],
        }),
        next_run_at: string('Replacement RFC 3339 next-run timestamp with a UTC offset', {
          format: 'date-time',
        }),
        enabled: { type: 'boolean', description: 'False pauses; true resumes' },
        max_runs: {
          type: 'integer',
          minimum: 1,
          maximum: 10_000,
          description: 'Replacement total run limit',
        },
      },
      ['schedule_id'],
    ),
    annotations: { readOnly: false, requiresApproval: true, takesForeground: false },
  },
  schedule_delete: {
    name: 'schedule_delete',
    description: 'Permanently remove scheduled work owned by the current Sia thread.',
    inputSchema: object(
      { schedule_id: string('Schedule id returned by schedule_list or schedule_create') },
      ['schedule_id'],
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
