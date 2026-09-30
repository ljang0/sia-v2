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
  it('submits a normalized email without a research gate and focuses errors', async () => {
    const onStart = vi.fn().mockRejectedValue(new Error('Sia could not start email sign-in.'));
    render(
      <AppsSettings
        snapshot={withCloud('signed-out')}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
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
    const submit = screen.getByRole('button', { name: 'Email me a sign-in code' });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('checkbox', { name: /research/i })).toBeNull();
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
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
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
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
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

  it('explains unavailable cloud connections without showing unusable controls', () => {
    render(
      <AppsSettings
        snapshot={withCloud('unconfigured')}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText('Cloud connections unavailable')).toBeTruthy();
    expect(screen.getByText(/does not have a Sia cloud service configured/)).toBeTruthy();
    expect(screen.getByText(/will appear after cloud service is configured/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect work apps' })).toBeNull();
    expect(screen.getByText('Signed-in Chrome')).toBeTruthy();
    expect(screen.getByText('Messages')).toBeTruthy();
  });

  it('shows the signed-in identity and enables app connection', () => {
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Account', { selector: 'span' }));
    expect(screen.getByText(/^Signed in as lawrence@example\.com\./)).toBeTruthy();
    expect(screen.getByText('Available for this account')).toBeTruthy();
    expect(screen.getByText(/workspace administrator may need to approve/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Connect selected apps' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('keeps connector availability explicit before sign-in and for gated accounts', () => {
    const { unmount } = render(
      <AppsSettings
        snapshot={withCloud('signed-out')}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Sign in to connect')[0]).toBeTruthy();
    unmount();

    const snapshot = withCloud('signed-in', 'tester@example.com');
    snapshot.cloudAuth.features = {
      researchUploads: false,
      researchArchive: false,
      connectors: false,
      schedules: true,
    };
    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Not enabled for this account')[0]).toBeTruthy();
    expect(screen.getByText(/Existing connections can still be disconnected/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Connect selected apps' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
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
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
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

  it('starts one read-only Google approval and explains the provider consent boundary', async () => {
    const onConnectSelected = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectSelected={onConnectSelected}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText(/Google starts read-only/i)).toBeTruthy();
    expect(
      screen.getByRole('checkbox', { name: /Google Workspace/ }).closest('label')?.textContent,
    ).toContain('Read access.');
    fireEvent.click(screen.getByRole('checkbox', { name: /Slack/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected apps' }));
    await waitFor(() => expect(onConnectSelected).toHaveBeenCalledWith(['google']));
  });

  it('keeps read access active while a person explicitly enables Google editing', async () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps = snapshot.apps.map((app) =>
      app.id === 'slack'
        ? app
        : {
            ...app,
            status: 'connected',
            connectionId: 'gw_read_only',
            googleAccess: 'read_only',
            enabled: true,
          },
    );
    const onUpgradeGoogle = vi.fn().mockResolvedValue(undefined);

    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onUpgradeGoogle={onUpgradeGoogle}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText('Read-only access')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable editing' }));
    await waitFor(() => expect(onUpgradeGoogle).toHaveBeenCalledOnce());
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
        onConnectSelected={vi.fn()}
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
        onConnectSelected={vi.fn()}
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

    expect(screen.getByText('Editing enabled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Gmail' }));
    await waitFor(() => expect(onSetEnabled).toHaveBeenCalledWith('gmail', true));
    fireEvent.click(screen.getByRole('button', { name: 'Disable Google Docs' }));
    await waitFor(() => expect(onSetEnabled).toHaveBeenCalledWith('docs', false));
  });

  it('asks before disconnecting Google or Slack', async () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps = snapshot.apps.map((app) => ({
      ...app,
      status: 'connected',
      connectionId: app.id === 'slack' ? 'slack_1' : 'gw_shared',
    }));
    const onDisconnect = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={snapshot}
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={onDisconnect}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Google Workspace' }));
    const google = screen.getByRole('alertdialog', { name: 'Disconnect Google?' });
    expect(google.textContent).toMatch(/until you connect again/);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDisconnect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Slack' }));
    expect(screen.getByRole('alertdialog', { name: 'Disconnect Slack?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(onDisconnect).toHaveBeenCalledWith('slack', 'slack_1'));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('lets people connect Slack without connecting Google', async () => {
    const onConnectSelected = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectSelected={onConnectSelected}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Google Workspace/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect selected apps' })[0]!);
    await waitFor(() => expect(onConnectSelected).toHaveBeenCalledWith(['slack']));
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
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
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
        onConnectSelected={vi.fn()}
        onConnectGoogle={vi.fn()}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={onDelete}
      />,
    );

    fireEvent.click(screen.getByText('Account', { selector: 'span' }));
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
    await waitFor(() => expect(document.activeElement).toBe(alert));
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
    // Focus moves in an effect after the error renders, so wait for it rather than racing it.
    await waitFor(() => expect(document.activeElement).toBe(alert));
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

  it('keeps research capture optional while an account is signed in', () => {
    render(
      <PrivacySettings
        snapshot={structuredClone(demoSnapshot)}
        onSetCapturePaused={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByText(/Pause collection, export local records/)).toBeTruthy();
  });
});

describe('computer access settings', () => {
  it('describes only the grants and revocation surfaces the UI exposes', () => {
    render(
      <ComputerSettings
        snapshot={structuredClone(demoSnapshot)}
        onReviewConnections={vi.fn()}
        macSetupApi={{
          requestComputerPermissions: vi.fn(),
          requestAutomationPermission: vi.fn(),
          refreshComputerPermissions: vi.fn(),
          configureVoice: vi.fn(),
          configurePushToTalk: vi.fn(),
        }}
        onSetComputerTrust={vi.fn()}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );

    expect(screen.getByText(/whether actions need your confirmation/i)).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: 'Bypass action approvals' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(screen.getByText('Diagnostics'));
    expect(
      screen
        .getByRole('switch', { name: 'Keep a full local log' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.queryByText(/Every grant is narrow, visible, and revocable/)).toBeNull();
  });

  it('uses Connections as the single browser setup route', () => {
    const onReviewConnections = vi.fn();
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
        onReviewConnections={onReviewConnections}
        macSetupApi={{
          requestComputerPermissions: vi.fn(),
          requestAutomationPermission: vi.fn(),
          refreshComputerPermissions: vi.fn(),
          configureVoice: vi.fn(),
          configurePushToTalk: vi.fn(),
        }}
        onSetComputerTrust={vi.fn()}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );

    expect(screen.queryByText('Everything is unlocked')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose window' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
    expect(onReviewConnections).toHaveBeenCalledOnce();
  });

  it('asks for confirmation before bypassing action approvals', async () => {
    const onSetComputerTrust = vi.fn(async () => undefined);
    const snapshot = structuredClone(demoSnapshot);
    snapshot.computer.trust = 'ask';
    render(
      <ComputerSettings
        snapshot={snapshot}
        onReviewConnections={vi.fn()}
        macSetupApi={{
          requestComputerPermissions: vi.fn(),
          requestAutomationPermission: vi.fn(),
          refreshComputerPermissions: vi.fn(),
          configureVoice: vi.fn(),
          configurePushToTalk: vi.fn(),
        }}
        onSetComputerTrust={onSetComputerTrust}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Bypass action approvals' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Let Sia act without asking?' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep asking me' }));
    expect(onSetComputerTrust).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'Bypass action approvals' }));
    fireEvent.click(screen.getByRole('button', { name: 'Act without asking' }));
    await waitFor(() => expect(onSetComputerTrust).toHaveBeenCalledWith('auto'));
  });

  it('flips trust and the local log through the switches', async () => {
    const onSetComputerTrust = vi.fn(async () => undefined);
    const onSetTrajectoryLog = vi.fn(async () => undefined);
    const snapshot = structuredClone(demoSnapshot);
    snapshot.computer.trust = 'auto';
    render(
      <ComputerSettings
        snapshot={snapshot}
        onReviewConnections={vi.fn()}
        macSetupApi={{
          requestComputerPermissions: vi.fn(),
          requestAutomationPermission: vi.fn(),
          refreshComputerPermissions: vi.fn(),
          configureVoice: vi.fn(),
          configurePushToTalk: vi.fn(),
        }}
        onSetComputerTrust={onSetComputerTrust}
        onSetTrajectoryLog={onSetTrajectoryLog}
        onRevealTrajectories={vi.fn()}
      />,
    );
    expect(
      screen
        .getByRole('switch', { name: 'Bypass action approvals' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Bypass action approvals' }));
    await waitFor(() => expect(onSetComputerTrust).toHaveBeenCalledWith('ask'));
    fireEvent.click(screen.getByText('Diagnostics'));
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

it('drops the connection checklist once both work apps are connected', () => {
  const snapshot = withCloud('signed-in', 'lawrence@example.com');
  snapshot.apps = snapshot.apps.map((app) => ({
    ...app,
    status: 'connected',
    connectionId: app.id === 'slack' ? 'slack-grant' : 'google-grant',
  }));
  render(
    <AppsSettings
      snapshot={snapshot}
      onConnectSelected={vi.fn()}
      onConnectGoogle={vi.fn()}
      onConnect={vi.fn()}
      onDisconnect={vi.fn()}
      onStartCloudSignIn={vi.fn()}
      onCompleteCloudSignIn={vi.fn()}
      onSignOutCloud={vi.fn()}
      onDeleteCloudAccount={vi.fn()}
    />,
  );

  expect(screen.getByText('All connected')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'Choose your connections' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Disconnect Google Workspace' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disconnect Slack' })).toBeTruthy();
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

it('sets up computer, voice and missing app access through one settings action', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.accessibility = 'not-requested';
  snapshot.computer.screenRecording = 'not-requested';
  snapshot.computer.automation = {
    system_events: 'ready',
    safari: 'ready',
    finder: 'ready',
    messages: 'ready',
    reminders: 'ready',
    chrome: 'unavailable',
    calendar: 'needs_permission',
  };
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
  const macSetupApi = {
    requestComputerPermissions: vi.fn(async () => {}),
    requestAutomationPermission: vi.fn(async () => {}),
    refreshComputerPermissions: vi.fn(async () => {}),
    configureVoice: vi.fn(async () => {}),
    configurePushToTalk: vi.fn(async () => {}),
  };
  const content = () => (
    <ComputerSettings
      snapshot={snapshot}
      macSetupApi={macSetupApi}
      onReviewConnections={vi.fn()}
      onSetComputerTrust={vi.fn()}
      onSetTrajectoryLog={vi.fn()}
      onRevealTrajectories={vi.fn()}
    />
  );
  const view = render(content());
  const redraw = () => view.rerender(content());
  macSetupApi.requestComputerPermissions.mockImplementation(async () => {
    await Promise.resolve();
    if (snapshot.computer.accessibility !== 'allowed')
      snapshot.computer.accessibility = 'allowed';
    else snapshot.computer.screenRecording = 'allowed';
    redraw();
  });
  macSetupApi.configureVoice.mockImplementation(async () => {
    await Promise.resolve();
    snapshot.voice.status = 'connected';
    redraw();
  });
  macSetupApi.configurePushToTalk.mockImplementation(async () => {
    await Promise.resolve();
    snapshot.voice.pushToTalk = {
      ...snapshot.voice.pushToTalk!,
      enabled: true,
      microphone: true,
      accessibility: true,
    };
    redraw();
  });
  macSetupApi.requestAutomationPermission.mockImplementation(async () => {
    await Promise.resolve();
    snapshot.computer.automation!.calendar = 'ready';
    redraw();
  });
  expect(macSetupApi.requestComputerPermissions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Set up permissions' }));
  await waitFor(() => expect(macSetupApi.configureVoice).toHaveBeenCalledOnce());
  await waitFor(() => expect(macSetupApi.configurePushToTalk).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByText('Mac access is ready.')).toBeTruthy());
  expect(macSetupApi.requestComputerPermissions).toHaveBeenCalledTimes(2);
  expect(macSetupApi.configureVoice).toHaveBeenCalledOnce();
  expect(macSetupApi.configurePushToTalk).toHaveBeenCalledOnce();
  expect(macSetupApi.requestAutomationPermission).toHaveBeenCalledWith('calendar');
  expect(screen.queryByRole('button', { name: 'Allow all Mac apps' })).toBeNull();
  expect(screen.queryByText('Mac computer use')).toBeNull();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Check access' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  const refreshes = macSetupApi.refreshComputerPermissions.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
  await waitFor(() =>
    expect(macSetupApi.refreshComputerPermissions).toHaveBeenCalledTimes(refreshes + 1),
  );
  expect(macSetupApi.requestComputerPermissions).toHaveBeenCalledTimes(2);
});
