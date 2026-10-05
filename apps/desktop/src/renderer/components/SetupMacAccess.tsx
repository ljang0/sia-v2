import { Check } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { RendererApi, RendererSnapshot } from '../types';
import { dictationReady } from '../voiceReadiness';
import { automationApps, type AutomationStatus } from '../../shared/mac-permissions';
import buttons from '../styles/buttons.module.css';
import styles from './Onboarding.module.css';
import { errorMessage } from '../plainErrors';

export type MacSetupApi = Pick<
  RendererApi,
  | 'requestComputerPermissions'
  | 'refreshComputerPermissions'
  | 'requestAutomationPermission'
  | 'configureVoice'
  | 'configurePushToTalk'
> &
  Partial<Pick<RendererApi, 'setupMessages'>>;

/** What a row needs from the person right now. */
type AccessState = 'ready' | 'needed' | 'denied' | 'relaunch' | 'unavailable' | 'error';

export type AccessRow = {
  id: string;
  name: string;
  /** One plain line: why Sia asks. */
  why: string;
  /** What to do while the guided pass is on this row. */
  guide: string;
  optional: boolean;
  state: AccessState;
  /** A guided step may use a native prompt or direct the person to System Settings. */
  guided: boolean;
  request?(isCurrent: () => boolean): Promise<void>;
};

const STATE_LABEL: Record<AccessState, string> = {
  ready: 'Allowed',
  needed: 'Needs you',
  denied: 'Turned off',
  relaunch: 'Reopen Sia',
  unavailable: 'Unavailable',
  error: 'Could not check',
};

const automationState: Record<AutomationStatus, AccessState> = {
  ready: 'ready',
  needs_permission: 'needed',
  not_running: 'needed',
  denied: 'denied',
  unavailable: 'unavailable',
  error: 'error',
};

/**
 * Every macOS permission Sia can ask for, in the order setup asks. Accessibility and Screen
 * Recording are needed to work on the Mac; everything else can be skipped and is asked for by
 * macOS in plain words the first time a task needs it.
 */
export function macAccessRows(
  snapshot: RendererSnapshot,
  api: MacSetupApi,
  options: { agentId: string | undefined; includeApps: boolean; canRelaunch: boolean },
): AccessRow[] {
  const computer = snapshot.computer;
  const core = (permission: 'accessibility' | 'screenRecording'): AccessState =>
    computer[permission] === 'allowed'
      ? // Both grants are listed, but reading a window failed: macOS usually applies the
        // grant to Sia only after it reopens, so treat seeing the screen as not done yet.
        permission === 'screenRecording' && computer.verified === 'failed'
        ? 'relaunch'
        : 'ready'
      : computer.relaunchFor?.includes(permission)
        ? 'relaunch'
        : 'needed';
  const voiceAvailable =
    Boolean(snapshot.voice.pushToTalk?.available) &&
    snapshot.voice.dictationAvailable !== false &&
    Boolean(options.agentId);
  const rows: AccessRow[] = [
    {
      id: 'accessibility',
      name: 'Control your Mac',
      why: 'Lets Sia click and type in apps for you.',
      guide:
        'In Accessibility, turn on Sia. If macOS asks, enter your password in its own dialog.',
      optional: false,
      state: core('accessibility'),
      guided: true,
      request: () => api.requestComputerPermissions('accessibility'),
    },
    {
      id: 'screen',
      name: 'See your screen',
      why: 'Lets Sia see the app it is working in.',
      guide: options.canRelaunch
        ? 'In Screen & System Audio Recording, turn on Sia. If macOS offers to quit, choose Later — Sia shows one Relaunch button when it’s needed.'
        : 'In Screen & System Audio Recording, turn on Sia. Quit and reopen Sia if macOS asks you to.',
      optional: false,
      state: core('screenRecording'),
      guided: true,
      request: () => api.requestComputerPermissions('screenRecording'),
    },
    voiceAvailable
      ? {
          id: 'voice',
          name: 'Talk with Fn',
          why: 'Hold Fn and speak instead of typing. Uses the microphone and Speech Recognition.',
          guide:
            'Allow the microphone and any Speech Recognition prompt. Setup does not record your voice.',
          optional: true,
          state: dictationReady(snapshot.voice) ? 'ready' : 'needed',
          guided: true,
          request: async (isCurrent) => {
            if (snapshot.voice.status !== 'connected') await api.configureVoice();
            if (!isCurrent()) return;
            await api.configurePushToTalk(true, options.agentId!, true);
          },
        }
      : {
          id: 'voice',
          name: 'Talk with Fn',
          why: snapshot.voice.dictationDetail ?? 'Voice setup is unavailable on this device.',
          guide: '',
          optional: true,
          state: 'unavailable',
          guided: false,
        },
  ];
  if (!options.includeApps) return rows;
  for (const { id, name, detail } of automationApps) {
    const status = computer.automation?.[id] ?? 'needs_permission';
    if (status === 'unavailable') continue;
    const state = automationState[status];
    rows.push({
      id,
      name,
      why: detail,
      guide:
        state === 'denied'
          ? `In Automation, expand Sia and turn on ${name}.`
          : `Choose Allow when macOS asks if Sia can control ${name}.`,
      optional: true,
      state,
      guided: true,
      request: () => api.requestAutomationPermission(id),
    });
  }
  const messages = computer.messagesAccess;
  if (messages && messages !== 'unavailable' && api.setupMessages)
    rows.push({
      id: 'messages_history',
      name: 'Read Messages history',
      why: 'Lets Sia find earlier texts. In Full Disk Access, add Sia and turn it on.',
      guide:
        'In Full Disk Access, turn on Sia. If it is not listed, use + to add Sia from Applications. This is optional; skip it if you do not want Sia to read earlier texts.',
      optional: true,
      state: messages === 'ready' ? 'ready' : 'needed',
      guided: true,
      request: () => api.setupMessages!(),
    });
  return rows;
}

