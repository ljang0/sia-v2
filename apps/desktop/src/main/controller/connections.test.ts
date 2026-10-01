import { describe, expect, it, vi } from 'vitest';
import type { CloudClient } from '../cloud/cloud-client.js';
import type { DesktopController } from './desktop-controller.js';
import { createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('connects Google Workspace and Slack through their focused actions', async () => {
    const controller = await createController();

    const google = await controller.invoke('connections.startGoogle', undefined);
    const result = await controller.invoke('connections.start', { connectionId: 'slack' });

    expect(google.opened).toBe(false);
    expect(result.opened).toBe(false);
    expect(result.snapshot.connections).toEqual([
      expect.objectContaining({ id: 'gmail', status: 'connected' }),
      expect.objectContaining({ id: 'drive', status: 'connected' }),
      expect.objectContaining({ id: 'docs', status: 'connected' }),
      expect.objectContaining({ id: 'sheets', status: 'connected' }),
      expect.objectContaining({ id: 'slides', status: 'connected' }),
      expect.objectContaining({ id: 'slack', status: 'connected' }),
    ]);
    await controller.shutdown();
  });

  it('replaces an expired saved grant in one reconnect action', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'docs' });
    const original = controller
      .snapshot()
      .connections.find(({ id }) => id === 'docs')?.connectionId;
    expect(original).toBeTruthy();

    controller.markConnectionReconnectRequired('docs', original!);
    expect(controller.snapshot().connections.find(({ id }) => id === 'docs')).toMatchObject({
      status: 'error',
      connectionId: original,
      detail: 'This app connection expired. Reconnect Google Workspace, then retry the action.',
    });

    const result = await controller.invoke('connections.start', { connectionId: 'docs' });
    expect(result.snapshot.connections.find(({ id }) => id === 'docs')).toMatchObject({
      status: 'connected',
    });
    expect(result.snapshot.connections.find(({ id }) => id === 'docs')?.connectionId).not.toBe(
      original,
    );
    await controller.shutdown();
  });

  it('connects Google Workspace as one guided group without implicitly granting Slack', async () => {
    const controller = await createController();

    const result = await controller.invoke('connections.startGoogle', undefined);

    expect(result.opened).toBe(false);
    expect(
      result.snapshot.connections
        .filter(({ id }) => id !== 'slack')
        .every(({ status }) => status === 'connected'),
    ).toBe(true);
    expect(result.snapshot.connections.find(({ id }) => id === 'slack')).toMatchObject({
      status: 'disconnected',
    });
    await controller.shutdown();
  });

  it.each([['google'], ['slack'], ['google', 'slack']] as ('google' | 'slack')[][])(
    'connects only the selected account checklist: %j',
    async (...apps) => {
      const controller = await createController();
      try {
        const result = await controller.invoke('connections.startSelected', { apps });
        for (const connection of result.snapshot.connections) {
          const selected = apps.includes(connection.id === 'slack' ? 'slack' : 'google');
          expect(connection.status).toBe(selected ? 'connected' : 'disconnected');
        }
        const ids = result.snapshot.connections.map((connection) => connection.connectionId);
        await controller.invoke('connections.startSelected', { apps });
        expect(
          controller.snapshot().connections.map((connection) => connection.connectionId),
        ).toEqual(ids);
      } finally {
        await controller.shutdown();
      }
    },
  );

  it('keeps a read-only Google grant active until the editor upgrade succeeds', async () => {
    let editorStarted = false;
    const startConnection = vi.fn(
      async (_connectionId: string, access?: 'read_only' | 'read_write') => {
        editorStarted = access === 'read_write';
        return {
          redirectUrl: `https://connect.example.test/${editorStarted ? 'editor' : 'reader'}`,
          connectionId: editorStarted ? 'grant-editor' : 'grant-reader',
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
        };
      },
    );
    const connectionStatus = vi.fn(async () => ({
      connections: [
        {
          id: 'grant-reader',
          app: 'google_workspace' as const,
          status: 'connected' as const,
          accountLabel: 'person@example.com',
          access: 'read_only' as const,
        },
        ...(editorStarted
          ? [
              {
                id: 'grant-editor',
                app: 'google_workspace' as const,
                status: 'connected' as const,
                accountLabel: 'person@example.com',
                access: 'read_write' as const,
              },
            ]
          : []),
      ],
    }));
    const disconnect = vi.fn(async () => undefined);
    const retireSupersededGoogleConnection = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus,
      disconnect,
      retireSupersededGoogleConnection,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.startGoogle', undefined);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        controller
          .snapshot()
          .connections.filter(({ id }) => id !== 'slack')
          .every(
            ({ status, connectionId, googleAccess }) =>
              status === 'connected' &&
              connectionId === 'grant-reader' &&
              googleAccess === 'read_only',
          ),
      ).toBe(true);

      const upgrading = await controller.invoke('connections.upgradeGoogle', undefined);
      expect(upgrading.opened).toBe(true);
      expect(startConnection).toHaveBeenLastCalledWith('gmail', 'read_write');
      expect(
        upgrading.snapshot.connections
          .filter(({ id }) => id !== 'slack')
          .every(
            ({ connectionId, googleAccess, upgradeConnectionId }) =>
              connectionId === 'grant-reader' &&
              googleAccess === 'read_only' &&
              upgradeConnectionId === 'grant-editor',
          ),
      ).toBe(true);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(
        controller
          .snapshot()
          .connections.filter(({ id }) => id !== 'slack')
          .every(
            ({ connectionId, googleAccess, upgradeConnectionId }) =>
              connectionId === 'grant-editor' &&
              googleAccess === 'read_write' &&
              upgradeConnectionId === undefined,
          ),
      ).toBe(true);
      expect(openExternal).toHaveBeenNthCalledWith(1, 'https://connect.example.test/reader');
      expect(openExternal).toHaveBeenNthCalledWith(2, 'https://connect.example.test/editor');
      expect(retireSupersededGoogleConnection).toHaveBeenCalledWith(
        'grant-reader',
        'grant-editor',
      );
      expect(disconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('treats any Google app reconnect as the unified Workspace grant', async () => {
    const controller = await createController();

    await controller.invoke('connections.start', { connectionId: 'docs' });
    const result = await controller.invoke('connections.start', { connectionId: 'slack' });

    expect(result.opened).toBe(false);
    expect(
      result.snapshot.connections.map(({ id, status, enabled }) => ({
        id,
        status,
        enabled: enabled !== false,
      })),
    ).toEqual([
      { id: 'gmail', status: 'connected', enabled: false },
      { id: 'drive', status: 'connected', enabled: false },
      { id: 'docs', status: 'connected', enabled: true },
      { id: 'sheets', status: 'connected', enabled: false },
      { id: 'slides', status: 'connected', enabled: false },
      { id: 'slack', status: 'connected', enabled: true },
    ]);
    await controller.shutdown();
  });

  it('enforces Google service switches in the connector action router', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'docs' });

    expect(controller.connectionIdForAction('gmail', 'gmail')).toBeUndefined();
    expect(controller.connectionIdForAction('docs', 'docs')).toEqual(expect.any(String));

    await controller.invoke('connections.setEnabled', {
      connectionId: 'gmail',
      enabled: true,
    });
    expect(controller.connectionIdForAction('gmail', 'gmail')).toEqual(expect.any(String));

    await controller.invoke('connections.setEnabled', {
      connectionId: 'docs',
      enabled: false,
    });
    expect(controller.connectionIdForAction('docs', 'docs')).toBeUndefined();
    await controller.shutdown();
  });

  it('reuses an already connected unified Google Workspace grant', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const before = controller.snapshot().connections;
    const gmailGrant = before.find(({ id }) => id === 'gmail')?.connectionId;

    const result = await controller.invoke('connections.startGoogle', undefined);

    expect(result.snapshot.connections.find(({ id }) => id === 'gmail')).toMatchObject({
      status: 'connected',
      connectionId: gmailGrant,
    });
    expect(result.snapshot.connections.find(({ id }) => id === 'drive')).toMatchObject({
      status: 'connected',
      connectionId: gmailGrant,
    });
    expect(
      result.snapshot.connections
        .filter(({ id }) => id !== 'slack')
        .every(({ status }) => status === 'connected'),
    ).toBe(true);
    expect(result.snapshot.connections.find(({ id }) => id === 'slack')).toMatchObject({
      status: 'disconnected',
    });
    await controller.shutdown();
  });

  it('allows connector setup without research and copies lifecycle events only after opt-in', async () => {
    const uploadResearchBatch = vi.fn(async () => undefined);
    const startConnection = vi.fn(async () => ({
      redirectUrl: 'https://connect.example.test/docs',
      connectionId: 'grant-docs',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus: async () => ({
        connections: [
          {
            id: 'grant-docs',
            app: 'google_docs' as const,
            status: 'connected' as const,
            accountLabel: 'research-fixture@example.test',
          },
        ],
      }),
      disconnect: async () => undefined,
      uploadResearchBatch,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      completeEmailSignIn: async () => ({
        state: 'signed_in' as const,
        email: 'person@example.com',
      }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const record = vi.fn();
    const trajectory = {
      rootDirectory: '/tmp/sia-trajectories',
      record,
    } as unknown as NonNullable<
      ConstructorParameters<typeof DesktopController>[0]['trajectory']
    >;
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      trajectory,
    });

    await controller.invoke('connections.start', { connectionId: 'docs' });
    expect(startConnection).toHaveBeenCalledOnce();
    expect(repository.list('research')).toHaveLength(0);
    await controller.invoke('connections.disconnect', {
      connectionId: 'docs',
      expectedConnectionId: 'grant-docs',
    });

    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();
    try {
      await controller.invoke('connections.start', { connectionId: 'docs' });
      await vi.advanceTimersByTimeAsync(2_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(controller.snapshot().connections.find(({ id }) => id === 'docs')).toMatchObject({
        status: 'connected',
        account: 'research-fixture@example.test',
      });
      const serialized = JSON.stringify(repository.list('research'));
      expect(serialized).toContain('connector.setup.started');
      expect(serialized).toContain('connector.authorization.opened');
      expect(serialized).toContain('connector.connected');
      expect(serialized).not.toContain('https://connect.example.test/docs');
      expect(uploadResearchBatch).toHaveBeenCalled();
      expect(record.mock.calls.map(([event]) => event.type)).toEqual(
        expect.arrayContaining([
          'connector.setup.started',
          'connector.authorization.opened',
          'connector.connected',
        ]),
      );
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('keeps polling until the provider-supplied authorization expiry', async () => {
    let startedAt = 0;
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection: async () => {
        startedAt = Date.now();
        return {
          redirectUrl: 'https://connect.example.test/gmail',
          connectionId: 'slow-gmail-grant',
          expiresAt: new Date(startedAt + 10 * 60_000).toISOString(),
        };
      },
      connectionStatus: async () => ({
        connections: [
          {
            id: 'slow-gmail-grant',
            app: 'gmail' as const,
            status:
              Date.now() - startedAt >= 124_000
                ? ('connected' as const)
                : ('link_pending' as const),
            accountLabel: 'slow-consent@example.test',
          },
        ],
      }),
      disconnect: async () => undefined,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.start', { connectionId: 'gmail' });
      await vi.advanceTimersByTimeAsync(122_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toMatchObject({
        status: 'connecting',
        connectionId: 'slow-gmail-grant',
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toMatchObject({
        status: 'connected',
        connectionId: 'slow-gmail-grant',
        account: 'slow-consent@example.test',
      });
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('queues selected providers after consent and cancels the queue when disconnected', async () => {
    type TestConnectionId = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';
    const connectionOrder: TestConnectionId[] = ['gmail', 'slack'];
    const startConnection = vi.fn(async (connectionId: TestConnectionId) => ({
      redirectUrl: `https://connect.example.test/${connectionId}`,
      connectionId: `grant-${connectionId}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    const connectionStatus = vi.fn(async (connectionId: TestConnectionId) => ({
      connections: [
        {
          id: `grant-${connectionId}`,
          app: {
            gmail: 'gmail',
            drive: 'google_drive',
            docs: 'google_docs',
            sheets: 'google_sheets',
            slides: 'google_slides',
            slack: 'slack',
          }[connectionId],
          status: 'connected' as const,
          accountLabel: `${connectionId}@example.test`,
        },
      ],
    }));
    const disconnect = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection,
      connectionStatus,
      disconnect,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal,
      restartApp: vi.fn(),
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory: async () => undefined,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    await controller.invoke('agents.save', {
      name: 'Sia',
      instructions: '',
      model: 'gpt-5.6-sol',
      startOnboarding: true,
    });
    await controller.invoke('settings.setOnboarding', { step: 'restart' });
    vi.useFakeTimers();

    try {
      const result = await controller.invoke('connections.startSelected', {
        apps: ['google', 'slack'],
      });
      expect(result.opened).toBe(true);
      await expect(
        controller.invoke('settings.restartForOnboarding', undefined),
      ).rejects.toThrow('Finish or cancel account approval');
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenLastCalledWith('https://connect.example.test/gmail');

      await expect(
        controller.invoke('connections.startSelected', { apps: ['slack'] }),
      ).rejects.toThrow(/already waiting/);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(openExternal).toHaveBeenCalledTimes(2);
      expect(openExternal).toHaveBeenLastCalledWith('https://connect.example.test/slack');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(startConnection.mock.calls.map(([id]) => id)).toEqual(connectionOrder);
      expect(connectionStatus.mock.calls.map(([id]) => id)).toEqual(connectionOrder);
      expect(
        controller.snapshot().connections.every(({ status }) => status === 'connected'),
      ).toBe(true);

      for (const connectionId of connectionOrder) {
        await controller.invoke('connections.disconnect', { connectionId });
      }
      const delayedStatus = Promise.withResolvers<{
        connections: Array<{
          id: string;
          app: 'gmail';
          status: 'connected';
          accountLabel: string;
        }>;
      }>();
      connectionStatus.mockImplementationOnce(async () => await delayedStatus.promise);
      await controller.invoke('connections.startSelected', { apps: ['google', 'slack'] });
      expect(openExternal).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(connectionStatus).toHaveBeenCalledTimes(3);

      await controller.invoke('connections.disconnect', { connectionId: 'gmail' });
      delayedStatus.resolve({
        connections: [
          {
            id: 'grant-gmail',
            app: 'gmail',
            status: 'connected',
            accountLabel: 'gmail@example.test',
          },
        ],
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(openExternal).toHaveBeenCalledTimes(3);
      expect(controller.snapshot().connections).toEqual([
        expect.objectContaining({ id: 'gmail', status: 'disconnected' }),
        expect.objectContaining({ id: 'drive', status: 'disconnected' }),
        expect.objectContaining({ id: 'docs', status: 'disconnected' }),
        expect.objectContaining({ id: 'sheets', status: 'disconnected' }),
        expect.objectContaining({ id: 'slides', status: 'disconnected' }),
        expect.objectContaining({ id: 'slack', status: 'disconnected' }),
      ]);
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('keeps polling through a transient connection-status outage', async () => {
    const connectionStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary network failure'))
      .mockResolvedValue({
        connections: [
          {
            id: 'grant-slack',
            app: 'slack' as const,
            status: 'connected' as const,
            accountLabel: 'fixture-workspace',
          },
        ],
      });
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        features: {
          researchUploads: true,
          researchArchive: true,
          connectors: true,
          schedules: true,
        },
      }),
      startConnection: async () => ({
        redirectUrl: 'https://connect.example.test/slack',
        connectionId: 'grant-slack',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
      connectionStatus,
      disconnect: async () => undefined,
      uploadResearchBatch: async () => undefined,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      openExternal: async () => undefined,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    vi.useFakeTimers();

    try {
      await controller.invoke('connections.start', { connectionId: 'slack' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'slack')).toMatchObject({
        status: 'connecting',
        connectionId: 'grant-slack',
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(controller.snapshot().connections.find(({ id }) => id === 'slack')).toMatchObject({
        status: 'connected',
        connectionId: 'grant-slack',
        account: 'fixture-workspace',
      });
      expect(connectionStatus).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      await controller.shutdown();
    }
  });

  it('does not let a stale disconnect revoke a replacement connector grant', async () => {
    const controller = await createController();
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const originalConnectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'gmail')?.connectionId;
    expect(originalConnectionId).toEqual(expect.any(String));

    await controller.invoke('connections.disconnect', {
      connectionId: 'gmail',
      expectedConnectionId: originalConnectionId!,
    });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const replacement = controller.snapshot().connections.find(({ id }) => id === 'gmail');
    expect(replacement?.connectionId).not.toBe(originalConnectionId);

    await expect(
      controller.invoke('connections.disconnect', {
        connectionId: 'gmail',
        expectedConnectionId: originalConnectionId!,
      }),
    ).rejects.toThrow('changed since this screen was shown');
    expect(controller.snapshot().connections.find(({ id }) => id === 'gmail')).toEqual(
      replacement,
    );
    await controller.shutdown();
  });
});
