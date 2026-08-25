// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoRendererApi, demoSnapshot } from '../demo';
import type { ProviderId, RendererApi } from '../types';
import { useAppController } from '../useAppController';
import { WorkspaceNotice } from './AppStates';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('workspace diagnostics', () => {
  it('deduplicates repeated failures and copies a support-ready diagnostic', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    api.refreshProvider = vi
      .fn<(provider: ProviderId) => Promise<void>>()
      .mockRejectedValue(new Error('Sia cloud request failed (503), request request-alpha12.'));

    render(<DiagnosticHarness api={api} />);
    await screen.findByRole('button', { name: 'Trigger failure' });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await screen.findByTestId('diagnostic-tray');
    fireEvent.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await screen.findByText(/repeated 2 times/);

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain('Sia support ID: request-alpha12');
    expect(writeText.mock.calls[0]?.[0]).toContain('Occurrences: 2');
  });
});

function DiagnosticHarness({ api }: { api: RendererApi }) {
  const app = useAppController(api);
  return (
    <>
      <button type="button" onClick={() => void app.run(() => api.refreshProvider('codex'))}>
        Trigger failure
      </button>
      <WorkspaceNotice app={app} />
    </>
  );
}