export function SetupMacAccess({
  snapshot,
  api,
  agentId,
  disabled,
  onBusyChange,
  autoStart = false,
  compact = false,
  onComplete,
  onReadyChange,
  includeApps = false,
  initialSkipped,
  onRestart,
  onPause,
}: {
  snapshot: RendererSnapshot;
  api: MacSetupApi;
  agentId: string | undefined;
  disabled: boolean;
  onBusyChange(busy: boolean): void;
  autoStart?: boolean;
  compact?: boolean;
  onComplete?(): Promise<void>;
  /** True once everything Sia needs is allowed; optional rows never block setup. */
  onReadyChange?(ready: boolean): void;
  includeApps?: boolean;
  /** Optional rows skipped before a relaunch, so the resumed pass does not ask again. */
  initialSkipped?: readonly string[] | undefined;
  /** Relaunches Sia and resumes setup at this step; receives the skipped optional rows. */
  onRestart?(skipped: string[]): Promise<void>;
  onPause?(): void;
}) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [rowPending, setRowPending] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<readonly string[]>(initialSkipped ?? []);
  const [asked, setAsked] = useState<readonly string[]>([]);
  const requested = useRef(new Set<string>());
  const requesting = useRef(false);
  const refreshing = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const automaticallyStarted = useRef(false);
  const latest = useRef({ api, onComplete });
  latest.current = { api, onComplete };
  const rows = macAccessRows(snapshot, api, {
    agentId,
    includeApps,
    canRelaunch: Boolean(onRestart),
  });
  const shown = rows.filter((row) => row.state !== 'unavailable');
  const readyCount = shown.filter((row) => row.state === 'ready').length;
  const required = rows.filter((row) => !row.optional);
  const requiredReady = required.every((row) => row.state === 'ready');
  const relaunch = rows.filter((row) => row.state === 'relaunch');
  // The guided pass walks every row with a native prompt that still needs the person.
  const current = rows.find(
    (row) =>
      row.guided &&
      (row.state === 'needed' || row.state === 'denied' || row.state === 'error') &&
      !skipped.includes(row.id),
  );
  const currentRef = useRef(current);
  currentRef.current = current;
  const relaunchRef = useRef(relaunch.length);
  relaunchRef.current = relaunch.length;
  const walk = rows.filter(
    (row) => row.guided && row.state !== 'unavailable' && !skipped.includes(row.id),
  );
  useEffect(() => {
    onReadyChange?.(requiredReady);
  }, [onReadyChange, requiredReady]);
  useEffect(() => {
    onBusyChange(active || Boolean(rowPending));
    return () => onBusyChange(false);
  }, [active, rowPending, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter, not a DOM ref; unmount must bump the latest value.
      generation.current++;
    };
  }, []);

  const start = () => {
    if (requesting.current) return;
    requested.current.clear();
    setError(undefined);
    setActive(true);
    setRetry((value) => value + 1);
  };
  useEffect(() => {
    if (!autoStart || disabled || automaticallyStarted.current) return;
    automaticallyStarted.current = true;
    start();
  }, [autoStart, disabled]);

  // Passive status checks only read; they never open a prompt. Rows flip without a restart.
  const refreshAccess = async (reportError = false) => {
    if (refreshing.current || requesting.current) return;
    refreshing.current = true;
    try {
      await latest.current.api.refreshComputerPermissions();
    } catch {
      if (reportError && mounted.current) setError('Access could not be checked. Try again.');
    } finally {
      refreshing.current = false;
    }
  };
  const waiting = shown.some((row) => row.state !== 'ready');
  useEffect(() => {
    const refresh = () => void refreshAccess();
    const timer = waiting ? window.setInterval(refresh, active ? 2000 : 5000) : undefined;
    window.addEventListener('focus', refresh);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [active, waiting]);

  useEffect(() => {
    if (!active || disabled || requesting.current) return;
    const step = currentRef.current;
    if (step && requested.current.has(step.id)) return;
    const pass = generation.current;
    if (step) {
      requested.current.add(step.id);
      setAsked((ids) => (ids.includes(step.id) ? ids : [...ids, step.id]));
    }
    requesting.current = true;
    setPending(true);
    setError(undefined);
    void (async () => {
      try {
        if (step) {
          await step.request?.(() => pass === generation.current);
          if (pass !== generation.current) return;
          await latest.current.api.refreshComputerPermissions();
        } else {
          setActive(false);
          // A grant waiting for a relaunch finishes with the Relaunch button, not here.
          if (!relaunchRef.current) await latest.current.onComplete?.();
        }
      } catch (cause) {
        if (pass === generation.current)
          setError(errorMessage(cause, 'Setup needs another try.'));
      } finally {
        requesting.current = false;
        if (mounted.current) {
          setPending(false);
          setRetry((value) => value + 1);
        }
      }
    })();
  }, [active, disabled, current?.id, retry]);

  const pause = () => {
    generation.current++;
    setActive(false);
    setPending(false);
    setError(undefined);
  };
  const relaunchNow = () => {
    pause();
    void onRestart?.([...skipped]).catch((cause: unknown) =>
      setError(errorMessage(cause, 'Sia could not relaunch. Try again.')),
    );
  };
  const requestRow = async (row: AccessRow) => {
    if (!row.request || requesting.current) return;
    requesting.current = true;
    setRowPending(row.id);
    setAsked((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]));
    setSkipped((ids) => ids.filter((id) => id !== row.id));
    setError(undefined);
    try {
      await row.request(() => mounted.current);
      await latest.current.api.refreshComputerPermissions();
    } catch (cause) {
      if (mounted.current) setError(errorMessage(cause, 'Setup needs another try.'));
    } finally {
      requesting.current = false;
      if (mounted.current) setRowPending(undefined);
    }
  };
  // Fallback when macOS gives no signal: a core grant asked for here that still reads as off.
  const maybeStale =
    Boolean(onRestart) &&
    shown.some(
      (row) =>
        (!row.optional || row.id === 'messages_history') &&
        row.state === 'needed' &&
        asked.includes(row.id),
    );
  const busy = pending || Boolean(rowPending);

  const renderRow = (row: AccessRow) => {
    const action = row.state === 'denied' || !row.guided ? 'Open Settings' : 'Allow';
    return (
      <li className={styles.permission} key={row.id} data-state={row.state}>
        <div>
          <strong>{row.name}</strong>
          <p>{row.why}</p>
        </div>
        <span className={styles.permissionEnd}>
          <span className={row.state === 'ready' ? styles.ready : styles.status}>
            {row.state === 'ready' ? (
              <Check size={11} weight="bold" aria-hidden="true" />
            ) : null}
            {STATE_LABEL[row.state]}
          </span>
          {row.request && row.state !== 'ready' && row.state !== 'relaunch' ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              disabled={disabled || busy}
              aria-label={`${action}: ${row.name}`}
              onClick={() => void requestRow(row)}
            >
              {rowPending === row.id ? 'Waiting…' : action}
            </button>
          ) : null}
        </span>
      </li>
    );
  };

  return (
    <section aria-label="Guided Mac permissions">
      {!compact && <h3>Set up Mac access in one go</h3>}
      <p className={styles.accessSummary} role="status">
        <strong>
          {requiredReady && !current
            ? 'Mac access is ready.'
            : `${readyCount} of ${shown.length} permissions ready`}
        </strong>
        <span>
          Grant all goes through each one and moves on when macOS says it’s on. You approve
          macOS dialogs; your password stays with macOS.
        </span>
        <span className={styles.meter} aria-hidden="true">
          <span
            style={{ width: `${shown.length ? (readyCount / shown.length) * 100 : 100}%` }}
          />
        </span>
      </p>
      {relaunch.length && (!active || !current) ? (
        <div className={styles.permissionGuide} role="alert">
          <h3>Relaunch Sia to finish</h3>
          <p>
            {relaunch.map((row) => row.name).join(' and ')} {relaunch.length > 1 ? 'are' : 'is'}{' '}
            turned on. macOS applies it after Sia reopens.
            {onRestart ? ' Setup picks up right here.' : ' Quit and reopen Sia.'}
          </p>
          {onRestart ? (
            <button className={buttons.primaryButton} disabled={disabled} onClick={relaunchNow}>
              Relaunch Sia
            </button>
          ) : null}
        </div>
      ) : null}
      {active && current && (
        <div className={styles.permissionGuide}>
          <span className={styles.eyebrow}>
            Step {walk.indexOf(current) + 1} of {walk.length}
            {current.optional ? ' · Optional' : ''}
          </span>
          <h3>{current.name}</h3>
          <p>{current.guide}</p>
          <p className={styles.note}>
            Keep this guide open. Already allowed permissions are skipped.
          </p>
          <div className={styles.siteButtons}>
            <button
              className={buttons.secondaryButton}
              disabled={pending}
              onClick={() => {
                requested.current.delete(current.id);
                setRetry((value) => value + 1);
              }}
            >
              {current.state === 'denied' ? 'Open System Settings' : 'I don’t see the prompt'}
            </button>
            {current.optional ? (
              <button
                className={buttons.secondaryButton}
                disabled={pending}
                onClick={() => {
                  setSkipped((ids) => [...ids, current.id]);
                  setRetry((value) => value + 1);
                }}
              >
                Skip
              </button>
            ) : null}
            {maybeStale && (!current.optional || current.id === 'messages_history') && (
              <button className={styles.link} disabled={pending} onClick={relaunchNow}>
                Turned it on? Relaunch Sia
              </button>
            )}
            <button
              className={styles.link}
              onClick={() => {
                pause();
                onPause?.();
              }}
            >
              Finish later
            </button>
          </div>
        </div>
      )}
      {!active && current && (
        <button
          className={`${buttons.primaryButton} ${styles.grantAll}`}
          disabled={disabled || busy}
          onClick={start}
        >
          Grant all
        </button>
      )}
      {!active && !relaunch.length && maybeStale && (
        <button className={styles.link} disabled={disabled || busy} onClick={relaunchNow}>
          Turned it on? Relaunch Sia
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.accessList} aria-label="Needed permissions">
        {required.map(renderRow)}
      </ul>
      <p className={styles.groupLabel}>Optional — skip anything you won’t use</p>
      <ul className={styles.accessList} aria-label="Optional permissions">
        {rows.filter((row) => row.optional).map(renderRow)}
      </ul>
      <button
        className={styles.link}
        disabled={disabled || busy}
        onClick={() => void refreshAccess(true)}
      >
        Check access
      </button>
    </section>
  );
}
