import { FolderSimple, Target } from '@phosphor-icons/react';
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

  return (
    <header className={companion.roomHeader} data-companion-room-header>
      <div className={companion.roomIdentity}>
        <AgentForm identity={agent?.hue} state={state} size="medium" />
        <div className={companion.roomTitles}>
          <span className={companion.roomEyebrow}>
            {agent?.name ?? 'Sia'} · {presenceLabel(state)}
          </span>
          <strong>{thread?.title ?? (agent ? 'A fresh room' : 'Your agent rooms')}</strong>
          {thread ? (
            <div className={companion.roomMeta}>
              <span title={thread.workspace}>
                <FolderSimple size={13} aria-hidden="true" />
                {workspaceName(thread.workspace)}
              </span>
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

function workspaceName(workspace: string): string {
  return workspace.split(/[\\/]/).filter(Boolean).at(-1) ?? workspace;
}

function presenceLabel(state: SiaPresenceState): string {
  if (state === 'working') return 'working';
  if (state === 'waiting') return 'waiting for you';
  if (state === 'error') return 'needs attention';
  return 'ready';
}
