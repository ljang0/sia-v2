import { activityLabel } from '../../shared/activity-label';
import { Target } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { AgentSummary, ThreadDetail } from '../types';
import companion from '../companion.module.css';
import { AgentForm } from './AgentForm';
import { threadDisplayTitle } from '../threadTitle';
import { workingLabel } from './WorkGroup';
import type { SiaPresenceState } from './SiaPresence';

export function RoomHeader({
  agent,
  thread,
  controls,
  setup = false,
}: {
  agent?: AgentSummary | undefined;
  thread?: ThreadDetail | undefined;
  controls: ReactNode;
  /** First-run setup is open; the header names it instead of an empty workspace. */
  setup?: boolean;
}) {
  const state: SiaPresenceState =
    thread?.status === 'running' || thread?.status === 'queued'
      ? 'working'
      : thread?.status === 'waiting'
        ? 'waiting'
        : thread?.status === 'error'
          ? 'error'
          : 'idle';

  const events = thread?.events ?? [];
  const current = events.slice(
    events.findLastIndex((event) => event.type === 'message' && event.role === 'user') + 1,
  );
  const latestActivity = current
    .filter((event) => event.type === 'activity' && event.status === 'running')
    .at(-1);
  const writing = current.some(
    (event) => event.type === 'message' && event.role === 'assistant',
  );
  const pendingApproval = current.some(
    (event) => event.type === 'approval' && event.status === 'pending',
  );
  const label =
    thread?.status === 'queued'
      ? 'Queued'
      : state === 'working'
        ? latestActivity?.type === 'activity'
          ? activityLabel(
              latestActivity.toolName,
              latestActivity.presentation?.kind ?? latestActivity.kind,
            )
          : workingLabel(false, writing)
        : state === 'waiting'
          ? pendingApproval
            ? 'Waiting for your approval'
            : 'Waiting for your answer'
          : setup
            ? 'getting set up'
            : presenceLabel(state);
  return (
    <header className={companion.roomHeader} data-companion-room-header>
      <div className={companion.roomIdentity}>
        <AgentForm identity={agent?.hue} state={state} size="medium" />
        <div className={companion.roomTitles}>
          <span className={companion.roomEyebrow}>
            {agent?.name ?? 'Sia'} · {label}
          </span>
          <strong title={thread ? threadDisplayTitle(thread.title) : undefined}>
            {setup
              ? 'Welcome'
              : thread
                ? threadDisplayTitle(thread.title)
                : agent
                  ? 'New conversation'
                  : 'Your conversations'}
          </strong>
          {thread?.goal ? (
            <div className={companion.roomMeta}>
              {thread.goal ? (
                <span title={thread.goal.text}>
                  <Target size={13} aria-hidden="true" />
                  {thread.goal.text}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className={companion.roomControls}>{controls}</div>
    </header>
  );
}

function presenceLabel(state: SiaPresenceState): string {
  if (state === 'working') return 'working on your request';
  if (state === 'waiting') return 'waiting for you';
  if (state === 'error') return 'needs attention';
  return 'ready';
}
