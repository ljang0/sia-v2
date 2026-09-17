// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import type { RendererApi } from '../types';
import { Onboarding, onboardingStep } from './Onboarding';
import { Composer } from './Composer';
import { accessChecklist, SetupAccessReview } from './OnboardingConnections';

afterEach(cleanup);

it.each(['mac-bypass', 'connected'] as const)(
  'applies the %s setup choice before advancing',
  async (route) => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.agents = [];
    snapshot.preferences.onboarding = { step: 'welcome' };
    const api = {
      setComputerAccessMode: vi.fn().mockResolvedValue(undefined),
      setComputerTrust: vi.fn().mockResolvedValue(undefined),
      setOnboarding: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <Onboarding
        snapshot={snapshot}
        api={api as unknown as RendererApi}
        onCustomize={vi.fn()}
        onSuggest={vi.fn()}
        onModels={vi.fn()}
        onAccount={vi.fn()}
      >
        <div />
      </Onboarding>,
    );
    fireEvent.click(
      screen.getByRole('radio', {
        name:
          route === 'mac-bypass'
            ? /Use my Mac \+ full bypass/
            : /Connected apps \+ confirmations/,
      }),
    );
    expect(api.setComputerTrust).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
    await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('agent'));
    expect(api.setComputerAccessMode).toHaveBeenCalledWith(
      route === 'mac-bypass' ? 'mac' : 'connected',
    );
    expect(api.setComputerTrust).toHaveBeenCalledWith(route === 'mac-bypass' ? 'auto' : 'ask');
    expect(api.setOnboarding.mock.invocationCallOrder[0]).toBeGreaterThan(
      api.setComputerTrust.mock.invocationCallOrder[0]!,
    );
  },
);

