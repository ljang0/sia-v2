import { ArrowRight, Check, Cursor, Microphone, Sparkle } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OnboardingStep } from '../../shared/bridge';
import { modelChoices } from '../agentModels';
import type { RendererApi, RendererSnapshot } from '../types';
import {
  SetupConnections,
  SetupBrowser,
  SetupAccessReview,
  accessChecklist,
} from './OnboardingConnections';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import { ProvidersSettings } from './settings/ProvidersSettings';
import ui from '../ui.module.css';
import styles from './Onboarding.module.css';

const steps = [
  'welcome',
  'agent',
  'voice',
  'access',
  'apps',
  'restart',
  'verify',
  'practice',
] as const;
const labels = [
  'Meet Sia',
  'Your agent',
  'Your voice',
  'Your Mac',
  'Your apps',
  'Restart',
  'Check access',
  'Try it',
];
const starterInstructions = `You are Sia, a helpful personal assistant on the user's Mac. Help with everyday questions, writing, planning, research, and tasks in apps. Be concise, warm, and clear. Use the tools available to you to complete requested work. Explain the next step when access is missing. Use the provided action tools and follow the user's selected approval mode; when bypass is enabled, execute permitted actions without asking for each step. Never access passwords, secure fields, or authentication surfaces. Do not claim to have completed an action unless its result confirms it.`;
const practicePrompt = 'Help me make a simple plan for my day. Ask me what I need to get done.';

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

