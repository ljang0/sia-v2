import { z } from 'zod';

const id = z.string().trim().min(1).max(512);

const optionalId = id.optional();

export const computerList = z.object({}).strict();

export const memoryVault = z
  .object({
    operation: z.enum(['list', 'read', 'write', 'append']),
    offset: z.number().int().min(0).max(8000000).optional(),
    name: z.string().max(160),
    text: z.string().max(256000),
    revision: z.string().regex(/^(?:[a-f0-9]{64})?$/),
  })
  .strict();

const computerOpenApp = z
  .object({
    delivery: z.enum(['background', 'foreground']).optional(),
    application: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  })
  .strict();

const computerOpenUrl = z
  .object({
    delivery: z.enum(['background', 'foreground']).optional(),
    url: z
      .url()
      .max(2048)
      .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), {
        message: 'Only HTTP and HTTPS URLs are allowed',
      })
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password;
      }, 'Credentials are not allowed in URLs'),
  })
  .strict();

const computerSnapshot = z
  .object({
    app_id: id,
    window_id: id,
    wait_ms: z.number().int().min(0).max(3000).optional(),
    read_text: z.boolean().optional(),
    include_image: z.boolean().optional(),
    expected_url: computerOpenUrl.shape.url.optional(),
  })
  .strict();

