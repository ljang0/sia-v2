// Requests waiting for the person's approval.

export type ApprovalKind =
  'native_tool' | 'connector_write' | 'foreground_takeover' | 'file_upload' | 'browser_attach';

export interface ApprovalView {
  id: string;
  threadId?: string;
  callId: string;
  kind: ApprovalKind;
  title: string;
  summary: string;
  target: string;
  /** Trusted account label resolved from controller-owned connection state. */
  account?: string;
  dataLeaving?: string;
  dataLabel?: string;
  reversible: boolean;
  /** Absent when the request waits until it is answered or its turn ends, as in Codex. */
  expiresAt?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  /** The request can be allowed for the rest of its task (never on phone turns). */
  allowForTask?: boolean;
  /** The person allowed this request, and equivalent ones, for the rest of its task. */
  scope?: 'task';
}
