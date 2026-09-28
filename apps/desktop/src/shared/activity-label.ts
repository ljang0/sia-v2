/** UI labels describe the operation, never infer intent from tool arguments. */
export function activityLabel(tool: string | undefined, kind?: string): string {
  const labels: Record<string, string> = {
    assistant_library: 'Checking saved preferences',
    memory_learn: 'Saving a lesson',
    memory_suggest: 'Preparing a suggestion',
    skill_save: 'Saving a reusable skill',
    skill_run: 'Running your saved skill',
    mac_automation: 'Working with an app',
    computer_list: 'Finding available apps',
    computer_open_app: 'Opening an app',
    computer_open_url: 'Opening a website',
    computer_snapshot: 'Checking the app window',
    computer_action: 'Working in the app',
    browser_tabs: 'Finding browser tabs',
    browser_snapshot: 'Reading the page',
    browser_navigate: 'Opening a page',
    browser_action: 'Working in the browser',
    browser_upload: 'Uploading a file',
    mail_search: 'Searching your mail',
    mail_read_thread: 'Reading a mail conversation',
    mail_create_draft: 'Preparing a draft',
    mail_send: 'Sending your mail',
    drive_search: 'Finding files',
    drive_read: 'Reading a file',
    drive_upload: 'Uploading a file',
    drive_share: 'Sharing a file',
    docs_create: 'Creating a document',
    docs_read: 'Reading a document',
    docs_append: 'Updating a document',
    sheets_create: 'Creating a spreadsheet',
    sheets_read: 'Reading a spreadsheet',
    sheets_update: 'Updating a spreadsheet',
    sheets_append: 'Adding spreadsheet rows',
    slides_create: 'Creating a presentation',
    slides_read: 'Reading a presentation',
    slides_append: 'Adding slides',
    slack_search: 'Searching Slack',
    slack_find_users: 'Finding people in Slack',
    slack_open_dm: 'Opening a Slack conversation',
    slack_read_thread: 'Reading a Slack conversation',
    slack_post: 'Posting to Slack',
    messages_search: 'Searching Messages',
    messages_read_thread: 'Reading a conversation',
    messages_send: 'Sending a message',
    schedule_create: 'Creating a schedule',
    schedule_list: 'Checking your schedules',
    schedule_update: 'Updating a schedule',
    schedule_delete: 'Removing a schedule',
    'runtime.start': 'Getting ready',
  };
  if (tool && labels[tool]) return labels[tool];
  const kinds: Record<string, string> = {
    command: 'Running a command',
    file_change: 'Updating files',
    web_search: 'Searching the web',
    plan: 'Planning the next steps',
    subagent: 'Working with another agent',
    compaction: 'Organizing conversation context',
    image: 'Viewing an image',
    review: 'Reviewing the work',
    browser: 'Working in the browser',
    computer: 'Working in an app',
    connector: 'Working with a connected app',
  };
  return kinds[kind ?? ''] ?? 'Working on your request';
}

const PAST_TENSE: Record<string, string> = {
  Acting: 'Acted',
  Adding: 'Added',
  Checking: 'Checked',
  Creating: 'Created',
  Finding: 'Found',
  Getting: 'Got',
  Listing: 'Listed',
  Looking: 'Looked',
  Opening: 'Opened',
  Organizing: 'Organized',
  Planning: 'Planned',
  Posting: 'Posted',
  Preparing: 'Prepared',
  Reading: 'Read',
  Removing: 'Removed',
  Reviewing: 'Reviewed',
  Running: 'Ran',
  Saving: 'Saved',
  Searching: 'Searched',
  Sending: 'Sent',
  Sharing: 'Shared',
  Updating: 'Updated',
  Uploading: 'Uploaded',
  Viewing: 'Viewed',
  Working: 'Worked',
};

/** The same label once the step is done: "Running a command" becomes "Ran a command". */
export function completedActivityLabel(label: string): string {
  if (label === 'Getting ready') return 'Got ready';
  const [first, ...rest] = label.split(' ');
  const past = first ? PAST_TENSE[first] : undefined;
  return past ? [past, ...rest].join(' ') : label;
}
