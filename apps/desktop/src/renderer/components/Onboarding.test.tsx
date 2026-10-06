// @vitest-environment jsdom
import { StrictMode } from 'react';
import { automationApps } from '../../shared/mac-permissions';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo/snapshot';
import type { RendererApi } from '../types';
import type { OnboardingStep } from '../../shared/bridge';
import { Onboarding, onboardingStep } from './Onboarding';

afterEach(cleanup);

function setup(step: OnboardingStep = 'welcome') {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = {
    step,
    ...(step === 'welcome' || step === 'agent' ? {} : { agentId: snapshot.agents[0]!.id }),
  };
  if (step === 'welcome' || step === 'agent') snapshot.agents = [];
  // A new profile starts with bypass, the product default.
  snapshot.computer.trust = 'auto';
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
  expect(screen.getByText(/Sia starts in the background/)).toBeTruthy();
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
      screen.getByRole('heading', { name: /^(Give Sia access to your Mac|You’re all set)\.$/ }),
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
      expect(screen.getByRole('button', { name: 'Grant all' })).toBeTruthy();
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
  expect(screen.getByText(/Connect AI access above/)).toBeTruthy();
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
  expect(screen.queryByRole('button', { name: /Relaunch|Restart/ })).toBeNull();
  expect(screen.queryByText('Permission not updating?')).toBeNull();
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.relaunchFor = ['screenRecording'];
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('alert').textContent).toContain('See your screen is turned on');
  expect(screen.getAllByRole('button', { name: /Relaunch/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Relaunch Sia' }));
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
  expect(screen.getByText('Awaiting approval')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel connection setup' }));
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
  expect(screen.getByRole('alert').textContent).toContain('needs attention');
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

it('finishes a verified pass without restarting Sia', async () => {
  const { snapshot, api, props } = setup('voice');
  snapshot.computer.accessibility = 'not-requested';
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
  const content = () => (
    <StrictMode>
      <Onboarding {...props}>
        <div>Conversation</div>
      </Onboarding>
    </StrictMode>
  );
  const view = render(content());
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
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

it('resumes an active pass after the relaunch without asking again for skipped or granted rows', async () => {
  const { snapshot, api, props } = setup('verify');
  snapshot.preferences.onboarding = {
    step: 'verify',
    agentId: snapshot.agents[0]!.id,
    restarted: true,
    permissionSetup: { includeApps: true, active: true, skipped: ['safari'] },
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
  expect(asked).not.toContain('safari');
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

it('summarizes the chosen way of working, including confirmations', () => {
  const { props } = setup();
  props.snapshot.computer.trust = 'auto';
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByText('Works quietly in the background')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  expect(screen.getByRole('textbox', { name: 'Agent name' }).closest('details')!.open).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /Ask before each action/ }));
  expect(screen.getByText('Asks before it acts')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: /Ask before each action/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Connected apps only/ }));
  expect(screen.getByText('Works in your connected apps')).toBeTruthy();
});
