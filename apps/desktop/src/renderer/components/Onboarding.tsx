import {
  ChatsCircle,
  Check,
  CheckCircle,
  CursorClick,
  LockKey,
  Lightning,
  Microphone,
  Moon,
  PlugsConnected,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OnboardingStep } from '../../shared/bridge';
import { modelChoices } from '../agentModels';
import { focusComposer } from '../composerFocus';
import { STARTER_INSTRUCTIONS } from '../welcome';
import type { RendererApi, RendererSnapshot } from '../types';
import { SetupConnections } from './OnboardingConnections';
import { SetupMacAccess } from './SetupMacAccess';
import { FnPractice } from './FnPractice';
import { SiaLogo } from './SiaLogo';
import { ProvidersSettings } from './settings/ProvidersSettings';
import buttons from '../styles/buttons.module.css';
import layout from '../styles/layout.module.css';
import styles from './Onboarding.module.css';
import { errorMessage } from '../plainErrors';
import { dictationReady } from '../voiceReadiness';

export function onboardingStep(snapshot: RendererSnapshot): OnboardingStep | undefined {
  const progress = snapshot.preferences.onboarding;
  if (progress?.step === 'complete') return undefined;
  if (!progress) return snapshot.agents.length ? undefined : 'welcome';
  if (
    ['voice', 'access', 'apps', 'restart', 'verify', 'practice'].includes(progress.step) &&
    !snapshot.agents.some(({ id }) => id === progress.agentId)
  )
    return 'welcome';
  return progress.step;
}

const INCLUDED: readonly { icon: Icon; title: string; detail: string }[] = [
  {
    icon: CursorClick,
    title: 'Screen and keyboard control',
    detail: 'So Sia can click, type, and read what is on screen for you.',
  },
  {
    icon: Microphone,
    title: 'Talk instead of typing',
    detail: 'Hold the Fn key and speak. Uses your microphone.',
  },
  {
    icon: LockKey,
    title: 'You stay in charge',
    detail: 'You approve each macOS prompt. Your passwords stay with macOS.',
  },
];

const CONNECTED_INCLUDED: typeof INCLUDED = [
  {
    icon: ChatsCircle,
    title: 'Start with a conversation',
    detail: 'Ask questions, make plans, or draft something right away.',
  },
  {
    icon: PlugsConnected,
    title: 'Connect only what you need',
    detail: 'Choose Google Workspace or Slack, then approve each account.',
  },
  {
    icon: LockKey,
    title: 'No Mac permissions needed',
    detail: 'Screen control and voice can be added later in Settings.',
  },
];

