// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createDemoRendererApi } from './demo/api';
import { demoSnapshot } from './demo/snapshot';
import type { RendererApi, RendererSnapshot } from './types';

afterEach(cleanup);

describe('app privacy routing', () => {
  it('replaces startup with a recoverable error when the initial load fails', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    const getSnapshot = api.getSnapshot;
    let reject!: (error: Error) => void;
    api.getSnapshot = () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      });
    render(<App api={api} />);
    expect(screen.getByRole('status', { name: 'Loading Sia' })).toBeTruthy();
    await act(async () => reject(new Error('Please reconnect.')));
    expect(await screen.findByRole('heading', { name: 'Sia needs to reconnect' })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading Sia' })).toBeNull();
    api.getSnapshot = getSnapshot;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Access' })).toBeTruthy();
  });

  it('opens the quick switcher from the keyboard and routes a command', async () => {
    render(<App api={createDemoRendererApi(structuredClone(demoSnapshot))} />);
    await screen.findByRole('button', { name: 'Access' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Move through Sia' })).toBeTruthy();

    const search = screen.getByRole('combobox', { name: 'Search conversations and actions' });
    fireEvent.change(search, { target: { value: 'archived' } });
    fireEvent.click(screen.getByRole('option', { name: /Open archived conversations/ }));

    expect(await screen.findByRole('region', { name: 'Archived' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Move through Sia' })).toBeNull();
  });

  it('opens the selected launcher conversation even when Settings is already open', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    let reveal: (() => void) | undefined;
    api.onOpenConversation = (listener) => {
      reveal = listener;
      return () => {
        reveal = undefined;
      };
    };
    render(<App api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    await act(async () => {
      await api.selectThread('thread-inbox');
    });
    act(() => reveal?.());
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Triage today’s inbox' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByRole('button', { name: 'Access' })).toBeTruthy();
  });

  it('names the conversation model plainly and keeps the folder path for developers', async () => {
    const snapshot = structuredClone(demoSnapshot);
    for (const provider of snapshot.providers) provider.models = [];
    const { unmount } = render(<App api={createDemoRendererApi(snapshot)} />);
    fireEvent.click(await screen.findByText('Model for this conversation'));
    const model = screen.getByRole('combobox', { name: 'Model' }) as HTMLSelectElement;
    expect(model.selectedOptions[0]?.textContent).not.toMatch(/^[a-z0-9.-]+$/);
    expect(screen.queryByText('Workspace')).toBeNull();
    unmount();

    const developer = structuredClone(snapshot);
    developer.preferences.developerTools = true;
    render(<App api={createDemoRendererApi(developer)} />);
    fireEvent.click(await screen.findByText('Model for this conversation'));
    expect(screen.getByText('Workspace')).toBeTruthy();
  });

  async function openSettingsInNavWidth(
    navWidth: number,
    check: (nav: HTMLElement) => Promise<void>,
  ) {
    const original = globalThis.ResizeObserver;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const width = this.getAttribute('aria-label') === 'Settings sections' ? navWidth : 0;
        return {
          width,
          height: 0,
          top: 0,
          left: 0,
          right: width,
          bottom: 0,
          x: 0,
          y: 0,
        } as DOMRect;
      });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const api = createDemoRendererApi(structuredClone(demoSnapshot));
      api.phoneRemote = async () => ({ enabled: false, running: false, detail: 'Off.' });
      render(<App api={api} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
      await check(await screen.findByRole('navigation', { name: 'Settings sections' }));
    } finally {
      rect.mockRestore();
      globalThis.ResizeObserver = original;
    }
  }

  it('keeps Settings tabs on one row in a narrow pane by moving extras into More', async () => {
    await openSettingsInNavWidth(700, async (nav) => {
      expect(within(nav).getByRole('button', { name: 'Privacy' })).toBeTruthy();
      expect(within(nav).getByRole('button', { name: 'Voice' })).toBeTruthy();
      expect(within(nav).queryByRole('button', { name: 'Phone remote' })).toBeNull();
      fireEvent.pointerDown(within(nav).getByRole('button', { name: 'More settings' }), {
        button: 0,
        ctrlKey: false,
      });
      expect(await screen.findByRole('menuitem', { name: 'Phone remote' })).toBeTruthy();
      expect(screen.queryByRole('menuitem', { name: 'Voice' })).toBeNull();
    });
  });

  it('moves Voice into More too when a zoomed window narrows the Settings tabs further', async () => {
    await openSettingsInNavWidth(520, async (nav) => {
      expect(within(nav).getByRole('button', { name: 'Privacy' })).toBeTruthy();
      expect(within(nav).queryByRole('button', { name: 'Voice' })).toBeNull();
      fireEvent.pointerDown(within(nav).getByRole('button', { name: 'More settings' }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Voice' }));
      expect(await screen.findByRole('heading', { level: 2, name: /voice/i })).toBeTruthy();
    });
  });

  it('closes Settings with Escape', async () => {
    render(<App api={createDemoRendererApi(structuredClone(demoSnapshot))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull();
  });

  it('requires email sign-in before any app access when cloud is configured', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      cloudAuth: { state: 'signed-out' },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('dialog', { name: 'Sign in to Sia' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
    expect(screen.getByText(/Sign in or create your account with an email code/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start in local mode' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create your first agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Access' })).toBeNull();
    expect(screen.queryByText(demoSnapshot.agents[0]!.name)).toBeNull();
  });

  it('moves from email verification into guided setup without opening a second dialog', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
      cloudAuth: { state: 'signed-out' },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Email' }), {
      target: { value: 'jy@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Sign-in code' }), {
      target: { value: '12345678' },
    });
    // The dialog's hint follows the step instead of repeating the email instruction.
    expect(screen.getByText(/Check your inbox for a one-time code/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(await screen.findByRole('button', { name: 'Set up Sia' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New agent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
    expect(await screen.findByRole('button', { name: 'Start using Sia' })).toBeTruthy();
  });

  it('keeps archived conversations accessible through Activity', async () => {
    const snapshot: RendererSnapshot = structuredClone(demoSnapshot);
    snapshot.archivedThreads = [
      {
        id: 'archived-1',
        agentId: 'agent-work',
        title: 'Previous release notes',
        updatedAt: '2026-08-14T00:00:00.000Z',
        archivedAt: '2026-08-14T00:00:00.000Z',
        status: 'idle',
      },
    ];

    render(<App api={createDemoRendererApi(snapshot)} />);
    fireEvent.click(await screen.findByTestId('activity-center-toggle'));

    const archive = await screen.findByRole('region', { name: 'Archived' });
    expect(archive).toBeTruthy();
    expect(screen.getByText('Previous release notes')).toBeTruthy();
    // Activity is a full page, like Settings: the conversation header steps aside.
    expect(screen.queryByText('Model for this conversation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Access' })).toBeNull();
  });

  it('lists every schedule on the Scheduled page and opens a schedule’s conversation', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    const selectThread = vi.spyOn(api, 'selectThread');
    render(<App api={api} />);
    fireEvent.click(await screen.findByTestId('scheduled-open'));

    const page = await screen.findByRole('main', { name: 'Scheduled' });
    expect(within(page).getAllByTestId('schedule-row')).toHaveLength(
      demoSnapshot.schedules.length,
    );
    expect(within(page).getByText('Personal admin · Triage today’s inbox')).toBeTruthy();
    expect(within(page).getByText(/Weekdays at 8:00.AM/)).toBeTruthy();
    expect(within(page).getByText(/Mondays and Thursdays at 4:00.PM/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scheduled' }).getAttribute('aria-current')).toBe(
      'page',
    );

    fireEvent.click(
      within(page).getByRole('button', {
        name: 'Summarize my inbox and tell me what needs a reply',
      }),
    );
    await waitFor(() => expect(selectThread).toHaveBeenCalledWith('thread-inbox'));
    expect(screen.queryByRole('main', { name: 'Scheduled' })).toBeNull();
  });

  it('keeps existing local work locked while signed out', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      connection: 'offline',
      cloudAuth: { state: 'signed-out' },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
      },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('dialog', { name: 'Sign in to Sia' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Access' })).toBeNull();
    expect(screen.queryByText(demoSnapshot.agents[0]!.name)).toBeNull();
  });

  it('does not gate signed-in users behind research enrollment', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      cloudAuth: { state: 'signed-in', email: 'participant@example.com' },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
        promptReviewedVersion: undefined,
      },
    };
    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('button', { name: 'Access' })).toBeTruthy();
    expect(
      screen.queryByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toBeNull();
  });

  it('starts capture only after the user opts in from Privacy', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      cloudAuth: { state: 'signed-in', email: 'participant@example.com' },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
        promptReviewedVersion: undefined,
      },
    };
    const api = createDemoRendererApi(snapshot);

    render(<App api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Access' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review & enable' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join research release' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Join the Sia research release?' }),
      ).toBeNull(),
    );
    expect((await api.getSnapshot()).research).toMatchObject({
      consented: true,
      capture: 'recording',
      promptReviewedVersion: 'alpha-research-v3-raw',
    });
  });

  it('does not enroll an internal operator or model tester in research', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
      cloudAuth: {
        state: 'signed-in',
        email: 'operator@example.com',
        participant: false,
        features: {
          researchUploads: false,
          researchArchive: false,
          connectors: false,
          schedules: false,
        },
      },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
        promptReviewedVersion: undefined,
      },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('button', { name: 'Set up Sia' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New agent' })).toBeNull();
    expect(
      screen.queryByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toBeNull();
  });

  it('opens core Sia immediately and keeps work apps optional', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
      apps: structuredClone(demoSnapshot.apps).map(({ account: _account, ...app }) => ({
        ...app,
        status: 'disconnected' as const,
      })),
      cloudAuth: {
        state: 'signed-in',
        email: 'participant@example.com',
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
        promptReviewedVersion: undefined,
      },
    };
    const api = createDemoRendererApi(snapshot);

    render(<App api={api} />);

    await screen.findByRole('button', { name: 'Set up Sia' });
    expect(
      screen.queryByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Connect your work apps' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit setup' }));
    expect(await screen.findByRole('button', { name: 'Connect work apps later' })).toBeTruthy();
    expect(
      (await api.getSnapshot()).apps.every(({ status }) => status === 'disconnected'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Connect work apps later' }));
    expect(await screen.findByRole('heading', { name: 'Connections' })).toBeTruthy();
    expect(screen.getByText(/Every connection is optional/)).toBeTruthy();
  });

  it('connects Slack independently later from Settings', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      apps: structuredClone(demoSnapshot.apps).map(({ account: _account, ...app }) => ({
        ...app,
        status: 'disconnected' as const,
      })),
      cloudAuth: {
        state: 'signed-in',
        email: 'participant@example.com',
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: true,
        capture: 'recording',
        promptReviewedVersion: 'alpha-research-v3-raw',
      },
    };
    const api = createDemoRendererApi(snapshot);
    render(<App api={api} />);

    expect(screen.queryByRole('dialog', { name: 'Connect your work apps' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connections' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Google Workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect selected apps' }));

    await waitFor(async () =>
      expect((await api.getSnapshot()).apps.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: 'gmail', status: 'disconnected' },
        { id: 'drive', status: 'disconnected' },
        { id: 'docs', status: 'disconnected' },
        { id: 'sheets', status: 'disconnected' },
        { id: 'slides', status: 'disconnected' },
        { id: 'slack', status: 'connected' },
      ]),
    );
  });

  it('does not interrupt existing local work with research enrollment', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      cloudAuth: { state: 'unconfigured' },
      research: {
        ...structuredClone(demoSnapshot.research),
        consented: false,
        capture: 'paused',
        promptReviewedVersion: undefined,
      },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('button', { name: 'Access' })).toBeTruthy();
    expect(
      screen.queryByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toBeNull();
  });

  it('keeps custom agent creation available as an explicit choice', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Customize an agent instead' }));
    const dialog = await screen.findByRole('dialog', { name: 'New agent' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: 'Instructions' })).toBeTruthy();
    expect(within(dialog).getByText('Details').closest('details')?.open).toBe(false);
  });

  it('makes a signed-in cloud outage visible without disabling local work', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      connection: 'offline',
      cloudAuth: { state: 'signed-in', email: 'lawrence@example.com' },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(screen.queryByRole('status', { name: 'Cloud offline' })).toBeNull();
    expect(await screen.findByText('Sia cloud is offline.')).toBeTruthy();
    expect(screen.getByText(/Local work is still available/)).toBeTruthy();
  });

  it('shows a fatal bridge event before bootstrap completes and recovers on retry', async () => {
    const demoApi = createDemoRendererApi();
    let bootstrapCalls = 0;
    const api: RendererApi = {
      ...demoApi,
      getSnapshot() {
        bootstrapCalls += 1;
        if (bootstrapCalls === 1) return new Promise<RendererSnapshot>(() => undefined);
        return demoApi.getSnapshot();
      },
      subscribe(_listener, onError) {
        onError?.('The secure desktop service stopped unexpectedly.');
        return () => undefined;
      },
    };

    render(<App api={api} />);

    expect(await screen.findByRole('heading', { name: 'Sia needs to reconnect' })).toBeTruthy();
    expect(screen.getByText('The secure desktop service stopped unexpectedly.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Access' })).toBeTruthy();
  });
});

it('creates a monthly task directly from Scheduled with an explicit conversation', async () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.schedules = [];
  const api = createDemoRendererApi(snapshot);
  const created = vi.spyOn(api, 'createSchedule');
  render(<App api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Scheduled' }));
  fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
  expect(screen.getByRole('combobox', { name: 'Conversation' })).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
    target: { value: 'Prepare my monthly spending report' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Repeat' }), {
    target: { value: 'monthly' },
  });
  fireEvent.change(screen.getByLabelText('Starting'), {
    target: { value: '2030-01-31T09:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
  await waitFor(() =>
    expect(created).toHaveBeenCalledWith(
      snapshot.activeThread!.id,
      'Prepare my monthly spending report',
      'monthly',
      new Date(2030, 0, 31, 9).toISOString(),
      undefined,
      { days: undefined, everyHours: undefined },
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'New schedule' })).toBeNull(),
  );
  expect(screen.getByText('Prepare my monthly spending report')).toBeTruthy();
});
