import { describe, expect, it, vi } from 'vitest';
import { CloudClient } from '../cloud/cloud-client.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';
import { ElevenLabsVoiceService } from '../voice-service.js';
import type { DesktopController } from './desktop-controller.js';
import { createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('clears identity-bound local research before signing out', async () => {
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const identity = {
      initialize: async () => ({
        state: identityState,
        ...(identityState === 'signed_in' ? { email: 'person@example.com' } : {}),
      }),
      status: () => ({
        state: identityState,
        ...(identityState === 'signed_in' ? { email: 'person@example.com' } : {}),
      }),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut: async () => {
        identityState = 'signed_out';
        return { state: identityState } as const;
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller, repository } = await createHarness({ identity });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId: thread.threadId, text: 'Hello' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    await controller.invoke('auth.signOut', undefined);

    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    expect(repository.list('research')).toEqual([]);
    expect(repository.list('research_sync')).toEqual([]);
    await controller.shutdown();
  });

  it('does not discard an unsynced research outbox during sign-out', async () => {
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const identity = {
      initialize: async () => ({ state: identityState, email: 'person@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut: async () => {
        identityState = 'signed_out';
        return { state: identityState } as const;
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
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
      uploadResearchBatch: vi.fn(async () => {
        throw new Error('offline');
      }),
    } as unknown as CloudClient;
    const { controller, repository } = await createHarness({ cloud, identity });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Research participant',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId: thread.threadId, text: 'Retain me' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    await expect(controller.invoke('auth.signOut', undefined)).rejects.toThrow(
      'waiting for AWS',
    );
    expect(identityState).toBe('signed_in');
    expect(repository.list('research')).not.toHaveLength(0);
    await controller.shutdown();
  });

  it('retains local research until cloud deletion is confirmed and preserves it on failure', async () => {
    const deletion = Promise.withResolvers<{
      id: string;
      scope: 'research';
      state: string;
    }>();
    const deleteResearchData = vi
      .fn()
      .mockRejectedValueOnce(new Error('cloud worker failed'))
      .mockImplementationOnce(() => deletion.promise);
    const cloud = {
      configured: true,
      deleteResearchData,
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
    };
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    repository.put('research', 'batch-1', {
      batchId: 'batch-1',
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: new Date().toISOString(),
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });

    await expect(
      controller.invoke('research.delete', { confirmation: 'DELETE' }),
    ).rejects.toThrow('Local research batches remain');
    expect(repository.list('research')).toHaveLength(1);
    expect(controller.snapshot().capture.status).toBe('recording');

    const pending = controller.invoke('research.delete', { confirmation: 'DELETE' });
    await vi.waitFor(() => expect(deleteResearchData).toHaveBeenCalledTimes(2));
    expect(repository.list('research')).toHaveLength(1);
    expect(controller.snapshot().capture.status).toBe('deleting');
    deletion.resolve({ id: 'deletion-1', scope: 'research', state: 'completed' });

    await expect(pending).resolves.toMatchObject({
      capture: { status: 'not_consented', pendingCount: 0 },
    });
    expect(repository.list('research')).toHaveLength(0);
    await controller.shutdown();
  });

  it('clears local Sia state only after the exact cloud account job completes', async () => {
    const deletion = Promise.withResolvers<{
      id: string;
      scope: 'account';
      state: 'completed';
    }>();
    const cloud = {
      configured: true,
      deleteAccountData: vi.fn(() => deletion.promise),
    } as unknown as CloudClient;
    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const signOut = vi.fn(async () => {
      identityState = 'signed_out';
      return { state: identityState } as const;
    });
    const identity = {
      initialize: async () => ({ state: identityState, email: 'person@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => ({ state: identityState }),
      signOut,
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const resetSessions = vi.fn(async () => undefined);
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      runtime: {
        runTurn: vi.fn(),
        cancel: vi.fn(async () => undefined),
        respondToRequest: vi.fn(async () => undefined),
        resetSessions,
        dispose: vi.fn(async () => undefined),
      },
    });
    repository.put('sentinel', 'keep-until-confirmed', { value: true });

    const pending = controller.invoke('auth.deleteAccount', {
      confirmation: 'DELETE ACCOUNT',
    });
    await vi.waitFor(() => expect(cloud.deleteAccountData).toHaveBeenCalledOnce());
    expect(repository.get('sentinel', 'keep-until-confirmed')).toEqual({ value: true });
    expect(controller.snapshot().cloud.auth).toBe('signed_in');

    deletion.resolve({
      id: 'account-deletion-1',
      scope: 'account',
      state: 'completed',
    });
    await expect(pending).resolves.toMatchObject({
      agents: [],
      threads: [],
      connections: expect.arrayContaining([
        expect.objectContaining({ id: 'gmail', status: 'disconnected' }),
      ]),
      cloud: { auth: 'signed_out' },
    });
    expect(repository.get('sentinel', 'keep-until-confirmed')).toBeUndefined();
    expect(signOut).toHaveBeenCalledOnce();
    expect(resetSessions).toHaveBeenCalledOnce();
    await controller.shutdown();
  });

  it('keeps local Sia state and sign-in when cloud account deletion fails', async () => {
    const cloud = {
      configured: true,
      deleteAccountData: vi.fn(async () => {
        throw new Error('cloud worker failed');
      }),
    } as unknown as CloudClient;
    const signOut = vi.fn(async () => ({ state: 'signed_out' as const }));
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut,
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller, repository } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
    });
    repository.put('sentinel', 'must-survive', { value: true });

    await expect(
      controller.invoke('auth.deleteAccount', { confirmation: 'DELETE ACCOUNT' }),
    ).rejects.toThrow('cloud worker failed');

    expect(repository.get('sentinel', 'must-survive')).toEqual({ value: true });
    expect(controller.snapshot().cloud.auth).toBe('signed_in');
    expect(signOut).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('routes an MFA-protected admin through password then authenticator completion', async () => {
    let identityState: 'password_required' | 'mfa_required' | 'signed_in' = 'password_required';
    const completePasswordSignIn = vi.fn(async (password: string) => {
      expect(password).toBe('admin password with spaces');
      identityState = 'mfa_required';
      return { state: identityState, email: 'admin@example.com' } as const;
    });
    const completeMfaSignIn = vi.fn(async (code: string) => {
      expect(code).toBe('123456');
      identityState = 'signed_in';
      return {
        state: identityState,
        email: 'admin@example.com',
        admin: true,
        adminMfa: true,
      } as const;
    });
    const identity = {
      initialize: async () => ({ state: identityState, email: 'admin@example.com' }),
      status: () =>
        identityState === 'signed_in'
          ? {
              state: identityState,
              email: 'admin@example.com',
              admin: true,
              adminMfa: true,
            }
          : { state: identityState, email: 'admin@example.com' },
      startEmailSignIn: async () => ({ state: identityState, email: 'admin@example.com' }),
      completeEmailSignIn: vi.fn(async () => ({
        state: identityState,
        email: 'admin@example.com',
      })),
      completePasswordSignIn,
      completeMfaSignIn,
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      identity,
      cloud: new CloudClient('https://api.example.test', { read: async () => undefined }),
    });

    await controller.invoke('auth.complete', { code: 'admin password with spaces' });
    expect(completePasswordSignIn).toHaveBeenCalledOnce();
    expect(identity.completeEmailSignIn).not.toHaveBeenCalled();
    expect(controller.snapshot().cloud.auth).toBe('mfa_required');

    await controller.invoke('auth.complete', { code: '123456' });
    expect(completeMfaSignIn).toHaveBeenCalledOnce();
    expect(controller.snapshot().cloud).toMatchObject({
      auth: 'signed_in',
      admin: true,
      adminMfa: true,
    });
    await controller.shutdown();
  });

  it('refuses account deletion without a configured signed-in cloud identity', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('auth.deleteAccount', { confirmation: 'DELETE ACCOUNT' }),
    ).rejects.toThrow('not configured');
    await controller.shutdown();
  });

  it('disconnects included voice at sign-out before awaiting other work', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const voice = new ElevenLabsVoiceService({
      repository,
      gateway: {
        configured: true,
        voiceCatalog: async () => ({
          provider: {
            available: true,
            voices: [{ id: 'test-voice', name: 'Test voice' }],
            tokenTypes: ['realtime_scribe'],
          },
        }),
        mintVoiceToken: vi.fn(),
      },
    });
    const { controller } = await createHarness({ repository, voice });
    await controller.invoke('voice.configure', undefined);
    expect(voice.view().status).toBe('connected');
    await controller.invoke('auth.signOut', undefined);
    expect(voice.view().status).toBe('disconnected');
    expect(repository.get('voice', 'managed')).toBeUndefined();
    await controller.shutdown();
  });

  it('locks every app bridge and local record until email sign-in succeeds', async () => {
    type IdentityState = 'signed_in' | 'signed_out' | 'code_sent';
    let state: IdentityState = 'signed_in';
    let email = 'person@example.com';
    const status = () =>
      state === 'signed_out'
        ? ({ state } as const)
        : ({ state, email } as { state: Exclude<IdentityState, 'signed_out'>; email: string });
    const identity = {
      initialize: async () => status(),
      status,
      startEmailSignIn: async (nextEmail: string) => {
        email = nextEmail;
        state = 'code_sent';
        return status();
      },
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return status();
      },
      signOut: async () => {
        state = 'signed_out';
        return status();
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const registerAccount = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      registerAccount,
      sessionStatus: async () => ({
        admin: false,
        participant: false,
        features: {
          researchUploads: true,
          researchArchive: false,
          connectors: true,
          schedules: true,
        },
      }),
    } as unknown as CloudClient;
    const { controller } = await createHarness({
      cloud,
      identity,
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory: async () => undefined,
    });
    const created = await controller.invoke('agents.save', {
      name: 'Private release work',
      instructions: 'Keep this behind Sia sign-in.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
    });
    expect(created.snapshot.agents).toHaveLength(1);

    await controller.invoke('auth.signOut', undefined);

    await expect(controller.invoke('bootstrap', undefined)).resolves.toMatchObject({
      agents: [],
      threads: [],
      timeline: [],
      providers: [],
      schedules: [],
      cloud: { auth: 'signed_out' },
    });
    await expect(controller.invoke('settings.openDirectory', undefined)).rejects.toThrow(
      'Sign in to Sia to continue.',
    );
    await expect(controller.invoke('providers.probe', { providerId: 'codex' })).rejects.toThrow(
      'Sign in to Sia to continue.',
    );
    await expect(controller.invoke('computer.permissions', undefined)).rejects.toThrow(
      'Sign in to Sia to continue.',
    );
    await expect(controller.invoke('assistant.library', { operation: 'list' })).rejects.toThrow(
      'Sign in',
    );
    await expect(
      controller.invoke('settings.setOnboarding', { step: 'welcome' }),
    ).rejects.toThrow('Sign in to Sia to continue.');
    await expect(controller.invoke('settings.restartForOnboarding', undefined)).rejects.toThrow(
      'Sign in to Sia',
    );
    await expect(controller.invoke('computer.setupMessages', undefined)).rejects.toThrow(
      'Sign in to Sia',
    );
    expect(controller.snapshot().preferences.onboarding).toBeUndefined();
    expect(controller.actionToolAvailable('computer_snapshot')).toBe(false);

    await controller.invoke('auth.start', { email: 'person@example.com' });
    expect(registerAccount).toHaveBeenCalledWith('person@example.com');
    expect(controller.snapshot().cloud.auth).toBe('code_sent');
    await controller.invoke('auth.complete', { code: '12345678' });

    expect(controller.snapshot()).toMatchObject({
      agents: [expect.objectContaining({ name: 'Private release work' })],
      cloud: { auth: 'signed_in', account: 'person@example.com' },
    });
    expect(controller.actionToolAvailable('computer_snapshot')).toBe(true);
    await controller.shutdown();
  });
});
