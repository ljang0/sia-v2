// @vitest-environment jsdom
import { StrictMode } from 'react';
import { automationApps } from '../../shared/mac-permissions';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo/snapshot';
import type { RendererApi } from '../types';
import type { OnboardingStep } from '../../shared/bridge';
import { Onboarding, onboardingStep, SetupDoneToast } from './Onboarding';

afterEach(cleanup);

function readyVoice() {
  return {
    status: 'connected' as const,
    voices: [],
    pushToTalk: {
      available: true,
      enabled: true,
      accessibility: true,
      microphone: true,
      phase: 'idle' as const,
    },
  };
}

function setup(step: OnboardingStep = 'welcome') {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = {
    step,
    ...(step === 'welcome' || step === 'agent' ? {} : { agentId: snapshot.agents[0]!.id }),
  };
  if (step === 'welcome' || step === 'agent') snapshot.agents = [];
  // A new profile starts with bypass, the product default.
  snapshot.computer.trust = 'auto';
  // Every app permission is required to finish; tests that need one missing set it.
  snapshot.computer.automation = Object.fromEntries(
    automationApps.map(({ id }) => [id, 'ready' as const]),
  ) as NonNullable<typeof snapshot.computer.automation>;
  const api = {
    getSnapshot: vi.fn(async () => structuredClone(snapshot)),
    setComputerAccessMode: vi.fn(async () => {}),
    setComputerTrust: vi.fn(async () => {}),
    setOnboarding: vi.fn(async (_step: OnboardingStep) => {}),
    createAgent: vi.fn(async () => 'starter'),
    selectThread: vi.fn(async () => {}),
    createThread: vi.fn(async () => 'thread'),
    requestComputerPermissions: vi.fn(async () => {}),
    refreshComputerPermissions: vi.fn(async () => {}),
    requestAutomationPermission: vi.fn(async () => {}),
    setupMessages: vi.fn(async () => {}),
    configureVoice: vi.fn(async () => {}),
    configurePushToTalk: vi.fn(async () => {}),
    startRealtimeVoice: vi.fn(),
    restartForOnboarding: vi.fn(async () => {}),
    connectSelectedApps: vi.fn(async () => {}),
    disconnectApp: vi.fn(async () => {}),
  };
  const props = {
    snapshot,
    api: api as unknown as RendererApi,
    onCustomize: vi.fn(),
    onModels: vi.fn(),
    onAccount: vi.fn(),
  };
  return { snapshot, api, props };
}

it('advances a verified permission pass to real Fn practice without opening another agent or recording', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.preferences.onboarding = {
    ...snapshot.preferences.onboarding!,
    restarted: true,
    permissionSetup: { includeApps: true, active: true },
  };
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.voice = readyVoice();
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  await waitFor(() =>
    expect(api.setOnboarding).toHaveBeenLastCalledWith('practice', {
      includeApps: true,
      active: false,
    }),
  );
  // The finished pass is saved first; practice follows it once.
  expect(api.setOnboarding.mock.calls.map(([step]) => step)).toEqual(['verify', 'practice']);
  snapshot.preferences.onboarding!.step = 'practice';
  snapshot.voice.pushToTalk!.practice = true;
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('heading', { name: 'A little less typing.' })).toBeTruthy();
  expect(
    screen.getByRole('list', { name: 'Setup progress' }).querySelector('[aria-current="step"]')!
      .textContent,
  ).toContain('Try Fn');
  expect(api.createAgent).not.toHaveBeenCalled();
  expect(api.createThread).not.toHaveBeenCalled();
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
});

