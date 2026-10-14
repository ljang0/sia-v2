import { ArrowUpRight, Check } from '@phosphor-icons/react';
import type { ScottyAction, ScottyTask } from '../../shared/scotty';
import styles from './Scotty.module.css';

/** One task in Scotty's tray: progress, the latest response, a question, or an action to review. */
export function ScottyTaskDetail({
  task,
  busy,
  act,
}: {
  task: ScottyTask;
  busy: boolean;
  act: (action: ScottyAction) => Promise<void>;
}) {
  return (
    <section className={styles.detail}>
      <span className={styles.eyebrow}>{task.agent}</span>
      <h2>{task.title}</h2>
      <p className={styles.progress} data-status={task.status} role="status">
        {/* Keyed by state so a change of state, not every progress update, plays its beat. */}
        <span key={task.status} className={styles.statusLine}>
          <span className={styles.dot} />
          {task.progress}
        </span>
      </p>
      {task.screen && (
        <small className={styles.screen}>
          {task.screen === 'foreground'
            ? 'Using your screen · Press ⌃Esc to stop'
            : 'Working quietly in the background'}
        </small>
      )}
      {task.response && (
        <div className={styles.response}>
          {task.truncated && <small>This is the latest part. Open Sia to see all of it.</small>}
          {task.response}
        </div>
      )}
      {task.question && (
        <div className={styles.question}>
          <span>A question for you</span>
          <p>{task.question}</p>
        </div>
      )}
      {task.approval && (
        <section className={styles.approval} aria-label="Review action">
          <h3>{task.approval.title}</h3>
          <p>{task.approval.summary}</p>
          <dl>
            <dt>Where</dt>
            <dd>{task.approval.target}</dd>
            {task.approval.account && (
              <>
                <dt>Account</dt>
                <dd>{task.approval.account}</dd>
              </>
            )}
            {task.approval.dataLeaving && (
              <>
                <dt>Information that leaves your Mac</dt>
                <dd>{task.approval.dataLeaving}</dd>
              </>
            )}
            <dt>Can it be undone?</dt>
            <dd>{task.approval.reversible ? 'Yes' : 'No'}</dd>
          </dl>
          {task.approval.requiresMainApp ? (
            <button
              className={styles.primary}
              onClick={() => void act({ kind: 'open', token: task.token })}
            >
              Review in Sia
            </button>
          ) : (
            <div className={styles.actions}>
              <button
                disabled={busy}
                className={styles.secondary}
                onClick={() =>
                  void act({
                    kind: 'approve',
                    token: task.token,
                    approvalId: task.approval!.id,
                    decision: 'deny',
                  })
                }
              >
                Don&apos;t allow
              </button>
              <button
                disabled={busy}
                className={styles.primary}
                onClick={() =>
                  void act({
                    kind: 'approve',
                    token: task.token,
                    approvalId: task.approval!.id,
                    decision: 'approve',
                  })
                }
              >
                Allow once
              </button>
            </div>
          )}
        </section>
      )}
      <div className={styles.actions}>
        {task.canStop && (
          <button
            className={styles.textButton}
            disabled={busy}
            onClick={() => void act({ kind: 'cancel', token: task.token })}
          >
            Stop task
          </button>
        )}
        {task.unread && !task.canStop && (
          <button
            className={styles.textButton}
            disabled={busy}
            onClick={() => void act({ kind: 'read', token: task.token })}
          >
            <Check size={16} /> Mark as read
          </button>
        )}
        <button
          className={styles.textButton}
          disabled={busy}
          onClick={() => void act({ kind: 'open', token: task.token })}
        >
          Open in Sia <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
