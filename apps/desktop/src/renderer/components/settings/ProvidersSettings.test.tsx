// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../../demo';
import { AboutSettings } from './AboutSettings';
import { ProvidersSettings } from './ProvidersSettings';

afterEach(cleanup);

describe('AI access settings', () => {
  it('shows only the two release access choices with user-facing copy', () => {
    renderSettings();

    expect(screen.getByRole('heading', { name: 'AI access' })).toBeTruthy();
    expect(screen.getByText('Included model')).toBeTruthy();
    expect(screen.getByText('Codex plan')).toBeTruthy();
    expect(screen.queryByText('Claude')).toBeNull();
    expect(screen.queryByText('Grok')).toBeNull();
    expect(screen.queryByText('Gemini')).toBeNull();
    expect(screen.queryByText('super_nova_ext')).toBeNull();
    expect(screen.queryByText('Desktop updates')).toBeNull();
  });

  it('keeps diagnostics and recheck controls out of the connected state', () => {
    renderSettings();

    expect(screen.queryByText('Technical details')).toBeNull();
    expect(screen.queryByText('Uses your existing ChatGPT Codex subscription.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recheck' })).toBeNull();
  });

  it('shows how much of the plan usage window is left', () => {
    renderSettings({
      providers: demoSnapshot.providers.map((provider) =>
        provider.id === 'codex'
          ? { ...provider, status: 'ready' as const, limits: { usedPercent: 37 } }
          : provider,
      ),
    });
    expect(screen.getByText('Plan usage: 63% left')).toBeTruthy();
  });

  it('can retry a temporarily unavailable plan', async () => {
    const onProbe = vi.fn().mockResolvedValue(undefined);
    renderSettings({
      providers: demoSnapshot.providers.map((provider) =>
        provider.id === 'codex' ? { ...provider, status: 'unavailable' as const } : provider,
      ),
      onProbe,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onProbe).toHaveBeenCalledWith('codex'));
  });

  it('opens the provider-owned setup flow for a disconnected plan', async () => {
    const onOpenProviderSetup = vi.fn().mockResolvedValue(undefined);
    renderSettings({
      providers: demoSnapshot.providers.map((provider) =>
        provider.id === 'codex' ? { ...provider, status: 'needs-login' as const } : provider,
      ),
      onOpenProviderSetup,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Set up Codex' }));
    await waitFor(() => expect(onOpenProviderSetup).toHaveBeenCalledWith('codex'));
  });

  it.each(['needs-install', 'incompatible'] as const)(
    'installs or updates Codex with pending and retry feedback (%s)',
    async (status) => {
      let fail!: (error: Error) => void;
      const onOpenProviderSetup = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            fail = reject;
          }),
      );
      renderSettings({
        providers: demoSnapshot.providers.map((provider) =>
          provider.id === 'codex' ? { ...provider, status } : provider,
        ),
        onOpenProviderSetup,
      });
      const name = 'Set up Codex';
      fireEvent.click(screen.getByRole('button', { name }));
      const busy = screen.getByRole('button', {
        name: status === 'needs-install' ? 'Installing…' : 'Updating…',
      });
      expect((busy as HTMLButtonElement).disabled).toBe(true);
      expect(onOpenProviderSetup).toHaveBeenCalledWith('codex');
      fail(new Error('Download could not be verified. Try again.'));
      await waitFor(() =>
        expect(screen.getByText('Download could not be verified. Try again.')).toBeTruthy(),
      );
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
    },
  );

  it('shows restarted setup progress and prevents duplicate sign-in clicks', () => {
    renderSettings({
      providers: demoSnapshot.providers.map((provider) =>
        provider.id === 'codex'
          ? {
              ...provider,
              status: 'needs-login' as const,
              setup: {
                phase: 'signing-in' as const,
                message: 'Finish signing in with ChatGPT in your browser.',
              },
            }
          : provider,
      ),
    });
    expect(screen.getByRole('status').textContent).toContain('Finish signing in');
    expect(
      (screen.getByRole('button', { name: 'Waiting for sign-in…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('offers one Codex setup button when both access choices need its installation', () => {
    renderSettings({
      providers: demoSnapshot.providers.map((provider) => ({
        ...provider,
        status: 'needs-install' as const,
      })),
    });
    expect(screen.getAllByRole('button', { name: 'Set up Codex' })).toHaveLength(1);
  });

  it('routes included-model access to Sia sign-in', () => {
    const onOpenCloudSettings = vi.fn();
    renderSettings({
      providers: demoSnapshot.providers.map((provider) =>
        provider.id === 'meta' ? { ...provider, status: 'needs-login' as const } : provider,
      ),
      onOpenCloudSettings,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenCloudSettings).toHaveBeenCalledOnce();
  });
});

describe('about settings', () => {
  it('owns desktop update controls', () => {
    render(
      <AboutSettings
        updates={{
          status: 'available',
          currentVersion: '0.1.0',
          latestVersion: '0.2.0',
          detail: 'A newer version is ready.',
        }}
        onCheckForUpdates={vi.fn()}
        onOpenUpdateDownload={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'About Sia' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.getByText('Sia 0.2.0 is ready to download.')).toBeTruthy();
  });

  it('explains a build without an update feed instead of offering a dead button', () => {
    render(
      <AboutSettings
        updates={{
          status: 'unconfigured',
          currentVersion: '0.1.0',
          detail: 'This build does not have a persistent signed update feed configured.',
        }}
        onCheckForUpdates={vi.fn()}
        onOpenUpdateDownload={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Check for updates' })).toBeNull();
    expect(screen.getByText(/doesn’t check for updates on its own/)).toBeTruthy();
    expect(screen.queryByText(/signed update feed/)).toBeNull();
  });
});

function renderSettings(
  overrides: Partial<React.ComponentProps<typeof ProvidersSettings>> = {},
) {
  return render(
    <ProvidersSettings
      providers={demoSnapshot.providers}
      onProbe={vi.fn().mockResolvedValue(undefined)}
      onOpenProviderSetup={vi.fn().mockResolvedValue(undefined)}
      onOpenCloudSettings={vi.fn()}
      {...overrides}
    />,
  );
}