it('shows genuine recording states and only unlocks the practice finish after native transcription', async () => {
  const { snapshot, api, props } = setup('practice');
  snapshot.voice = readyVoice();
  snapshot.voice.pushToTalk!.practice = true;
  const content = () => (
    <Onboarding {...props}>
      <div />
    </Onboarding>
  );
  const view = render(content());
  const finish = screen.getByRole('button', { name: 'Start using Sia' }) as HTMLButtonElement;
  expect(finish.disabled).toBe(true);
  // DOM key events cannot stand in for the native Fn recorder.
  fireEvent.keyDown(window, { key: 'Fn' });
  fireEvent.keyUp(window, { key: 'Fn' });
  expect(finish.disabled).toBe(true);
  snapshot.voice.pushToTalk!.phase = 'listening';
  view.rerender(content());
  expect(screen.getByRole('status').textContent).toContain('Release Fn');
  snapshot.voice.pushToTalk!.phase = 'transcribing';
  view.rerender(content());
  expect(screen.getByRole('status').textContent).toContain('Turning your voice into words');
  snapshot.voice.pushToTalk!.phase = 'idle';
  snapshot.voice.pushToTalk!.practiceTranscript = 'Plan a walk after lunch.';
  view.rerender(content());
  expect(screen.getByText('Plan a walk after lunch.')).toBeTruthy();
  expect(finish.disabled).toBe(false);
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
  fireEvent.click(finish);
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  expect(api.createAgent).not.toHaveBeenCalled();
});

it('allows voice practice to be skipped and resumes the existing conversation', async () => {
  const { snapshot, api, props } = setup('practice');
  snapshot.voice = readyVoice();
  snapshot.voice.pushToTalk!.practice = true;
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Skip voice practice' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  expect(api.createThread.mock.calls.length + api.selectThread.mock.calls.length).toBe(1);
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
});

