/** Connected-app identifiers and the action names that belong to them. */

import type { ConnectionView } from '../../shared/bridge.js';

export const EMPTY_CONNECTIONS: ConnectionView[] = [
  { id: 'gmail', label: 'Gmail', status: 'disconnected' },
  { id: 'drive', label: 'Google Drive', status: 'disconnected' },
  { id: 'docs', label: 'Google Docs', status: 'disconnected' },
  { id: 'sheets', label: 'Google Sheets', status: 'disconnected' },
  { id: 'slides', label: 'Google Slides', status: 'disconnected' },
  { id: 'slack', label: 'Slack', status: 'disconnected' },
];

export const GOOGLE_CONNECTION_IDS: readonly ConnectionView['id'][] = [
  'gmail',
  'drive',
  'docs',
  'sheets',
  'slides',
];

export function isGoogleConnection(id: ConnectionView['id']): boolean {
  return id !== 'slack';
}

export function isConnectorActionTool(name: string): boolean {
  return /^(?:mail|drive|docs|sheets|slides|slack)_/.test(name);
}

export const GOOGLE_WORKSPACE_ACTION = /^(?:mail|drive|docs|sheets|slides)_/;

export function connectorAppForTool(value: string): ConnectionView['id'] | undefined {
  if (value.startsWith('mail_')) return 'gmail';
  if (value.startsWith('drive_')) return 'drive';
  if (value.startsWith('docs_')) return 'docs';
  if (value.startsWith('sheets_')) return 'sheets';
  if (value.startsWith('slides_')) return 'slides';
  if (value.startsWith('slack_')) return 'slack';
  return undefined;
}
