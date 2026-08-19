import {
  ArrowSquareOut,
  Bell,
  Circle,
  Desktop,
  Pause,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import { useId, useState } from 'react';
import styles from '../../ui.module.css';

type DashboardActivityStatus =
  'running' | 'waiting' | 'unread' | 'background' | 'complete' | 'failed';

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

const activeStatuses: readonly DashboardActivityStatus[] = [
  'running',
  'waiting',
  'unread',
  'background',
];

export function ActivityDashboard({ activities, onOpenThread }: ActivityDashboardProps) {
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const titleId = useId();
  const visible =
    filter === 'all'
      ? activities
      : activities.filter((activity) => activeStatuses.includes(activity.status));
  const metricLabels = {
    running: 'Running',
    waiting: 'Waiting',
    unread: 'Unread',
    background: 'Background',
  } as const;

  return (
    <section className={styles.activityDashboard} aria-labelledby={titleId}>
      <div className={styles.localSurfaceHeader}>
        <h2 id={titleId}>Across agents</h2>
        <div className={styles.segmentedControl} aria-label="Activity filter">
          <button
            type="button"
            className={filter === 'active' ? styles.segmentActive : undefined}
            aria-pressed={filter === 'active'}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={filter === 'all' ? styles.segmentActive : undefined}
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      <div className={styles.activityMetrics}>
        {(['running', 'waiting', 'unread', 'background'] as const).map((status) => (
          <div key={status}>
            <strong>
              {activities.filter((activity) => activity.status === status).length}
            </strong>
            <span>{metricLabels[status]}</span>
          </div>
        ))}
      </div>

      <div className={styles.dashboardList}>
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
                <span className={styles.visuallyHidden}>
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
          <p className={styles.localEmpty}>Nothing needs attention.</p>
        )}
      </div>
    </section>
  );
}

function ActivityStatusIcon({ status }: { status: DashboardActivityStatus }) {
  const props = { size: 17, 'aria-hidden': true as const };
  if (status === 'running') return <SpinnerGap className={styles.spin} {...props} />;
  if (status === 'waiting') return <Pause {...props} />;
  if (status === 'unread') return <Bell weight="fill" {...props} />;
  if (status === 'background') return <Desktop {...props} />;
  if (status === 'failed') return <WarningCircle {...props} />;
  return <Circle weight="fill" {...props} />;
}

function formatRelative(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
