/** Connected-app identifiers and the action names that belong to them. */

import type { ConnectionView } from '../../shared/bridge.js';

export const EMPTY_CONNECTIONS: ConnectionView[] = [
  { id: 'gmail', label: 'Gmail', status: 'disconnected' },
  { id: 'calendar', label: 'Google Calendar', status: 'disconnected' },
  { id: 'drive', label: 'Google Drive', status: 'disconnected' },
  { id: 'docs', label: 'Google Docs', status: 'disconnected' },
  { id: 'sheets', label: 'Google Sheets', status: 'disconnected' },
  { id: 'slides', label: 'Google Slides', status: 'disconnected' },
  { id: 'tasks', label: 'Google Tasks', status: 'disconnected' },
  { id: 'slack', label: 'Slack', status: 'disconnected' },
  { id: 'outlook', label: 'Outlook', status: 'disconnected' },
  { id: 'notion', label: 'Notion', status: 'disconnected' },
  { id: 'github', label: 'GitHub', status: 'disconnected' },
];

export {
  GOOGLE_CONNECTION_IDS,
  isGoogleConnection,
  isLocalConnection,
  LOCAL_CONNECTION_IDS,
  type LocalConnectionId,
} from '../../shared/bridge.js';

const TOOL_PREFIXES: Readonly<Record<string, ConnectionView['id']>> = {
  mail: 'gmail',
  calendar: 'calendar',
  drive: 'drive',
  docs: 'docs',
  sheets: 'sheets',
  slides: 'slides',
  tasks: 'tasks',
  slack: 'slack',
  outlook: 'outlook',
  notion: 'notion',
  github: 'github',
};

export function connectorAppForTool(value: string): ConnectionView['id'] | undefined {
  const prefix = /^([a-z]+)_/.exec(value)?.[1];
  return prefix ? TOOL_PREFIXES[prefix] : undefined;
}

export function isConnectorActionTool(name: string): boolean {
  return connectorAppForTool(name) !== undefined;
}

export const GOOGLE_WORKSPACE_ACTION = /^(?:mail|calendar|drive|docs|sheets|slides|tasks)_/;
