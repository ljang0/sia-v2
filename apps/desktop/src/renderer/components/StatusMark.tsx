import {
  CheckCircle,
  CircleNotch,
  Clock,
  PauseCircle,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import primitives from '../styles/primitives.module.css';
import styles from './StatusMark.module.css';

interface StatusMarkProps {
  status: 'idle' | 'running' | 'queued' | 'waiting' | 'error' | 'complete';
  label?: string;
}

export function StatusMark({ status, label }: StatusMarkProps) {
  const icon = {
    idle: <PauseCircle aria-hidden="true" />,
    running: <CircleNotch className={primitives.spin} aria-hidden="true" />,
    queued: <Clock aria-hidden="true" />,
    waiting: <WarningCircle aria-hidden="true" />,
    error: <XCircle aria-hidden="true" />,
    complete: <CheckCircle aria-hidden="true" />,
  }[status];
  const toneClass = status === 'idle' ? '' : styles[`status_${status}`];

  return (
    <span className={`${styles.statusMark} ${toneClass}`}>
      {icon}
      <span className={label ? undefined : primitives.visuallyHidden}>
        {label ?? statusLabel(status)}
      </span>
    </span>
  );
}

function statusLabel(status: StatusMarkProps['status']) {
  return {
    idle: 'Idle',
    running: 'Running',
    queued: 'Queued',
    waiting: 'Waiting for approval',
    error: 'Error',
    complete: 'Complete',
  }[status];
}
