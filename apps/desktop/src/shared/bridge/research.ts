// Research capture consent, upload status, and the admin research archive.

export interface CaptureView {
  status: 'not_consented' | 'recording' | 'paused' | 'sync_pending' | 'blocked' | 'deleting';
  consentVersion?: string;
  consentAcceptedAt?: string;
  /** Last consent text shown to the current local identity, including a decline. */
  promptReviewedVersion?: string;
  pendingCount: number;
  /** Encrypted raw batches still waiting for a cloud acknowledgement. */
  pendingBytes?: number;
  /** Creation time of the oldest batch that has not been acknowledged by the cloud. */
  oldestPendingAt?: string;
  /** Sanitized operational detail from the most recent failed upload attempt. */
  lastSyncError?: string;
  /** Set when Sia cannot durably queue raw capture. New turns fail closed until resolved. */
  blockedReason?: string;
}

export interface AdminResearchParticipantView {
  subject: string;
  email?: string;
  batchCount: number;
  byteLength: number;
  lastCreatedAt: string;
}

export interface AdminInviteView {
  email: string;
  invitedAt: string;
  status: 'invited' | 'active' | 'failed';
}

export interface AdminResearchBatchView {
  batchId: string;
  consentVersion: string;
  eventCount: number;
  sha256: string;
  byteLength: number;
  createdAt: string;
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
}

export const RESEARCH_CONSENT_VERSION = 'alpha-research-v3-raw' as const;
