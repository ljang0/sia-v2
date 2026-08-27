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

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }));
    await waitFor(() => expect(onOpenProviderSetup).toHaveBeenCalledWith('codex'));
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
    expect(screen.getByText('Latest release: 0.2.0')).toBeTruthy();
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