/** Where the person is in setup: a short, fixed path so progress is always clear. */
function SetupProgress({
  stage,
  connected,
  practice,
}: {
  stage: number;
  connected: boolean;
  practice: boolean;
}) {
  return (
    <ol className={styles.progress} aria-label="Setup progress">
      {['Welcome', connected ? 'Connections' : 'Mac access', practice ? 'Try Fn' : 'Ready'].map(
        (label, index) => (
          <li
            key={label}
            data-state={index < stage ? 'done' : index === stage ? 'current' : 'todo'}
            aria-current={index === stage ? 'step' : undefined}
          >
            <span className={styles.progressMark} aria-hidden="true">
              {index < stage ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ),
      )}
    </ol>
  );
}

export function Onboarding({
  snapshot,
  api,
  onCustomize,
  onModels,
  onAccount,
  children,
}: {
  snapshot: RendererSnapshot;
  api: RendererApi;
  onCustomize(): void;
  onModels(): void;
  onAccount(): void;
  children: ReactNode;
}) {
  const step = onboardingStep(snapshot);
  const starting = step === 'welcome' || step === 'agent';
  const practicing = step === 'practice';
  const voiceReady = dictationReady(snapshot.voice);
  // The practice preview finishes only on a real native transcript, never a simulated key event.
  const practiceDone = Boolean(
    snapshot.voice.pushToTalk?.practice &&
    snapshot.voice.pushToTalk.practiceTranscript?.trim() &&
    snapshot.voice.pushToTalk.phase === 'idle',
  );
  const [name, setName] = useState('Sia');
  const [model, setModel] = useState('');
  const [pending, setPending] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [startPermissions, setStartPermissions] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [permissionPassComplete, setPermissionPassComplete] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const autoFinished = useRef(false);
  const [error, setError] = useState<string>();
  const [celebrate, setCelebrate] = useState(false);
  const customize = useRef<HTMLDetailsElement>(null);
  const [setupRoute, setSetupRoute] = useState<'mac-bypass' | 'connected'>(() =>
    snapshot.agents.length && snapshot.computer.accessMode === 'connected'
      ? 'connected'
      : 'mac-bypass',
  );
  // Bypass is the default for every route; confirmations are an explicit opt-in.
  const [confirmActions, setConfirmActions] = useState(snapshot.computer.trust === 'ask');
  const working = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  const agent = snapshot.agents.find(
    ({ id }) => id === snapshot.preferences.onboarding?.agentId,
  );
  const choices = modelChoices(snapshot.providers);
  const choice =
    choices.find((item) => `${item.provider}:${item.model}` === model) ??
    (setupRoute === 'mac-bypass'
      ? choices.find(
          (item) => item.ready && item.provider === 'codex' && item.model === 'gpt-6-astra',
        )
      : undefined) ??
    choices.find((item) => item.ready);
  const restarting = Boolean(snapshot.preferences.onboarding?.restartPending);
  const connectedSetup = setupRoute === 'connected';
  const aiReady = Boolean(agent || choice?.ready);
  const codexSetupBusy = snapshot.providers.some(
    ({ setup }) => setup && setup.phase !== 'error',
  );
  const connecting = snapshot.apps.some((app) => app.status === 'connecting');
  const busy = pending || permissionBusy || restarting || codexSetupBusy;
  // An approval opens the section; keep it open afterwards so its result and errors stay visible.
  const showConnections = step === 'apps' || connecting;
  useEffect(() => {
    if (showConnections) setConnectionsOpen(true);
  }, [showConnections]);

  useEffect(() => {
    title.current?.focus();
  }, [starting, practicing]);
  // Finishing or leaving setup lands in the first conversation, ready to type.
  const inSetup = Boolean(step);
  const wasInSetup = useRef(inSetup);
  useEffect(() => {
    if (wasInSetup.current && !inSetup) focusComposer();
    wasInSetup.current = inSetup;
  }, [inSetup]);
  // Resuming setup only checks status. The shared checklist handles focus refreshes.
  useEffect(() => {
    if (!inSetup || starting || restarting || connectedSetup) return;
    void api.refreshComputerPermissions().catch(() => undefined);
  }, [api, inSetup, starting, restarting, connectedSetup]);

  const run = async (action: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, 'Setup could not finish. Try again.'));
    } finally {
      working.current = false;
      setPending(false);
    }
  };
  const start = () =>
    void run(async () => {
      autoFinished.current = false;
      setPermissionPassComplete(false);
      await api.setComputerAccessMode(setupRoute === 'mac-bypass' ? 'mac' : 'connected');
      await api.setComputerTrust(confirmActions ? 'ask' : 'auto');
      if (!agent && choice?.ready)
        await api.createAgent({
          name: name.trim(),
          instructions: STARTER_INSTRUCTIONS,
          provider: choice.provider,
          model: choice.model,
          workspace: '',
          startOnboarding: true,
        });
      await api.setOnboarding(connectedSetup ? 'apps' : 'voice', {
        includeApps: !connectedSetup,
        active: !connectedSetup,
      });
      setConnectionsOpen(connectedSetup);
      setStartPermissions(!connectedSetup);
    });
  const finish = () =>
    void run(async () => {
      const thread = agent?.threads.find((item) => !item.archivedAt);
      if (thread) await api.selectThread(thread.id);
      else if (agent) await api.createThread(agent.id);
      await api.setOnboarding('complete');
      setCelebrate(true);
    });

  // Fn voice stays optional: practice is offered only when dictation is already ready.
  const practice = () =>
    void run(() =>
      api.setOnboarding('practice', { includeApps: !connectedSetup, active: false }),
    );

  // Only a completed, user-started permission pass can advance automatically.
  // An authorized restart resumes only missing steps; passive status checks do not prompt.
  useEffect(() => {
    if (
      !step ||
      starting ||
      practicing ||
      !agent ||
      !permissionPassComplete ||
      !accessReady ||
      busy ||
      connecting ||
      connectionsOpen ||
      autoFinished.current
    )
      return;
    autoFinished.current = true;
    if (voiceReady && !connectedSetup) practice();
    else finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish is recreated every render.
  }, [
    step,
    starting,
    practicing,
    voiceReady,
    connectedSetup,
    agent,
    permissionPassComplete,
    accessReady,
    busy,
    connecting,
    connectionsOpen,
  ]);

  if (!step)
    return (
      <>
        {children}
        {/* The note points at the suggestions; once a conversation starts it would only cover it. */}
        {celebrate && !snapshot.activeThread?.events.length ? (
          <SetupDoneToast onDone={() => setCelebrate(false)} />
        ) : null}
      </>
    );
  // Stay on Mac access while a Grant all pass is still walking its rows.
  const done = !starting && !practicing && !restarting && accessReady && !permissionBusy;
  return (
    <main className={styles.setup} aria-label="Welcome to Sia">
      <section className={styles.stage}>
        <div className={styles.topline}>
          <div className={styles.brand} aria-hidden="true">
            <SiaLogo /> Sia
          </div>
          <SetupProgress
            stage={starting ? 0 : practicing || done ? 2 : 1}
            connected={connectedSetup}
            practice={practicing || (!connectedSetup && voiceReady)}
          />
        </div>
        {/* Keyed so moving from welcome to permissions plays one calm entrance. */}
        <div
          key={starting ? 'welcome' : practicing ? 'practice' : 'access'}
          className={styles.stageBody}
        >
          {done ? (
            <span className={styles.doneMark} aria-hidden="true">
              <CheckCircle size={30} weight="fill" />
            </span>
          ) : null}
          <h1
            ref={title}
            tabIndex={-1}
            data-done={done || undefined}
            className={done ? layout.gradientHeading : undefined}
          >
            {starting
              ? 'Let’s set up Sia.'
              : connectedSetup
                ? 'Connect the apps you use.'
                : practicing
                  ? 'A little less typing.'
                  : done
                    ? 'You’re all set.'
                    : 'Give Sia access to your Mac.'}
          </h1>
          <p className={styles.intro} data-done={done || undefined}>
            {starting
              ? 'A few quick steps, then Sia can help with everyday tasks in the apps you already use.'
              : connectedSetup
                ? 'Choose the accounts you want Sia to use. You can also start chatting now and connect them later. No Mac permissions are needed.'
                : practicing
                  ? 'Hold Fn. Speak. Release. That’s all there is to it.'
                  : done
                    ? 'Sia is ready to help. Connect more apps below, or jump right in.'
                    : 'Sia walks you through each permission, one at a time. You approve each one in macOS. You can pause and keep chatting anytime.'}
          </p>
          {starting ? (
            <>
              <ul className={styles.included} aria-label="Included in setup">
                {(connectedSetup ? CONNECTED_INCLUDED : INCLUDED).map(
                  ({ icon: ItemIcon, title: label, detail }) => (
                    <li key={label}>
                      <span className={styles.includedIcon} aria-hidden="true">
                        <ItemIcon size={18} />
                      </span>
                      <span>
                        <strong>{label}</strong>
                        <span>{detail}</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {!agent && !choices.some((item) => item.ready) ? (
                <div className={styles.providerSetup}>
                  <ProvidersSettings
                    providers={snapshot.providers}
                    onProbe={(id) => api.refreshProvider(id)}
                    onOpenProviderSetup={(id) => api.openProviderSetup(id)}
                    onCancelProviderSetup={(id) => api.cancelProviderSetup(id)}
                    onOpenCloudSettings={onAccount}
                  />
                </div>
              ) : null}
              {/* Owner decision: Sia acts without per-step approval by default. Say so plainly,
                  with a one-click way to opt into confirmations before setup starts. */}
              <section className={styles.modeSummary} aria-labelledby="setup-autonomy-title">
                <span className={styles.includedIcon} aria-hidden="true">
                  {confirmActions ? <ChatsCircle size={18} /> : <Lightning size={18} />}
                </span>
                <div>
                  <h2 id="setup-autonomy-title">
                    {confirmActions ? 'Sia asks you first' : 'Sia acts on its own'}
                  </h2>
                  <p>
                    {confirmActions
                      ? 'Before Sia sends a message, changes a file, or clicks anything, it shows you and waits for your OK.'
                      : connectedSetup
                        ? 'For example, it can send a Slack message or create a Gmail draft without asking you first.'
                        : 'For example, it can send an email, move a file, or click through a website without asking you first.'}
                  </p>
                  <div className={styles.modeActions}>
                    <button
                      type="button"
                      className={buttons.secondaryButton}
                      disabled={busy || connecting}
                      onClick={() => setConfirmActions((value) => !value)}
                    >
                      {confirmActions ? 'Let Sia act on its own' : 'Ask me first instead'}
                    </button>
                    <button
                      type="button"
                      className={styles.link}
                      disabled={busy || connecting}
                      onClick={() => {
                        const details = customize.current;
                        if (!details) return;
                        details.open = true;
                        details.scrollIntoView?.({ block: 'nearest' });
                        details.querySelector<HTMLInputElement>('input:checked')?.focus();
                      }}
                    >
                      More choices
                    </button>
                  </div>
                </div>
              </section>
              {aiReady ? (
                <div className={styles.actions}>
                  <button
                    className={buttons.primaryButton}
                    disabled={
                      busy || connecting || (!agent && (!name.trim() || !choice?.ready))
                    }
                    onClick={start}
                  >
                    {pending ? 'Setting up Sia…' : 'Set up Sia'}
                  </button>
                </div>
              ) : (
                <p className={styles.note}>Connect an AI service above to continue.</p>
              )}
              <details ref={customize} className={styles.details}>
                <summary>Customize setup</summary>
                <fieldset className={styles.setupChoices} disabled={busy || connecting}>
                  <legend>How Sia works</legend>
                  <label className={styles.setupChoice}>
                    <input
                      type="radio"
                      name="setup-route"
                      checked={setupRoute === 'mac-bypass'}
                      onChange={() => setSetupRoute('mac-bypass')}
                    />
                    <span className={styles.choiceIcon} aria-hidden="true">
                      <Moon size={18} />
                    </span>
                    <span>
                      <strong>Use my Mac</strong>
                      <span>Works in the background with your signed-in apps.</span>
                    </span>
                  </label>
                  <label className={styles.setupChoice}>
                    <input
                      type="radio"
                      name="setup-route"
                      checked={setupRoute === 'connected'}
                      onChange={() => setSetupRoute('connected')}
                    />
                    <span className={styles.choiceIcon} aria-hidden="true">
                      <PlugsConnected size={18} />
                    </span>
                    <span>
                      <strong>Connected apps only</strong>
                      <span>Works only with the accounts you connect.</span>
                    </span>
                  </label>
                  <label className={styles.setupChoice}>
                    <input
                      type="checkbox"
                      checked={confirmActions}
                      onChange={(event) => setConfirmActions(event.currentTarget.checked)}
                    />
                    <span className={styles.choiceIcon} aria-hidden="true">
                      <ChatsCircle size={18} />
                    </span>
                    <span>
                      <strong>Ask before each action</strong>
                      <span>
                        Off by default. Turn on to approve each message, file change, or click.
                      </span>
                    </span>
                  </label>
                  {!agent ? (
                    <>
                      <label className={styles.field}>
                        Agent name
                        <input
                          maxLength={80}
                          value={name}
                          onChange={(event) => setName(event.currentTarget.value)}
                        />
                      </label>
                      {choice ? (
                        <label className={styles.field}>
                          AI access
                          <select
                            value={`${choice.provider}:${choice.model}`}
                            onChange={(event) => setModel(event.currentTarget.value)}
                          >
                            {choices.map((item) => (
                              <option
                                key={`${item.provider}:${item.model}`}
                                value={`${item.provider}:${item.model}`}
                                disabled={!item.ready}
                              >
                                {item.label}
                                {item.ready ? '' : ' · Setup needed'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  <button className={styles.link} onClick={onModels}>
                    Manage AI access
                  </button>
                  <button className={styles.link} onClick={onCustomize}>
                    Customize an agent instead
                  </button>
                </fieldset>
              </details>
            </>
          ) : practicing ? (
            <>
              {voiceReady ? (
                <FnPractice voice={snapshot.voice.pushToTalk} />
              ) : (
                <p className={styles.note}>
                  Voice isn’t ready on this Mac yet. You can set it up later in Settings →
                  Voice.
                </p>
              )}
              {/* A pending account approval stays visible so it can still be cancelled. */}
              {connecting ? (
                <SetupConnections snapshot={snapshot} api={api} pending={busy} run={run} />
              ) : null}
              <div className={styles.actions}>
                <button
                  className={buttons.primaryButton}
                  disabled={busy || connecting || (voiceReady && !practiceDone)}
                  onClick={finish}
                >
                  Start using Sia
                </button>
                {voiceReady ? (
                  <button
                    className={styles.link}
                    disabled={busy || connecting}
                    onClick={finish}
                  >
                    Skip voice practice
                  </button>
                ) : null}
              </div>
              <p className={styles.note}>
                After setup, hold Fn in any app to ask Sia for help. Press ⌘E to type a quick
                request.
              </p>
            </>
          ) : (
            <>
              {connectedSetup ? null : restarting ? (
                <p role="status">Reopening Sia…</p>
              ) : (
                <SetupMacAccess
                  snapshot={snapshot}
                  api={api}
                  agentId={agent?.id}
                  disabled={pending || connecting}
                  onBusyChange={setPermissionBusy}
                  onReadyChange={setAccessReady}
                  compact
                  autoStart={
                    startPermissions ||
                    Boolean(
                      snapshot.preferences.onboarding?.restarted &&
                      snapshot.preferences.onboarding?.permissionSetup?.active,
                    )
                  }
                  onPause={() => {
                    setStartPermissions(false);
                    void api
                      .setOnboarding(step!, {
                        includeApps: setupRoute === 'mac-bypass',
                        active: false,
                      })
                      .catch(() =>
                        setError('Setup paused. Its saved progress could not update.'),
                      );
                  }}
                  // The one relaunch: saves this step and resumes the pass after reopening.
                  onRestart={async (skipped) => {
                    await api.setOnboarding('verify', {
                      includeApps: setupRoute === 'mac-bypass',
                      active: true,
                      skipped,
                    });
                    await api.restartForOnboarding();
                  }}
                  includeApps={setupRoute === 'mac-bypass'}
                  initialSkipped={snapshot.preferences.onboarding?.permissionSetup?.skipped}
                  onComplete={async () => {
                    setStartPermissions(false);
                    await run(async () => {
                      await api.setOnboarding('verify', {
                        includeApps: setupRoute === 'mac-bypass',
                        active: false,
                      });
                      setPermissionPassComplete(true);
                    });
                  }}
                />
              )}
              <div className={styles.actions}>
                <button
                  className={buttons.primaryButton}
                  // Use my Mac needs every permission; the guide above asks for each in turn.
                  disabled={busy || connecting || (!connectedSetup && !accessReady)}
                  onClick={!connectedSetup && voiceReady ? practice : finish}
                >
                  {!connectedSetup && voiceReady ? 'Try Fn' : 'Start using Sia'}
                </button>
              </div>
              <details
                className={styles.details}
                open={connectionsOpen || showConnections}
                onToggle={(event) => setConnectionsOpen(event.currentTarget.open)}
              >
                <summary>
                  Connect Google or Slack <span>Optional</span>
                </summary>
                <SetupConnections snapshot={snapshot} api={api} pending={busy} run={run} />
              </details>
            </>
          )}
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <footer className={styles.footer}>
          <span>You can change access anytime in Settings.</span>
          <button
            className={styles.link}
            disabled={busy || connecting}
            onClick={() => void run(() => api.setOnboarding('complete'))}
          >
            Exit setup
          </button>
        </footer>
      </section>
    </main>
  );
}

/** A calm, one-time note that setup finished; it steps aside on its own. */
export function SetupDoneToast({ onDone }: { onDone(): void }) {
  const done = useRef(onDone);
  done.current = onDone;
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 6000);
    // Removes the note even when a hidden window suppresses the exit animation's end event.
    const remove = window.setTimeout(() => done.current(), 6400);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(remove);
    };
  }, []);
  return (
    <div
      className={styles.doneToast}
      role="status"
      data-leaving={leaving || undefined}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) done.current();
      }}
    >
      <CheckCircle size={22} weight="fill" aria-hidden="true" />
      <span>
        <strong>You’re all set.</strong> Ask Sia anything, or try a suggestion below.
      </span>
    </div>
  );
}
