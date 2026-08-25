// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import { AgentDialog } from './AgentDialog';

afterEach(cleanup);

describe('agent defaults', () => {
  it('prefills a useful Sia-native role without changing provider or workspace controls', () => {
    render(
      <AgentDialog
        open
        providers={demoSnapshot.providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Release partner/ }));

    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(
      'Release partner',
    );
    expect(
      (screen.getByRole('textbox', { name: /^Instructions/ }) as HTMLTextAreaElement).value,
    ).toContain('source, tests, deployment state, artifacts, rollback');
    expect(
      (screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value,
    ).toBe('codex');
  });

  it('uses the canonical pinned Codex model for a new agent', () => {
    render(
      <AgentDialog
        open
        providers={demoSnapshot.providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect((screen.getByRole('textbox', { name: /^Model\b/ }) as HTMLInputElement).value).toBe(
      'gpt-5.6-sol',
    );
  });

  it('selects the first ready provider instead of an unusable default', () => {
    render(
      <AgentDialog
        open
        providers={demoSnapshot.providers.map((provider) =>
          provider.id === 'codex'
            ? { ...provider, status: 'needs-install' as const }
            : provider,
        )}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('combobox', { name: 'Provider' }) as HTMLSelectElement).value,
    ).toBe('meta');
    expect((screen.getByRole('textbox', { name: /^Model\b/ }) as HTMLInputElement).value).toBe(
      'super_nova_ext',
    );
  });

  it('blocks agent creation until a missing provider is installed and rechecked', () => {
    const providers = demoSnapshot.providers.map((provider) => ({
      ...provider,
      status: provider.id === 'codex' ? ('needs-install' as const) : ('disabled' as const),
    }));
    render(
      <AgentDialog
        open
        providers={providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onProbeProvider={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText('Not installed')).toBeTruthy();
    expect(screen.getByText(/Install Codex, then recheck/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open install guide' }).getAttribute('href')).toBe(
      'https://developers.openai.com/codex/cli/',
    );
    expect(
      (screen.getByRole('button', { name: 'Set up provider first' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('routes Meta readiness to Sia cloud sign-in', () => {
    const onOpenCloudSettings = vi.fn();
    const providers = demoSnapshot.providers.map((provider) => ({
      ...provider,
      status: provider.id === 'meta' ? ('needs-login' as const) : ('disabled' as const),
    }));
    render(
      <AgentDialog
        open
        providers={providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onOpenCloudSettings={onOpenCloudSettings}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to Sia cloud' }));
    expect(onOpenCloudSettings).toHaveBeenCalledOnce();
  });

  it('uses protocol model IDs instead of display labels when the provider changes', () => {
    render(
      <AgentDialog
        open
        providers={demoSnapshot.providers.map((provider) => ({
          ...provider,
          status: 'ready',
        }))}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const provider = screen.getByRole('combobox', { name: 'Provider' });
    const model = screen.getByRole('textbox', { name: /^Model\b/ }) as HTMLInputElement;
    for (const [providerId, modelId] of [
      ['meta', 'super_nova_ext'],
      ['grok', 'grok-code-fast'],
      ['gemini', 'gemini-2.5-pro'],
      ['claude', 'claude-sonnet-4-5'],
    ] as const) {
      fireEvent.change(provider, { target: { value: providerId } });
      expect(model.value).toBe(modelId);
    }
  });

  it('requires a second deliberate click before deleting an agent and its threads', async () => {
    const onDelete = vi.fn(async () => undefined);
    render(
      <AgentDialog
        open
        agent={demoSnapshot.agents[0]!}
        providers={demoSnapshot.providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent and threads' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('shows a workspace picker failure without producing an unhandled action', async () => {
    render(
      <AgentDialog
        open
        providers={demoSnapshot.providers}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn().mockRejectedValue(new Error('Folder access was denied.'))}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(await screen.findByText('Folder access was denied.')).toBeTruthy();
  });

  it('pins a connected ElevenLabs voice to an agent without cluttering disconnected setup', async () => {
    const onSave = vi.fn(async () => undefined);
    const view = render(
      <AgentDialog
        open
        agent={demoSnapshot.agents[0]!}
        providers={demoSnapshot.providers}
        voice={demoSnapshot.voice}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Voice' }), {
      target: { value: 'voice-milo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ voiceId: 'voice-milo' }));

    view.rerender(
      <AgentDialog
        open
        agent={demoSnapshot.agents[0]!}
        providers={demoSnapshot.providers}
        voice={{ status: 'disconnected', voices: [] }}
        onOpenChange={vi.fn()}
        onPickWorkspace={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Voice' })).toBeNull();
  });
});
