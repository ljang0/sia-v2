// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo';
import { Inspector } from './Inspector';

afterEach(cleanup);

describe('access dialog', () => {
  it('lets the user choose one signed-in Chrome window without closing the others', () => {
    const attach = vi.fn();
    render(
      <Inspector
        browser={{
          status: 'detached',
          profileName: 'Chrome profile',
          attached: false,
          tabs: [],
          availableWindows: [
            { id: 8, label: 'Chrome window 1', detail: 'Inbox — Work' },
            { id: 9, label: 'Chrome window 2', detail: 'CUA-Speedrun — Test profile' },
          ],
          snapshotLabel: 'Choose the signed-in Chrome window you want Sia to use.',
        }}
        computer={demoSnapshot.computer}
        connection={demoSnapshot.connection}
        cloudAuth={demoSnapshot.cloudAuth}
        research={demoSnapshot.research}
        onClose={vi.fn()}
        onAttachBrowser={attach}
        onOpenBrowserSite={vi.fn()}
        onDetachBrowser={vi.fn()}
        onRequestPermissions={vi.fn()}
        onOpenCloudSettings={vi.fn()}
        onOpenResearchSettings={vi.fn()}
        onToggleResearch={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Choose a Chrome window' })).toBeTruthy();
    expect(screen.getByText(/others will not be granted/i)).toBeTruthy();
    expect(screen.queryByText(/close extra ordinary Chrome windows/i)).toBeNull();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Use Chrome window 2: CUA-Speedrun — Test profile',
      }),
    );
    expect(attach).toHaveBeenCalledWith(9);
  });

  it('uses modal focus semantics, restores focus, and describes only real inventory', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open access
          </button>
          {open ? (
            <Inspector
              browser={demoSnapshot.browser}
              computer={demoSnapshot.computer}
              connection={demoSnapshot.connection}
              cloudAuth={demoSnapshot.cloudAuth}
              research={demoSnapshot.research}
              onClose={() => setOpen(false)}
              onAttachBrowser={vi.fn()}
              onOpenBrowserSite={vi.fn()}
              onDetachBrowser={vi.fn()}
              onRequestPermissions={vi.fn()}
              onOpenCloudSettings={vi.fn()}
              onOpenResearchSettings={vi.fn()}
              onToggleResearch={vi.fn()}
            />
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open access' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Access' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getByRole('heading', { name: 'Granted sites' })).toBeTruthy();
    expect(screen.getByText('drive.google.com')).toBeTruthy();
    expect(screen.queryByText('mail.google.com')).toBeNull();
    expect(
      screen.getByText(/does not receive a complete inventory of your tabs/i),
    ).toBeTruthy();

    const browserTab = screen.getByRole('tab', { name: 'Browser' });
    const computerTab = screen.getByRole('tab', { name: 'Computer' });
    const dataTab = screen.getByRole('tab', { name: 'Data' });
    expect(browserTab.tabIndex).toBe(0);
    expect(computerTab.tabIndex).toBe(-1);
    expect(dataTab.tabIndex).toBe(-1);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(browserTab.id);

    fireEvent.keyDown(browserTab, { key: 'ArrowRight' });
    expect(computerTab.getAttribute('aria-selected')).toBe('true');
    expect(computerTab.tabIndex).toBe(0);
    expect(browserTab.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(computerTab);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(computerTab.id);
    expect(screen.getByText(/complete window inventory is unavailable/i)).toBeTruthy();
    expect(screen.queryByText('alpha-flow.pdf')).toBeNull();

    fireEvent.keyDown(computerTab, { key: 'ArrowRight' });
    expect(dataTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(dataTab);
    expect(screen.getByRole('heading', { name: 'Data access' })).toBeTruthy();
    expect(screen.getByText('Sia cloud')).toBeTruthy();
    expect(screen.getByText('Research capture')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Access' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
