// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceSettings } from './VoiceSettings';

afterEach(cleanup);

describe('voice settings', () => {
  it('connects without rendering the key back into the page', async () => {
    const configure = vi.fn(async () => undefined);
    render(
      <VoiceSettings
        voice={{ status: 'disconnected', voices: [] }}
        completionSound={false}
        onConfigure={configure}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onDisconnect={vi.fn()}
        onSetCompletionSound={vi.fn()}
      />,
    );

    const key = 'sk_123456789012345678901234';
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: key } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(configure).toHaveBeenCalledWith(key));
    expect(screen.queryByDisplayValue(key)).toBeNull();
  });

  it('selects and disconnects a connected voice', async () => {
    const select = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    render(
      <VoiceSettings
        voice={{
          status: 'connected',
          selectedVoiceId: 'voice-1',
          selectedVoiceName: 'Aria',
          voices: [
            { id: 'voice-1', name: 'Aria' },
            { id: 'voice-2', name: 'Milo' },
          ],
        }}
        completionSound={false}
        onConfigure={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={select}
        onDisconnect={disconnect}
        onSetCompletionSound={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Voice'), { target: { value: 'voice-2' } });
    await waitFor(() => expect(select).toHaveBeenCalledWith('voice-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
  });

  it('updates the optional completion sound', async () => {
    const setCompletionSound = vi.fn(async () => undefined);
    render(
      <VoiceSettings
        voice={{ status: 'disconnected', voices: [] }}
        completionSound={false}
        onConfigure={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onDisconnect={vi.fn()}
        onSetCompletionSound={setCompletionSound}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Completion sound/ }));
    await waitFor(() => expect(setCompletionSound).toHaveBeenCalledWith(true));
  });
});