it('keeps pending account approval visible with a cancel action during practice', async () => {
  const { snapshot, api, props } = setup('practice');
  snapshot.voice = readyVoice();
  snapshot.apps[0]!.status = 'connecting';
  snapshot.apps[0]!.connectionId = 'pending-google';
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  for (const name of ['Start using Sia', 'Skip voice practice', 'Exit setup'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await waitFor(() =>
    expect(api.disconnectApp).toHaveBeenCalledWith('gmail', 'pending-google'),
  );
});

it.each([
  ['mac-bypass', false],
  ['connected', false],
  ['connected', true],
] as const)(
  'setup honors the selected %s route (confirmations: %s)',
  async (route, confirmActions) => {
    const { snapshot, api, props } = setup();
    const view = render(
      <Onboarding {...props}>
        <div>Conversation</div>
      </Onboarding>,
    );
    api.createAgent.mockImplementation(async () => {
      snapshot.agents = structuredClone(demoSnapshot.agents.slice(0, 1));
      snapshot.preferences.onboarding = { step: 'voice', agentId: snapshot.agents[0]!.id };
      snapshot.computer.accessibility = 'not-requested';
      snapshot.computer.automation = undefined;
      view.rerender(
        <Onboarding {...props}>
          <div>Conversation</div>
        </Onboarding>,
      );
      return snapshot.agents[0]!.id;
    });
    const redraw = () =>
      view.rerender(
        <Onboarding {...props}>
          <div>Conversation</div>
        </Onboarding>,
      );
    api.requestComputerPermissions.mockImplementation(async () => {
      await Promise.resolve();
      snapshot.computer.accessibility = 'allowed';
      snapshot.computer.screenRecording = 'allowed';
      redraw();
    });
    api.requestAutomationPermission.mockImplementation(async (...args: unknown[]) => {
      await Promise.resolve();
      const id = args[0] as keyof NonNullable<typeof snapshot.computer.automation>;
      snapshot.computer.automation = {
        calendar: 'needs_permission',
        reminders: 'needs_permission',
        finder: 'needs_permission',
        messages: 'needs_permission',
        ...snapshot.computer.automation,
        [id]: 'ready',
      };
      redraw();
    });
    expect(api.createAgent).not.toHaveBeenCalled();
    expect(api.requestComputerPermissions).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Agent name' }).closest('details')!.open).toBe(
      false,
    );
    if (route === 'connected') {
      fireEvent.click(screen.getByText('Customize setup'));
      fireEvent.click(screen.getByRole('radio', { name: /Connected apps only/ }));
    }
    const confirmations = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /Ask before each action/,
    });
    expect(confirmations.checked).toBe(false);
    if (confirmActions) fireEvent.click(confirmations);
    // Use my Mac asks for every app permission in the same pass; there is nothing to opt into.
    expect(screen.queryByRole('checkbox', { name: /Prepare everyday apps now/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
    if (route === 'mac-bypass') {
      await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1));
      expect(snapshot.computer.accessibility).toBe('allowed');
      await waitFor(() =>
        expect(api.setOnboarding).toHaveBeenCalledWith('verify', {
          includeApps: true,
          active: false,
        }),
      );
    } else {
      await waitFor(() =>
        expect(api.setOnboarding).toHaveBeenCalledWith('apps', {
          includeApps: false,
          active: false,
        }),
      );
      expect(api.requestComputerPermissions).not.toHaveBeenCalled();
      expect(screen.queryByRole('region', { name: 'Guided Mac permissions' })).toBeNull();
      expect(screen.getByText('Connect the apps you use.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
    }
    expect(api.createAgent).toHaveBeenCalledTimes(1);
    expect(api.createAgent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Sia', workspace: '', startOnboarding: true }),
    );
    expect(api.setComputerAccessMode).toHaveBeenCalledWith(
      route === 'mac-bypass' ? 'mac' : 'connected',
    );
    expect(api.setComputerTrust).toHaveBeenCalledWith(confirmActions ? 'ask' : 'auto');
    expect(api.createAgent.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.setComputerTrust.mock.invocationCallOrder[0]!,
    );
    expect(api.requestComputerPermissions).toHaveBeenCalledTimes(
      route === 'mac-bypass' ? 1 : 0,
    );
    expect(api.requestAutomationPermission).toHaveBeenCalledTimes(
      route === 'mac-bypass' ? 7 : 0,
    );
    expect(api.setupMessages).not.toHaveBeenCalled();
    expect(api.startRealtimeVoice).not.toHaveBeenCalled();
    expect(api.connectSelectedApps).not.toHaveBeenCalled();
    fireEvent.focus(window);
    view.rerender(
      <Onboarding {...props}>
        <div>Conversation</div>
      </Onboarding>,
    );
    expect(api.requestComputerPermissions).toHaveBeenCalledTimes(
      route === 'mac-bypass' ? 1 : 0,
    );
    // A finished pass opens the conversation directly; no restart is part of setup.
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
    expect(api.restartForOnboarding).not.toHaveBeenCalled();
  },
);

it('prefers an available Astra model for Use my Mac while honoring a model the user picks', async () => {
  const { snapshot, api, props } = setup();
  snapshot.providers[0]!.models = [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', description: '', reasoningEfforts: ['high'] },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', description: '', reasoningEfforts: ['high'] },
  ];
  const view = render(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  const selector = screen.getByRole('combobox', { name: 'AI access' }) as HTMLSelectElement;
  expect(selector.value).toBe('codex:gpt-6-astra');
  expect(screen.getByText(/click through a website without asking you first/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
  await waitFor(() =>
    expect(api.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex', model: 'gpt-6-astra' }),
    ),
  );
  // Setup keeps the stored background preference: new profiles work in the background.
  expect(api.setComputerAccessMode).toHaveBeenCalledWith('mac');

  view.unmount();
  const another = setup();
  another.snapshot.providers[0]!.models = structuredClone(snapshot.providers[0]!.models ?? []);
  render(
    <Onboarding {...another.props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'AI access' }), {
    target: { value: 'codex:gpt-5.6-sol' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
  await waitFor(() =>
    expect(another.api.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex', model: 'gpt-5.6-sol' }),
    ),
  );
});

it.each(['voice', 'access', 'apps', 'restart', 'verify', 'practice'] as const)(
  'resumes saved %s setup on one screen without replaying permission requests',
  async (step) => {
    const { api, props } = setup(step);
    render(
      <Onboarding {...props}>
        <div />
      </Onboarding>,
    );
    await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('heading', {
        name:
          step === 'practice'
            ? 'A little less typing.'
            : /^(Give Sia access to your Mac|You’re all set)\.$/,
      }),
    ).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Setup progress' })).toBeTruthy();
    expect(api.requestComputerPermissions).not.toHaveBeenCalled();
    expect(api.requestAutomationPermission).not.toHaveBeenCalled();
    expect(api.createAgent).not.toHaveBeenCalled();
    expect(api.restartForOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  },
);

it.each([true, false])(
  'resumes only an active saved permission pass after restart (%s)',
  async (active) => {
    const { snapshot, api, props } = setup('verify');
    snapshot.preferences.onboarding = {
      ...snapshot.preferences.onboarding!,
      restarted: true,
      permissionSetup: { includeApps: true, active },
    };
    snapshot.computer.accessMode = 'mac';
    snapshot.computer.accessibility = 'allowed';
    snapshot.computer.screenRecording = 'allowed';
    snapshot.computer.automation = {
      system_events: 'ready',
      safari: 'needs_permission',
      chrome: 'unavailable',
      calendar: 'ready',
      reminders: 'ready',
      finder: 'ready',
      messages: 'ready',
    };
    render(
      <Onboarding {...props}>
        <div />
      </Onboarding>,
    );
    if (active)
      await waitFor(() =>
        expect(api.requestAutomationPermission).toHaveBeenCalledExactlyOnceWith('safari'),
      );
    else {
      expect(screen.getByRole('button', { name: 'Allow all' })).toBeTruthy();
      expect(api.requestAutomationPermission).not.toHaveBeenCalled();
    }
    expect(api.requestComputerPermissions).not.toHaveBeenCalled();
    expect(api.restartForOnboarding).not.toHaveBeenCalled();
    expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
  },
);

it('keeps denied voice access optional and leaves the microphone off', async () => {
  const { snapshot, api, props } = setup('voice');
  snapshot.voice = {
    status: 'connected',
    voices: [],
    pushToTalk: {
      enabled: true,
      available: true,
      accessibility: true,
      microphone: false,
      phase: 'idle',
    },
  };
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  expect(api.configurePushToTalk).not.toHaveBeenCalled();
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
});

it('blocks setup when no admitted model is ready', () => {
  const { snapshot, api, props } = setup('agent');
  snapshot.providers.forEach((provider) => {
    provider.status = 'unavailable';
  });
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.queryByRole('button', { name: 'Set up Sia' })).toBeNull();
  expect(screen.getByText(/Connect an AI service above/)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  expect(api.createAgent).not.toHaveBeenCalled();
});

it('shows connections only when expanded and does not request unavailable cloud access', () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.cloudAuth.state = 'unconfigured';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(
    screen.getByRole('checkbox', { name: /Google Workspace/ }).closest('details')!.open,
  ).toBe(false);
  fireEvent.click(screen.getByText('Connect Google or Slack'));
  expect(
    (screen.getByRole('button', { name: 'Connect selected apps' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(api.connectSelectedApps).not.toHaveBeenCalled();
});

it('offers one Relaunch button only when a grant waits for it, saving the step first', async () => {
  const { snapshot, api, props } = setup('verify');
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.queryByRole('button', { name: /Reopen|Relaunch|Restart/ })).toBeNull();
  expect(screen.queryByText('Permission not updating?')).toBeNull();
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.relaunchFor = ['screenRecording'];
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('alert').textContent).toContain('See your screen is turned on');
  expect(screen.getAllByRole('button', { name: /Reopen/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Reopen Sia' }));
  await waitFor(() => expect(api.restartForOnboarding).toHaveBeenCalledTimes(1));
  expect(api.setOnboarding).toHaveBeenCalledWith(
    'verify',
    expect.objectContaining({ active: true, skipped: [] }),
  );
  expect(api.setOnboarding.mock.invocationCallOrder[0]).toBeLessThan(
    api.restartForOnboarding.mock.invocationCallOrder[0]!,
  );
  snapshot.preferences.onboarding!.restartPending = true;
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  for (const name of ['Start using Sia', 'Exit setup'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
});

it('keeps pending account approvals visible and blocks leaving until cancellation', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.cloudAuth.state = 'signed-in';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  snapshot.apps[0]!.status = 'connecting';
  snapshot.apps[0]!.connectionId = 'pending-google';
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  for (const name of ['Start using Sia', 'Exit setup'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Waiting for you')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
  await waitFor(() =>
    expect(api.disconnectApp).toHaveBeenCalledWith('gmail', 'pending-google'),
  );
  snapshot.apps[0]!.status = 'disconnected';
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(
    (screen.getByRole('button', { name: 'Start using Sia' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('keeps the connections section open when an account approval finishes', () => {
  const { snapshot, props } = setup('verify');
  snapshot.cloudAuth.state = 'signed-in';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  snapshot.apps[0]!.status = 'connecting';
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  const section = () =>
    screen.getByText('Connect Google or Slack').closest('details') as HTMLDetailsElement;
  expect(section().open).toBe(true);
  snapshot.apps[0]!.status = 'error';
  snapshot.apps[0]!.connectionId = 'failed-google';
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(section().open).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('needs to be reconnected');
});

it('replays setup with the existing agent without creating another', async () => {
  const { snapshot, api, props } = setup('voice');
  snapshot.preferences.onboarding!.step = 'welcome';
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
  await waitFor(() =>
    expect(api.setOnboarding).toHaveBeenCalledWith(
      'voice',
      expect.objectContaining({ active: true }),
    ),
  );
  expect(api.createAgent).not.toHaveBeenCalled();
});

it('keeps existing profiles out of first-run and recovers a deleted starter', () => {
  const { snapshot } = setup('voice');
  delete snapshot.preferences.onboarding;
  expect(onboardingStep(snapshot)).toBeUndefined();
  snapshot.preferences.onboarding = { step: 'practice', agentId: 'deleted' };
  expect(onboardingStep(snapshot)).toBe('welcome');
  snapshot.preferences.onboarding = { step: 'complete' };
  snapshot.agents = [];
  expect(onboardingStep(snapshot)).toBeUndefined();
});

it('keeps Start using Sia off until every Mac permission is on', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.automation = { ...snapshot.computer.automation!, calendar: 'denied' };
  const content = () => (
    <Onboarding {...props}>
      <div />
    </Onboarding>
  );
  const view = render(content());
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalled());
  const start = () =>
    screen.getByRole<HTMLButtonElement>('button', { name: 'Start using Sia' }).disabled;
  expect(start()).toBe(true);
  snapshot.computer.automation = { ...snapshot.computer.automation!, calendar: 'ready' };
  view.rerender(content());
  await waitFor(() => expect(start()).toBe(false));
});

it('finishes a verified pass without restarting Sia', async () => {
  const { snapshot, api, props } = setup('voice');
  snapshot.computer.accessibility = 'not-requested';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.voice.pushToTalk = {
    enabled: false,
    available: false,
    accessibility: false,
    microphone: false,
    phase: 'idle',
  };
  const content = () => (
    <StrictMode>
      <Onboarding {...props}>
        <div>Conversation</div>
      </Onboarding>
    </StrictMode>
  );
  const view = render(content());
  fireEvent.click(screen.getByRole('button', { name: 'Allow all' }));
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1));
  expect(api.restartForOnboarding).not.toHaveBeenCalled();
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
  snapshot.computer.accessibility = 'allowed';
  view.rerender(content());
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  fireEvent.focus(window);
  view.rerender(content());
  expect(api.restartForOnboarding).not.toHaveBeenCalled();
  expect(api.setOnboarding.mock.calls.filter(([step]) => step === 'complete')).toHaveLength(1);
  expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
  expect(api.createThread.mock.calls.length + api.selectThread.mock.calls.length).toBe(1);
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
});

it('preserves granted Mac access but blocks finishing when AI disconnects during setup', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.voice.pushToTalk = {
    available: false,
    enabled: false,
    accessibility: false,
    microphone: false,
    phase: 'idle',
  };
  const provider = snapshot.providers.find(({ id }) => id === snapshot.agents[0]!.provider)!;
  provider.status = 'needs-login';
  const content = () => (
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>
  );
  const view = render(content());
  const finish = screen.getByRole<HTMLButtonElement>('button', { name: 'Start using Sia' });
  expect(finish.disabled).toBe(true);
  expect(screen.getByRole('region', { name: 'Finish AI setup' }).textContent).toContain(
    'Your Mac access is saved',
  );
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
  provider.status = 'ready';
  view.rerender(content());
  await waitFor(() => expect(finish.disabled).toBe(false));
  fireEvent.click(finish);
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  expect(api.createAgent).not.toHaveBeenCalled();
});

it('resumes an active pass after the relaunch without asking again for granted rows', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.preferences.onboarding = {
    step: 'verify',
    agentId: snapshot.agents[0]!.id,
    restarted: true,
    permissionSetup: { includeApps: true, active: true },
  };
  snapshot.computer.accessMode = 'mac';
  snapshot.voice.dictationAvailable = false;
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.automation = Object.fromEntries(
    automationApps.map(({ id }) => [id, id === 'finder' ? 'ready' : 'needs_permission']),
  ) as typeof snapshot.computer.automation;
  const content = () => (
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>
  );
  api.requestAutomationPermission.mockImplementation(async (...args: unknown[]) => {
    await Promise.resolve();
    snapshot.computer.automation = {
      ...snapshot.computer.automation!,
      [args[0] as string]: 'ready',
    };
    view.rerender(content());
  });
  const view = render(content());
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  const asked = api.requestAutomationPermission.mock.calls.map(
    (call) => (call as unknown[])[0],
  );
  expect(asked).toContain('safari');
  expect(asked).not.toContain('finder');
  expect(new Set(asked).size).toBe(asked.length);
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  expect(api.setupMessages).not.toHaveBeenCalled();
  expect(api.restartForOnboarding).not.toHaveBeenCalled();
});

it('does not auto-finish a resumed guide just because access is already ready', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.messagesAccess = 'needs_full_disk_access';
  snapshot.computer.automation = Object.fromEntries(
    automationApps.map(({ id }) => [id, 'needs_permission']),
  ) as typeof snapshot.computer.automation;
  snapshot.voice.pushToTalk = {
    enabled: false,
    available: false,
    accessibility: false,
    microphone: false,
    phase: 'idle',
  };
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalled());
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
});

it('lands in the conversation composer when setup finishes', async () => {
  const { snapshot, props } = setup('practice');
  const view = render(
    <Onboarding {...props}>
      <textarea aria-label="Message" data-composer-input />
    </Onboarding>,
  );
  const done = structuredClone(snapshot);
  done.preferences.onboarding = { step: 'complete' };
  view.rerender(
    <Onboarding {...props} snapshot={done}>
      <textarea aria-label="Message" data-composer-input />
    </Onboarding>,
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Message' })),
  );
});

it('shows progress through setup and a calm note after finishing', async () => {
  const { snapshot, api, props } = setup();
  const view = render(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  const progress = screen.getByRole('list', { name: 'Setup progress' });
  expect(progress.querySelector('[aria-current="step"]')?.textContent).toContain('Welcome');

  snapshot.agents = structuredClone(demoSnapshot.agents.slice(0, 1));
  snapshot.preferences.onboarding = { step: 'verify', agentId: snapshot.agents[0]!.id };
  // A fresh setup opens an empty conversation; the note steps aside once one starts.
  snapshot.activeThread = undefined;
  view.rerender(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  expect(
    screen.getByRole('list', { name: 'Setup progress' }).querySelector('[aria-current="step"]')
      ?.textContent,
  ).toMatch(/Mac access|Ready/);

  api.setOnboarding.mockImplementation(async (step: OnboardingStep) => {
    snapshot.preferences.onboarding = { step };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  view.rerender(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  expect(screen.getByText('Conversation')).toBeTruthy();
  expect((await screen.findByRole('status')).textContent).toContain('You’re all set.');
});

it('skipping setup does not claim it finished', async () => {
  const { snapshot, api, props } = setup('verify');
  api.setOnboarding.mockImplementation(async (step: OnboardingStep) => {
    snapshot.preferences.onboarding = { step };
  });
  const view = render(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Exit setup' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  view.rerender(
    <Onboarding {...props}>
      <div>Conversation</div>
    </Onboarding>,
  );
  expect(screen.queryByText(/You’re all set/)).toBeNull();
});

it('discloses that Sia acts on its own by default and offers asking first', () => {
  const { props } = setup();
  props.snapshot.computer.trust = 'auto';
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('heading', { name: 'Sia acts on its own' })).toBeTruthy();
  expect(screen.getByText(/without asking you first/)).toBeTruthy();
  const ask = screen.getByRole('checkbox', {
    name: /Ask before each action/,
  }) as HTMLInputElement;
  expect(ask.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Ask me first instead' }));
  expect(screen.getByRole('heading', { name: 'Sia asks you first' })).toBeTruthy();
  expect(ask.checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Let Sia act on its own' }));
  expect(ask.checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'More choices' }));
  expect(screen.getByRole('textbox', { name: 'Agent name' }).closest('details')!.open).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('radio', { name: /Connected apps only/ }));
  expect(screen.getByText(/send a Slack message/)).toBeTruthy();
});

it('lets the finished note step aside with a short exit before it is removed', () => {
  vi.useFakeTimers();
  const done = vi.fn();
  render(<SetupDoneToast onDone={done} />);
  const note = screen.getByRole('status');
  expect(note.dataset.leaving).toBeUndefined();
  act(() => {
    vi.advanceTimersByTime(6000);
  });
  expect(note.dataset.leaving).toBe('true');
  expect(done).not.toHaveBeenCalled();
  // A hidden window may never report the exit animation's end; the note still goes.
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(done).toHaveBeenCalled();
  vi.useRealTimers();
});

it('keeps default Mac setup open until Chrome has a verified site and uses the selected window', async () => {
  const { snapshot, api, props } = setup('verify');
  const attachBrowser = vi.fn(async (_windowId?: number) => {});
  Object.assign(api, { attachBrowser });
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.chromeConnection = 'off';
  snapshot.voice = readyVoice();
  snapshot.browser = {
    ...snapshot.browser,
    attached: false,
    status: 'detached',
    tabs: [],
    availableWindows: [],
  };
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  await screen.findByRole('button', { name: 'Set up Chrome' });
  expect((screen.getByRole('button', { name: 'Try Fn' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(attachBrowser).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up Chrome' }));
  await waitFor(() => expect(attachBrowser).toHaveBeenCalledWith());
  snapshot.browser.availableWindows = [
    { id: 42, label: 'Chrome window 2', detail: 'Research' },
  ];
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use Chrome window 2: Research' }));
  await waitFor(() => expect(attachBrowser).toHaveBeenCalledWith(42));
  snapshot.browser.attached = true;
  snapshot.browser.status = 'attached';
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  // An empty or ungranted tab is not a successful background-read setup.
  expect((screen.getByRole('button', { name: 'Try Fn' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  snapshot.browser.tabs = [
    { id: 'qa', origin: 'example.com', title: 'Research', active: true, granted: true },
  ];
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Try Fn' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
});

it('allows explicitly declining Chrome without granting access or preventing native Mac use', async () => {
  const { snapshot, api, props } = setup('verify');
  const attachBrowser = vi.fn(async () => {});
  Object.assign(api, { attachBrowser });
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.chromeConnection = 'off';
  snapshot.voice = readyVoice();
  snapshot.browser = {
    ...snapshot.browser,
    attached: false,
    status: 'detached',
    tabs: [],
    availableWindows: [],
  };
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Continue without Chrome' }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Try Fn' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(attachBrowser).not.toHaveBeenCalled();
  expect(snapshot.browser.attached).toBe(false);
});
