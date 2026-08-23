// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../../demo';
import type { ProviderSetup } from '../../types';
import { ProvidersSettings } from './ProvidersSettings';

afterEach(cleanup);

describe('provider setup actions', () => {
  it('distinguishes install guidance from provider rechecks', async () => {
    const onProbe = vi.fn().mockResolvedValue(undefined);
    const needsInstall: ProviderSetup = {
      ...demoSnapshot.providers.find((provider) => provider.id === 'gemini')!,
      status: 'needs-install',
    };
    const unavailable: ProviderSetup = {
      ...demoSnapshot.providers.find((provider) => provider.id === 'meta')!,
      status: 'unavailable',
    };
    render(
      <ProvidersSettings
        providers={[demoSnapshot.providers[0]!, needsInstall, unavailable]}
        onProbe={onProbe}
        onOpenCloudSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Installed')).toBeTruthy();
    expect(screen.getByText('Not installed')).toBeTruthy();
    const guide = screen.getByRole('link', { name: 'Open install guide' });
    expect(guide.getAttribute('href')).toContain('/installation/');

    fireEvent.click(screen.getAllByRole('button', { name: 'Recheck' })[0]!);
    await waitFor(() => expect(onProbe).toHaveBeenCalledWith('codex'));

    fireEvent.click(guide);
    fireEvent.click(screen.getAllByRole('button', { name: 'Recheck' })[1]!);
    await waitFor(() => expect(onProbe).toHaveBeenCalledWith('gemini'));
  });

  it('routes Meta sign-in to the Sia cloud account instead of meta.ai', () => {
    const onOpenCloudSettings = vi.fn();
    const meta = {
      ...demoSnapshot.providers.find((provider) => provider.id === 'meta')!,
      status: 'needs-login' as const,
    };
    render(
      <ProvidersSettings
        providers={[meta]}
        onProbe={vi.fn()}
        onOpenCloudSettings={onOpenCloudSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Sia cloud' }));
    expect(onOpenCloudSettings).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders the provider billing statement without adding a false prefix', () => {
    render(
      <ProvidersSettings
        providers={[demoSnapshot.providers[0]!]}
        onProbe={vi.fn()}
        onOpenCloudSettings={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Uses your existing ChatGPT Codex plan or OpenAI API account.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Billed by Uses/)).toBeNull();
  });

  it('keeps production-disabled providers visible without offering setup', () => {
    render(
      <ProvidersSettings
        providers={[demoSnapshot.providers.find((provider) => provider.id === 'grok')!]}
        onProbe={vi.fn()}
        onOpenCloudSettings={vi.fn()}
      />,
    );

    expect(screen.getByText('Not in alpha')).toBeTruthy();
    expect(screen.getByText(/inherited plugins, skills, and MCP/i)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Unavailable' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
