import {
  ArrowRight,
  CheckCircle,
  CaretRight,
  Desktop,
  EnvelopeSimple,
  ShieldCheck,
  XCircle,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { COMPOSER_INPUT_ATTRIBUTE, focusIsAdrift } from '../composerFocus';
import type { ApprovalEvent, ApprovalDecision } from '../types';
import buttons from '../styles/buttons.module.css';
import styles from './ApprovalCard.module.css';

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
  const card = useRef<HTMLElement>(null);
  const command = request.kind === 'action' ? nativeCommand(request.summary) : undefined;

  // Move focus to the card itself, not to Approve, so a stray Enter cannot approve and the
  // next Tab reaches the choices. Someone mid-sentence in the composer keeps typing: their
  // message queues as a follow-up and the card waits for them.
  useEffect(() => {
    if (status !== 'pending') return;
    const active = document.activeElement;
    const typing =
      active instanceof HTMLTextAreaElement &&
      active.hasAttribute(COMPOSER_INPUT_ATTRIBUTE) &&
      active.value.trim() !== '';
    if (focusIsAdrift(active) || (active?.closest('[data-companion-composer]') && !typing)) {
      card.current?.focus({ preventScroll: true });
    }
  }, [status]);

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

  const content = (
    <>
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
          {!resolved ? (
            <p>
              {request.kind === 'foreground'
                ? 'Sia needs to control the pointer for a moment.'
                : request.kind === 'connector'
                  ? `${request.app} will make this change only after you allow it.`
                  : `Review this ${request.category.toLowerCase()} action before Sia continues.`}
            </p>
          ) : null}
        </div>
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
          <p className={styles.connectorMeta}>
            <span>
              <span className={styles.metaLabel}>From </span>
              <span>{request.account}</span>
            </span>
            <ArrowRight size={16} aria-hidden="true" />
            <span>
              <span className={styles.metaLabel}>To </span>
              <span>{request.destination}</span>
            </span>
          </p>
          <pre className={styles.connectorPreview}>{request.preview}</pre>
          {displayStatus === 'expired' ? (
            <p className={styles.expiryNote}>Preview expired</p>
          ) : null}
        </div>
      ) : (
        <div className={styles.approvalDetails}>
          {command ? (
            <div className={styles.approvalCommand}>
              <span>Run this command</span>
              <pre>
                <code>{command}</code>
              </pre>
            </div>
          ) : (
            <div className={styles.detailPair}>
              <span>Action</span>
              <strong>{request.summary}</strong>
            </div>
          )}
          <div className={styles.detailPair}>
            <span>Applies to</span>
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
              Allowing this covers only what is shown here. Sia can&apos;t undo it
              automatically.
            </span>
          </div>
          {displayStatus === 'expired' ? (
            <p className={styles.expiryNote}>Request expired</p>
          ) : null}
        </div>
      )}
    </>
  );

  return (
    <section
      ref={card}
      tabIndex={-1}
      className={`${styles.approvalCard} ${resolved ? styles.approvalResolved : ''}`}
      aria-label={request.title}
      data-approval={resolved ? 'resolved' : 'pending'}
      data-testid="approval-card"
    >
      {resolved ? (
        <details className={styles.resolvedDetails}>
          <summary className={styles.resolvedSummary}>
            <CaretRight size={16} className={styles.resolvedCaret} aria-hidden="true" />
            <span className={styles.resolvedTitle}>{request.title}</span>
            <span className={styles.approvalStatus}>
              {displayStatus === 'approved' ? (
                <CheckCircle size={16} aria-hidden="true" />
              ) : (
                <XCircle size={16} aria-hidden="true" />
              )}
              {displayStatus === 'approved' && event.scope === 'task'
                ? 'Allowed for this task'
                : STATUS_LABEL[displayStatus]}
            </span>
          </summary>
          {content}
        </details>
      ) : (
        content
      )}

      {!resolved ? (
        <footer className={styles.approvalActions}>
          {/* Time pressure stays quiet: it appears only near the end, beside the choices. */}
          {expiresAt && new Date(expiresAt).getTime() - now <= EXPIRY_NOTICE_MS ? (
            <span className={styles.expiryNote}>
              {formatExpiry(
                expiresAt,
                now,
                request.kind === 'connector' ? 'Preview expires' : 'Sia will skip this step',
              )}
            </span>
          ) : null}
          <button
            type="button"
            className={buttons.secondaryButton}
            onClick={() => onResolve(request.id, 'reject')}
            disabled={busy}
          >
            Don&apos;t allow
          </button>
          {request.allowForTask ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              onClick={() => onResolve(request.id, 'approve_task')}
              disabled={busy}
              title="Sia won't ask again for this same kind of action on this target until this task ends."
            >
              Allow for this task
            </button>
          ) : null}
          <button
            type="button"
            className={buttons.primaryButton}
            onClick={() => onResolve(request.id, 'approve')}
            disabled={busy}
          >
            {request.kind === 'foreground' ? 'Take over briefly' : 'Allow'}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

const STATUS_LABEL = {
  pending: 'Waiting',
  approved: 'Allowed',
  rejected: 'Not allowed',
  expired: 'Expired',
} as const;

/** A countdown is shown only for the last two minutes; earlier it would only add pressure. */
const EXPIRY_NOTICE_MS = 2 * 60_000;

const COMMAND_PREFIX = 'Run a command: ';

/** A native shell approval arrives as "Run a command: <command>"; show the command itself. */
function nativeCommand(summary: string): string | undefined {
  if (!summary.startsWith(COMMAND_PREFIX)) return undefined;
  return summary.slice(COMMAND_PREFIX.length).trim() || undefined;
}

function formatExpiry(value: string, now: number, action: string) {
  const remaining = new Date(value).getTime() - now;
  if (remaining < 60_000) return `${action} in less than a minute`;
  const minutes = Math.ceil(remaining / 60_000);
  return `${action} in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
