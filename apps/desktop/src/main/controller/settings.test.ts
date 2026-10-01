import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MacVoiceService } from '../voice/mac-voice-service.js';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { canonicalJson } from '../cloud/update-manifest.js';
import { computer, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('saves setup before restarting and rechecks access without reviving a browser grant', async () => {
    const restartApp = vi.fn();
    const h = await createHarness({
      restartApp,
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory: async () => undefined,
    });
    await expect(
      h.controller.invoke('settings.restartForOnboarding', undefined),
    ).rejects.toThrow('Finish connecting');
    await h.controller.invoke('agents.save', {
      name: 'Sia',
      instructions: '',
      model: 'gpt-5.6-sol',
      startOnboarding: true,
    });
    await h.controller.invoke('computer.setTrust', { trust: 'ask' });
    await h.controller.invoke('settings.setOnboarding', {
      step: 'restart',
      permissionSetup: { includeApps: true, active: true },
    });
    restartApp.mockImplementation(() => {
      expect(
        h.repository.get<{ preferences: { onboarding: unknown } }>('desktop', 'state')
          ?.preferences.onboarding,
      ).toMatchObject({ step: 'verify', restartPending: true });
    });
    await h.controller.invoke('settings.restartForOnboarding', undefined);
    await h.controller.invoke('settings.restartForOnboarding', undefined);
    expect(restartApp).toHaveBeenCalledTimes(1);
    const restored = await createHarness({ repository: h.repository });
    expect(restored.controller.snapshot().preferences.onboarding).toMatchObject({
      step: 'verify',
      restartPending: false,
      restarted: true,
      permissionSetup: { includeApps: true, active: true },
    });
    expect(restored.controller.snapshot().browser.status).toBe('detached');
    expect(restored.controller.computerTrust()).toBe('ask');
    expect(restored.controller.snapshot().agents).toHaveLength(1);
  });

  it('does not request macOS permissions on initial startup or a read-only recheck', async () => {
    const requestPermissions = vi.fn(computer.requestPermissions);
    const missing = {
      ...computer,
      requestPermissions,
      permissions: async () => ({
        status: 'needs_permission' as const,
        accessibility: false,
        screenRecording: false,
      }),
    };
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'person@example.test' }),
      status: () => ({ state: 'signed_in' as const, email: 'person@example.test' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      computer: missing,
      identity,
    });
    try {
      await controller.invoke('computer.setTrust', { trust: 'auto' });
      await controller.initialize();
      expect(controller.computerTrust()).toBe('auto');
      expect(requestPermissions).not.toHaveBeenCalled();
      await controller.invoke('computer.permissions', undefined);
      expect(requestPermissions).not.toHaveBeenCalled();
      await controller.invoke('computer.requestPermissions', undefined);
      expect(requestPermissions).toHaveBeenCalledTimes(1);
      await controller.invoke('computer.requestPermissions', { permission: 'screenRecording' });
      expect(requestPermissions).toHaveBeenLastCalledWith('screenRecording');
    } finally {
      await controller.shutdown();
    }
  });

  it('includes live voice permission status in a read-only access check without authorizing dictation', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const voice = new MacVoiceService(repository, vi.fn());
    const refreshPermissions = vi.fn(async () => {});
    const prepareDictation = vi.fn(async () => {});
    const requestMicrophonePermission = vi.fn(async () => {});
    Object.assign(voice, { refreshPermissions, prepareDictation });
    const { controller } = await createHarness({
      voice,
      repository,
      requestMicrophonePermission,
    });
    try {
      await controller.invoke('computer.permissions', undefined);
      expect(refreshPermissions).toHaveBeenCalledOnce();
      expect(prepareDictation).not.toHaveBeenCalled();
      expect(requestMicrophonePermission).not.toHaveBeenCalled();
    } finally {
      await controller.shutdown();
    }
  });

  it('requests native app permission only through explicit setup and refreshes revocations', async () => {
    let ready = false;
    const automationPermissions = vi.fn(async (app?: string) => {
      if (app === 'calendar') ready = true;
      return {
        calendar: ready ? ('ready' as const) : ('denied' as const),
        reminders: 'needs_permission' as const,
        finder: 'not_running' as const,
        messages: 'unavailable' as const,
      };
    });
    const { controller } = await createHarness({
      capabilitySetup: {
        automationPermissions,
        messagesStatus: () => 'unavailable',
        chromeDebugStatus: async () => 'off',
      },
    });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    expect(automationPermissions).toHaveBeenCalledWith();
    expect(controller.snapshot().computer.automation?.calendar).toBe('denied');
    await controller.invoke('computer.requestAutomation', { app: 'calendar' });
    expect(automationPermissions).toHaveBeenLastCalledWith('calendar');
    expect(controller.snapshot().computer.automation?.calendar).toBe('ready');
    expect(controller.computerTrust()).toBe('ask');
    ready = false;
    await controller.invoke('computer.permissions', undefined);
    expect(controller.snapshot().computer.automation?.calendar).toBe('denied');
  });

  it('opens Messages permission setup only on request and refreshes its real status', async () => {
    let granted = false;
    const openMessagesPermissions = vi.fn(async () => {
      granted = true;
    });
    const h = await createHarness({
      openMessagesPermissions,
      capabilitySetup: {
        messagesStatus: () => (granted ? 'ready' : 'needs_full_disk_access'),
        chromeDebugStatus: async () => 'off',
      },
    });
    expect(openMessagesPermissions).not.toHaveBeenCalled();
    await h.controller.invoke('computer.setupMessages', undefined);
    expect(openMessagesPermissions).toHaveBeenCalledTimes(1);
    expect(h.controller.snapshot().computer.messagesAccess).toBe('ready');
    granted = false;
    await h.controller.invoke('computer.permissions', undefined);
    expect(h.controller.snapshot().computer.messagesAccess).toBe('needs_full_disk_access');
  });

  it('persists setup with a single canonical starter and preserves approval defaults', async () => {
    const { controller, repository } = await createHarness({
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory: async () => undefined,
    });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('settings.setOnboarding', { step: 'agent' });
    await expect(
      controller.invoke('settings.setOnboarding', { step: 'voice' }),
    ).rejects.toThrow('Create your agent');
    const input = {
      name: 'Sia',
      instructions: 'Help with everyday tasks.',
      provider: 'codex' as const,
      model: 'gpt-5.6-sol',
      startOnboarding: true,
    };
    const [first, repeated] = await Promise.all([
      controller.invoke('agents.save', input),
      controller.invoke('agents.save', input),
    ]);
    expect(repeated.agentId).toBe(first.agentId);
    expect(controller.snapshot().agents).toHaveLength(1);
    expect(controller.snapshot().threads).toHaveLength(1);
    expect(controller.snapshot().preferences.onboarding).toEqual({
      step: 'voice',
      agentId: first.agentId,
    });
    expect(controller.snapshot().threads[0]?.harnessId).toBe('codex_app_server');
    expect(controller.computerTrust()).toBe('ask');
    await controller.invoke('settings.setOnboarding', { step: 'access' });
    expect(
      repository.get<{ preferences: unknown }>('desktop', 'state')?.preferences,
    ).toMatchObject({ onboarding: { step: 'access', agentId: first.agentId } });
    await controller.invoke('settings.setOnboarding', { step: 'complete' });
    await controller.invoke('settings.setOnboarding', { step: 'welcome' });
    expect(controller.snapshot().preferences.onboarding).toEqual({
      step: 'welcome',
      agentId: first.agentId,
    });
    expect(controller.snapshot().agents).toHaveLength(1);
  });

  it('leaves setup cleanly when a first agent is created manually', async () => {
    const { controller } = await createHarness({
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory: async () => undefined,
    });
    await controller.invoke('settings.setOnboarding', { step: 'agent' });
    await controller.invoke('agents.save', {
      name: 'Custom helper',
      instructions: 'Custom instructions',
      model: 'gpt-5.6-sol',
    });
    expect(controller.snapshot().preferences.onboarding?.step).toBe('complete');
    await expect(
      controller.invoke('agents.save', {
        name: 'Sia',
        instructions: '',
        model: 'gpt-5.6-sol',
        startOnboarding: true,
      }),
    ).rejects.toThrow('existing agent');
  });

  it('hands feedback to the mail client without transcript contents', async () => {
    const composeFeedback = vi.fn().mockResolvedValue(undefined);
    const { controller } = await createHarness({ composeFeedback });

    await controller.invoke('feedback.compose', {
      message: 'The room menu is hard to find.',
      includeDiagnostics: true,
    });

    expect(composeFeedback).toHaveBeenCalledOnce();
    expect(composeFeedback.mock.calls[0]?.[1]).toContain('Version: development');
    expect(composeFeedback.mock.calls[0]?.[1]).toContain('no transcript or file contents');
    await controller.shutdown();
  });

  it('checks a clean update feed and opens only its HTTPS download', async () => {
    const keys = generateKeyPairSync('ed25519');
    const publicKey = keys.publicKey
      .export({ format: 'der', type: 'spki' })
      .toString('base64url');
    const payload = {
      schemaVersion: 1,
      channel: 'internal',
      platform: 'macos',
      architecture: 'universal',
      version: '0.1.0-alpha.15',
      publishedAt: '2026-08-26T12:00:00.000Z',
      minimumSystemVersion: '14.0',
      artifact: {
        key: 'releases/0.1.0-alpha.15/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.15-universal.dmg',
        sha256: 'a'.repeat(64),
        bytes: 250_000_000,
      },
    } as const;
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          payload,
          keyId: 'sia-release-2026-01',
          signature: sign(null, Buffer.from(canonicalJson(payload)), keys.privateKey).toString(
            'base64url',
          ),
          downloadUrl:
            'https://sia-alpha-releases.s3.us-east-1.amazonaws.com/releases/0.1.0-alpha.15/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.15-universal.dmg?X-Amz-Signature=test',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { controller } = await createHarness({
      openExternal,
      appVersion: '0.1.0-alpha.14',
      updateManifestUrl: 'https://releases.example.test/latest-mac.json',
      updateManifestPublicKey: publicKey,
      identity: {
        initialize: async () => ({ state: 'signed_in' as const }),
        read: async () => 'signed-id-token',
        status: () => ({ state: 'signed_in' as const }),
        startEmailSignIn: async () => ({ state: 'signed_in' as const }),
        completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
        signOut: async () => ({ state: 'signed_out' as const }),
      },
    });

    await expect(controller.invoke('updates.check', undefined)).resolves.toMatchObject({
      status: 'available',
      latestVersion: '0.1.0-alpha.15',
    });
    await controller.invoke('updates.openDownload', undefined);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://releases.example.test/latest-mac.json',
      expect.objectContaining({
        headers: { accept: 'application/json', authorization: 'Bearer signed-id-token' },
      }),
    );
    expect(openExternal).toHaveBeenCalledWith(
      'https://sia-alpha-releases.s3.us-east-1.amazonaws.com/releases/0.1.0-alpha.15/aaaaaaaaaaaaaaaa/Sia-0.1.0-alpha.15-universal.dmg?X-Amz-Signature=test',
    );
    vi.unstubAllGlobals();
    await controller.shutdown();
  });

  it('opens Apple Messages through a dedicated host capability', async () => {
    const openMessages = vi.fn().mockResolvedValue(undefined);
    const { controller } = await createHarness({ openMessages });

    await controller.invoke('computer.openMessages', undefined);

    expect(openMessages).toHaveBeenCalledOnce();
    await controller.shutdown();
  });

  it('persists appearance without changing existing preferences or conversations', async () => {
    const { controller, repository } = await createHarness();
    const before = controller.snapshot();
    const updated = await controller.invoke('settings.setAppearance', { appearance: 'calm' });
    expect(updated.preferences).toEqual({ ...before.preferences, appearance: 'calm' });
    expect(updated.threads).toEqual(before.threads);
    expect(
      repository.get<{ preferences: { appearance: string } }>('desktop', 'state')?.preferences
        .appearance,
    ).toBe('calm');
    expect(
      (await controller.invoke('settings.setAppearance', { appearance: 'expressive' }))
        .preferences.appearance,
    ).toBe('expressive');
    await controller.shutdown();
  });

  it('saves theme and text size, drops defaults, and ignores unreadable stored values', async () => {
    const { controller, repository } = await createHarness();
    expect(controller.displayPreferences()).toEqual({});
    await controller.invoke('settings.setTheme', { theme: 'dark' });
    const updated = await controller.invoke('settings.setTextSize', { textSize: 'larger' });
    expect(updated.preferences).toMatchObject({ theme: 'dark', textSize: 'larger' });
    expect(controller.displayPreferences()).toEqual({ theme: 'dark', textSize: 'larger' });
    await expect(
      controller.invoke('settings.setTheme', { theme: 'neon' } as never),
    ).rejects.toThrow('Choose System, Light, or Dark.');
    await expect(
      controller.invoke('settings.setTextSize', { textSize: 'huge' } as never),
    ).rejects.toThrow('Choose a text size');
    const restored = await createHarness({ repository });
    expect(restored.controller.displayPreferences()).toEqual({
      theme: 'dark',
      textSize: 'larger',
    });
    await restored.controller.invoke('settings.setTheme', { theme: 'system' });
    await restored.controller.invoke('settings.setTextSize', { textSize: 'default' });
    const saved = repository.get<{ preferences: Record<string, unknown> }>('desktop', 'state')!;
    expect(saved.preferences).not.toHaveProperty('theme');
    expect(saved.preferences).not.toHaveProperty('textSize');
    repository.put('desktop', 'state', {
      ...saved,
      preferences: { ...saved.preferences, theme: 'neon', textSize: 3 },
    });
    expect((await createHarness({ repository })).controller.displayPreferences()).toEqual({});
  });

  it('persists the local completion-sound preference', async () => {
    const { controller, repository } = await createHarness();

    const updated = await controller.invoke('settings.setCompletionSound', { enabled: true });
    expect(updated.preferences.completionSound).toBe(true);
    expect(
      repository.get<{ preferences: { completionSound: boolean } }>('desktop', 'state')
        ?.preferences.completionSound,
    ).toBe(true);
    await controller.shutdown();
  });

  it('registers Sia as a login item only when the person turns it on', async () => {
    const setOpenAtLogin = vi.fn();
    const { controller, repository } = await createHarness({ setOpenAtLogin });
    expect(controller.snapshot().preferences.openAtLogin).toBeUndefined();

    const updated = await controller.invoke('settings.setOpenAtLogin', { enabled: true });
    expect(setOpenAtLogin).toHaveBeenCalledWith(true);
    expect(updated.preferences.openAtLogin).toBe(true);
    expect(
      repository.get<{ preferences: { openAtLogin?: boolean } }>('desktop', 'state')
        ?.preferences.openAtLogin,
    ).toBe(true);

    setOpenAtLogin.mockImplementationOnce(() => {
      throw new Error('Opening at login is available in the installed Sia app.');
    });
    await expect(
      controller.invoke('settings.setOpenAtLogin', { enabled: false }),
    ).rejects.toThrow('installed Sia app');
    expect(controller.snapshot().preferences.openAtLogin).toBe(true);
    await controller.shutdown();
  });
});

