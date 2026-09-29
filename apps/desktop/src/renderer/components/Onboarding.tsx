import { Check, Sparkle } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { OnboardingStep } from '../../shared/bridge';
import { modelChoices } from '../agentModels';
import { focusComposer } from '../composerFocus';
import { STARTER_INSTRUCTIONS } from '../welcome';
import type { RendererApi, RendererSnapshot } from '../types';
import { SetupConnections } from './OnboardingConnections';
import { SetupMacAccess } from './SetupMacAccess';
import { ProvidersSettings } from './settings/ProvidersSettings';
import ui from '../ui.module.css';
import styles from './Onboarding.module.css';

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
  const [name, setName] = useState('Sia');
  const [model, setModel] = useState('');
  const [pending, setPending] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [startPermissions, setStartPermissions] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [permissionPassComplete, setPermissionPassComplete] = useState(
    Boolean(snapshot.preferences.onboarding?.restarted),
  );
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [prepareApps, setPrepareApps] = useState(
    snapshot.preferences.onboarding?.permissionSetup?.includeApps ?? starting,
  );
  const autoFinished = useRef(false);
  const [error, setError] = useState<string>();
  const [setupRoute, setSetupRoute] = useState<'mac-bypass' | 'connected'>(() =>
    snapshot.agents.length && snapshot.computer.accessMode !== 'mac'
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
  }, [starting]);
  // Finishing or leaving setup lands in the first conversation, ready to type.
  const inSetup = Boolean(step);
  const wasInSetup = useRef(inSetup);
  useEffect(() => {
    if (wasInSetup.current && !inSetup) focusComposer();
    wasInSetup.current = inSetup;
  }, [inSetup]);
  // Resuming setup only checks status. The shared checklist handles focus refreshes.
  useEffect(() => {
    if (!step || starting || restarting) return;
    void api.refreshComputerPermissions().catch(() => undefined);
  }, [api, Boolean(step), starting, restarting]);

  const run = async (action: () => Promise<unknown>) => {
    if (working.current) return;
    working.current = true;
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Setup could not finish. Try again.');
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
      await api.setOnboarding('voice', {
        includeApps: setupRoute === 'mac-bypass' && prepareApps,
        active: true,
      });
      setStartPermissions(true);
    });
  const finish = () =>
    void run(async () => {
      const thread = agent?.threads.find((item) => !item.archivedAt);
      if (thread) await api.selectThread(thread.id);
      else if (agent) await api.createThread(agent.id);
      await api.setOnboarding('complete');
    });

  // Only a completed, user-started permission pass can advance automatically.
  // An authorized restart resumes only missing steps; passive status checks do not prompt.
  useEffect(() => {
    if (
      !step ||
      starting ||
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
    finish();
  }, [
    step,
    starting,
    agent,
    permissionPassComplete,
    accessReady,
    busy,
    connecting,
    connectionsOpen,
  ]);

  if (!step) return children;
  return (
    <main className={styles.setup} aria-label="Welcome to Sia">
      <section className={styles.stage}>
        <div className={styles.brand} aria-hidden="true">
          <Sparkle size={24} weight="fill" /> sia
        </div>
        <h1 ref={title} tabIndex={-1}>
          {starting ? 'Let’s set up Sia.' : 'Your Sia setup.'}
        </h1>
        {starting ? (
          <p className={styles.intro}>
            Set up screen control, voice, and access to the apps you already use.
          </p>
        ) : null}
        {starting ? (
          <>
            <ul className={styles.included} aria-label="Included in setup">
              {['Screen and keyboard control', 'Microphone and Fn dictation'].map((label) => (
                <li key={label}>
                  <Check size={17} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
            {!agent && !choices.some((item) => item.ready) ? (
              <div className={styles.providerSetup}>
                <ProvidersSettings
                  providers={snapshot.providers}
                  onProbe={(id) => api.refreshProvider(id)}
                  onOpenProviderSetup={(id) => api.openProviderSetup(id)}
                  onOpenCloudSettings={onAccount}
                />
              </div>
            ) : null}
            <p className={styles.note}>
              {setupRoute === 'mac-bypass'
                ? confirmActions
                  ? 'Sia works in the background while you keep using your Mac and asks before it sends messages or changes files.'
                  : 'Sia works in the background while you keep using your Mac. It can send messages and change files without asking each time. You can switch to On my screen in Settings → Computer.'
                : confirmActions
                  ? 'Sia asks before taking actions in connected apps.'
                  : 'Sia takes actions in connected apps without asking each time. You can turn on confirmations in Settings → Computer.'}
            </p>
            {setupRoute === 'mac-bypass' && aiReady ? (
              <label className={styles.prepareApps}>
                <input
                  type="checkbox"
                  checked={prepareApps}
                  disabled={busy || connecting}
                  onChange={(event) => setPrepareApps(event.currentTarget.checked)}
                />
                <span>
                  <strong>Prepare everyday apps now</strong>
                  <span>
                    Browsers, Calendar, Reminders, Finder, and Messages may open for macOS
                    approval. You can also connect them later.
                  </span>
                </span>
              </label>
            ) : null}
            {aiReady ? (
              <div className={styles.actions}>
                <button
                  className={ui.primaryButton}
                  disabled={busy || connecting || (!agent && (!name.trim() || !choice?.ready))}
                  onClick={start}
                >
                  {pending ? 'Setting up Sia…' : 'Set up Sia'}
                </button>
              </div>
            ) : (
              <p className={styles.note}>
                Connect AI access above, then continue to permissions. No terminal is needed.
              </p>
            )}
            <details className={styles.details}>
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
        ) : (
          <>
            {restarting ? (
              <p role="status">Restarting Sia…</p>
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
                      includeApps: setupRoute === 'mac-bypass' && prepareApps,
                      active: false,
                    })
                    .catch(() =>
                      setError('Setup paused. Its saved progress could not update.'),
                    );
                }}
                onRestart={async () => {
                  await api.setOnboarding('verify', {
                    includeApps: setupRoute === 'mac-bypass' && prepareApps,
                    active: true,
                  });
                  await api.restartForOnboarding();
                }}
                includeApps={setupRoute === 'mac-bypass' && prepareApps}
                onComplete={async () => {
                  setStartPermissions(false);
                  await run(async () => {
                    await api.setOnboarding('verify', {
                      includeApps: setupRoute === 'mac-bypass' && prepareApps,
                      active: false,
                    });
                    if (!snapshot.preferences.onboarding?.restarted)
                      await api.restartForOnboarding();
                    else setPermissionPassComplete(true);
                  });
                }}
              />
            )}
            <div className={styles.actions}>
              <button
                className={ui.primaryButton}
                disabled={busy || connecting}
                onClick={finish}
              >
                Start using Sia
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
            <details className={styles.details}>
              <summary>Permission not updating?</summary>
              <p className={styles.note}>
                If macOS asks you to restart Sia, use this button. Your setup is saved.
              </p>
              <button
                className={ui.secondaryButton}
                disabled={busy || connecting}
                onClick={() =>
                  void run(async () => {
                    await api.setOnboarding('verify');
                    await api.restartForOnboarding();
                  })
                }
              >
                {restarting ? 'Restarting…' : 'Restart Sia'}
              </button>
            </details>
          </>
        )}
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
