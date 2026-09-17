// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import type { RendererApi } from '../types';
import { automationApps, type AutomationPermissions } from '../../shared/mac-permissions';
import { SetupMacAccess } from './SetupMacAccess';
import { SetupConnections } from './OnboardingConnections';

afterEach(cleanup);

function setup() {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.accessibility = 'not-requested';
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.messagesAccess = 'needs_full_disk_access';
  snapshot.computer.automation = Object.fromEntries(
    automationApps.map(({ id }) => [id, 'needs_permission']),
  ) as AutomationPermissions;
  snapshot.voice = {
    status: 'disconnected',
    voices: [],
    pushToTalk: {
      available: true,
      enabled: false,
      accessibility: false,
      microphone: false,
      phase: 'idle',
    },
  };
  const api = {
    requestComputerPermissions: vi.fn(async () => {}),
    configureVoice: vi.fn(async () => {}),
    configurePushToTalk: vi.fn(async () => {}),
    setupMessages: vi.fn(async () => {}),
    requestAutomationPermission: vi.fn(async () => {}),
    refreshComputerPermissions: vi.fn(async () => {}),
  };
  const props = {
    snapshot,
    api: api as unknown as RendererApi,
    agentId: snapshot.agents[0]!.id,
    disabled: false,
    onBusyChange: vi.fn(),
    onReadyChange: vi.fn(),
  };
  return { snapshot, api, props };
}

it('requests only core access, preserves failures, and never launches apps or Messages setup', async () => {
  const { snapshot, api, props } = setup();
  snapshot.computer.automation!.calendar = 'ready';
  snapshot.computer.automation!.chrome = 'unavailable';
  api.configureVoice.mockRejectedValue(new Error('Speech access denied'));
  render(<SetupMacAccess {...props} />);
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow all required access' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Speech access denied'),
  );
  expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
  expect(api.setupMessages).not.toHaveBeenCalled();
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  expect(props.onBusyChange.mock.calls).toEqual([[true], [false]]);
  fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(2));
  expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
  expect(api.configureVoice).toHaveBeenCalledTimes(1);
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
});

it.each([false, true])(
  'requests helper Accessibility only when the main app already has access: %s',
  async (allowed) => {
    const { snapshot, api, props } = setup();
    if (allowed) snapshot.computer.accessibility = 'allowed';
    render(<SetupMacAccess {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow all required access' }));
    await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(1));
    expect(api.configurePushToTalk).toHaveBeenCalledExactlyOnceWith(
      true,
      props.agentId,
      allowed,
    );
    expect(api.configureVoice.mock.invocationCallOrder[0]).toBeLessThan(
      api.configurePushToTalk.mock.invocationCallOrder[0]!,
    );
  },
);

it('finishes core setup even when Messages and individual app access are not granted', async () => {
  const { snapshot, api, props } = setup();
  snapshot.computer.accessibility = snapshot.computer.screenRecording = 'allowed';
  snapshot.voice = {
    status: 'connected',
    voices: [],
    pushToTalk: {
      available: true,
      enabled: true,
      accessibility: true,
      microphone: true,
      phase: 'idle',
    },
  };
  render(<SetupMacAccess {...props} />);
  expect(
    (screen.getByRole('button', { name: 'Allow all required access' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(1));
  expect(props.onReadyChange).toHaveBeenCalledWith(true);
  for (const [name, method] of Object.entries(api))
    if (name !== 'refreshComputerPermissions') expect(method).not.toHaveBeenCalled();
});

it('shows unsupported dictation as unavailable and does not request it', async () => {
  const { snapshot, api, props } = setup();
  snapshot.voice.dictationAvailable = false;
  snapshot.voice.dictationDetail = 'Dictation is unavailable for this language.';
  render(<SetupMacAccess {...props} />);
  expect(screen.getByText('Dictation is unavailable for this language.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Allow all required access' }));
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(1));
  expect(api.configurePushToTalk).not.toHaveBeenCalled();
});

it('connects only checked accounts and disables already connected accounts', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.cloudAuth.state = 'signed-in';
  snapshot.apps.forEach((app) => {
    app.status = 'disconnected';
  });
  const connectSelectedApps = vi.fn(async () => {});
  const props = {
    snapshot,
    api: { connectSelectedApps } as unknown as RendererApi,
    pending: false,
    run: async (action: () => Promise<unknown>) => {
      await action();
    },
  };
  const view = render(<SetupConnections {...props} />);
  const google = screen.getByRole('checkbox', { name: /Google Workspace/ }) as HTMLInputElement;
  const slack = screen.getByRole('checkbox', { name: /Slack/ }) as HTMLInputElement;
  expect(google.checked).toBe(true);
  expect(slack.checked).toBe(true);
  fireEvent.click(slack);
  fireEvent.click(screen.getByRole('button', { name: 'Connect selected apps' }));
  await waitFor(() => expect(connectSelectedApps).toHaveBeenCalledExactlyOnceWith(['google']));
  snapshot.apps
    .filter((app) => app.id !== 'slack')
    .forEach((app) => {
      app.status = 'connected';
      app.enabled = true;
    });
  view.rerender(<SetupConnections {...props} />);
  expect(google.disabled).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Connect selected apps' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
