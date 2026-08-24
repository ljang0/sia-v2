// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../../demo';
import type { RendererSnapshot } from '../../types';
import { AppsSettings } from './AppsSettings';
import { ComputerSettings } from './ComputerSettings';
import { PrivacySettings } from './PrivacySettings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('cloud account settings', () => {
  it('requires research-alpha acknowledgment, submits a normalized email, and focuses errors', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('Sia could not start email sign-in.'));
    render(
      <AppsSettings
        snapshot={withCloud('signed-out')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={onStart}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: '  LAWRENCE@EXAMPLE.COM  ' },
    });
    const submit = screen.getByRole('button', { name: 'Join & email me a code' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('checkbox', { name: /18 or older and joining the Sia research alpha/i }),
    );
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('lawrence@example.com'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Sia could not start email sign-in.');
    expect(alert.parentElement).toBe(document.activeElement);
  });

  it('accepts only a 6-10 digit code and offers resend and change-email paths', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('code-sent', 'lawrence@example.com')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={onStart}
        onCompleteCloudSignIn={onComplete}
        onSignOutCloud={onSignOut}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    const code = screen.getByRole('textbox', { name: 'Sign-in code' });
    expect(screen.getByText(/A one-time code will arrive shortly/)).toBeTruthy();
    expect(document.activeElement).toBe(code);
    fireEvent.change(code, { target: { value: '12a 34-5678901' } });
    expect((code as HTMLInputElement).value).toBe('1234567890');
    fireEvent.submit(code.closest('form')!);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('1234567890'));

    fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith('lawrence@example.com'));
    fireEvent.click(screen.getByRole('button', { name: 'Use another email' }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
  });

  it('collects an admin password privately before the authenticator step', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('password-required', 'admin@example.com')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={onComplete}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    const password = screen.getByLabelText('Administrator password') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(document.activeElement).toBe(password);
    fireEvent.change(password, { target: { value: ' admin password with spaces ' } });
    fireEvent.submit(password.closest('form')!);

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(' admin password with spaces '),
    );
    expect(screen.getByText(/password, then an authenticator code/)).toBeTruthy();
  });

  it('explains local mode without showing unusable app connection controls', () => {
    render(
      <AppsSettings
        snapshot={withCloud('unconfigured')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText('Local mode is ready')).toBeTruthy();
    expect(screen.getByText(/work without a Sia account or cloud credits/)).toBeTruthy();
    expect(
      screen.getByText(/will appear here after a cloud service is configured/),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect work apps' })).toBeNull();
    expect(screen.getByText('Signed-in Chrome')).toBeTruthy();
    expect(screen.getByText('Messages')).toBeTruthy();
  });

  it('shows the signed-in identity and enables app connection', () => {
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Signed in as lawrence@example\.com\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    for (const name of [
      'Connect Gmail',
      'Connect Google Drive',
      'Connect Google Docs',
      'Connect Google Sheets',
      'Connect Google Slides',
      'Connect Slack',
    ]) {
      for (const button of screen.getAllByRole('button', { name })) {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    }
  });

  it('puts signed-in Chrome and Apple Messages behind separate local buttons', async () => {
    const snapshot = withCloud('unconfigured');
    snapshot.browser = {
      status: 'detached',
      profileName: 'Chrome',
      attached: false,
      availableWindows: [],
      tabs: [],
    };
    snapshot.computer.accessibility = 'allowed';
    snapshot.computer.screenRecording = 'allowed';
    const onAttachBrowser = vi.fn().mockResolvedValue(undefined);
    const onOpenMessages = vi.fn().mockResolvedValue(undefined);

    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
        onAttachBrowser={onAttachBrowser}
        onDetachBrowser={vi.fn()}
        onOpenMessages={onOpenMessages}
        onReviewComputerAccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose window' }));
    await waitFor(() => expect(onAttachBrowser).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Open Messages' }));
    await waitFor(() => expect(onOpenMessages).toHaveBeenCalledOnce());
  });

  it('starts one Google approval and explains the provider consent boundary', async () => {
    const onConnectGoogle = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectGoogle={onConnectGoogle}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText(/one account approval for Gmail, Drive/i)).toBeTruthy();
    expect(screen.getByText(/nothing is bulk copied into Sia/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
    await waitFor(() => expect(onConnectGoogle).toHaveBeenCalledOnce());
  });

  it('offers one-click migration when older partial Google grants are present', async () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps = snapshot.apps.map((app) => {
      if (app.id === 'gmail') {
        return { ...app, status: 'connected', connectionId: 'legacy_gmail' };
      }
      if (app.id === 'drive') {
        return { ...app, status: 'connected', connectionId: 'legacy_drive' };
      }
      return app;
    });
    const onConnectGoogle = vi.fn().mockResolvedValue(undefined);
    const onDisconnect = vi.fn();

    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectGoogle={onConnectGoogle}
        onConnect={vi.fn()}
        onDisconnect={onDisconnect}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText(/Older connections found/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Google' }));
    await waitFor(() => expect(onConnectGoogle).toHaveBeenCalledOnce());
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('lets a connected Google account expose only the services the person enables', async () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps = snapshot.apps.map((app) =>
      app.id === 'slack'
        ? app
        : {
            ...app,
            status: 'connected',
            connectionId: 'gw_shared',
            enabled: app.id === 'docs',
          },
    );
    const onSetEnabled = vi.fn().mockResolvedValue(undefined);

    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onSetEnabled={onSetEnabled}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText('1 of 5 services available')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Gmail' }));
    await waitFor(() => expect(onSetEnabled).toHaveBeenCalledWith('gmail', true));
    fireEvent.click(screen.getByRole('button', { name: 'Disable Google Docs' }));
    await waitFor(() => expect(onSetEnabled).toHaveBeenCalledWith('docs', false));
  });

  it('lets people connect Slack without connecting Google', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectGoogle={vi.fn()}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Connect Slack' })[0]!);
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith('slack'));
  });

  it('surfaces an interrupted saved grant and provides one-click reconnect', async () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps[0] = {
      ...snapshot.apps[0]!,
      status: 'error',
      description: 'Connection setup was interrupted. Verify or disconnect this saved grant.',
    };
    const onConnect = vi.fn().mockResolvedValue(undefined);
    const onDisconnect = vi.fn();
    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectAll={vi.fn()}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText(/Connection setup was interrupted/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect Gmail' }));
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith('gmail'));
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('requires the exact account-deletion phrase and keeps failures recoverable', async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cloud account deletion did not complete.'))
      .mockResolvedValueOnce(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectAll={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete your Sia cloud account?',
    });
    expect(dialog.textContent).toContain('Only after the cloud confirms completion');
    expect(dialog.textContent).toContain('Workspace files');
    const deleteButton = screen.getByRole('button', {
      name: 'Permanently delete account',
    }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox', { name: /Type DELETE ACCOUNT/ }), {
      target: { value: 'delete account' },
    });
    expect(deleteButton.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: /Type DELETE ACCOUNT/ }), {
      target: { value: 'DELETE ACCOUNT' },
    });
    expect(deleteButton.disabled).toBe(false);
    fireEvent.click(deleteButton);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Cloud account deletion did not complete.');
    expect(onDelete).toHaveBeenCalledWith('DELETE ACCOUNT');
    expect(document.activeElement).toBe(alert);
    expect(document.body.contains(dialog)).toBe(true);

    fireEvent.click(deleteButton);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('research consent settings', () => {
  it('keeps the consent dialog open and focuses an inline error when enabling fails', async () => {
    const onCapture = vi.fn().mockRejectedValue(new Error('Research service is unavailable.'));
    render(
      <PrivacySettings
        snapshot={withoutResearchConsent()}
        onSetCapturePaused={onCapture}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Not enabled')).toBeTruthy();
    expect(screen.getByText(/Anything the task can observe may be included raw/)).toBeTruthy();
    expect(screen.queryByText(/always excluded|withdraw consent/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review & enable' }));
    const dialog = screen.getByRole('alertdialog', {
      name: 'Join the Sia research release?',
    });
    expect(dialog.textContent).toContain('Research data is not used for model training.');
    expect(dialog.textContent).toContain('Raw task content can contain private or secret');
    expect(dialog.textContent).toContain('Deleting resets consent.');
    fireEvent.click(screen.getByRole('button', { name: 'Join research release' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Research service is unavailable.');
    expect(document.activeElement).toBe(alert);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('does not show recording when consent has not been granted', () => {
    render(
      <PrivacySettings
        snapshot={withoutResearchConsent()}
        onSetCapturePaused={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText('Recording')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Review & enable' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('makes deletion and consent reset one explicit action', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <PrivacySettings
        snapshot={structuredClone(demoSnapshot)}
        onSetCapturePaused={vi.fn()}
        onExport={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete research data' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your research data?' });
    expect(dialog.textContent).toContain('turns research capture off, and resets consent');
    fireEvent.click(screen.getByRole('button', { name: 'Delete data' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });

  it('does not offer a capture pause while a research-release account is signed in', () => {
    render(
      <PrivacySettings
        snapshot={structuredClone(demoSnapshot)}
        onSetCapturePaused={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Required while signed in')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.getByText(/Sign out to stop new collection/)).toBeTruthy();
  });
});

describe('computer access settings', () => {
  it('describes only the grants and revocation surfaces the UI exposes', () => {
    render(
      <ComputerSettings
        snapshot={structuredClone(demoSnapshot)}
        onAttachBrowser={vi.fn()}
        onOpenBrowserSite={vi.fn()}
        onDetachBrowser={vi.fn()}
        onRequestPermissions={vi.fn()}
        onUnlockComputer={vi.fn()}
        onSetComputerTrust={vi.fn()}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );

    expect(screen.getByText(/Every action stays in the local log for review/)).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: 'Confirm before changes' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen
        .getByRole('switch', { name: 'Keep a full local log' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.queryByText(/Every grant is narrow, visible, and revocable/)).toBeNull();
  });

  it('does not call Chrome ready until a window is attached', () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.browser = {
      status: 'detached',
      profileName: 'Chrome',
      attached: false,
      availableWindows: [],
      tabs: [],
    };
    snapshot.computer.chromeConnection = 'enabled';

    render(
      <ComputerSettings
        snapshot={snapshot}
        onAttachBrowser={vi.fn()}
        onOpenBrowserSite={vi.fn()}
        onDetachBrowser={vi.fn()}
        onRequestPermissions={vi.fn()}
        onUnlockComputer={vi.fn()}
        onSetComputerTrust={vi.fn()}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );

    expect(screen.queryByText('Everything is unlocked')).toBeNull();
    expect(screen.getByText(/approve Chrome once/i)).toBeTruthy();
    expect(screen.getByText(/security step cannot be skipped/i)).toBeTruthy();
  });

  it('flips trust and the local log through the switches', async () => {
    const onSetComputerTrust = vi.fn(async () => undefined);
    const onSetTrajectoryLog = vi.fn(async () => undefined);
    render(
      <ComputerSettings
        snapshot={structuredClone(demoSnapshot)}
        onAttachBrowser={vi.fn()}
        onOpenBrowserSite={vi.fn()}
        onDetachBrowser={vi.fn()}
        onRequestPermissions={vi.fn()}
        onUnlockComputer={vi.fn()}
        onSetComputerTrust={onSetComputerTrust}
        onSetTrajectoryLog={onSetTrajectoryLog}
        onRevealTrajectories={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Confirm before changes' }));
    await waitFor(() => expect(onSetComputerTrust).toHaveBeenCalledWith('ask'));
    await waitFor(() =>
      expect(
        (screen.getByRole('switch', { name: 'Keep a full local log' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Keep a full local log' }));
    await waitFor(() => expect(onSetTrajectoryLog).toHaveBeenCalledWith(false));
  });
});

function withCloud(
  state: RendererSnapshot['cloudAuth']['state'],
  email?: string,
): RendererSnapshot {
  return {
    ...structuredClone(demoSnapshot),
    cloudAuth: email ? { state, email } : { state },
    apps: structuredClone(demoSnapshot.apps).map((app) => ({
      ...app,
      status: 'disconnected',
      account: undefined,
    })),
  };
}

function withoutResearchConsent(): RendererSnapshot {
  return {
    ...structuredClone(demoSnapshot),
    research: {
      ...structuredClone(demoSnapshot.research),
      consented: false,
      capture: 'paused',
    },
  };
}