it('defaults new profiles to automatic action approval and preserves it after agent creation and restart', async () => {
  const { controller, repository } = await createHarness();
  expect(controller.computerAccessMode()).toBe('mac');
  expect(controller.computerTrust()).toBe('auto');
  expect(controller.snapshot().computer.trust).toBe('auto');
  await controller.invoke('agents.save', {
    name: 'Fresh profile agent',
    instructions: 'Help with tasks.',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-workspace',
  });
  expect(controller.computerTrust()).toBe('auto');
  const restored = await createHarness({ repository });
  expect(restored.controller.computerTrust()).toBe('auto');
  await restored.controller.shutdown();
});

it('uses bypass for profiles that never chose an approval preference', async () => {
  const { repository } = await createHarness();
  const stored = repository.get<{ preferences: { computerTrust?: string } }>(
    'desktop',
    'state',
  )!;
  delete stored.preferences.computerTrust;
  repository.put('desktop', 'state', stored);
  const restored = await createHarness({ repository });
  expect(restored.controller.computerTrust()).toBe('auto');
  expect(restored.controller.snapshot().computer.trust).toBe('auto');
  expect(restored.controller.isBrowserOriginAllowed('https://example.com')).toBe(true);
  await restored.controller.shutdown();
});

it('persists Use my Mac separately from action confirmations and avoids Chrome preparation', async () => {
  const { controller, repository } = await createHarness();
  await controller.invoke('computer.setTrust', { trust: 'ask' });
  expect(controller.computerAccessMode()).toBe('mac');
  expect(controller.macBackgroundControl()).toBe(true);
  expect(controller.macBackgroundFallback()).toBe('pause');
  expect(controller.computerTrust()).toBe('ask');
  await controller.invoke('computer.setAccessMode', {
    mode: 'mac',
    background: false,
    backgroundFallback: 'foreground',
  });
  await controller.invoke('computer.setAccessMode', { mode: 'mac' });
  expect(controller.snapshot().computer.backgroundControl).toBe(false);
  expect(controller.snapshot().computer.accessMode).toBe('mac');
  expect(controller.computerTrust()).toBe('ask');
  expect(await controller.ensureBrowserAttachedForActions()).toContain('Use my Mac');
  expect(controller.snapshot().browser.status).toBe('detached');
  const restored = await createHarness({ repository });
  expect(restored.controller.computerAccessMode()).toBe('mac');
  expect(restored.controller.macBackgroundControl()).toBe(false);
  expect(restored.controller.macBackgroundFallback()).toBe('foreground');
  expect(restored.controller.computerTrust()).toBe('ask');
  await restored.controller.shutdown();
});