const computerAction = z
  .object({
    app_id: id,
    window_id: id,
    snapshot_id: id,
    action: z.enum(['click', 'type', 'set', 'scroll', 'key', 'drag']),
    button: z.enum(['left', 'right']).optional(),
    count: z.number().int().min(1).max(2).optional(),
    include_image: z.boolean().optional(),
    delivery: z.enum(['background', 'foreground']).optional(),
    x: z.number().finite().min(0).max(32768).optional(),
    y: z.number().finite().min(0).max(32768).optional(),
    to_x: z.number().finite().min(0).max(32768).optional(),
    to_y: z.number().finite().min(0).max(32768).optional(),
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
  .superRefine(({ action, element_ref, x, y, to_x, to_y, button, count }, context) => {
    const coordinates = x !== undefined && y !== undefined;
    if ((button !== undefined || count !== undefined) && action !== 'click')
      context.addIssue({ code: 'custom', message: 'button/count only apply to click.' });
    if (count === 2 && (!coordinates || element_ref))
      context.addIssue({
        code: 'custom',
        message: 'Double-click requires fresh screenshot coordinates.',
      });
    if (
      (x !== undefined || y !== undefined || to_x !== undefined || to_y !== undefined) &&
      (!coordinates || element_ref || !['click', 'drag'].includes(action))
    )
      context.addIssue({
        code: 'custom',
        message:
          'Use either an element reference or complete screenshot coordinates for click/drag.',
      });
    if (action === 'drag' && (!coordinates || to_x === undefined || to_y === undefined))
      context.addIssue({
        code: 'custom',
        message: 'Drag requires start and end screenshot coordinates.',
      });
    if ((action === 'set' || (action === 'click' && !coordinates)) && !element_ref) {
      context.addIssue({
        code: 'custom',
        path: ['element_ref'],
        message: `${action} requires an exact element reference`,
      });
    }
  });

const browserTabs = z.object({}).strict();

const workspaceFileName = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[^./\\\x00-\x1f][^/\\\x00-\x1f]*\.(?:txt|md|csv|tsv|json)$/i);

export const computerReadFile = z.object({ name: workspaceFileName }).strict();

export const computerWriteFile = z
  .object({
    name: workspaceFileName,
    text: z.string().max(262_144),
    expected_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

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

export const SCHEDULE_CADENCES = [
  'once',
  'hourly',
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'yearly',
] as const;

export const SCHEDULE_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const scheduleCadence = z.enum(SCHEDULE_CADENCES);

const scheduleDays = z.array(z.enum(SCHEDULE_DAYS)).min(1).max(7);

const scheduleEveryHours = z.number().int().min(1).max(24);

const scheduleCreate = z
  .object({
    task: z.string().trim().min(1).max(20_000),
    cadence: scheduleCadence,
    days: scheduleDays.optional(),
    every_hours: scheduleEveryHours.optional(),
    first_run_at: z.string().trim().min(1).max(64).optional(),
    max_runs: z.number().int().min(1).max(10_000).optional(),
  })
  .strict()
  .refine(({ cadence, days }) => days === undefined || cadence === 'weekly', {
    message: 'days only applies to a weekly schedule',
  })
  .refine(({ cadence, every_hours }) => every_hours === undefined || cadence === 'hourly', {
    message: 'every_hours only applies to an hourly schedule',
  });

const scheduleList = z.object({}).strict();

const scheduleUpdate = z
  .object({
    schedule_id: id,
    task: z.string().trim().min(1).max(20_000).optional(),
    cadence: scheduleCadence.optional(),
    days: scheduleDays.optional(),
    every_hours: scheduleEveryHours.optional(),
    next_run_at: z.string().trim().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    max_runs: z.number().int().min(1).max(10_000).optional(),
  })
  .strict()
  .refine(
    ({ task, cadence, days, every_hours, next_run_at, enabled, max_runs }) =>
      task !== undefined ||
      cadence !== undefined ||
      days !== undefined ||
      every_hours !== undefined ||
      next_run_at !== undefined ||
      enabled !== undefined ||
      max_runs !== undefined,
    { message: 'Provide at least one schedule change' },
  );

const scheduleDelete = z.object({ schedule_id: id }).strict();

export const libraryList = z.object({}).strict();

export const memoryLearn = z
  .object({
    title: z.string().trim().min(1).max(100),
    lesson: z.string().trim().min(1).max(2000),
  })
  .strict();

export const memorySuggestion = z
  .object({
    kind: z.enum(['merge', 'retire', 'skill', 'lesson']),
    title: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(1000),
    memory_ids: z.array(z.string().uuid()).max(8),
    evidence_ids: z.array(z.string().uuid()).min(1).max(12),
    text: z.string().trim().max(4000),
    description: z.string().trim().max(500),
    source: z.string().max(16000),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.memory_ids).size === v.memory_ids.length &&
      new Set(v.evidence_ids).size === v.evidence_ids.length &&
      (v.kind === 'merge'
        ? v.memory_ids.length >= 2 && !!v.text && !v.source && !v.description
        : v.kind === 'retire'
          ? v.memory_ids.length === 1 && !v.text && !v.source && !v.description
          : v.kind === 'lesson'
            ? v.memory_ids.length === 0 && !!v.text && !v.source && !v.description
            : v.memory_ids.length === 0 && !!v.source.trim() && !!v.description && !v.text),
    'Supply only the fields for the chosen kind: merge needs two memories and text; retire one memory; lesson text and no memories; skill source and description.',
  );

export const skillSave = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    source: z.string().min(1).max(16000),
  })
  .strict();

export const skillRun = z
  .object({
    id: z.string().uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    input: z
      .record(z.string().max(100), z.string().max(2000))
      .refine((v) => Object.keys(v).length <= 12),
  })
  .strict();

export const macAutomation = z
  .discriminatedUnion('operation', [
    z.object({ operation: z.literal('calendar_list') }).strict(),
    z
      .object({
        operation: z.literal('calendar_events'),
        calendar: z.string().min(1).max(512),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
      })
      .strict(),
    z
      .object({
        operation: z.literal('calendar_create'),
        calendar: z.string().min(1).max(512),
        title: z.string().min(1).max(500),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
      })
      .strict(),
    z.object({ operation: z.literal('reminders_lists') }).strict(),
    z
      .object({ operation: z.literal('reminders_list'), list: z.string().min(1).max(512) })
      .strict(),
    z
      .object({
        operation: z.literal('reminders_create'),
        list: z.string().min(1).max(512),
        title: z.string().min(1).max(500),
      })
      .strict(),
    z.object({ operation: z.literal('finder_selection') }).strict(),
  ])
  .refine(
    (v) =>
      !('start' in v) ||
      (Date.parse(v.end) > Date.parse(v.start) &&
        Date.parse(v.end) - Date.parse(v.start) <= 31 * 86400000),
    'Choose an ascending date range of at most 31 days.',
  );

export const actionInputSchemas = {
  assistant_library: libraryList,
  memory_learn: memoryLearn,
  memory_suggest: memorySuggestion,
  memory_vault: memoryVault,
  skill_save: skillSave,
  skill_run: skillRun,
  mac_automation: macAutomation,
  computer_list: computerList,
  computer_open_app: computerOpenApp,
  computer_open_url: computerOpenUrl,
  computer_snapshot: computerSnapshot,
  computer_action: computerAction,
  computer_list_files: computerList,
  computer_read_file: computerReadFile,
  computer_write_file: computerWriteFile,
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

export function isActionToolName(name: string): name is ActionToolName {
  return Object.hasOwn(actionInputSchemas, name);
}

export function parseActionArguments<N extends ActionToolName>(
  name: N,
  value: unknown,
): ActionArguments<N> {
  return actionInputSchemas[name].parse(value) as ActionArguments<N>;
}
