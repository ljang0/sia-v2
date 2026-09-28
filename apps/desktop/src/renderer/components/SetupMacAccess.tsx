import { useEffect, useRef, useState } from 'react';
import type { RendererApi, RendererSnapshot } from '../types';
import { dictationReady } from '../voiceReadiness';
import { automationApps, automationStatusLabel } from '../../shared/mac-permissions';
import ui from '../ui.module.css';
import styles from './Onboarding.module.css';

export type MacSetupApi = Pick<
  RendererApi,
  | 'requestComputerPermissions'
  | 'refreshComputerPermissions'
  | 'requestAutomationPermission'
  | 'configureVoice'
  | 'configurePushToTalk'
>;

type AccessStep = {
  id: string;
  name: string;
  ready: boolean;
  detail: string;
  request(isCurrent: () => boolean): Promise<void>;
};

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
  onReadyChange?(ready: boolean): void;
  includeApps?: boolean;
  onRestart?(): Promise<void>;
  onPause?(): void;
}) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string>();
  const requested = useRef(new Set<string>());
  const requesting = useRef(false);
  const refreshing = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const automaticallyStarted = useRef(false);
  const latest = useRef({ api, onComplete });
  latest.current = { api, onComplete };
  const voiceAvailable =
    Boolean(snapshot.voice.pushToTalk?.available) &&
    snapshot.voice.dictationAvailable !== false &&
    Boolean(agentId);
  const steps: AccessStep[] = [
    {
      id: 'accessibility',
      name: 'Control your Mac',
      ready: snapshot.computer.accessibility === 'allowed',
      detail:
        'In Accessibility, turn on Sia. If macOS asks, enter your password in its own dialog.',
      request: () => api.requestComputerPermissions(),
    },
    {
      id: 'screen',
      name: 'See your screen',
      ready: snapshot.computer.screenRecording === 'allowed',
      detail: onRestart
        ? 'In Screen & System Audio Recording, turn on Sia. If asked to quit, choose Later and use the restart button below.'
        : 'In Screen & System Audio Recording, turn on Sia. Quit and reopen Sia if macOS asks you to restart.',
      request: () => api.requestComputerPermissions(),
    },
    ...(voiceAvailable
      ? [
          {
            id: 'voice',
            name: 'Use Fn and your microphone',
            ready: dictationReady(snapshot.voice),
            detail:
              'Allow the microphone and any Speech Recognition prompt. Setup does not record your voice.',
            request: async (isCurrent: () => boolean) => {
              if (snapshot.voice.status !== 'connected') await api.configureVoice();
              if (!isCurrent()) return;
              await api.configurePushToTalk(true, agentId!, true);
            },
          },
        ]
      : []),
    ...(includeApps
      ? automationApps.flatMap(({ id, name }) => {
          const status = snapshot.computer.automation?.[id] ?? 'needs_permission';
          if (status === 'unavailable') return [];
          return [
            {
              id,
              name,
              ready: status === 'ready',
              detail:
                status === 'denied'
                  ? `In Automation, expand Sia and turn on ${name}.`
                  : `Allow Sia to control ${name} in the macOS prompt. ${automationStatusLabel[status]}.`,
              request: () => api.requestAutomationPermission(id),
            },
          ];
        })
      : []),
  ];
  const ready = steps.filter((step) => step.ready).length;
  const current = steps.find((step) => !step.ready);
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    onReadyChange?.(!current);
  }, [onReadyChange, Boolean(current)]);
  useEffect(() => {
    onBusyChange(active);
    return () => onBusyChange(false);
  }, [active, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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

  // The shared checklist owns passive refresh, including return from Settings while paused.
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
  useEffect(() => {
    const refresh = () => void refreshAccess();
    const timer = active ? window.setInterval(refresh, 2000) : undefined;
    window.addEventListener('focus', refresh);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [active]);

  useEffect(() => {
    if (!active || disabled || requesting.current) return;
    const step = currentRef.current;
    if (step && requested.current.has(step.id)) return;
    const pass = generation.current;
    if (step) requested.current.add(step.id);
    requesting.current = true;
    setPending(true);
    setError(undefined);
    void (async () => {
      try {
        if (step) {
          await step.request(() => pass === generation.current);
          if (pass !== generation.current) return;
          await latest.current.api.refreshComputerPermissions();
        } else {
          setActive(false);
          await latest.current.onComplete?.();
        }
      } catch (cause) {
        if (pass === generation.current)
          setError(cause instanceof Error ? cause.message : 'Setup needs another try.');
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
  return (
    <section aria-label="Guided Mac permissions">
      {!compact && <h3>Set up Mac access in one go</h3>}
      <p className={styles.accessSummary} role="status">
        <strong>
          {current ? `${ready} of ${steps.length} permissions ready` : 'Mac access is ready.'}
        </strong>
        <span>
          Sia opens each step and moves on when access is granted. You approve macOS dialogs;
          your password stays with macOS.
        </span>
      </p>
      {active && current && (
        <div className={styles.permissionGuide}>
          <span className={styles.eyebrow}>
            STEP {steps.indexOf(current) + 1} OF {steps.length}
          </span>
          <h3>{current.name}</h3>
          <p>{current.detail}</p>
          <p className={styles.note}>
            Keep this guide open. Already allowed permissions are skipped.
          </p>
          <div className={styles.siteButtons}>
            <button
              className={ui.secondaryButton}
              disabled={pending}
              onClick={() => {
                requested.current.delete(current.id);
                setRetry((value) => value + 1);
              }}
            >
              I don’t see the prompt
            </button>
            {current.id === 'screen' && onRestart && (
              <button
                className={styles.link}
                disabled={pending}
                onClick={() => {
                  pause();
                  void onRestart().catch(() => setError('Sia could not restart. Try again.'));
                }}
              >
                I enabled it — restart Sia
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
          className={ui.primaryButton}
          disabled={disabled || requesting.current}
          onClick={start}
        >
          Set up permissions
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.accessList} aria-label="Core permissions">
        {steps
          .filter((step) => ['accessibility', 'screen', 'voice'].includes(step.id))
          .map((step) => (
            <li className={styles.permission} key={step.id}>
              <div>
                <strong>{step.name}</strong>
                <p>{step.detail}</p>
              </div>
              <span className={step.ready ? styles.ready : styles.status}>
                {step.ready ? 'Allowed' : 'Needs access'}
              </span>
            </li>
          ))}
        {!voiceAvailable && (
          <li className={styles.permission}>
            <div>
              <strong>Voice and microphone</strong>
              <p>
                {snapshot.voice.dictationDetail ?? 'Voice setup is unavailable on this device.'}
              </p>
            </div>
            <span className={styles.status}>Unavailable</span>
          </li>
        )}
      </ul>
      <button
        className={styles.link}
        disabled={disabled || pending}
        onClick={() => void refreshAccess(true)}
      >
        Check access
      </button>
      {includeApps && (
        <details className={styles.details}>
          <summary>App permissions</summary>
          <ul className={styles.accessList}>
            {steps
              .filter((step) => !['accessibility', 'screen', 'voice'].includes(step.id))
              .map((step) => (
                <li className={styles.permission} key={step.id}>
                  <strong>{step.name}</strong>
                  <span className={step.ready ? styles.ready : styles.status}>
                    {step.ready ? 'Allowed' : 'Needs access'}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
