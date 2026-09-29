// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SetupMacAccess } from './SetupMacAccess';
import { demoSnapshot } from '../demo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(autoStart = false) {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.accessibility = 'not-requested';
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.voice.pushToTalk = {
    available: false,
    enabled: false,
    accessibility: false,
    microphone: false,
    phase: 'idle',
  };
  snapshot.computer.automation = {
    system_events: 'ready',
    safari: 'needs_permission',
    chrome: 'unavailable',
    calendar: 'ready',
    reminders: 'ready',
    finder: 'ready',
    messages: 'ready',
  };
  const api = {
    requestComputerPermissions: vi.fn(async () => {}),
    refreshComputerPermissions: vi.fn(async () => {}),
    requestAutomationPermission: vi.fn(async () => {}),
    configureVoice: vi.fn(async () => {}),
    configurePushToTalk: vi.fn(async () => {}),
  };
  const complete = vi.fn(async () => {});
  const pause = vi.fn();
  const busy = vi.fn();
  const content = () => (
    <StrictMode>
      <SetupMacAccess
        snapshot={snapshot}
        api={api}
        agentId="agent"
        disabled={false}
        onBusyChange={busy}
        onComplete={complete}
        onPause={pause}
        includeApps
        autoStart={autoStart}
      />
    </StrictMode>
  );
  const view = render(content());
  return { snapshot, api, complete, pause, view, rerender: () => view.rerender(content()) };
}

it('one start waits for verified access, advances without more clicks, and never overlaps prompts', async () => {
  const { snapshot, api, complete, rerender } = setup();
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1));
  fireEvent.focus(window);
  rerender();
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  snapshot.computer.accessibility = 'allowed';
  rerender();
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(2));
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  snapshot.computer.screenRecording = 'allowed';
  rerender();
  await waitFor(() =>
    expect(api.requestAutomationPermission).toHaveBeenCalledExactlyOnceWith('safari'),
  );
  expect(complete).not.toHaveBeenCalled(); // Request returned, but user has not granted it.
  snapshot.computer.automation!.safari = 'ready';
  rerender();
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Mac access is ready.')).toBeTruthy();
  expect(api.configureVoice).not.toHaveBeenCalled();
});

it('an explicitly authorized automatic pass starts once even under StrictMode and focus checks', async () => {
  const { api, rerender } = setup(true);
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1));
  fireEvent.focus(window);
  rerender();
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalled());
  expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1);
});

it('keeps a denial incomplete and retries only the current step when the person requests recovery', async () => {
  const { snapshot, api, complete, rerender } = setup();
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.automation!.safari = 'denied';
  rerender();
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Open System Settings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(screen.getByText('In Automation, expand Sia and turn on Safari.')).toBeTruthy();
  expect(screen.getByText('Allow in System Settings')).toBeTruthy();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }));
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledTimes(2));
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
});

it('stops the pass while a native request is pending and does not continue after its late result', async () => {
  const { snapshot, api, complete, pause, rerender } = setup();
  const request = Promise.withResolvers<void>();
  api.requestComputerPermissions.mockImplementation(() => request.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Finish later' }));
  expect(pause).toHaveBeenCalledOnce();
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  rerender();
  await act(async () => {
    request.resolve();
    await request.promise;
  });
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Set up permissions' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('does not enable Fn after the person pauses a pending voice setup', async () => {
  const { snapshot, api, complete, rerender } = setup();
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.voice.status = 'disconnected';
  snapshot.voice.dictationAvailable = true;
  snapshot.voice.pushToTalk!.available = true;
  const voice = Promise.withResolvers<void>();
  api.configureVoice.mockImplementation(() => voice.promise);
  rerender();
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(api.configureVoice).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Finish later' }));
  await act(async () => {
    voice.resolve();
    await voice.promise;
  });
  expect(api.configurePushToTalk).not.toHaveBeenCalled();
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

it('keeps core statuses visible and allows passive checks without starting a permission pass', async () => {
  const { api, view } = setup();
  const core = screen.getByRole('list', { name: 'Core permissions' });
  expect(core.closest('details')).toBeNull();
  expect(core.textContent).toContain('Control your Mac');
  expect(core.textContent).toContain('See your screen');
  fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledOnce());
  fireEvent.focus(window);
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(2));
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
  view.unmount();
  fireEvent.focus(window);
  expect(api.refreshComputerPermissions).toHaveBeenCalledTimes(2);
});

it('explains unavailable dictation without attempting to configure it', async () => {
  const { snapshot, api, rerender } = setup();
  snapshot.voice.dictationAvailable = false;
  snapshot.voice.dictationDetail = 'Dictation is unavailable for this language.';
  rerender();
  expect(screen.getByText('Dictation is unavailable for this language.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledOnce());
  expect(api.configureVoice).not.toHaveBeenCalled();
});