it('resumes legacy Mac access setup with one action and offers the connector checklist', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = { step: 'access', agentId: snapshot.agents[0]!.id };
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.trust = 'auto';
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  const api = {
    setOnboarding: vi.fn().mockResolvedValue(undefined),
    refreshComputerPermissions: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <Onboarding
      snapshot={snapshot}
      api={api as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div />
    </Onboarding>,
  );
  expect(screen.getByRole('button', { name: 'Allow all required access' })).toBeTruthy();
  for (const name of [
    'System Events',
    'Safari',
    'Chrome',
    'Calendar',
    'Reminders',
    'Finder',
    'Messages',
  ])
    expect(screen.getByText(name, { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Connect your apps' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('apps'));
  expect(
    accessChecklist(snapshot).filter((item) => item.label.endsWith('automation')),
  ).toHaveLength(7);
  expect(screen.getByText('Your apps')).toBeTruthy();
});

it('keeps existing profiles out of first-run and recovers a deleted starter', () => {
  const snapshot = structuredClone(demoSnapshot);
  delete snapshot.preferences.onboarding;
  expect(onboardingStep(snapshot)).toBeUndefined();
  snapshot.preferences.onboarding = { step: 'practice', agentId: 'deleted' };
  expect(onboardingStep(snapshot)).toBe('welcome');
  snapshot.preferences.onboarding = { step: 'complete' };
  snapshot.agents = [];
  expect(onboardingStep(snapshot)).toBeUndefined();
});

it('keeps voice permission denial optional and does not activate the microphone during setup', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = { step: 'voice', agentId: snapshot.agents[0]!.id };
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
  const api = {
    setOnboarding: vi.fn().mockResolvedValue(undefined),
    configurePushToTalk: vi.fn(),
    startRealtimeVoice: vi.fn(),
    requestComputerPermissions: vi.fn(),
    refreshComputerPermissions: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <Onboarding
      snapshot={snapshot}
      api={api as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div>Conversation</div>
    </Onboarding>,
  );
  expect(screen.getByText('Voice and microphone')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Connect your apps' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('apps'));
  expect(api.configurePushToTalk).not.toHaveBeenCalled();
  expect(api.startRealtimeVoice).not.toHaveBeenCalled();
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
});

it('offers setup and retry when no admitted model is ready without creating an unusable agent', () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.agents = [];
  snapshot.preferences.onboarding = { step: 'agent' };
  snapshot.providers.forEach((provider) => {
    provider.status = 'unavailable';
  });
  const createAgent = vi.fn();
  render(
    <Onboarding
      snapshot={snapshot}
      api={{ createAgent } as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div>Conversation</div>
    </Onboarding>,
  );
  expect(
    (screen.getByRole('button', { name: 'Create my agent' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  expect(createAgent).not.toHaveBeenCalled();
});

it('inserts tutorial suggestions into an empty composer without sending or overwriting a draft', () => {
  const onSend = vi.fn();
  const handled = vi.fn();
  const { rerender } = render(
    <Composer
      suggestion={{ text: 'Plan my day.' }}
      onSuggestionHandled={handled}
      onSend={onSend}
      onStop={vi.fn()}
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
  expect(input.value).toBe('Plan my day.');
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'Keep my own draft.' } });
  rerender(
    <Composer
      suggestion={{ text: 'A different suggestion.' }}
      onSuggestionHandled={handled}
      onSend={onSend}
      onStop={vi.fn()}
    />,
  );
  expect(input.value).toBe('Keep my own draft.');
  expect(onSend).not.toHaveBeenCalled();
});

it('shows unavailable cloud connections without requesting account or Mac access', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = { step: 'apps', agentId: snapshot.agents[0]!.id };
  snapshot.cloudAuth.state = 'unconfigured';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  snapshot.computer.messagesAccess = 'needs_full_disk_access';
  const api = {
    refreshComputerPermissions: vi.fn().mockResolvedValue(undefined),
    setupMessages: vi.fn().mockResolvedValue(undefined),
    connectSelectedApps: vi.fn(),
    setOnboarding: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <Onboarding
      snapshot={snapshot}
      api={api as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div />
    </Onboarding>,
  );
  expect(
    (screen.getByRole('button', { name: 'Connect selected apps' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/Unavailable in this build\./)).toBeTruthy();
  expect(api.setupMessages).not.toHaveBeenCalled();
  expect(api.connectSelectedApps).not.toHaveBeenCalled();
});

it('requires an explicit restart and prevents continuing while it is pending', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = { step: 'restart', agentId: snapshot.agents[0]!.id };
  const api = {
    restartForOnboarding: vi.fn().mockResolvedValue(undefined),
    setOnboarding: vi.fn(),
  };
  const props = {
    snapshot,
    api: api as unknown as RendererApi,
    onCustomize: vi.fn(),
    onSuggest: vi.fn(),
    onModels: vi.fn(),
    onAccount: vi.fn(),
  };
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(api.restartForOnboarding).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Restart Sia and check access' }));
  await waitFor(() => expect(api.restartForOnboarding).toHaveBeenCalledTimes(1));
  snapshot.preferences.onboarding = {
    ...snapshot.preferences.onboarding,
    step: 'verify',
    restartPending: true,
  };
  Object.assign(api, { refreshComputerPermissions: vi.fn().mockResolvedValue(undefined) });
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  expect(
    (screen.getByRole('button', { name: 'Restarting…' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Exit setup' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(api.setOnboarding).not.toHaveBeenCalled();
});

it('shows a missing browser after restart and attaches only when the user chooses it', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = {
    step: 'verify',
    agentId: snapshot.agents[0]!.id,
    restarted: true,
  };
  snapshot.browser.attached = false;
  snapshot.browser.availableWindows = [];
  const api = {
    refreshComputerPermissions: vi.fn().mockResolvedValue(undefined),
    attachBrowser: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <Onboarding
      snapshot={snapshot}
      api={api as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div />
    </Onboarding>,
  );
  expect(screen.getByText(/Some access still needs setup/)).toBeTruthy();
  expect(api.attachBrowser).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Open Gmail' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Choose Chrome window' }));
  await waitFor(() => expect(api.attachBrowser).toHaveBeenCalledTimes(1));
});

it('offers inbox access through the canonical browser action and counts only live granted origins', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = {
    step: 'verify',
    agentId: snapshot.agents[0]!.id,
    restarted: true,
  };
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  snapshot.browser.attached = true;
  snapshot.browser.tabs = [
    {
      id: 'gmail',
      title: 'Gmail',
      origin: 'https://mail.google.com',
      granted: true,
      active: true,
    },
  ];
  const api = {
    refreshComputerPermissions: vi.fn().mockResolvedValue(undefined),
    openBrowserSite: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <Onboarding
      snapshot={snapshot}
      api={api as unknown as RendererApi}
      onCustomize={vi.fn()}
      onSuggest={vi.fn()}
      onModels={vi.fn()}
      onAccount={vi.fn()}
    >
      <div />
    </Onboarding>,
  );
  expect(api.openBrowserSite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open Gmail' }));
  await waitFor(() =>
    expect(api.openBrowserSite).toHaveBeenCalledWith('https://mail.google.com'),
  );
  expect(accessChecklist(snapshot).find((item) => item.label === 'Gmail')).toMatchObject({
    ready: true,
    detail: 'Chrome access; check website sign-in',
  });
  snapshot.browser.attached = false;
  expect(accessChecklist(snapshot).find((item) => item.label === 'Gmail')?.ready).toBe(false);
});

it('uses the Mac browser route after restart without requiring a Chrome connection', async () => {
  const { SetupBrowser } = await import('./OnboardingConnections');
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.accessMode = 'mac';
  snapshot.browser.attached = false;
  const setComputerAccessMode = vi.fn(async () => undefined);
  const attachBrowser = vi.fn();
  render(
    <SetupBrowser
      snapshot={snapshot}
      api={{ setComputerAccessMode, attachBrowser } as unknown as RendererApi}
      pending={false}
      run={async (action) => {
        await action();
      }}
    />,
  );
  expect(screen.getByText('Use your existing browser')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Choose Chrome window' })).toBeNull();
  expect(attachBrowser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'App access mode' }), {
    target: { value: 'connected' },
  });
  await waitFor(() => expect(setComputerAccessMode).toHaveBeenCalledWith('connected'));
  expect(
    accessChecklist(snapshot).find((item) => item.label === 'Browser window access')?.detail,
  ).toContain('sign-in is checked during');
});

it('keeps setup on the checklist until pending account approval completes or is cancelled', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = { step: 'apps', agentId: snapshot.agents[0]!.id };
  snapshot.cloudAuth.state = 'signed-in';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  snapshot.apps[0]!.status = 'connecting';
  snapshot.apps[0]!.connectionId = 'pending-google';
  const api = {
    refreshComputerPermissions: vi.fn(async () => {}),
    setOnboarding: vi.fn(async () => {}),
    disconnectApp: vi.fn(async () => {}),
    connectSelectedApps: vi.fn(async () => {}),
  };
  const props = {
    snapshot,
    api: api as unknown as RendererApi,
    onCustomize: vi.fn(),
    onSuggest: vi.fn(),
    onModels: vi.fn(),
    onAccount: vi.fn(),
  };
  const view = render(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  for (const name of ['Review and restart', 'Back', 'Exit setup']) {
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  }
  expect(screen.getByText('Awaiting approval')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel connection setup' }));
  await waitFor(() =>
    expect(api.disconnectApp).toHaveBeenCalledWith('gmail', 'pending-google'),
  );
  expect(api.connectSelectedApps).not.toHaveBeenCalled();
  snapshot.apps[0]!.status = 'disconnected';
  view.rerender(
    <Onboarding {...props}>
      <div />
    </Onboarding>,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Review and restart' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review and restart' }));
  await waitFor(() => expect(api.setOnboarding).toHaveBeenCalledWith('restart'));
});

it('distinguishes unavailable features from missing access and never marks an unknown speech grant ready', () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.accessMode = 'mac';
  snapshot.computer.trust = 'auto';
  snapshot.computer.automation = {
    safari: 'unavailable',
    calendar: 'denied',
    finder: 'ready',
    messages: 'ready',
    reminders: 'ready',
  };
  snapshot.voice = {
    engine: 'macos',
    status: 'connected',
    voices: [],
    dictationAvailable: true,
    pushToTalk: {
      available: true,
      enabled: true,
      accessibility: true,
      microphone: true,
      phase: 'idle',
    },
  };
  expect(accessChecklist(snapshot).find((item) => item.label === 'Fn dictation')?.ready).toBe(
    false,
  );
  snapshot.voice.speechRecognition = 'allowed';
  expect(accessChecklist(snapshot).find((item) => item.label === 'Fn dictation')?.ready).toBe(
    true,
  );
  snapshot.voice.dictationAvailable = false;
  render(<SetupAccessReview snapshot={snapshot} />);
  expect(screen.getByText('Fn dictation').closest('li')?.textContent).toContain('Unavailable');
  expect(screen.getByText('Safari automation').closest('li')?.textContent).toContain(
    'Unavailable',
  );
  expect(screen.getByText('Calendar automation').closest('li')?.textContent).toContain(
    'Needs setup',
  );
});
