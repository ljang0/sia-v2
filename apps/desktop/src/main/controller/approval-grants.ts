import { stringArray } from '../actions/records.js';

/**
 * What "Allow for this task" covers for a Sia-hosted action: the same kind of action on the same
 * app, site, account, recipients or item. Saved skills and uploads always ask, because each run or
 * file is different content. Hard safety denials run before this and are never granted.
 */
export function gatewayTaskGrant(
  toolName: string,
  argumentsValue: Readonly<Record<string, unknown>>,
): string | undefined {
  if (toolName.startsWith('skill_') || toolName.includes('upload')) return undefined;
  const parts = [toolName];
  for (const key of [
    'operation',
    'calendar',
    'list',
    'application',
    'app_id',
    'origin',
    'account_id',
    'channel_id',
    'recipient',
    'resource_id',
    'document_id',
    'spreadsheet_id',
    'presentation_id',
    'schedule_id',
    'name',
  ]) {
    const value = argumentsValue[key];
    if (typeof value === 'string') parts.push(`${key}=${value}`);
  }
  if (typeof argumentsValue.url === 'string') {
    try {
      parts.push(`url=${new URL(argumentsValue.url).origin}`);
    } catch {
      return undefined;
    }
  }
  const recipients = [...stringArray(argumentsValue.to), ...stringArray(argumentsValue.cc)];
  if (recipients.length)
    parts.push(
      `to=${recipients
        .map((value) => value.trim().toLowerCase())
        .sort()
        .join(',')}`,
    );
  return parts.join('\u0000');
}
