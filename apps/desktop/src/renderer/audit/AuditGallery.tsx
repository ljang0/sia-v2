import { CheckCircle, Clock, CloudSlash, WarningCircle } from '@phosphor-icons/react';
import { ActivityRow } from '../components/ActivityRow';
import { ApprovalCard } from '../components/ApprovalCard';
import { Composer } from '../components/Composer';
import { StatusMark } from '../components/StatusMark';
import type { ApprovalEvent } from '../types';
import styles from '../ui.module.css';
import { AccountAuditMatrix } from './AccountAuditMatrix';

const foregroundApproval: ApprovalEvent = {
  id: 'audit-foreground',
  type: 'approval',
  status: 'pending',
  timestamp: new Date().toISOString(),
  request: {
    id: 'audit-foreground',
    kind: 'foreground',
    title: 'Use Chrome in the foreground',
    reason: 'The target cannot be activated exactly while Chrome is behind another app.',
    appName: 'Google Chrome',
    target: 'Click “Submit feedback” on research.sia.dev',
    restoresFocusTo: 'Notes',
  },
};

const connectorApproval: ApprovalEvent = {
  id: 'audit-connector',
  type: 'approval',
  status: 'pending',
  timestamp: new Date().toISOString(),
  request: {
    id: 'audit-connector',
    kind: 'connector',
    title: 'Post a Slack message',
    app: 'Slack',
    account: 'Sia workspace',
    action: 'Post message',
    destination: '#alpha-research',
    preview:
      'Browser reliability passed the background-action checks. Foreground takeover still needs one final usability test.',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  },
};

export default function AuditGallery() {
  return (
    <main className={styles.auditPage}>
      <header className={styles.auditHeader}>
        <div>
          <span>Development only</span>
          <h1>Sia UI audit</h1>
          <p>
            Real components in consequential states. Check at every supported window size and
            color scheme.
          </p>
        </div>
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            location.hash = '';
            location.reload();
          }}
        >
          Return to app
        </a>
      </header>

      <AuditSection title="System states">
        <div className={styles.auditStateGrid}>
          <StatePanel icon={<CloudSlash size={18} />} title="Offline" tone="warning">
            Local providers and threads still work. Meta, apps, and research sync are
            unavailable.
          </StatePanel>
          <StatePanel icon={<Clock size={18} />} title="Queued" tone="neutral">
            Waiting for the Chrome tab used by another turn. The task will begin when it is
            released.
          </StatePanel>
          <StatePanel icon={<WarningCircle size={18} />} title="Turn stopped" tone="danger">
            Chrome closed before the action could be verified. Nothing was submitted.
          </StatePanel>
          <StatePanel icon={<CheckCircle size={18} />} title="Complete" tone="success">
            The file was saved and the final state was verified.
          </StatePanel>
        </div>
      </AuditSection>

      <AuditSection title="Thread status">
        <div className={styles.auditInlineRow}>
          <StatusMark status="idle" label="Idle" />
          <StatusMark status="running" label="Running" />
          <StatusMark status="queued" label="Queued" />
          <StatusMark status="waiting" label="Waiting" />
          <StatusMark status="error" label="Error" />
          <StatusMark status="complete" label="Complete" />
        </div>
      </AuditSection>

      <AuditSection title="Compact activity">
        <div className={styles.auditNarrowColumn}>
          <ActivityRow
            event={{
              id: 'audit-activity-1',
              type: 'activity',
              kind: 'browser',
              title: 'Opened the research form',
              detail: 'research.sia.dev/feedback',
              status: 'complete',
              timestamp: new Date().toISOString(),
            }}
          />
          <ActivityRow
            event={{
              id: 'audit-activity-2',
              type: 'activity',
              kind: 'command',
              title: 'Running typecheck',
              detail: 'pnpm typecheck',
              status: 'running',
              timestamp: new Date().toISOString(),
            }}
          />
          <ActivityRow
            event={{
              id: 'audit-activity-3',
              type: 'activity',
              kind: 'connector',
              title: 'Waiting for Drive',
              detail: 'The cloud connection is offline.',
              status: 'queued',
              timestamp: new Date().toISOString(),
            }}
          />
        </div>
      </AuditSection>

      <AuditSection title="Approvals">
        <div className={styles.auditApprovalGrid}>
          <ApprovalCard event={foregroundApproval} onResolve={() => undefined} />
          <ApprovalCard event={connectorApproval} onResolve={() => undefined} />
        </div>
      </AuditSection>

      <AuditSection title="Composer">
        <div className={styles.auditComposerGrid}>
          <div>
            <h3>Ready</h3>
            <Composer
              executionLabel="Codex / gpt-5.6-sol, provider client on this Mac"
              onSend={() => Promise.resolve()}
              onStop={() => Promise.resolve()}
            />
          </div>
          <div>
            <h3>Queued</h3>
            <Composer
              disabled
              placeholder="This thread is queued"
              executionLabel="Meta / Sia Meta, hosted model; tools on this Mac"
              onSend={() => Promise.resolve()}
              onStop={() => Promise.resolve()}
            />
          </div>
        </div>
      </AuditSection>

      <AccountAuditMatrix />
    </main>
  );
}

function AuditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.auditSection}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function StatePanel({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.auditStatePanel} ${styles[`auditTone_${tone}`]}`}>
      {icon}
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
