// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import { AgentDialog } from './AgentDialog';

afterEach(cleanup);

describe('agent dialog', () => {
  it('keeps the primary creation form to name and instructions', () => {
    renderDialog();

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Instructions' })).toBeTruthy();
    expect(screen.getByText('Details').closest('details')?.open).toBe(false);

    fireEvent.click(screen.getByText('Details'));

    expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Included model · Included' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'GPT-5.6 Sol · Codex plan' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Claude/ })).toBeNull();
    expect(screen.queryByLabelText('Provider')).toBeNull();
    expect(screen.queryByText('Color')).toBeNull();
    expect(screen.queryByText('Start with a role')).toBeNull();
    expect(screen.queryByText('super_nova_ext')).toBeNull();
    expect(screen.queryByText(/Grok/)).toBeNull();
    expect(screen.queryByText(/Gemini/)).toBeNull();
  });

  it('defaults to Codex when it is ready and lets the backend create a private workspace', async () => {
    const onPickWorkspace = vi.fn().mockResolvedValue('/Users/example/Work');
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onPickWorkspace, onSave });

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Research partner' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Compare sources and explain uncertainty.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onPickWorkspace).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith({
      name: 'Research partner',
      instructions: 'Compare sources and explain uncertainty.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '',
    });
  });

  it('requires a short instruction so a new agent has a clear role', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave });

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Research partner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));

    expect(screen.getByText('Add a short instruction for this agent.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ignores repeated submits during a save and while the completed dialog is closing', async () => {
    let finish!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onOpenChange = vi.fn();
    renderDialog({ onSave, onOpenChange });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'One agent' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Work on local files.' },
    });
    const form = screen.getByRole('textbox', { name: 'Name' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    fireEvent.submit(form);
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('maps a friendly model choice to the provider and protocol model ID', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      onPickWorkspace: vi.fn().mockResolvedValue('/Users/example/Work'),
      onSave,
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Builder' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Build carefully and ask before making external changes.' },
    });
    fireEvent.click(screen.getByText('Details'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'codex:gpt-5.6-sol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'codex', model: 'gpt-5.6-sol' }),
    );
  });

  it('keeps model, workspace, and voice inside Details', () => {
    renderDialog({ voice: demoSnapshot.voice });

    const advanced = screen.getByText('Details').closest('details')!;
    expect(advanced.open).toBe(false);

    fireEvent.click(screen.getByText('Details'));

    expect(advanced.open).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Voice' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Harness' })).toBeNull();
    expect(screen.queryByText(/OpenCode/)).toBeNull();
    expect(screen.queryByText(/^Pi/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose' })).toBeTruthy();
  });

  it('uses the backend-approved Codex harness without asking for a harness choice', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onSave });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Builder' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Instructions' }), {
      target: { value: 'Work inside the private folder and explain changes.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create agent' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('harnessPreference');
  });

  it('routes model recovery to AI settings without provider diagnostics in the form', () => {
    const onOpenModelSettings = vi.fn();
    renderDialog({
      providers: demoSnapshot.providers.map((provider) => ({
        ...provider,
        status: provider.id === 'meta' ? ('needs-login' as const) : ('disabled' as const),
      })),
      onOpenModelSettings,
    });

    expect(screen.getByText('No usable model is connected.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open model settings' }));
    expect(onOpenModelSettings).toHaveBeenCalledOnce();
    expect(screen.queryByText(/not installed/i)).toBeNull();
  });

  it('preserves an existing agent color and voice without exposing color controls', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      agent: { ...demoSnapshot.agents[0]!, voiceId: 'voice-milo' },
      voice: demoSnapshot.voice,
      onSave,
    });

    fireEvent.click(screen.getByText('Details'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Voice' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ hue: demoSnapshot.agents[0]!.hue, voiceId: undefined }),
    );
    expect(screen.queryByText('Color')).toBeNull();
  });

  it('requires a second deliberate click before deleting an agent and its threads', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderDialog({ agent: demoSnapshot.agents[0]!, onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Delete agent' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete agent and conversations' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });

  it('shows an advanced workspace picker failure without an unhandled action', async () => {
    renderDialog({
      onPickWorkspace: vi.fn().mockRejectedValue(new Error('Folder access was denied.')),
    });
    fireEvent.click(screen.getByText('Details'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(await screen.findByText('Folder access was denied.')).toBeTruthy();
  });
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof AgentDialog>> = {}) {
  return render(
    <AgentDialog
      open
      providers={demoSnapshot.providers}
      onOpenChange={vi.fn()}
      onPickWorkspace={vi.fn().mockResolvedValue('/Users/example/Work')}
      onSave={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );
}
