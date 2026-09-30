import {
  ArrowRight,
  Check,
  CloudCheck,
  Database,
  Microphone,
  ShieldCheck,
} from '@phosphor-icons/react';
import { useState } from 'react';
import type { RendererSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import styles from './ReleaseReviewSettings.module.css';
import { SettingsSectionHeader } from './SettingsShared';

const STORAGE_KEY = 'sia.alpha-release-review.v1';

const MANUAL_CHECKS = [
  {
    id: 'archive-flow',
    title: 'Admin archive flow',
    detail: 'Sign in on the final app, open a participant, inspect a batch, and view an image.',
  },
  {
    id: 'offline-recovery',
    title: 'Offline recovery',
    detail: 'Create work offline, inspect the encrypted outbox, reconnect, and confirm upload.',
  },
  {
    id: 'voice-permissions',
    title: 'Voice and microphone',
    detail:
      'Test dictation, a denied microphone permission, audible playback, and completion sound.',
  },
  {
    id: 'install-upgrade',
    title: 'Install and upgrade',
    detail: 'Install with a clean macOS account, then upgrade once from the previous build.',
  },
  {
    id: 'named-approvals',
    title: 'Named approvals',
    detail:
      'Record research, privacy, security, support, and release owners in the sign-off record.',
  },
  {
    id: 'support-rollback',
    title: 'Invite and rollback plan',
    detail: 'Confirm the recipient list, support route, rollback owner, and stop-ship channel.',
  },
  {
    id: 'source-tag',
    title: 'Release source',
    detail: 'Commit the exact source, create the release tag, and retain artifact checksums.',
  },
] as const;

type CheckId = (typeof MANUAL_CHECKS)[number]['id'];

function readChecks(): CheckId[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    const allowed = new Set<string>(MANUAL_CHECKS.map((item) => item.id));
    return value.filter(
      (item): item is CheckId => typeof item === 'string' && allowed.has(item),
    );
  } catch {
    return [];
  }
}

function persistChecks(value: readonly CheckId[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The checklist remains usable for this session if local storage is unavailable.
  }
}

function clearChecks() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory state is still cleared below.
  }
}

export function ReleaseReviewSettings({
  snapshot,
  onOpenPrivacy,
  onOpenVoice,
  onOpenArchive,
}: {
  snapshot: RendererSnapshot;
  onOpenPrivacy(): void;
  onOpenVoice(): void;
  onOpenArchive?: (() => void) | undefined;
}) {
  const [checked, setChecked] = useState<CheckId[]>(readChecks);
  const completed = new Set(checked);
  const percent = Math.round((checked.length / MANUAL_CHECKS.length) * 100);

  const toggle = (id: CheckId) => {
    setChecked((current) => {
      const next = current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id];
      persistChecks(next);
      return next;
    });
  };

  return (
    <SettingsSectionHeader
      title="Release review"
      description="A focused final pass for the build you intend to invite people to use. System signals update live; operator checks stay on this Mac."
    >
      <div className={styles.releaseSignals} aria-label="Live release signals">
        <ReleaseSignal
          icon={<CloudCheck size={18} aria-hidden="true" />}
          title="Admin access"
          detail="Signed in with administrator MFA"
          ready={
            snapshot.cloudAuth.state === 'signed-in' && Boolean(snapshot.cloudAuth.adminMfa)
          }
          action={onOpenArchive ? { label: 'Open archive', onClick: onOpenArchive } : undefined}
        />
        <ReleaseSignal
          icon={<ShieldCheck size={18} aria-hidden="true" />}
          title="Research capture"
          detail={
            snapshot.research.capture === 'blocked'
              ? (snapshot.research.blockedReason ?? 'Capture needs attention')
              : snapshot.research.consented
                ? `${snapshot.research.pendingItems} item${snapshot.research.pendingItems === 1 ? '' : 's'} pending upload`
                : 'Consent has not been recorded'
          }
          ready={snapshot.research.consented && snapshot.research.capture !== 'blocked'}
          action={{ label: 'Review privacy', onClick: onOpenPrivacy }}
        />
        <ReleaseSignal
          icon={<Microphone size={18} aria-hidden="true" />}
          title="Voice"
          detail={
            snapshot.voice.status === 'connected'
              ? 'Voice service connected'
              : 'Optional voice service not connected'
          }
          ready={snapshot.voice.status === 'connected'}
          optional
          action={{ label: 'Review voice', onClick: onOpenVoice }}
        />
      </div>

      <section className={styles.releaseChecklist} aria-labelledby="release-checklist-title">
        <header>
          <div>
            <span>Operator checks</span>
            <strong id="release-checklist-title">
              {checked.length} of {MANUAL_CHECKS.length} verified
            </strong>
          </div>
          {checked.length ? (
            <button
              type="button"
              className={buttons.textButton}
              onClick={() => {
                clearChecks();
                setChecked([]);
              }}
            >
              Reset
            </button>
          ) : null}
        </header>
        <div
          className={styles.releaseProgress}
          role="progressbar"
          aria-label="Release review progress"
          aria-valuemin={0}
          aria-valuemax={MANUAL_CHECKS.length}
          aria-valuenow={checked.length}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className={styles.releaseCheckList}>
          {MANUAL_CHECKS.map((item) => (
            <label className={styles.releaseCheck} key={item.id}>
              <input
                type="checkbox"
                checked={completed.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span className={styles.releaseCheckMark} aria-hidden="true">
                <Check size={13} weight="bold" />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
    </SettingsSectionHeader>
  );
}

function ReleaseSignal({
  icon,
  title,
  detail,
  ready,
  optional,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  ready: boolean;
  optional?: boolean | undefined;
  action?: { label: string; onClick(): void } | undefined;
}) {
  return (
    <article className={styles.releaseSignal} data-ready={ready}>
      <span className={styles.releaseSignalIcon}>{icon}</span>
      <div>
        <span>
          <strong>{title}</strong>
          <small>{ready ? 'Ready' : optional ? 'Optional' : 'Review'}</small>
        </span>
        <p>{detail}</p>
      </div>
      {action ? (
        <button type="button" className={buttons.textButton} onClick={action.onClick}>
          {action.label}
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      ) : (
        <Database size={15} aria-hidden="true" />
      )}
    </article>
  );
}
