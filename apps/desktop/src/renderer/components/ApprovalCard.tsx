import {
  ArrowSquareOut,
  CheckCircle,
  Clock,
  Desktop,
  EnvelopeSimple,
  ShieldCheck,
  XCircle,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { ApprovalEvent, ApprovalDecision } from '../types';
import styles from '../ui.module.css';

interface ApprovalCardProps {
  event: ApprovalEvent;
  busy?: boolean;
  onResolve(approvalId: string, decision: ApprovalDecision): void;
}

export function ApprovalCard({ event, busy, onResolve }: ApprovalCardProps) {
  const { request, status } = event;
  const expiresAt = request.kind === 'foreground' ? undefined : request.expiresAt;
  const [now, setNow] = useState(() => Date.now());
  const expiredByClock = Boolean(
    status === 'pending' && expiresAt && new Date(expiresAt).getTime() <= now,
  );
  const displayStatus = expiredByClock ? 'expired' : status;
  const resolved = displayStatus !== 'pending';

  useEffect(() => {
    if (!expiresAt || status !== 'pending') return;
    setNow(Date.now());
    const expiry = new Date(expiresAt).getTime();
    const interval = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= expiry) window.clearInterval(interval);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAt, status]);

  return (
    <section
      className={`${styles.approvalCard} ${resolved ? styles.approvalResolved : ''}`}
      aria-label={request.title}
    >
      <header className={styles.approvalHeader}>
        <span className={styles.approvalIcon}>
          {request.kind === 'foreground' ? (
            <Desktop size={18} aria-hidden="true" />
          ) : request.kind === 'connector' ? (
            <EnvelopeSimple size={18} aria-hidden="true" />
          ) : (
            <ShieldCheck size={18} aria-hidden="true" />
          )}
        </span>
        <div>
          <h3>{request.title}</h3>
          <p>
            {request.kind === 'foreground'
              ? 'Sia needs to use the pointer in the foreground.'
              : request.kind === 'connector'
                ? `${request.app} will make this change only after you approve it.`
                : `Review this ${request.category.toLowerCase()} action before Sia continues.`}
          </p>
        </div>
        {resolved ? (
          <span className={styles.approvalStatus}>
            {displayStatus === 'approved' ? (
              <CheckCircle size={16} aria-hidden="true" />
            ) : (
              <XCircle size={16} aria-hidden="true" />
            )}
            {displayStatus}
          </span>
        ) : null}
      </header>

      {request.kind === 'foreground' ? (
        <div className={styles.approvalDetails}>
          <div className={styles.detailPair}>
            <span>App</span>
            <strong>{request.appName}</strong>
          </div>
          <div className={styles.detailPair}>
            <span>Action</span>
            <strong>{request.target}</strong>
          </div>
          <p className={styles.approvalReason}>{request.reason}</p>
          <div className={styles.restoreNote}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Focus returns to {request.restoresFocusTo} when the action finishes.</span>
          </div>
        </div>
      ) : request.kind === 'connector' ? (
        <div className={styles.approvalDetails}>
          <div className={styles.connectorMeta}>
            <span>{request.account}</span>
            <ArrowSquareOut size={14} aria-hidden="true" />
            <span>{request.destination}</span>
          </div>
          <pre className={styles.connectorPreview}>{request.preview}</pre>
          <div className={styles.expiryNote}>
            <Clock size={14} aria-hidden="true" />
            <span>{formatExpiry(request.expiresAt, now)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.approvalDetails}>
          <div className={styles.detailPair}>
            <span>Action</span>
            <strong>{request.summary}</strong>
          </div>
          <div className={styles.detailPair}>
            <span>Target</span>
            <strong>{request.target}</strong>
          </div>
          {request.dataLeaving ? (
            <>
              <p className={styles.dataLeavingLabel}>
                {request.dataLabel ?? 'Data leaving your Mac'}
              </p>
              <pre className={styles.connectorPreview}>{request.dataLeaving}</pre>
            </>
          ) : null}
          <div className={styles.restoreNote}>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              This approval applies only to the target shown. Sia does not provide an automatic
              undo.
            </span>
          </div>
          {request.expiresAt && !resolved ? (
            <div className={styles.expiryNote}>
              <Clock size={14} aria-hidden="true" />
              <span>{formatExpiry(request.expiresAt, now, 'Sia will skip this step')}</span>
            </div>
          ) : null}
        </div>
      )}

      {!resolved ? (
        <footer className={styles.approvalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => onResolve(request.id, 'reject')}
            disabled={busy}
          >
            Don&apos;t allow
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onResolve(request.id, 'approve')}
            disabled={busy}
          >
            {request.kind === 'foreground' ? 'Take over briefly' : 'Approve'}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function formatExpiry(value: string, now: number, action = 'Preview expires') {
  const remaining = new Date(value).getTime() - now;
  if (remaining <= 0)
    return action === 'Preview expires' ? 'Preview expired' : 'Request expired';
  if (remaining < 60_000) return `${action} in less than a minute`;
  const minutes = Math.ceil(remaining / 60_000);
  return `${action} in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
