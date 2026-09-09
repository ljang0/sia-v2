// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createDemoRendererApi, demoSnapshot } from './demo';
import type { RendererApi, RendererSnapshot } from './types';

afterEach(cleanup);

describe('app privacy routing', () => {
  it('opens the quick switcher from the keyboard and routes a command', async () => {
    render(<App api={createDemoRendererApi(structuredClone(demoSnapshot))} />);
    await screen.findByRole('button', { name: 'Access' });

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Move through Sia' })).toBeTruthy();

    const search = screen.getByRole('combobox', { name: 'Search rooms and actions' });
    fireEvent.change(search, { target: { value: 'archived' } });
    fireEvent.click(screen.getByRole('option', { name: /Open archived threads/ }));

    expect(await screen.findByRole('region', { name: 'Archived' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Move through Sia' })).toBeNull();
  });

  it('requires email sign-in before any app access when cloud is configured', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      cloudAuth: { state: 'signed-out' },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('dialog', { name: 'Sign in to Sia' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
    expect(screen.getByText(/email invited to the pilot/)).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));

    expect(await screen.findByRole('button', { name: 'Set up Sia' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New agent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Sia' }));
    expect(await screen.findByRole('textbox', { name: 'Agent name' })).toBeTruthy();
  });

  it('takes Archived navigation directly to the archive section', async () => {
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
    fireEvent.click(await screen.findByTestId('archived-threads-toggle'));

    const archive = await screen.findByRole('region', { name: 'Archived' });
    await waitFor(() => expect(document.activeElement).toBe(archive));
    expect(screen.getByText('Previous release notes')).toBeTruthy();
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
    expect(screen.getByText(/Google Workspace and Slack are optional/)).toBeTruthy();
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Connect Slack' })[0]!);

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
