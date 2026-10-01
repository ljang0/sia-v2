import {
  ArrowSquareOut,
  Bell,
  Circle,
  Clock,
  Desktop,
  HandPalm,
  SealCheck,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import { useId, useState } from 'react';
import surface from './localParity.module.css';
import ui from '../../ui.module.css';
import styles from './ActivityDashboard.module.css';

type DashboardActivityStatus =
  'running' | 'queued' | 'waiting' | 'unread' | 'background' | 'complete' | 'failed';

interface DashboardActivity {
  id: string;
  threadId: string;
  title: string;
  detail: string;
  agentName: string;
  status: DashboardActivityStatus;
  updatedAt: string;
}

interface ActivityDashboardProps {
  activities: readonly DashboardActivity[];
  onOpenThread(threadId: string): void;
}

// A stopped task needs the person as much as a waiting one, so it stays in the default view.
const activeStatuses: readonly DashboardActivityStatus[] = [
  'running',
  'queued',
  'waiting',
  'failed',
  'unread',
  'background',
];

const statusOrder: Record<DashboardActivityStatus, number> = {
  waiting: 0,
  failed: 1,
  running: 2,
  queued: 2.5,
  unread: 3,
  background: 4,
  complete: 5,
};

export function ActivityDashboard({ activities, onOpenThread }: ActivityDashboardProps) {
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const titleId = useId();
  const visible = (
    filter === 'all'
      ? [...activities]
      : activities.filter((activity) => activeStatuses.includes(activity.status))
  ).sort(
    (left, right) =>
      statusOrder[left.status] - statusOrder[right.status] ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
  const metricLabels = {
    running: 'Working',
    waiting: 'Need you',
    failed: 'Stopped',
    unread: 'New results',
  } as const;

  return (
    <section className={surface.activityDashboard} aria-labelledby={titleId}>
      <div className={surface.localSurfaceHeader}>
        <h2 id={titleId}>Your agents’ work</h2>
        <div
          className={`${ui.segmentedControl} ${surface.surfaceSegments}`}
          aria-label="Activity filter"
        >
          <button
            type="button"
            className={filter === 'active' ? ui.segmentActive : undefined}
            aria-pressed={filter === 'active'}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={filter === 'all' ? ui.segmentActive : undefined}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      <div className={styles.activityMetrics}>
        {(['running', 'waiting', 'failed', 'unread'] as const).map((status) => {
          const count = activities.filter((activity) => activity.status === status).length;
          return (
            <div key={status} data-status={status} data-empty={count === 0}>
              <strong>{count}</strong>
              <span>{metricLabels[status]}</span>
            </div>
          );
        })}
      </div>

      <div className={surface.dashboardList}>
        {visible.length ? (
          visible.map((activity) => (
            <button
              type="button"
              className={styles.dashboardRow}
              onClick={() => onOpenThread(activity.threadId)}
              key={activity.id}
              data-testid="background-task-row"
            >
              <span data-testid="background-task-status">
                <ActivityStatusIcon status={activity.status} />
                <span className={ui.visuallyHidden}>
                  {activity.status === 'unread' ? 'complete, unread' : activity.status}
                </span>
              </span>
              <span className={styles.dashboardRowText}>
                <span>
                  <strong>{activity.title}</strong>
                  <small>{activity.agentName}</small>
                </span>
                <span>{activity.detail}</span>
              </span>
              <time dateTime={activity.updatedAt}>{formatRelative(activity.updatedAt)}</time>
              <ArrowSquareOut size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <p className={styles.activityAllClear}>
            <SealCheck size={18} aria-hidden="true" />
            {filter === 'active'
              ? 'All clear — nothing needs you right now.'
              : 'No work yet. Start a conversation and it will show up here.'}
          </p>
        )}
      </div>
    </section>
  );
}

function ActivityStatusIcon({ status }: { status: DashboardActivityStatus }) {
  const props = { size: 17, 'aria-hidden': true as const };
  if (status === 'running') return <SpinnerGap className={ui.spin} {...props} />;
  if (status === 'queued') return <Clock {...props} />;
  if (status === 'waiting') return <HandPalm {...props} />;
  if (status === 'unread') return <Bell weight="fill" {...props} />;
  if (status === 'background') return <Desktop {...props} />;
  if (status === 'failed') return <WarningCircle {...props} />;
  return <Circle weight="fill" {...props} />;
}

function formatRelative(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
