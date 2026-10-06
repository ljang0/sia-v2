import type { HarnessId, ProviderId, ResolvedExecutionTargetView } from './providers.js';

// Agents, their threads, and the timeline items a thread shows.

export interface AgentView {
  id: string;
  name: string;
  instructions: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  /** Backend/catalog harness preference. Automatic resolves when a thread is created. */
  harnessPreference?: { mode: 'automatic' } | { mode: 'explicit'; harnessId: HarnessId };
  /** Optional ElevenLabs voice used for this agent's read-aloud control. */
  voiceId?: string;
  /** Hue slot (0-3) that tints this agent's room; unset falls back to a stable id-derived slot. */
  hue?: number;
  /** Keeps this room near the top of the local room list. */
  pinned?: boolean;
  /** Controls background completion notifications for this room. */
  notificationsEnabled?: boolean;
  threadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ThreadStatus = 'idle' | 'queued' | 'running' | 'waiting' | 'failed';

export interface ThreadView {
  id: string;
  agentId: string;
  title: string;
  provider: ProviderId;
  model: string;
  reasoningEffort?: string;
  workspace: string;
  /** Immutable harness chosen when this thread was created. */
  harnessId?: HarnessId;
  /** Canonical immutable route selected when this thread was created. */
  resolvedExecutionTarget?: ResolvedExecutionTargetView;
  agentRevision: string;
  /** Immutable agent instructions captured when this thread was created. */
  instructionsSnapshot: string;
  agentNameSnapshot: string;
  status: ThreadStatus;
  queueReason?: string;
  archivedAt?: string;
  sourceThreadId?: string;
  unread?: boolean;
  /** Listed first in its agent's conversations. Older saved state has none: unpinned. */
  pinned?: boolean;
  /** Local encrypted composer text that has not been sent. */
  draft?: string;
  interruptedTurnId?: string;
  goal?: ThreadGoalView;
  worktree?: WorktreeView;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadGoalView {
  text: string;
  status: 'running' | 'paused';
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeView {
  kind: 'primary' | 'linked';
  sourceWorkspace: string;
  branch?: string;
}

export type AttachmentKind = 'image' | 'audio' | 'file';

export interface AttachmentView {
  id: string;
  name: string;
  kind: AttachmentKind;
  bytes: number;
  generated?: boolean;
}

export type AttachmentPreviewView =
  | { kind: 'image'; dataUrl: string }
  | {
      kind: 'text';
      content: string;
      format: 'text' | 'code' | 'diff' | 'csv';
      language?: string;
    }
  | { kind: 'pdf' }
  | { kind: 'unavailable'; detail: string };

export type TimelineItemKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'activity'
  | 'approval'
  | 'question'
  | 'notice'
  | 'error';

export type ActivityPresentationView =
  | {
      kind: 'command';
      command: string;
      cwd?: string | undefined;
      output?: string | undefined;
      exitCode?: number | null | undefined;
      durationMs?: number | null | undefined;
      processId?: string | null | undefined;
    }
  | {
      kind: 'file_change';
      files: Array<{
        path: string;
        change: string;
        movePath?: string | undefined;
        diff?: string | undefined;
      }>;
    }
  | {
      kind: 'web_search';
      query?: string | undefined;
      sources: Array<{ title?: string | undefined; url: string }>;
    }
  | { kind: 'image'; path: string }
  | { kind: 'review'; phase: 'entered' | 'exited'; review: string }
  | { kind: 'compaction' }
  | {
      kind: 'plan';
      steps: Array<{
        id: string;
        text: string;
        status: 'pending' | 'in_progress' | 'completed';
      }>;
    }
  | {
      kind: 'subagent';
      subagentId: string;
      name: string;
      phase: 'started' | 'message' | 'completed' | 'failed';
      text?: string | undefined;
      agentPath?: string | undefined;
      operation?: 'spawn' | 'send' | 'resume' | 'wait' | 'close' | 'activity' | undefined;
      model?: string | undefined;
      reasoningEffort?: string | undefined;
    };

export interface TimelineItemView {
  id: string;
  threadId: string;
  turnId?: string;
  sequence: number;
  kind: TimelineItemKind;
  title?: string;
  text?: string;
  detail?: string;
  status?: 'pending' | 'running' | 'complete' | 'denied' | 'failed';
  timestamp: string;
  approvalId?: string;
  toolName?: string;
  toolCallId?: string;
  /** Stable dispatch id used to recover a claimed schedule without creating a duplicate turn. */
  scheduleRunId?: string;
  activity?: ActivityPresentationView;
  attachments?: AttachmentView[];
}

export interface ThreadSearchResultView {
  threadId: string;
  threadTitle: string;
  archived: boolean;
  matches: Array<{
    itemId: string;
    excerpt: string;
    timestamp: string;
    kind: 'thread' | 'message' | 'file' | 'link';
    label?: string;
    url?: string;
  }>;
}

/** A one-line sidebar summary of a thread's latest turn. */
export interface ThreadPreview {
  label: 'Request' | 'Latest reply' | 'Latest activity';
  text: string;
}
