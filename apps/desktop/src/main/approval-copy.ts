import type { ApprovalView } from '../shared/bridge.js';
import { stringArray } from './records.js';

// Plain-language approval card copy for Sia-hosted actions: what the action touches and the
// exact data that would leave the Mac.

export function safeResourceLabel(resourceJson: string, kind: ApprovalView['kind']): string {
  try {
    const value = JSON.parse(resourceJson) as Record<string, unknown>;
    const window = typeof value.window_title === 'string' ? value.window_title : undefined;
    if (kind === 'browser_attach') {
      const browser = typeof value.browser === 'string' ? value.browser : 'selected browser';
      return window ? `${browser}, ${window}` : `${browser} profile`;
    }
    const app =
      typeof value.app_name === 'string'
        ? value.app_name
        : typeof value.application === 'string'
          ? value.application
          : undefined;
    if (app && window) return `${app}, ${window}`;
    if (app) return app;
    if (window) return window;
    return kind === 'foreground_takeover'
      ? 'Selected application window'
      : 'Protected computer resource';
  } catch {
    return kind === 'browser_attach'
      ? 'Selected browser profile'
      : 'Protected computer resource';
  }
}

export function computerApprovalPresentation(
  adapterId: string,
  summary: string,
): { kind: ApprovalView['kind']; title: string } {
  const identity = `${adapterId} ${summary}`.toLowerCase();
  if (identity.includes('existing_profile') || identity.includes('browser_prepare')) {
    return { kind: 'browser_attach', title: 'Attach to signed-in browser' };
  }
  if (identity.includes('foreground') || identity.includes('bring_to_front')) {
    return { kind: 'foreground_takeover', title: 'Allow foreground control' };
  }
  if (
    identity.includes('upload') ||
    identity.includes('download') ||
    identity.includes('file')
  ) {
    return { kind: 'file_upload', title: 'Allow local file access' };
  }
  return { kind: 'native_tool', title: 'Allow computer access' };
}

export function summarizeActionTarget(
  argumentsValue: Readonly<Record<string, unknown>>,
  toolName?: string,
): string {
  if (toolName === 'schedule_create') {
    const firstRun =
      typeof argumentsValue.first_run_at === 'string'
        ? ` starting ${argumentsValue.first_run_at}`
        : '';
    const days = Array.isArray(argumentsValue.days)
      ? ` on ${argumentsValue.days.map(String).join(', ')}`
      : '';
    const everyHours =
      typeof argumentsValue.every_hours === 'number'
        ? ` every ${argumentsValue.every_hours} hours`
        : '';
    return `${String(argumentsValue.cadence)}${days}${everyHours}: ${String(argumentsValue.task)}${firstRun}`;
  }
  if (toolName === 'schedule_update' || toolName === 'schedule_delete') {
    return `schedule ${String(argumentsValue.schedule_id)}`;
  }
  if (toolName === 'browser_upload') {
    return `${String(argumentsValue.origin)}, file input ${String(argumentsValue.element_ref)}`;
  }
  if (toolName === 'browser_action') {
    return `${String(argumentsValue.origin)}, ${String(argumentsValue.action)}${argumentsValue.element_ref ? ` element ${String(argumentsValue.element_ref)}` : ''}`;
  }
  if (toolName === 'browser_navigate') return `navigate to ${String(argumentsValue.url)}`;
  if (toolName === 'drive_share') {
    return `Drive resource ${String(argumentsValue.resource_id)} with ${String(argumentsValue.recipient)} as ${String(argumentsValue.role)}`;
  }
  if (toolName === 'computer_action') {
    return `${String(argumentsValue.app_name)}, window ${String(argumentsValue.window_id)}: ${String(argumentsValue.action)}${argumentsValue.element_ref ? ` element ${String(argumentsValue.element_ref)}` : ''}`;
  }
  const to = stringArray(argumentsValue.to);
  if (to.length > 0) return `email recipients: ${to.join(', ')}`;
  const appName = argumentsValue.app_name;
  const windowId = argumentsValue.window_id;
  if (typeof appName === 'string' && typeof windowId === 'string') {
    return `${appName}, window ${windowId}`;
  }
  for (const key of [
    'url',
    'origin',
    'recipient',
    'channel_id',
    'resource_id',
    'document_id',
    'spreadsheet_id',
    'presentation_id',
    'title',
    'parent_id',
    'tab_id',
    'window_id',
    'account_id',
  ]) {
    const value = argumentsValue[key];
    if (typeof value === 'string' && value.length > 0)
      return `${key.replaceAll('_', ' ')}: ${value}`;
  }
  return 'Exact action shown above';
}

