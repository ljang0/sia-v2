// @vitest-environment jsdom
import { StrictMode } from 'react';
import { automationApps } from '../../shared/mac-permissions';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
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
  const api = {
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

it.each(['mac-bypass', 'connected'] as const)(
  'one click creates the default agent and starts missing permissions in %s mode',
  async (route) => {
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
    expect(api.createAgent).not.toHaveBeenCalled();
    expect(api.requestComputerPermissions).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Agent name' }).closest('details')!.open).toBe(
      false,
    );
    if (route === 'connected') {
      fireEvent.click(screen.getByText('Customize setup'));
      fireEvent.click(screen.getByRole('radio', { name: /Connected apps \+ confirmations/ }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('verify'));
    expect(api.createAgent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'Sia', workspace: '', startOnboarding: true }),
    );
    expect(api.setComputerAccessMode).toHaveBeenCalledWith(
      route === 'mac-bypass' ? 'mac' : 'connected',
    );
    expect(api.setComputerTrust).toHaveBeenCalledWith(route === 'mac-bypass' ? 'auto' : 'ask');
    expect(api.createAgent.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.setComputerTrust.mock.invocationCallOrder[0]!,
    );
    expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
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
    expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
    expect(api.restartForOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  },
);

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
    expect(screen.getByRole('heading', { name: 'Your Sia setup.' })).toBeTruthy();
    expect(api.requestComputerPermissions).not.toHaveBeenCalled();
    expect(api.requestAutomationPermission).not.toHaveBeenCalled();
    expect(api.createAgent).not.toHaveBeenCalled();
    expect(api.restartForOnboarding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start using Sia' }));
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
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
  expect(
    (screen.getByRole('button', { name: 'Set up Sia' }) as HTMLButtonElement).disabled,
  ).toBe(true);
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

it('offers restart as optional troubleshooting and locks navigation during it', async () => {
  const { snapshot, api, props } = setup('verify');
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('button', { name: 'Restart Sia' }).closest('details')!.open).toBe(
    false,
  );
  fireEvent.click(screen.getByText('Permission not updating?'));
  fireEvent.click(screen.getByRole('button', { name: 'Restart Sia' }));
  await waitFor(() => expect(api.restartForOnboarding).toHaveBeenCalledTimes(1));
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

it('replays setup with the existing agent without creating another', async () => {
  const { snapshot, api, props } = setup('voice');
  snapshot.preferences.onboarding!.step = 'welcome';
  render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('voice'));
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

it('automatically opens the conversation once access is ready, including after returning from Settings', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Allow remaining access' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('verify'));
  expect(api.setOnboarding).not.toHaveBeenCalledWith('complete');
  snapshot.computer.accessibility = 'allowed';
  view.rerender(content());
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('complete'));
  fireEvent.focus(window);
  view.rerender(content());
  expect(api.setOnboarding.mock.calls.filter(([step]) => step === 'complete')).toHaveLength(1);
  expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
  expect(api.createThread.mock.calls.length + api.selectThread.mock.calls.length).toBe(1);
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
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
