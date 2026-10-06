// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { macAccessRows, SetupMacAccess } from './SetupMacAccess';
import { demoSnapshot } from '../demo/snapshot';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function setup(autoStart = false, onRestart?: (skipped: string[]) => Promise<void>) {
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
    setupMessages: vi.fn(async () => {}),
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
        {...(onRestart ? { onRestart } : {})}
      />
    </StrictMode>
  );
  const view = render(content());
  return { snapshot, api, complete, pause, view, rerender: () => view.rerender(content()) };
}

it('one start waits for verified access, advances without more clicks, and never overlaps prompts', async () => {
  const { snapshot, api, complete, rerender } = setup();
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Open System Settings' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(screen.getByText('In Automation, expand Sia and turn on Safari.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open Settings: Safari' })).toBeTruthy();
  expect(screen.getByText('Turned off')).toBeTruthy();
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Open System Settings' }));
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledTimes(2));
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
});

it('stops the pass while a native request is pending and does not continue after its late result', async () => {
  const { snapshot, api, complete, pause, rerender } = setup();
  const request = Promise.withResolvers<void>();
  api.requestComputerPermissions.mockImplementation(() => request.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
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
    (screen.getByRole('button', { name: 'Grant all' }) as HTMLButtonElement).disabled,
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
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
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
  const core = screen.getByRole('list', { name: 'Needed permissions' });
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
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
  await waitFor(() => expect(api.requestComputerPermissions).toHaveBeenCalledOnce());
  expect(api.configureVoice).not.toHaveBeenCalled();
});

it('lists every permission once, with the two needed ones first and the rest optional', () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.messagesAccess = 'needs_full_disk_access';
  snapshot.computer.automation = {
    system_events: 'ready',
    safari: 'needs_permission',
    chrome: 'unavailable',
    calendar: 'not_running',
    reminders: 'denied',
    finder: 'error',
    messages: 'ready',
  };
  snapshot.voice.pushToTalk = {
    available: true,
    enabled: false,
    accessibility: true,
    microphone: false,
    phase: 'idle',
  };
  const api = {
    requestComputerPermissions: vi.fn(async () => {}),
    refreshComputerPermissions: vi.fn(async () => {}),
    requestAutomationPermission: vi.fn(async () => {}),
    configureVoice: vi.fn(async () => {}),
    configurePushToTalk: vi.fn(async () => {}),
    setupMessages: vi.fn(async () => {}),
  };
  const rows = macAccessRows(snapshot, api, {
    agentId: 'agent',
    includeApps: true,
    canRelaunch: true,
  });
  expect(rows.map(({ id, optional, state, guided }) => [id, optional, state, guided])).toEqual([
    ['accessibility', false, 'ready', true],
    ['screen', false, 'ready', true],
    ['voice', true, 'needed', true],
    ['system_events', true, 'ready', true],
    ['safari', true, 'needed', true],
    ['calendar', true, 'needed', true],
    ['reminders', true, 'denied', true],
    ['finder', true, 'error', true],
    ['messages', true, 'ready', true],
    // Full Disk Access is guided through System Settings and remains skippable.
    ['messages_history', true, 'needed', true],
  ]);
  for (const row of rows) expect(row.why.length).toBeGreaterThan(10);
  expect(
    macAccessRows(snapshot, api, {
      agentId: 'agent',
      includeApps: false,
      canRelaunch: false,
    }).map(({ id }) => id),
  ).toEqual(['accessibility', 'screen', 'voice']);
});

it('each row asks for exactly its own permission without starting a pass', async () => {
  const { api } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Allow: See your screen' }));
  await waitFor(() =>
    expect(api.requestComputerPermissions).toHaveBeenCalledExactlyOnceWith('screenRecording'),
  );
  await waitFor(() => expect(api.refreshComputerPermissions).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Allow: Safari' }));
  await waitFor(() =>
    expect(api.requestAutomationPermission).toHaveBeenCalledExactlyOnceWith('safari'),
  );
  expect(api.requestComputerPermissions).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Step \d/)).toBeNull();
});

it('lets optional steps be skipped, but not the permissions Sia needs', async () => {
  const { snapshot, api, complete, rerender } = setup();
  snapshot.computer.screenRecording = 'allowed';
  rerender();
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
  await waitFor(() =>
    expect(api.requestComputerPermissions).toHaveBeenCalledExactlyOnceWith('accessibility'),
  );
  expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  snapshot.computer.accessibility = 'allowed';
  rerender();
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledWith('safari'));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Skip' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
  await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  expect(api.requestAutomationPermission).toHaveBeenCalledOnce();
  expect(screen.getByText('Mac access is ready.')).toBeTruthy();
});

it('treats a grant waiting for a relaunch as done-but-reopen, and relaunches once on request', async () => {
  const onRestart = vi.fn(async (_skipped: string[]) => {});
  const { snapshot, api, complete, rerender } = setup(false, onRestart);
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.relaunchFor = ['screenRecording'];
  snapshot.computer.automation!.safari = 'ready';
  rerender();
  expect(screen.getByText('Reopen Sia')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Allow: See your screen' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Grant all' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('See your screen is turned on');
  expect(complete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Relaunch Sia' }));
  await waitFor(() => expect(onRestart).toHaveBeenCalledExactlyOnceWith([]));
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
});

it('offers a relaunch fallback when a needed grant still reads as off after asking', async () => {
  const onRestart = vi.fn(async (_skipped: string[]) => {});
  const { snapshot } = setup(false, onRestart);
  snapshot.computer.accessibility = 'allowed';
  expect(screen.queryByRole('button', { name: /Relaunch Sia/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Allow: See your screen' }));
  const fallback = await screen.findByRole('button', { name: 'Turned it on? Relaunch Sia' });
  fireEvent.click(fallback);
  await waitFor(() => expect(onRestart).toHaveBeenCalledOnce());
});

it('keeps checking status while something is missing so rows flip without a restart', async () => {
  vi.useFakeTimers();
  const { api } = setup();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(api.refreshComputerPermissions.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(api.requestComputerPermissions).not.toHaveBeenCalled();
  expect(api.requestAutomationPermission).not.toHaveBeenCalled();
});

it('finishes the guided app prompts before one relaunch and includes Full Disk Access', async () => {
  const restart = vi.fn(async () => {});
  const { snapshot, api, complete, rerender } = setup(false, restart);
  snapshot.computer.accessibility = 'allowed';
  snapshot.computer.screenRecording = 'allowed';
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.relaunchFor = ['screenRecording'];
  snapshot.computer.messagesAccess = 'needs_full_disk_access';
  rerender();
  fireEvent.click(screen.getByRole('button', { name: 'Grant all' }));
  await waitFor(() => expect(api.requestAutomationPermission).toHaveBeenCalledWith('safari'));
  expect(screen.queryByRole('button', { name: 'Relaunch Sia' })).toBeNull();
  snapshot.computer.automation!.safari = 'ready';
  rerender();
  await waitFor(() => expect(api.setupMessages).toHaveBeenCalledOnce());
  expect(complete).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Turned it on? Relaunch Sia' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turned it on? Relaunch Sia' }));
  expect(restart).toHaveBeenCalledExactlyOnceWith([]);
});