export function summarizeDataLeaving(
  argumentsValue: Readonly<Record<string, unknown>>,
  toolName: string,
): string | undefined {
  const lines: string[] = [];
  if (toolName?.startsWith('skill_'))
    return `Exact Bash source:\n${String(argumentsValue.source)}\nInput JSON:\n${JSON.stringify(argumentsValue.input ?? {})}`;
  if (toolName === 'mac_automation') return JSON.stringify(argumentsValue, null, 2);
  const to = stringArray(argumentsValue.to);
  const cc = stringArray(argumentsValue.cc);
  if (to.length > 0) lines.push(`To: ${to.join(', ')}`);
  if (cc.length > 0) lines.push(`Cc: ${cc.join(', ')}`);
  if (typeof argumentsValue.subject === 'string') {
    lines.push(`Subject: ${argumentsValue.subject}`);
  }
  if (typeof argumentsValue.body === 'string') {
    lines.push(`Body:\n${argumentsValue.body}`);
  }
  if (typeof argumentsValue.markdown === 'string') {
    lines.push(`Markdown:\n${argumentsValue.markdown}`);
  }
  if (typeof argumentsValue.text === 'string') {
    const action = argumentsValue.action;
    const label =
      toolName === 'slack_post'
        ? 'Slack message'
        : toolName === 'computer_action' && action === 'set'
          ? 'Exact replacement text'
          : 'Text to type';
    lines.push(`${label}:\n${argumentsValue.text}`);
  }
  if (typeof argumentsValue.value === 'string') {
    lines.push(`Value to enter:\n${argumentsValue.value}`);
  }
  if (typeof argumentsValue.recipient === 'string') {
    lines.push(`Recipient: ${argumentsValue.recipient}`);
  }
  if (typeof argumentsValue.role === 'string') lines.push(`Role: ${argumentsValue.role}`);
  if (typeof argumentsValue.resource_id === 'string') {
    lines.push(`Resource: ${argumentsValue.resource_id}`);
  }
  if (typeof argumentsValue.document_id === 'string') {
    lines.push(`Document: ${argumentsValue.document_id}`);
  }
  if (typeof argumentsValue.spreadsheet_id === 'string') {
    lines.push(`Spreadsheet: ${argumentsValue.spreadsheet_id}`);
  }
  if (typeof argumentsValue.presentation_id === 'string') {
    lines.push(`Presentation: ${argumentsValue.presentation_id}`);
  }
  if (typeof argumentsValue.range === 'string') lines.push(`Range: ${argumentsValue.range}`);
  if (Array.isArray(argumentsValue.values)) {
    lines.push(`Values:\n${JSON.stringify(argumentsValue.values)}`);
  }
  if (typeof argumentsValue.thread_id === 'string') {
    lines.push(`Thread: ${argumentsValue.thread_id}`);
  }
  if (typeof argumentsValue.parent_id === 'string') {
    lines.push(`Destination folder: ${argumentsValue.parent_id}`);
  }
  if (typeof argumentsValue.name === 'string') {
    lines.push(`Remote name: ${argumentsValue.name}`);
  }
  if (typeof argumentsValue.title === 'string') {
    lines.push(`Title: ${argumentsValue.title}`);
  }
  for (const key of ['file_path', 'file_paths']) {
    const value = argumentsValue[key];
    if (typeof value === 'string' && value.length > 0) lines.push(`File: ${value}`);
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`Files:\n${value.map(String).join('\n')}`);
    }
  }
  return lines.length > 0 ? lines.join('\n\n') : undefined;
}
