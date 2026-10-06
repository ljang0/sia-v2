// Connected apps: Google Workspace and Slack through Sia cloud; Outlook, Notion, and GitHub
// signed in directly from this Mac.

export const CONNECTION_IDS = [
  'gmail',
  'calendar',
  'drive',
  'docs',
  'sheets',
  'slides',
  'tasks',
  'slack',
  'outlook',
  'notion',
  'github',
] as const;

export type ConnectionId = (typeof CONNECTION_IDS)[number];

export const GOOGLE_CONNECTION_IDS: readonly ConnectionId[] = [
  'gmail',
  'calendar',
  'drive',
  'docs',
  'sheets',
  'slides',
  'tasks',
];

/**
 * Calendar and Tasks ride the Google Workspace grant but stay hidden until their scopes are
 * enabled in Google Auth Platform and the cloud requests them (see the cloud's matching flag).
 */
export const GOOGLE_CALENDAR_AND_TASKS_ENABLED = false;

/** Google services shown in Settings and offered to agents. */
export function isOfferedGoogleConnection(id: ConnectionId): boolean {
  return (
    isGoogleConnection(id) &&
    (GOOGLE_CALENDAR_AND_TASKS_ENABLED || (id !== 'calendar' && id !== 'tasks'))
  );
}

/** Apps this Mac signs in to directly; their tokens stay in this Mac's Keychain-encrypted store. */
export const LOCAL_CONNECTION_IDS = ['outlook', 'notion', 'github'] as const;
export type LocalConnectionId = (typeof LOCAL_CONNECTION_IDS)[number];

export function isGoogleConnection(id: ConnectionId): boolean {
  return GOOGLE_CONNECTION_IDS.includes(id);
}

export function isLocalConnection(id: ConnectionId): id is LocalConnectionId {
  return (LOCAL_CONNECTION_IDS as readonly string[]).includes(id);
}

export interface ConnectionView {
  id: ConnectionId;
  label: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Local capability switch. A connected grant cannot be used while this is false. */
  enabled?: boolean;
  /** Opaque Sia connection id; never an OAuth credential. */
  connectionId?: string;
  /** Google starts read-only and can be upgraded with a second explicit consent. */
  googleAccess?: 'read_only' | 'read_write';
  /** Opaque pending grant used while read access remains available during an upgrade. */
  upgradeConnectionId?: string;
  /** One-time code the person types on the provider's page while a device sign-in waits. */
  userCode?: string;
  /** False when this build cannot sign in to the app (its registration is not configured). */
  available?: boolean;
  account?: string;
  detail?: string;
}
