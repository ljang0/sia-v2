// Connected work apps (Google Workspace, Slack).

export type ConnectionId = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';

export interface ConnectionView {
  id: ConnectionId;
  label: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Local capability switch. A connected grant cannot be used while this is false. */
  enabled?: boolean;
  /** Opaque Sia-cloud connection id; never an OAuth credential. */
  connectionId?: string;
  /** Google starts read-only and can be upgraded with a second explicit consent. */
  googleAccess?: 'read_only' | 'read_write';
  /** Opaque pending grant used while read access remains available during an upgrade. */
  upgradeConnectionId?: string;
  account?: string;
  detail?: string;
}