it('works in the background by default, including profiles saved before the setting existed', async () => {
  const { controller, repository } = await createHarness();
  expect(controller.snapshot().computer.backgroundControl).toBe(true);
  const stored = repository.get<{ preferences: { macBackgroundControl?: boolean } }>(
    'desktop',
    'state',
  )!;
  delete stored.preferences.macBackgroundControl;
  repository.put('desktop', 'state', stored);
  const legacy = await createHarness({ repository });
  expect(legacy.controller.macBackgroundControl()).toBe(true);
  await legacy.controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
  const onScreen = await createHarness({ repository });
  expect(onScreen.controller.macBackgroundControl()).toBe(false);
  await onScreen.controller.shutdown();
});

it('preserves connected mode for existing profiles, including profiles predating the mode setting', async () => {
  const { controller, repository } = await createHarness();
  await controller.invoke('computer.setAccessMode', { mode: 'connected' });
  const explicit = await createHarness({ repository });
  expect(explicit.controller.computerAccessMode()).toBe('connected');
  const stored = repository.get<{ preferences: { computerAccessMode?: string } }>(
    'desktop',
    'state',
  )!;
  delete stored.preferences.computerAccessMode;
  repository.put('desktop', 'state', stored);
  const legacy = await createHarness({ repository });
  expect(legacy.controller.computerAccessMode()).toBe('connected');
  await legacy.controller.shutdown();
});
