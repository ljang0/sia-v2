import { Check, Cursor } from '@phosphor-icons/react';
import { SiaLogo } from './SiaLogo';
import { useEffect, useRef, useState } from 'react';
import type { RendererApi, RendererSnapshot } from '../types';
import { dictationReady } from '../voiceReadiness';
import { automationApps, type AutomationStatus } from '../../shared/mac-permissions';
import buttons from '../styles/buttons.module.css';
import styles from './Onboarding.module.css';
import { errorMessage } from '../plainErrors';
import guide from './SetupMacAccess.module.css';

export type MacSetupApi = Pick<
  RendererApi,
  | 'requestComputerPermissions'
  | 'refreshComputerPermissions'
  | 'requestAutomationPermission'
  | 'configureVoice'
  | 'configurePushToTalk'
> &
  Partial<Pick<RendererApi, 'setupMessages'>>;

/** The System Settings pane where each guided row's switch lives. */
const SETTINGS_PANE: Record<string, string> = {
  accessibility: 'Accessibility',
  screen: 'Screen Recording',
  voice: 'Microphone',
  messages_history: 'Full Disk Access',
};

/** What a row needs from the person right now. */
type AccessState =
  'ready' | 'needed' | 'closed' | 'denied' | 'relaunch' | 'unavailable' | 'error';

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
  closed: 'Open to check',
  denied: 'Turned off',
  relaunch: 'Reopen to finish',
  unavailable: 'Unavailable',
  error: 'Could not check',
};

const automationState: Record<AutomationStatus, AccessState> = {
  ready: 'ready',
  needs_permission: 'needed',
  not_running: 'closed',
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
        'In System Settings, open Accessibility and turn on Sia. If macOS asks for your password, enter it in the macOS window.',
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
        ? 'In System Settings, open Screen & System Audio Recording and turn on Sia. If macOS offers to quit Sia, choose Later. Sia shows a Reopen button when it’s needed.'
        : 'In System Settings, open Screen & System Audio Recording and turn on Sia. If macOS asks, quit and reopen Sia.',
      optional: false,
      state: core('screenRecording'),
      guided: true,
      request: () => api.requestComputerPermissions('screenRecording'),
    },
    voiceAvailable
      ? {
          id: 'voice',
          name: 'Talk with Fn',
          why: 'Hold the Fn key and speak instead of typing. Uses your microphone.',
          guide:
            'Choose Allow for the microphone and for Speech Recognition if macOS asks. Setup does not record your voice.',
          // Voice also needs a voice service, which can be briefly unavailable; it never blocks.
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
        state === 'closed'
          ? `Open ${name} so macOS can check it. If macOS asks, choose Allow.`
          : state === 'denied'
            ? `In System Settings, open Automation, find Sia, and turn on ${name}.`
            : `Choose Allow when macOS asks if Sia can control ${name}.`,
      optional: false,
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
      why: 'Lets Sia find earlier texts. macOS calls this “Full Disk Access”.',
      guide:
        'In System Settings, open Full Disk Access and turn on Sia. If Sia isn’t listed, click + and choose Sia from Applications.',
      optional: false,
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
  // Rows seen waiting in this view; only these play the settle when they turn ready.
  const waited = useRef(new Set<string>());
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
  // A row macOS cannot offer on this Mac (an app that is not installed) never blocks setup.
  const requiredReady = required.every(
    (row) => row.state === 'ready' || row.state === 'unavailable',
  );
  const relaunch = rows.filter((row) => row.state === 'relaunch');
  // The guided pass walks every row with a native prompt that still needs the person.
  const current = rows.find(
    (row) =>
      row.guided &&
      (row.state === 'needed' ||
        row.state === 'closed' ||
        row.state === 'denied' ||
        row.state === 'error') &&
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
      setError(errorMessage(cause, 'Sia could not reopen. Try again.')),
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
    const action =
      row.state === 'closed'
        ? 'Open app'
        : row.state === 'denied' || !row.guided
          ? 'Open Settings'
          : 'Allow';
    if (row.state !== 'ready') waited.current.add(row.id);
    return (
      <li
        className={styles.permission}
        key={row.id}
        data-state={row.state}
        data-settled={(row.state === 'ready' && waited.current.has(row.id)) || undefined}
        data-current={(active && current?.id === row.id) || undefined}
      >
        <div>
          <strong>{row.name}</strong>
          <p>{row.why}</p>
        </div>
        <span className={styles.permissionEnd}>
          <span className={row.state === 'ready' ? styles.ready : styles.status}>
            {row.state === 'ready' ? (
              <Check size={14} weight="bold" aria-hidden="true" />
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
    <section className={styles.accessSection} aria-label="Guided Mac permissions">
      {!compact && <h3>Set up Mac access in one go</h3>}
      <p className={styles.accessSummary} role="status">
        <strong key={readyCount} data-ready={(requiredReady && !current) || undefined}>
          {requiredReady && !current
            ? 'Mac access is ready.'
            : `${readyCount} of ${shown.length} permissions ready`}
        </strong>
        <span>
          Allow all walks you through each one and moves on once it’s on. You approve every
          macOS prompt, and your password stays with macOS.
        </span>
        {shown.some((row) => row.state === 'closed') && (
          <span>Some apps need to be open before macOS can check them.</span>
        )}
        <span
          className={styles.meter}
          aria-hidden="true"
          data-full={readyCount === shown.length || undefined}
        >
          <span
            style={{ transform: `scaleX(${shown.length ? readyCount / shown.length : 1})` }}
          />
        </span>
      </p>
      {relaunch.length && (!active || !current) ? (
        <div className={styles.permissionGuide} role="alert">
          <h3>Reopen Sia to finish</h3>
          <p>
            {relaunch.map((row) => row.name).join(' and ')} {relaunch.length > 1 ? 'are' : 'is'}{' '}
            turned on. macOS applies it after Sia reopens.
            {onRestart ? ' Setup picks up right here.' : ' Quit Sia, then open it again.'}
          </p>
          {onRestart ? (
            <button className={buttons.primaryButton} disabled={disabled} onClick={relaunchNow}>
              Reopen Sia
            </button>
          ) : null}
        </div>
      ) : null}
      {active && current && (
        // Keyed so each step of the pass arrives on its own instead of swapping text in place.
        <div className={styles.permissionGuide} key={current.id}>
          {compact && current.state !== 'closed' ? (
            <div className={guide.permissionIllustration} aria-hidden="true">
              <div className={guide.settingsDots}>
                <i />
                <i />
                <i />
              </div>
              <span>Privacy &amp; Security</span>
              <div className={guide.settingsRow}>
                <SiaLogo />
                <strong>Sia</strong>
                <span className={guide.settingsToggle} />
                <Cursor size={22} weight="fill" className={guide.settingsCursor} />
              </div>
              <small>Turn on Sia in {SETTINGS_PANE[current.id] ?? 'Automation'}</small>
            </div>
          ) : null}
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
                Turned it on? Reopen Sia
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
          Allow all
        </button>
      )}
      {!active && !relaunch.length && maybeStale && (
        <button className={styles.link} disabled={disabled || busy} onClick={relaunchNow}>
          Turned it on? Reopen Sia
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
      {rows.some((row) => row.optional) ? (
        <>
          <p className={styles.groupLabel}>Optional: skip anything you won’t use</p>
          <ul className={styles.accessList} aria-label="Optional permissions">
            {rows.filter((row) => row.optional).map(renderRow)}
          </ul>
        </>
      ) : null}
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
