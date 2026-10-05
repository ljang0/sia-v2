import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rendererRoot = join(root, 'apps/desktop/src/renderer');
const toolSourcePath = join(root, 'packages/action-gateway/src/tools.ts');
const appControllerPath = join(rendererRoot, 'useAppController.ts');
const infraTemplatePath = join(root, 'infra/template.yaml');

const expectedActionTools = [
  'assistant_library',
  'memory_learn',
  'memory_vault',
  'memory_suggest',
  'skill_save',
  'skill_run',
  'mac_automation',
  'computer_list',
  'computer_snapshot',
  'computer_action',
  'computer_open_app',
  'computer_open_url',
  'computer_list_files',
  'computer_read_file',
  'computer_write_file',
  'browser_tabs',
  'browser_snapshot',
  'browser_navigate',
  'browser_action',
  'browser_upload',
  'mail_search',
  'mail_read_thread',
  'mail_create_draft',
  'mail_send',
  'drive_search',
  'drive_read',
  'drive_upload',
  'drive_share',
  'docs_create',
  'docs_read',
  'docs_append',
  'sheets_create',
  'sheets_read',
  'sheets_update',
  'sheets_append',
  'slides_create',
  'slides_read',
  'slides_append',
  'slack_search',
  'slack_find_users',
  'slack_open_dm',
  'slack_read_thread',
  'slack_post',
  'calendar_list_events',
  'calendar_read_event',
  'calendar_create_event',
  'calendar_update_event',
  'calendar_delete_event',
  'tasks_list',
  'tasks_create',
  'tasks_update',
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
  'messages_search',
  'messages_read_thread',
  'messages_send',
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_delete',
].sort();

const failures = [];
const renderedTag = new RegExp('<' + 'canvas(?:\\s|>)', 'i');
// The shared aurora is decoration only. Every control remains accessible native DOM.
const decorativeCanvasPath = join(rendererRoot, 'components/effects/dither-preview/Dither.jsx');

for (const path of await walk(rendererRoot)) {
  const extension = extname(path);
  if (!['.css', '.ts', '.tsx', '.js', '.jsx'].includes(extension)) continue;
  const source = await readFile(path, 'utf8');
  if (extension === '.css' && source.includes('!important')) {
    failures.push(`${relative(root, path)} contains !important`);
  }
  if (renderedTag.test(source) && path !== decorativeCanvasPath) {
    failures.push(`${relative(root, path)} renders a canvas element`);
  }
}

const toolSource = await readFile(toolSourcePath, 'utf8');
const appControllerSource = await readFile(appControllerPath, 'utf8');
const infraTemplateSource = await readFile(infraTemplatePath, 'utf8');
if (/from ['"]\.\/demo['"]/.test(appControllerSource)) {
  failures.push('The production renderer silently falls back to demo state');
}
if (
  !infraTemplateSource.includes("MfaConfiguration: 'OPTIONAL'") ||
  !infraTemplateSource.includes('- SOFTWARE_TOKEN_MFA')
) {
  failures.push('The Cognito software-token MFA policy must stay explicit and YAML-safe');
}
if (!infraTemplateSource.includes('AllowedFirstAuthFactors: [PASSWORD, EMAIL_OTP]')) {
  failures.push(
    'The Cognito sign-in policy must support the required PASSWORD and email OTP factors',
  );
}
const descriptorStart = toolSource.indexOf(
  'const descriptors: Record<ActionToolName, ToolDescriptor>',
);
const descriptorEnd = toolSource.indexOf('export const ACTION_TOOL_DESCRIPTORS');
if (descriptorStart < 0 || descriptorEnd <= descriptorStart) {
  failures.push('Could not locate the canonical action-tool descriptor table');
} else {
  const descriptorSource = toolSource.slice(descriptorStart, descriptorEnd);
  const toolNames = [...descriptorSource.matchAll(/\bname:\s*['"]([a-z][a-z0-9_]*)['"]/g)].map(
    (match) => match[1],
  );
  const uniqueToolNames = [...new Set(toolNames)];
  if (uniqueToolNames.length === 0) {
    failures.push('The canonical action-tool descriptor table is empty');
  }
  if (uniqueToolNames.sort().join('\n') !== expectedActionTools.join('\n')) {
    failures.push(
      `The canonical action-tool surface changed. Expected exactly ${expectedActionTools.join(', ')}`,
    );
  }
  const forbiddenToolName =
    /(?:visuali[sz]|canvas|raw_?cdp|cookie|execute_?javascript|browser_?profile|shell|terminal)/i;
  for (const name of uniqueToolNames) {
    if (forbiddenToolName.test(name)) {
      failures.push(`Canonical tool surface exposes forbidden tool: ${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Quality guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Quality guard passed: curated tool surface and renderer policy are intact.');
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
