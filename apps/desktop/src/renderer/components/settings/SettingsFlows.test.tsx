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
  it('submits a normalized invited email and moves focus to errors', async () => {
    const onStart = vi
      .fn()
      .mockRejectedValue(new Error('This email is not active in the Sia alpha.'));
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

    fireEvent.change(screen.getByRole('textbox', { name: 'Invited email' }), {
      target: { value: '  LAWRENCE@EXAMPLE.COM  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('lawrence@example.com'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('This email is not active in the Sia alpha.');
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
    expect(
      screen.getByRole('button', { name: 'Sign out & clear local research' }),
    ).toBeTruthy();
    for (const name of ['Connect Gmail', 'Connect Google Drive', 'Connect Slack']) {
      const button = screen.getByRole('button', { name });
      expect((button as HTMLButtonElement).disabled).toBe(false);
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

  it('starts guided work-app setup once and explains the provider consent boundary', async () => {
    const onConnectAll = vi.fn().mockResolvedValue(undefined);
    render(
      <AppsSettings
        snapshot={withCloud('signed-in', 'lawrence@example.com')}
        onConnectAll={onConnectAll}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onStartCloudSignIn={vi.fn()}
        onCompleteCloudSignIn={vi.fn()}
        onSignOutCloud={vi.fn()}
        onDeleteCloudAccount={vi.fn()}
      />,
    );

    expect(screen.getByText(/their own consent pages/)).toBeTruthy();
    expect(screen.getByText(/Nothing is bulk copied into Sia/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connect work apps' }));
    await waitFor(() => expect(onConnectAll).toHaveBeenCalledOnce());
  });

  it('surfaces an interrupted saved grant and provides a safe disconnect path', () => {
    const snapshot = withCloud('signed-in', 'lawrence@example.com');
    snapshot.apps[0] = {
      ...snapshot.apps[0]!,
      status: 'error',
      description: 'Connection setup was interrupted. Verify or disconnect this saved grant.',
    };
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
      />,
    );

    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText(/Connection setup was interrupted/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disconnect Gmail' }).textContent).toBe(
      'Disconnect saved grant',
    );
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
    expect(screen.getByText(/Other secrets may not be detected/)).toBeTruthy();
    expect(screen.queryByText(/always excluded|withdraw consent/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review & enable' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Help improve Sia?' });
    expect(dialog.textContent).toContain('Research data is not used for model training.');
    expect(dialog.textContent).toContain('Other secrets may not be detected');
    expect(dialog.textContent).toContain('Deleting resets consent.');
    fireEvent.click(screen.getByRole('button', { name: 'Join research' }));

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
        onSetComputerTrust={vi.fn()}
        onSetTrajectoryLog={vi.fn()}
        onRevealTrajectories={vi.fn()}
      />,
    );

    expect(screen.getByText(/keeps a full local log of everything it did/)).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: 'Ask before every action' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen
        .getByRole('switch', { name: 'Keep a full local log' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.queryByText(/Every grant is narrow, visible, and revocable/)).toBeNull();
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
        onSetComputerTrust={onSetComputerTrust}
        onSetTrajectoryLog={onSetTrajectoryLog}
        onRevealTrajectories={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Ask before every action' }));
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