export function Onboarding({
  snapshot,
  api,
  onCustomize,
  onSuggest,
  onModels,
  onAccount,
  children,
}: {
  snapshot: RendererSnapshot;
  api: RendererApi;
  onCustomize(): void;
  onSuggest(text: string): void;
  onModels(): void;
  onAccount(): void;
  children: ReactNode;
}) {
  const step = onboardingStep(snapshot);
  const [name, setName] = useState('Sia');
  const [model, setModel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [setupRoute, setSetupRoute] = useState<'mac-bypass' | 'connected'>('mac-bypass');
  const fastMac = snapshot.computer.accessMode === 'mac' && snapshot.computer.trust === 'auto';
  const setupSteps = steps.filter(
    (item) => item !== 'apps' || !(step === 'welcome' ? setupRoute === 'mac-bypass' : fastMac),
  );
  const restarting = Boolean(snapshot.preferences.onboarding?.restartPending);
  const title = useRef<HTMLHeadingElement>(null);
  const agent = snapshot.agents.find(
    ({ id }) => id === snapshot.preferences.onboarding?.agentId,
  );
  const choices = modelChoices(snapshot.providers);
  const choice =
    choices.find((item) => `${item.provider}:${item.model}` === model) ??
    choices.find((item) => item.ready);
  const ptt = snapshot.voice.pushToTalk;
  const nativeVoice = snapshot.voice.engine === 'macos';
  const voiceReady =
    snapshot.voice.dictationAvailable !== false &&
    ptt?.enabled &&
    ptt.accessibility &&
    ptt.microphone;
  const computerReady =
    snapshot.computer.accessibility === 'allowed' &&
    snapshot.computer.screenRecording === 'allowed';

  useEffect(() => {
    title.current?.focus();
    setError(undefined);
  }, [step]);
  // Returning from macOS Settings rechecks grants without opening another prompt.
  useEffect(() => {
    if (!step || !['access', 'apps', 'verify'].includes(step)) return;
    const refresh = () => {
      void api.refreshComputerPermissions().catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    refresh();
    return () => window.removeEventListener('focus', refresh);
  }, [api, step]);

  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Setup could not continue. Please try again.',
      );
    } finally {
      setPending(false);
    }
  };
  const go = (next: OnboardingStep) => void run(() => api.setOnboarding(next));
  if (!step) return children;
  const index = setupSteps.indexOf(step as (typeof steps)[number]);

  if (step === 'practice') {
    if (!agent || snapshot.activeThread?.agentId !== agent.id) return children;
    const replied = snapshot.activeThread.events.some(
      (event) => event.type === 'message' && event.role === 'assistant',
    );
    return (
      <div className={styles.practice}>
        <section className={styles.coach} aria-label="Try Sia">
          <div className={styles.coachIcon} aria-hidden="true">
            <Sparkle size={22} />
          </div>
          <div className={styles.coachBody}>
            <span className={styles.eyebrow}>
              {setupSteps.length} / {setupSteps.length} · TRY IT
            </span>
            <h2 ref={title} tabIndex={-1}>
              {replied
                ? 'Your first conversation is underway.'
                : 'One small request. A great place to start.'}
            </h2>
            <p>
              {voiceReady
                ? 'Hold Fn until the edges glow. Speak, then release to send. Escape cancels.'
                : 'Type a request in the message box below, then click the arrow to send.'}
            </p>
            {!replied ? (
              <button
                className={styles.prompt}
                disabled={pending || restarting}
                onClick={() => onSuggest(practicePrompt)}
              >
                Try a daily plan <ArrowRight size={14} aria-hidden="true" />
              </button>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
          </div>
          <button
            className={ui.secondaryButton}
            disabled={pending || restarting}
            onClick={() => go('complete')}
          >
            {replied ? 'Finish setup' : 'Finish without trying'}
          </button>
        </section>
        {children}
      </div>
    );
  }

  return (
    <main className={styles.setup} aria-label="Welcome to Sia">
      <nav className={styles.progress} aria-label="Setup progress">
        {setupSteps.map((item, i) => (
          <span
            key={item}
            aria-current={i === index ? 'step' : undefined}
            data-complete={i < index}
          >
            <span>{i < index ? <Check size={12} aria-hidden="true" /> : i + 1}</span>
            <span>{labels[steps.indexOf(item)]}</span>
          </span>
        ))}
      </nav>
      <div
        className={`${styles.stage} ${step === 'welcome' ? styles.welcomeStage : ''} ${['apps', 'restart', 'verify'].includes(step) ? styles.connectionsStage : ''}`}
        key={step}
      >
        <section className={styles.copy}>
          <span className={styles.eyebrow}>A LITTLE SETUP. A LOT LESS BUSYWORK.</span>
          <h1 ref={title} tabIndex={-1}>
            {step === 'welcome'
              ? snapshot.agents.length
                ? 'Make yourself at home.'
                : 'Create your first agent.'
              : step === 'agent'
                ? 'Meet your everyday helper.'
                : step === 'voice'
                  ? 'Just say the word.'
                  : step === 'access'
                    ? 'A helping hand on your Mac.'
                    : step === 'apps'
                      ? 'Bring your apps along.'
                      : step === 'restart'
                        ? 'One fresh start. Then you’re ready.'
                        : fastMac
                          ? 'Let’s check your Mac access.'
                          : 'Let’s check your connections.'}
          </h1>
          <p className={styles.intro}>
            {step === 'welcome'
              ? 'Choose how Sia works, then set up your everyday assistant.'
              : step === 'agent'
                ? 'Start with one agent for writing, planning, research, and everyday tasks. You can make it your own later.'
                : step === 'voice'
                  ? 'Hold Fn. Wait for the glow. Say what you need, then release to send it to your agent.'
                  : step === 'access'
                    ? 'Let Sia see and work in the apps on your Mac. Turn on both permissions, then come back here.'
                    : step === 'apps'
                      ? 'Choose Use my Mac for your existing apps and browser. Individual service connections are optional.'
                      : step === 'restart'
                        ? 'Restart Sia to apply your Mac permissions. Your agent, access mode, and setup progress are saved. We’ll recheck access when you return.'
                        : 'Sia is back. Check your chosen access mode and Mac permissions before your first request.'}
          </p>

          {step === 'welcome' ? (
            <fieldset className={styles.setupChoices} disabled={pending}>
              <legend>Choose your setup</legend>
              <label className={styles.setupChoice}>
                <input
                  type="radio"
                  name="setup-route"
                  value="mac-bypass"
                  checked={setupRoute === 'mac-bypass'}
                  onChange={() => setSetupRoute('mac-bypass')}
                />
                <span>
                  <strong>Use my Mac + full bypass</strong>
                  <span>Fastest setup · No app connections</span>
                  <p>
                    Use your existing apps and signed-in browser. Sia runs commands,
                    AppleScript, and file operations directly, and sees your screen, without
                    per-action prompts.
                  </p>
                </span>
              </label>
              <label className={styles.setupChoice}>
                <input
                  type="radio"
                  name="setup-route"
                  value="connected"
                  checked={setupRoute === 'connected'}
                  onChange={() => setSetupRoute('connected')}
                />
                <span>
                  <strong>Connected apps + confirmations</strong>
                  <p>
                    Choose individual service connections and review actions before they run.
                  </p>
                </span>
              </label>
              <p className={styles.note}>
                AI access and Mac permissions are still needed. This mode gives the agent full
                local command access, including sends, uploads and file changes. Complete
                sign-ins yourself. Change modes anytime in Settings.
              </p>
            </fieldset>
          ) : null}
          {step === 'agent' ? (
            <>
              <label className={styles.field}>
                Agent name
                <input
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  disabled={pending || restarting}
                />
              </label>
              {choices.some((item) => item.ready) ? (
                <>
                  <label className={styles.field}>
                    AI access
                    <select
                      value={choice ? `${choice.provider}:${choice.model}` : ''}
                      onChange={(event) => setModel(event.currentTarget.value)}
                      disabled={pending || restarting}
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
                  <p className={styles.note}>
                    A private workspace is created automatically. Your agent uses the selected
                    plan; no API key is needed.
                  </p>
                  <button className={styles.link} onClick={onModels}>
                    Manage AI access
                  </button>
                </>
              ) : (
                <div className={styles.providerSetup}>
                  <ProvidersSettings
                    providers={snapshot.providers}
                    onProbe={(id) => api.refreshProvider(id)}
                    onOpenProviderSetup={(id) => api.openProviderSetup(id)}
                    onOpenCloudSettings={onAccount}
                  />
                </div>
              )}
            </>
          ) : null}
          {step === 'voice' ? (
            <>
              <div className={styles.permission}>
                <div>
                  <strong>
                    {nativeVoice ? '1. Enable Mac voice' : '1. Connect included voice'}
                  </strong>
                  <p>
                    {nativeVoice
                      ? 'Use installed Mac voices. No cloud account or API key is needed.'
                      : 'Your audio is sent to ElevenLabs when you use voice.'}
                  </p>
                </div>
                {snapshot.voice.status === 'connected' ? (
                  <span className={styles.ready}>Connected</span>
                ) : (
                  <button
                    className={ui.secondaryButton}
                    disabled={pending || restarting}
                    onClick={() => void run(() => api.configureVoice())}
                  >
                    Enable voice
                  </button>
                )}
              </div>
              <div className={styles.permission}>
                <div>
                  <strong>2. Enable the Fn shortcut</strong>
                  <p>
                    {nativeVoice
                      ? 'macOS will ask for Speech Recognition, Microphone, and Accessibility access for Sia Voice.'
                      : 'macOS will ask for Microphone and Accessibility access for Sia Voice.'}
                  </p>
                </div>
                <button
                  className={ui.secondaryButton}
                  disabled={
                    pending ||
                    snapshot.voice.status !== 'connected' ||
                    snapshot.voice.dictationAvailable === false ||
                    !ptt?.available ||
                    !agent
                  }
                  onClick={() => void run(() => api.configurePushToTalk(true, agent?.id))}
                >
                  {voiceReady
                    ? 'Check permissions'
                    : ptt?.enabled
                      ? 'Open permissions'
                      : 'Enable Fn shortcut'}
                </button>
              </div>
              {snapshot.voice.dictationDetail ? (
                <p className={styles.note} role="status">
                  {snapshot.voice.dictationDetail}
                </p>
              ) : null}
              {ptt?.enabled ? (
                <div className={styles.grants} role="status">
                  <span>Microphone: {ptt.microphone ? 'Allowed' : 'Waiting for access'}</span>
                  <span>
                    Accessibility: {ptt.accessibility ? 'Allowed' : 'Waiting for access'}
                  </span>
                </div>
              ) : null}
              {ptt?.detail ? (
                <p className={styles.note} role="status">
                  {ptt.detail}
                </p>
              ) : null}
              {!ptt?.available ? (
                <p className={styles.note}>
                  Fn dictation needs the macOS app. You can keep going with typing.
                </p>
              ) : null}
              <p className={styles.note}>
                No screen recording is needed for dictation. Sia must stay open. You can turn
                voice off anytime in Settings → Voice.
              </p>
            </>
          ) : null}
          {step === 'access' ? (
            <>
              <div className={styles.permission}>
                <div>
                  <strong>Accessibility</strong>
                  <p>Click and type in the windows you grant.</p>
                </div>
                <span
                  className={
                    snapshot.computer.accessibility === 'allowed' ? styles.ready : styles.status
                  }
                >
                  {snapshot.computer.accessibility === 'allowed' ? 'Allowed' : 'Needs access'}
                </span>
              </div>
              <div className={styles.permission}>
                <div>
                  <strong>Screen Recording</strong>
                  <p>
                    {fastMac
                      ? 'See your screen to operate apps and verify task results.'
                      : 'See the windows you grant for computer tasks.'}
                  </p>
                </div>
                <span
                  className={
                    snapshot.computer.screenRecording === 'allowed'
                      ? styles.ready
                      : styles.status
                  }
                >
                  {snapshot.computer.screenRecording === 'allowed' ? 'Allowed' : 'Needs access'}
                </span>
              </div>
              <p className={styles.note}>
                Click Open Mac permissions, allow Sia in Privacy & Security, then return here.
                macOS may ask you to reopen Sia. Your setup progress is saved.
              </p>
              <button
                className={ui.secondaryButton}
                disabled={pending || restarting}
                onClick={() =>
                  void run(() =>
                    computerReady
                      ? api.refreshComputerPermissions()
                      : api.requestComputerPermissions(),
                  )
                }
              >
                {computerReady ? 'Check access again' : 'Open Mac permissions'}
              </button>
              {fastMac ? (
                <MacAutomationPermissions
                  permissions={snapshot.computer.automation}
                  request={(app) => api.requestAutomationPermission(app)}
                  refresh={() => api.refreshComputerPermissions()}
                  disabled={pending || restarting}
                />
              ) : null}
              <p className={styles.note}>
                {fastMac
                  ? 'No app connections needed. Next, restart Sia to apply your permissions. Full bypass is enabled for task actions.'
                  : 'Next we’ll connect your work apps and Messages. Actions ask for confirmation by default; you can grant app windows as tasks need them.'}
              </p>
            </>
          ) : null}
          {step === 'apps' ? (
            <SetupConnections snapshot={snapshot} api={api} pending={pending} run={run} />
          ) : null}
          {step === 'restart' ? (
            <>
              <p className={styles.note}>
                Sia will close and reopen automatically. Keep your browser open. Nothing will be
                sent to an agent during this restart.
              </p>
              <p className={styles.note}>
                Any access you haven’t enabled stays listed as “Needs setup.” You can revisit it
                before finishing.
              </p>
            </>
          ) : null}
          {step === 'verify' ? (
            restarting ? (
              <p role="status">Restarting Sia… Your setup will resume here.</p>
            ) : (
              <>
                {!snapshot.preferences.onboarding?.restarted ? (
                  <p className={styles.note} role="status">
                    Sia has not restarted yet. If you changed Mac permissions, go back and
                    restart to apply them.
                  </p>
                ) : null}
                <SetupBrowser snapshot={snapshot} api={api} pending={pending} run={run} />
                {accessChecklist(snapshot).some((item) => !item.ready) ? (
                  <p className={styles.note} role="status">
                    Some access still needs setup. You can go back to finish connecting it, or
                    continue with the access listed as ready.
                  </p>
                ) : null}
              </>
            )
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              className={ui.primaryButton}
              disabled={
                pending || restarting || (step === 'agent' && (!name.trim() || !choice?.ready))
              }
              onClick={() => {
                if (step === 'welcome')
                  void run(async () => {
                    await api.setComputerAccessMode(
                      setupRoute === 'mac-bypass' ? 'mac' : 'connected',
                    );
                    await api.setComputerTrust(setupRoute === 'mac-bypass' ? 'auto' : 'ask');
                    await api.setOnboarding(agent ? 'voice' : 'agent');
                  });
                else if (step === 'agent' && choice)
                  void run(() =>
                    api.createAgent({
                      name: name.trim(),
                      instructions: starterInstructions,
                      provider: choice.provider,
                      model: choice.model,
                      workspace: '',
                      startOnboarding: true,
                    }),
                  );
                else if (step === 'voice') go('access');
                else if (step === 'access') go(fastMac ? 'restart' : 'apps');
                else if (step === 'apps') go('restart');
                else if (step === 'restart') void run(() => api.restartForOnboarding());
                else
                  void run(async () => {
                    const thread = agent?.threads.find((item) => !item.archivedAt);
                    if (thread) await api.selectThread(thread.id);
                    else if (agent) await api.createThread(agent.id);
                    await api.setOnboarding('practice');
                  });
              }}
            >
              {pending
                ? 'One moment…'
                : step === 'welcome'
                  ? 'Set up Sia'
                  : step === 'agent'
                    ? 'Create my agent'
                    : step === 'voice'
                      ? voiceReady
                        ? 'Continue'
                        : 'Continue with typing'
                      : step === 'access'
                        ? computerReady
                          ? fastMac
                            ? 'Review and restart'
                            : 'Connect your apps'
                          : 'Continue without Mac access'
                        : step === 'apps'
                          ? 'Review and restart'
                          : step === 'restart'
                            ? 'Restart Sia and check access'
                            : restarting
                              ? 'Restarting…'
                              : accessChecklist(snapshot).every((item) => item.ready)
                                ? 'Try your agent'
                                : 'Continue with available access'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            {step === 'welcome' ? (
              <button className={styles.link} onClick={onCustomize}>
                Customize an agent instead
              </button>
            ) : (
              <button
                className={styles.link}
                disabled={pending || restarting}
                onClick={() => go(setupSteps[Math.max(0, index - 1)] ?? 'welcome')}
              >
                Back
              </button>
            )}
          </div>
        </section>
        {['apps', 'restart', 'verify'].includes(step) ? (
          <SetupAccessReview snapshot={snapshot} />
        ) : (
          <ShortcutDemo variant={step === 'access' ? 'access' : 'voice'} />
        )}
      </div>
      <footer className={styles.footer}>
        <span>Your progress stays on this Mac.</span>
        <button
          className={styles.link}
          disabled={pending || restarting}
          onClick={() => go('complete')}
        >
          Exit setup
        </button>
      </footer>
    </main>
  );
}

function ShortcutDemo({ variant }: { variant: 'voice' | 'access' }) {
  return (
    <aside
      className={styles.demo}
      aria-label={
        variant === 'voice'
          ? 'Demo: hold Fn, speak while the edges glow, then release to send.'
          : 'Demo: grant a window, review the action, then approve it.'
      }
    >
      <div className={styles.demoTop}>
        <span className={styles.brand}>
          <Sparkle size={18} weight="fill" /> sia
        </span>
        <span>ILLUSTRATION</span>
      </div>
      <div className={styles.demoScreen} data-variant={variant} aria-hidden="true">
        <div className={styles.window}>
          <div className={styles.windowBar}>
            <i />
            <i />
            <i />
            <span>
              {variant === 'voice' ? 'Your day, a little lighter' : 'You’re in control'}
            </span>
          </div>
          <div className={styles.demoContent}>
            <span className={styles.avatar}>s</span>
            <p>
              {variant === 'voice'
                ? 'What would you like to do?'
                : 'Ready to take the next step?'}
            </p>
            <div className={styles.demoMessage}>
              {variant === 'voice' ? 'Help me plan my day.' : 'Click “Save” in Notes?'}
            </div>
            <div className={styles.demoButton}>
              {variant === 'voice' ? (
                <>
                  <Microphone size={15} /> Listening…
                </>
              ) : (
                'Approve action'
              )}
            </div>
          </div>
        </div>
        <Cursor className={styles.cursor} size={32} weight="fill" />
        {variant === 'voice' ? (
          <kbd className={styles.fn}>
            fn <span>🌐</span>
          </kbd>
        ) : (
          <span className={styles.clickRing} />
        )}
      </div>
      <div className={styles.demoCaption}>
        <strong>
          {variant === 'voice'
            ? 'A shortcut from thought to action.'
            : 'A clear yes, before the next click.'}
        </strong>
        <p>
          {variant === 'voice'
            ? 'Hold Fn → speak → release to send'
            : 'Choose a window → review → approve'}
        </p>
        <span>
          {variant === 'voice'
            ? 'Press Escape to cancel at any point.'
            : 'You can decline or revoke access anytime.'}
        </span>
      </div>
    </aside>
  );
}
