import { activityLabel } from '../../shared/activity-label';
import { Target } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { AgentSummary, ThreadDetail } from '../types';
import companion from '../companion.module.css';
import { AgentForm } from './AgentForm';
import type { SiaPresenceState } from './SiaPresence';

export function RoomHeader({
  agent,
  thread,
  controls,
}: {
  agent?: AgentSummary | undefined;
  thread?: ThreadDetail | undefined;
  controls: ReactNode;
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
  const pendingApproval = current.some(
    (event) => event.type === 'approval' && event.status === 'pending',
  );
  const label =
    thread?.status === 'queued'
      ? 'Waiting to start'
      : state === 'working'
        ? latestActivity?.type === 'activity'
          ? activityLabel(
              latestActivity.toolName,
              latestActivity.presentation?.kind ?? latestActivity.kind,
            )
          : 'Thinking…'
        : state === 'waiting'
          ? pendingApproval
            ? 'Waiting for your approval'
            : 'Waiting for your answer'
          : presenceLabel(state);
  return (
    <header className={companion.roomHeader} data-companion-room-header>
      <div className={companion.roomIdentity}>
        <AgentForm identity={agent?.hue} state={state} size="medium" />
        <div className={companion.roomTitles}>
          <span className={companion.roomEyebrow}>
            {agent?.name ?? 'Sia'} · {label}
          </span>
          <strong>{thread?.title ?? (agent ? 'A fresh room' : 'Your agent rooms')}</strong>
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
