// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createDemoRendererApi, demoSnapshot } from './demo';
import type { RendererApi, RendererSnapshot } from './types';

afterEach(cleanup);

describe('app privacy routing', () => {
  it('offers Sia sign-in before first-run setup when cloud is configured', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
      cloudAuth: { state: 'signed-out' },
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    expect(await screen.findByRole('dialog', { name: 'Sign in to Sia' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue locally' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Sign in to Sia' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Create your first agent' })).toBeTruthy();
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

  it('keeps cloud and research controls in Access without treating signed-out as an outage', async () => {
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

    expect(screen.queryByText(/Cloud features are offline/)).toBeNull();
    expect(screen.queryByRole('status', { name: 'Cloud signed out' })).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Access' }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Data' }));
    expect(screen.getByText(/Signed out. Local work remains available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByRole('heading', { name: 'Privacy & research' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review & enable' })).toBeTruthy();
  });

  it('asks signed-in users to make an explicit research choice by default', async () => {
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

    expect(await screen.findByRole('alertdialog', { name: 'Help improve Sia?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use without sharing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join research' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use without sharing' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: 'Help improve Sia?' })).toBeNull(),
    );
    expect((await api.getSnapshot()).research).toMatchObject({
      consented: false,
      capture: 'paused',
      promptReviewedVersion: 'alpha-research-v2',
    });
  });

  it('starts capture only after the user joins research', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Join research' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: 'Help improve Sia?' })).toBeNull(),
    );
    expect((await api.getSnapshot()).research).toMatchObject({
      consented: true,
      capture: 'recording',
      promptReviewedVersion: 'alpha-research-v2',
    });
  });

  it('offers local-only research after the first local agent exists', async () => {
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

    const dialog = await screen.findByRole('alertdialog', { name: 'Help improve Sia?' });
    expect(dialog.textContent).toContain('captures stay encrypted on this Mac');
    expect(dialog.textContent).not.toContain('Cloud copies expire');
  });

  it('offers an obvious first-run agent action without duplicating the sidebar label', async () => {
    const snapshot: RendererSnapshot = {
      ...structuredClone(demoSnapshot),
      agents: [],
      selectedAgentId: undefined,
      selectedThreadId: undefined,
      activeThread: undefined,
    };

    render(<App api={createDemoRendererApi(snapshot)} />);

    const firstAgent = await screen.findByRole('button', {
      name: 'Create your first agent',
    });
    expect(screen.getByRole('button', { name: 'Create agent' })).toBeTruthy();
    fireEvent.click(firstAgent);
    expect(await screen.findByRole('dialog', { name: 'New agent' })).toBeTruthy();
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
