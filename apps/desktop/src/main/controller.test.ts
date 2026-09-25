import { ScottyTasks } from './scotty-state.js';
import { AssistantLibrary } from './assistant-library.js';
import { NotchVault } from './notch/vault.js';
import type { VoiceHelperFactory } from './push-to-talk.js';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { ActionGateway, getActionToolDescriptor } from '@sia/action-gateway';

import { CloudClient } from './cloud-client.js';
import { DesktopController } from './controller.js';
import { ElevenLabsVoiceService } from './voice-service.js';
import { MacVoiceService } from './mac-voice-service.js';
import { probeProviders } from './provider-probe.js';
import type { RuntimeTurnInput } from './runtime-coordinator.js';
import { canonicalJson } from './update-manifest.js';
import {
  EphemeralPayloadCipher,
  PlaintextTestCipher,
  type RecordRepository,
  SqliteRecordRepository,
} from './persistence.js';

const computer = {
  permissions: async () => ({
    status: 'ready' as const,
    accessibility: true,
    screenRecording: true,
  }),
  requestPermissions: async () => ({
    status: 'ready' as const,
    accessibility: true,
    screenRecording: true,
  }),
  call: async () => ({}),
  shutdown: async () => undefined,
};

interface ResearchBatchView {
  batchId: string;
  syncEligible?: boolean;
  consent: { version: string; acceptedAt: string; purpose: string };
  events: Array<{
    id: string;
    occurredAt: string;
    classification: string;
    taints: string[];
    kind: string;
    payload: Record<string, unknown>;
    sourceEventIds: string[];
  }>;
}

async function createHarness(
  options: {
    fakeServices?: boolean;
    voice?: ConstructorParameters<typeof DesktopController>[0]['voice'];
    runtime?: unknown;
    cloud?: CloudClient;
    identity?: ConstructorParameters<typeof DesktopController>[0]['identity'];
    computer?: ConstructorParameters<typeof DesktopController>[0]['computer'];
    runCommand?: (file: string, args: readonly string[]) => Promise<string>;
    providerProbe?: ConstructorParameters<typeof DesktopController>[0]['providerProbe'];
    openExternal?: (url: string) => Promise<void>;
    openMessages?: () => Promise<void>;
    openMessagesPermissions?: () => Promise<void>;
    requestMicrophonePermission?: () => Promise<void>;
    restartApp?: () => void;
    installCodex?: () => Promise<void>;
    workspaceOperations?: ConstructorParameters<
      typeof DesktopController
    >[0]['workspaceOperations'];
    repository?: RecordRepository;
    capabilitySetup?: ConstructorParameters<typeof DesktopController>[0]['capabilitySetup'];
    trajectory?: ConstructorParameters<typeof DesktopController>[0]['trajectory'];
    chooseFiles?: () => Promise<string[]>;
    openPath?: (path: string) => Promise<void>;
    revealDirectory?: (path: string) => Promise<void>;
    composeFeedback?: (subject: string, body: string) => Promise<void>;
    appVersion?: string;
    updateManifestUrl?: string;
    updateManifestPublicKey?: string;
    defaultWorkspaceRoot?: string;
    createDirectory?: (path: string) => Promise<void>;
  } = {},
): Promise<{
  controller: DesktopController;
  repository: RecordRepository;
}> {
  const repository =
    options.repository ?? new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  const controller = new DesktopController({
    repository,
    cloud: options.cloud ?? new CloudClient(undefined, { read: async () => undefined }),
    computer: options.computer ?? computer,
    identity: options.identity ?? {
      initialize: async () => ({ state: 'unconfigured' as const }),
      read: async () => undefined,
      status: () => ({ state: 'unconfigured' as const }),
      startEmailSignIn: async () => ({ state: 'unconfigured' as const }),
      completeEmailSignIn: async () => ({ state: 'unconfigured' as const }),
      signOut: async () => ({ state: 'unconfigured' as const }),
    },
    fakeServices: options.fakeServices ?? true,
    ...(options.voice ? { voice: options.voice } : {}),
    openExternal: options.openExternal ?? (async () => undefined),
    openMessages: options.openMessages ?? (async () => undefined),
    ...(options.restartApp ? { restartApp: options.restartApp } : {}),
    ...(options.installCodex ? { installCodex: options.installCodex } : {}),
    ...(options.workspaceOperations
      ? { workspaceOperations: options.workspaceOperations }
      : {}),
    ...(options.openMessagesPermissions
      ? { openMessagesPermissions: options.openMessagesPermissions }
      : {}),
    ...(options.requestMicrophonePermission
      ? { requestMicrophonePermission: options.requestMicrophonePermission }
      : {}),
    chooseDirectory: async () => '/tmp/sia-workspace',
    ...(options.defaultWorkspaceRoot
      ? { defaultWorkspaceRoot: options.defaultWorkspaceRoot }
      : {}),
    ...(options.createDirectory ? { createDirectory: options.createDirectory } : {}),
    ...(options.chooseFiles ? { chooseFiles: options.chooseFiles } : {}),
    ...(options.openPath ? { openPath: options.openPath } : {}),
    ...(options.revealDirectory ? { revealDirectory: options.revealDirectory } : {}),
    ...(options.composeFeedback ? { composeFeedback: options.composeFeedback } : {}),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    ...(options.updateManifestUrl ? { updateManifestUrl: options.updateManifestUrl } : {}),
    ...(options.updateManifestPublicKey
      ? { updateManifestPublicKey: options.updateManifestPublicKey }
      : {}),
    exportJson: async () => '/tmp/export.json',
    ...(options.capabilitySetup ? { capabilitySetup: options.capabilitySetup } : {}),
    ...(options.runCommand ? { runCommand: options.runCommand } : {}),
    ...(options.providerProbe
      ? { providerProbe: options.providerProbe }
      : options.fakeServices === false
        ? { providerProbe: deterministicProviderProbe }
        : {}),
    ...(options.trajectory ? { trajectory: options.trajectory } : {}),
  });
  await controller.initialize();
  if (
    controller.snapshot().cloud.auth === 'signed_in' ||
    controller.snapshot().cloud.auth === 'unconfigured'
  ) {
    await controller.invoke('settings.openDirectory', undefined);
  }
  if (options.runtime) controller.attachRuntime(options.runtime as never);
  return { controller, repository };
}

async function deterministicProviderProbe(providerId?: Parameters<typeof probeProviders>[0]) {
  const providers = await probeProviders(providerId, { PATH: '' });
  return providers.map((provider) =>
    provider.id === 'codex'
      ? {
          ...provider,
          status: 'ready' as const,
          version: '0.147.0',
          account: 'Authenticated test account',
        }
      : provider,
  );
}

async function createController(): Promise<DesktopController> {
  return (await createHarness()).controller;
}

describe('DesktopController', () => {
  it('uses the offered reasoning default after reset while preserving an explicit choice', async () => {
    const turns: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        turns.push(input);
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      providerProbe: async (only) =>
        (await deterministicProviderProbe(only)).map((provider) =>
          provider.id === 'codex'
            ? {
                ...provider,
                models: [
                  {
                    id: 'gpt-5.6-sol',
                    label: 'GPT-5.6-Sol',
                    description: '',
                    reasoningEfforts: ['low', 'medium'],
                    defaultReasoningEffort: 'medium',
                  },
                ],
              }
            : provider,
        ),
    });
    try {
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Reasoning validation',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      for (const choice of ['low', '']) {
        await controller.invoke('threads.config', {
          threadId,
          model: 'gpt-5.6-sol',
          reasoningEffort: choice,
        });
        await controller.invoke('threads.send', { threadId, text: 'Read the test document.' });
        await vi.waitFor(() =>
          expect(
            controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
          ).toBe('idle'),
        );
      }
      expect(turns.map((turn) => turn.reasoningEffort)).toEqual(['low', 'medium']);
    } finally {
      await controller.shutdown();
    }
  });

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

  it('creates a private default workspace, color, and first thread for a new agent', async () => {
    const createDirectory = vi.fn(async () => undefined);
    const { controller } = await createHarness({
      defaultWorkspaceRoot: '/tmp/Sia/Agents',
      createDirectory,
    });

    const created = await controller.invoke('agents.save', {
      name: 'Release Partner',
      instructions: 'Keep release work focused.',
      model: 'gpt-5.6-sol',
    });
    const agent = created.snapshot.agents.find(({ id }) => id === created.agentId)!;

    expect(createDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/^\/tmp\/Sia\/Agents\/release-partner-[a-f0-9]{8}$/),
    );
    expect(agent).toMatchObject({
      provider: 'codex',
      hue: 0,
      harnessPreference: { mode: 'automatic' },
    });
    expect(agent.threadIds).toHaveLength(1);
    expect(created.snapshot.activeThreadId).toBe(agent.threadIds[0]);
    expect(created.snapshot.threads.find(({ id }) => id === agent.threadIds[0])).toMatchObject({
      workspace: agent.workspace,
      harnessId: 'codex_app_server',
      resolvedExecutionTarget: {
        provider: 'codex',
        model: 'gpt-5.6-sol',
        harnessId: 'codex_app_server',
        harnessModelId: 'gpt-5.6-sol',
        credentialSource: 'provider_subscription',
        resolutionSource: 'legacy_default',
      },
    });
    await controller.shutdown();
  });

  it('persists room controls, duplicates a clean room, and marks threads unread', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Release room',
      instructions: 'Review releases.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: created.agentId });

    await controller.invoke('agents.setPinned', { agentId: created.agentId, pinned: true });
    await controller.invoke('agents.setNotifications', {
      agentId: created.agentId,
      enabled: false,
    });
    await controller.invoke('threads.setUnread', { threadId: thread.threadId, unread: true });
    const duplicated = await controller.invoke('agents.duplicate', {
      agentId: created.agentId,
    });
    const snapshot = controller.snapshot();

    expect(snapshot.agents.find(({ id }) => id === created.agentId)).toMatchObject({
      pinned: true,
      notificationsEnabled: false,
    });
    expect(snapshot.threads.find(({ id }) => id === thread.threadId)?.unread).toBe(true);
    expect(snapshot.agents.find(({ id }) => id === duplicated.agentId)).toMatchObject({
      name: 'Release room copy',
      pinned: false,
      threadIds: [],
    });
    await controller.shutdown();
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

  it('previews bounded text and code locally without treating markup as active content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-attachment-preview-'));
    const path = join(directory, 'release-plan.md');
    await writeFile(path, '# Release plan\n\n<script>never execute</script>\n', 'utf8');
    const { controller } = await createHarness({ chooseFiles: async () => [path] });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Release partner',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      const picked = await controller.invoke('attachments.pick', { threadId });
      const attachment = picked.attachments[0]!;

      await expect(
        controller.invoke('attachments.preview', {
          threadId,
          attachmentId: attachment.id,
        }),
      ).resolves.toEqual({
        kind: 'text',
        format: 'text',
        content: '# Release plan\n\n<script>never execute</script>\n',
      });
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps the latest provider usage event once per turn', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        for (const [sequence, inputTokens] of [120, 180].entries()) {
          yield {
            id: crypto.randomUUID(),
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex' as const,
            sequence,
            timestamp: new Date(Date.now() + sequence).toISOString(),
            type: 'usage' as const,
            payload: { inputTokens, outputTokens: 40, cachedInputTokens: 20 },
          };
        }
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 3,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Usage room',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = thread.threadId;
    await controller.invoke('threads.send', {
      threadId: thread.threadId,
      text: 'Measure this.',
    });

    await vi.waitFor(() =>
      expect(controller.snapshot().providerUsage).toEqual([
        expect.objectContaining({
          provider: 'codex',
          requests: 1,
          inputTokens: 180,
          outputTokens: 40,
          cachedInputTokens: 20,
        }),
      ]),
    );
    await controller.shutdown();
  });

  it('opens Apple Messages through a dedicated host capability', async () => {
    const openMessages = vi.fn().mockResolvedValue(undefined);
    const { controller } = await createHarness({ openMessages });

    await controller.invoke('computer.openMessages', undefined);

    expect(openMessages).toHaveBeenCalledOnce();
    await controller.shutdown();
  });

  it('pins agent configuration into a thread revision', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: 'Be concise.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: created.agentId });
    await controller.invoke('settings.openDirectory', undefined);
    await controller.invoke('agents.save', {
      id: created.agentId,
      name: 'Personal',
      instructions: 'New instructions.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });

    const pinned = thread.snapshot.threads.find(({ id }) => id === thread.threadId);
    const afterEdit = controller.snapshot().threads.find(({ id }) => id === thread.threadId);
    expect(pinned).toMatchObject({ provider: 'codex', model: 'gpt-5.6-sol' });
    expect(afterEdit).toMatchObject({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    await controller.shutdown();
  });

  it('persists an optional read-aloud voice with the agent', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Narrator',
      instructions: 'Be concise.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
      voiceId: 'voice-milo',
    });

    expect(created.snapshot.agents.find(({ id }) => id === created.agentId)).toMatchObject({
      voiceId: 'voice-milo',
    });
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

  it('renames and deletes an idle thread with its local transcript', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });

    const renamed = await controller.invoke('threads.rename', {
      threadId,
      title: 'Release review',
    });
    expect(renamed.threads.find(({ id }) => id === threadId)?.title).toBe('Release review');

    const deleted = await controller.invoke('threads.delete', { threadId });
    expect(deleted.threads.some(({ id }) => id === threadId)).toBe(false);
    expect(deleted.timeline.some((item) => item.threadId === threadId)).toBe(false);
    expect(deleted.agents[0]?.threadIds).not.toContain(threadId);
    expect(deleted.activeThreadId).toBeUndefined();
    expect(deleted.activeAgentId).toBe(agent.agentId);
    await controller.shutdown();
  });

  it('persists a local thread draft and clears it only after a send is accepted', async () => {
    const { controller, repository } = await createHarness();
    const agent = await controller.invoke('agents.save', {
      name: 'Writer',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });

    const drafted = await controller.invoke('threads.draft', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    expect(drafted.threads.find(({ id }) => id === threadId)?.draft).toBe(
      'Keep this thought across a restart.',
    );
    expect(
      repository
        .get<{ threads: Array<{ id: string; draft?: string }> }>('desktop', 'state')
        ?.threads.find(({ id }) => id === threadId)?.draft,
    ).toBe('Keep this thought across a restart.');

    const sent = await controller.invoke('threads.send', {
      threadId,
      text: 'Keep this thought across a restart.',
    });
    expect(sent.snapshot.threads.find(({ id }) => id === threadId)?.draft).toBeUndefined();
    await controller.shutdown();
  });

  it('persists agent-authored schedules and keeps them scoped to their thread', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const first = await controller.invoke('threads.create', { agentId: agent.agentId });
    const second = await controller.invoke('threads.create', { agentId: agent.agentId });

    const created = controller.createScheduleFromAction(first.threadId, {
      task: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T12:00:00+09:00',
    });
    expect(created).toMatchObject({
      threadId: first.threadId,
      prompt: 'Search the web for meaningful changes and summarize them.',
      cadence: 'hourly',
      nextRunAt: '2030-08-21T03:00:00.000Z',
      enabled: true,
      maxRuns: 10,
    });
    expect(controller.listSchedulesForAction(first.threadId)).toHaveLength(1);
    expect(controller.listSchedulesForAction(second.threadId)).toEqual([]);

    const paused = controller.updateScheduleFromAction(first.threadId, {
      scheduleId: created.id,
      enabled: false,
    });
    expect(paused.enabled).toBe(false);
    expect(() =>
      controller.updateScheduleFromAction(second.threadId, {
        scheduleId: created.id,
        enabled: true,
      }),
    ).toThrow('not found in this thread');
    expect(() => controller.deleteScheduleFromAction(second.threadId, created.id)).toThrow(
      'not found in this thread',
    );

    controller.deleteScheduleFromAction(first.threadId, created.id);
    expect(controller.listSchedulesForAction(first.threadId)).toEqual([]);
    await controller.shutdown();
  });

  it('keeps the eight most recent outcomes for repeated schedule runs', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Schedule history',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const thread = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = thread.threadId;
    const schedule = controller.createScheduleFromAction(thread.threadId, {
      task: 'Record this check.',
      cadence: 'daily',
      firstRunAt: '2030-08-21T03:00:00.000Z',
    });

    for (let runCount = 1; runCount <= 10; runCount += 1) {
      await controller.invoke('schedules.runNow', { scheduleId: schedule.id });
      await vi.waitFor(() => {
        expect(controller.snapshot().schedules?.[0]).toMatchObject({
          runCount,
          lastRun: { outcome: 'completed', finishedAt: expect.any(String) },
        });
      });
    }

    const persistedSchedule = repository
      .get<{ schedules: Array<{ runHistory?: Array<{ id: string; outcome: string }> }> }>(
        'desktop',
        'state',
      )
      ?.schedules.at(0);
    expect(persistedSchedule?.runHistory).toHaveLength(8);
    expect(persistedSchedule?.runHistory?.every(({ outcome }) => outcome === 'completed')).toBe(
      true,
    );
    expect(new Set(persistedSchedule?.runHistory?.map(({ id }) => id)).size).toBe(8);
    expect(persistedSchedule?.runHistory?.[0]?.id).toBe(
      controller.snapshot().schedules?.[0]?.lastRun?.id,
    );
    await controller.shutdown();
  });

  it('recovers a claimed schedule without dispatching its persisted turn twice', async () => {
    const initial = await createHarness();
    const agent = await initial.controller.invoke('agents.save', {
      name: 'Crash-safe scheduler',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await initial.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    const schedule = initial.controller.createScheduleFromAction(threadId, {
      task: 'Check the web once.',
      cadence: 'hourly',
      firstRunAt: '2030-08-21T03:00:00.000Z',
      maxRuns: 2,
    });
    const persisted = structuredClone(
      initial.repository.get<{
        schedules: Array<{
          id: string;
          activeRun?: { id: string; dueAt: string; claimedAt: string };
        }>;
        timeline: Array<Record<string, unknown>>;
      }>('desktop', 'state')!,
    );
    await initial.controller.shutdown();

    const claimId = 'schedule-run-after-dispatch';
    const storedSchedule = persisted.schedules.find(({ id }) => id === schedule.id)!;
    storedSchedule.activeRun = {
      id: claimId,
      dueAt: '2026-08-21T00:00:00.000Z',
      claimedAt: '2026-08-21T00:00:01.000Z',
    };
    persisted.timeline.push({
      id: 'persisted-scheduled-prompt',
      threadId,
      turnId: 'persisted-scheduled-turn',
      sequence: 1,
      kind: 'user',
      text: 'Check the web once.',
      status: 'complete',
      timestamp: '2026-08-21T00:00:02.000Z',
      scheduleRunId: claimId,
    });
    const recoveredRepository = new SqliteRecordRepository(
      ':memory:',
      new PlaintextTestCipher(),
    );
    recoveredRepository.put('desktop', 'state', persisted);
    const recovered = await createHarness({ repository: recoveredRepository });
    await vi.waitFor(() => {
      expect(recovered.controller.snapshot().schedules?.[0]?.activeRun).toBeUndefined();
    });

    const snapshot = recovered.controller.snapshot();
    expect(
      snapshot.timeline.filter(({ scheduleRunId }) => scheduleRunId === claimId),
    ).toHaveLength(1);
    expect(snapshot.schedules?.[0]).toMatchObject({
      runCount: 1,
      maxRuns: 2,
      lastRun: { id: claimId, outcome: 'started' },
      runHistory: [{ id: claimId, outcome: 'started' }],
    });
    await recovered.controller.shutdown();
  });

  it('requires an active turn to stop before its thread can be deleted', async () => {
    const controller = await createController();
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    await controller.invoke('threads.send', { threadId, text: 'Keep working' });

    await expect(controller.invoke('threads.delete', { threadId })).rejects.toThrow(
      'Stop the active turn',
    );
    await controller.invoke('threads.cancel', { threadId });
    await controller.shutdown();
  });

  it('rejects a renderer-supplied workspace that the native picker did not grant', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('agents.save', {
        name: 'Untrusted',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/',
      }),
    ).rejects.toThrow('native folder picker');
    await controller.shutdown();
  });

  it('rejects non-ready providers and unpinned models when saving', async () => {
    const controller = await createController();
    await expect(
      controller.invoke('agents.save', {
        name: 'Unpinned model',
        instructions: '',
        provider: 'codex',
        model: 'arbitrary-model',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow(/Codex (?:model must be|does not currently offer)/);
    await expect(
      controller.invoke('agents.save', {
        name: 'Unavailable',
        instructions: '',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow(/Gemini is not ready \(disabled\)/);
    await controller.shutdown();

    let identityState: 'signed_in' | 'signed_out' = 'signed_in';
    const runtime = {
      runTurn: vi.fn(),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
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
    const { controller: cloudController } = await createHarness({
      fakeServices: false,
      runtime,
      cloud: new CloudClient('https://api.example.test', { read: async () => 'token' }),
      identity,
    });
    await expect(
      cloudController.invoke('agents.save', {
        name: 'Cloud assistant',
        instructions: '',
        provider: 'meta',
        model: 'super_nova_ext',
        workspace: '/tmp/sia-workspace',
      }),
    ).rejects.toThrow(/Included models is not ready \(unavailable\)/);
    expect(runtime.runTurn).not.toHaveBeenCalled();
    await cloudController.shutdown();
  });

  it('streams deterministic local state and keeps completed work after a turn', async () => {
    const controller = await createController();
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await controller.invoke('threads.send', { threadId, text: 'Inspect this project' });
    await new Promise((resolve) => setTimeout(resolve, 220));

    const snapshot = controller.snapshot();
    expect(snapshot.threads.find(({ id }) => id === threadId)?.status).toBe('idle');
    expect(snapshot.timeline.filter((event) => event.threadId === threadId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'user', text: 'Inspect this project' }),
        expect.objectContaining({ kind: 'assistant' }),
      ]),
    );
    await controller.shutdown();
  });

  it('finishes getting ready when provider work starts without finishing that work', async () => {
    let begin!: () => void;
    let finish!: () => void;
    const prepared = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        await prepared;
        const base = {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
          sequence: 1,
        };
        yield {
          ...base,
          type: 'tool' as const,
          payload: {
            callId: 'browser-check',
            name: 'computer_snapshot',
            phase: 'started' as const,
            native: false,
          },
        };
        await completed;
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Progress helper',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      await controller.invoke('threads.send', { threadId, text: 'Check the example page' });
      const startup = () =>
        controller
          .snapshot()
          .timeline.findLast(
            (item) => item.threadId === threadId && item.toolName === 'runtime.start',
          );
      expect(startup()?.status).toBe('running');
      begin();
      await vi.waitFor(() =>
        expect(
          controller
            .snapshot()
            .timeline.find(
              (item) => item.threadId === threadId && item.toolCallId === 'browser-check',
            )?.status,
        ).toBe('running'),
      );
      expect(startup()?.status).toBe('complete');
      expect(
        controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
      ).toBe('running');
      finish();
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
        ).toBe('idle'),
      );
    } finally {
      begin();
      finish();
      await controller.shutdown();
    }
  });

  it('streams promptly with bounded encrypted checkpoints and a durable final answer', async () => {
    const repository = new CountingRepository();
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        for (let index = 0; index < 30; index += 1) {
          yield {
            id: crypto.randomUUID(),
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex' as const,
            sequence: index,
            timestamp: new Date().toISOString(),
            type: 'message' as const,
            payload: {
              messageId: 'streamed-answer',
              role: 'assistant' as const,
              parts: [{ kind: 'text' as const, text: 'x' }],
              delta: true,
            },
          };
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 31,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      repository,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Streaming helper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    const writesBeforeTurn = repository.desktopStateWrites;
    let pushes = 0;
    controller.subscribe(() => {
      pushes += 1;
    });

    await controller.invoke('threads.send', { threadId, text: 'Stream the answer' });
    // The stream deliberately waits 600ms before completion. Allow scheduler delays
    // on a busy Mac; the bounds below still enforce responsive, batched persistence.
    await vi.waitFor(
      () =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'idle',
        ),
      { timeout: 3000 },
    );

    expect(repository.desktopStateWrites - writesBeforeTurn).toBeLessThan(10);
    expect(pushes).toBeLessThan(25);
    expect(pushes).toBeGreaterThan(repository.desktopStateWrites - writesBeforeTurn + 4);
    expect(
      repository
        .get<{ timeline: Array<{ detail?: string; text?: string }> }>('desktop', 'state')
        ?.timeline.find(({ detail }) => detail === 'streamed-answer')?.text,
    ).toHaveLength(30);
    expect(
      controller.snapshot().timeline.find(({ detail }) => detail === 'streamed-answer')?.text,
    ).toHaveLength(30);
    await controller.shutdown();
  });

  it('waits for aborted turn cleanup before closing persistence on shutdown', async () => {
    const repository = new CountingRepository();
    let runtimeThreadId = '';
    let cleanupFinished = false;
    const runtime = {
      async *runTurn(input: { turnId: string }, signal?: AbortSignal) {
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'message' as const,
          payload: {
            messageId: 'partial',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'partial' }],
            delta: true,
          },
        };
        await new Promise<void>((resolve) => {
          const finish = () =>
            setTimeout(() => {
              cleanupFinished = true;
              resolve();
            }, 20);
          if (signal?.aborted) finish();
          else signal?.addEventListener('abort', finish, { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      runtime,
      repository,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Shutdown helper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Wait for shutdown' });

    await vi.waitFor(() =>
      expect(controller.snapshot().timeline.some((item) => item.text === 'partial')).toBe(true),
    );
    await controller.shutdown();

    expect(cleanupFinished).toBe(true);
    expect(repository.closedTimelineText).toContain('partial');
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(repository.writesAfterClose).toBe(0);
  });

  it('requires explicit research consent state and deletes the local research scope', async () => {
    const controller = await createController();
    expect(controller.snapshot().capture.status).toBe('not_consented');

    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture.status).toBe('recording');

    await controller.invoke('research.delete', { confirmation: 'DELETE' });
    expect(controller.snapshot().capture.status).toBe('not_consented');
    await controller.shutdown();
  });

  it('records a reviewed consent decline without enabling research capture', async () => {
    const { controller, repository } = await createHarness();

    await controller.invoke('research.setCapture', {
      enabled: false,
      consentVersion: 'alpha-research-v2',
    });
    expect(controller.snapshot().capture).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    expect(repository.list('research')).toEqual([]);
    expect(
      repository.get<{
        capture: { status: string; pendingCount: number; promptReviewedVersion?: string };
      }>('desktop', 'state')?.capture,
    ).toEqual({
      status: 'not_consented',
      pendingCount: 0,
      promptReviewedVersion: 'alpha-research-v2',
    });
    await controller.shutdown();
  });

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

  it('revokes process-local browser and interrupted turn state on relaunch', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const now = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [
        {
          id: 'agent-1',
          name: 'Persistent helper',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
          threadIds: ['thread-1'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      threads: [
        {
          id: 'thread-1',
          agentId: 'agent-1',
          title: 'Interrupted work',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
          agentRevision: 'revision-1',
          instructionsSnapshot: '',
          agentNameSnapshot: 'Persistent helper',
          status: 'waiting',
          createdAt: now,
          updatedAt: now,
        },
      ],
      timeline: [],
      approvals: [],
      connections: [
        {
          id: 'gmail',
          label: 'Gmail',
          status: 'connecting',
          connectionId: 'opaque-gmail-grant',
        },
        { id: 'drive', label: 'Google Drive', status: 'disconnected' },
        { id: 'slack', label: 'Slack', status: 'disconnected' },
      ],
      capture: { status: 'not_consented', pendingCount: 0 },
      browser: {
        status: 'attached',
        browser: 'Google Chrome',
        grantedOrigins: ['https://mail.example.test'],
      },
      connectionOwners: { gmail: 'person@example.com' },
    });

    const { controller } = await createHarness({ repository });
    const snapshot = controller.snapshot();
    expect(snapshot.browser).toEqual({ status: 'detached', grantedOrigins: [] });
    expect(snapshot.threads[0]).toMatchObject({ id: 'thread-1', status: 'idle' });
    expect(snapshot.connections[0]).toMatchObject({
      id: 'gmail',
      status: 'error',
      connectionId: 'opaque-gmail-grant',
      detail: expect.stringContaining('interrupted'),
    });
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

  it('retries a failed turn without appending the user message again', async () => {
    let runtimeThreadId = '';
    let attempts = 0;
    const requests: string[] = [];
    const runtime = {
      async *runTurn(input: { turnId: string; text: string }) {
        requests.push(input.text);
        attempts += 1;
        if (attempts === 1) throw new Error('provider startup failed');
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Retry this once' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'failed',
      ),
    );

    await controller.invoke('threads.retry', { threadId });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(
      controller
        .snapshot()
        .timeline.filter(({ threadId: id, kind }) => id === threadId && kind === 'user'),
    ).toHaveLength(1);
    expect(attempts).toBe(2);
    expect(requests[1]).toContain('Continue task');
    expect(requests[1]).toContain('provider startup failed');
    expect(requests[1]).toContain('verify any uncertain write');
    expect(requests[1]).toContain('Retry this once');
    await controller.shutdown();
  });

  it('restores partial progress for Continue task after an app restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-recovery-'));
    const path = join(root, 'state.sqlite');
    const requests: string[] = [];
    let attempts = 0;
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        requests.push(input.text);
        const base = {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
        };
        if (++attempts === 1) {
          yield {
            ...base,
            type: 'message' as const,
            payload: {
              messageId: randomUUID(),
              role: 'assistant' as const,
              parts: [
                {
                  kind: 'text' as const,
                  text: 'Created report.txt; the calendar step remains unverified.',
                },
              ],
              delta: false,
            },
          };
          throw new Error('Connection interrupted after the file step');
        }
        yield {
          ...base,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
    };
    let controller: DesktopController | undefined;
    try {
      ({ controller } = await createHarness({
        fakeServices: false,
        runtime,
        repository: new SqliteRecordRepository(path, new PlaintextTestCipher()),
      }));
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Recovery test',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Write a report and inspect the calendar.',
      });
      await vi.waitFor(() =>
        expect(controller!.snapshot().threads.find((t) => t.id === threadId)?.status).toBe(
          'failed',
        ),
      );
      await controller.shutdown();
      ({ controller } = await createHarness({
        fakeServices: false,
        runtime,
        repository: new SqliteRecordRepository(path, new PlaintextTestCipher()),
      }));
      expect(attempts).toBe(1); // Opening Sia must never execute interrupted work automatically.
      await controller.invoke('threads.retry', { threadId });
      await vi.waitFor(() =>
        expect(controller!.snapshot().threads.find((t) => t.id === threadId)?.status).toBe(
          'idle',
        ),
      );
      expect(requests[1]).toContain('Created report.txt');
      expect(requests[1]).toContain('calendar step remains unverified');
      expect(requests[1]).toContain('Connection interrupted after the file step');
      expect(requests[1]).toContain('verify any uncertain write before repeating it');
      expect(
        controller
          .snapshot()
          .timeline.filter((t) => t.threadId === threadId && t.kind === 'user'),
      ).toHaveLength(1);
    } finally {
      await controller?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
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

  it('refuses research capture until explicit consent is supplied', async () => {
    const controller = await createController();
    await expect(controller.invoke('research.setCapture', { enabled: true })).rejects.toThrow(
      'Review and accept',
    );
    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    await controller.shutdown();
  });

  it('requires signed-in research-release users to sign out before pausing capture', async () => {
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
    const { controller } = await createHarness({
      cloud: new CloudClient('https://api.example.test', { read: async () => 'test-token' }),
      identity,
    });
    const created = await controller.invoke('agents.save', {
      name: 'Research participant',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await expect(
      controller.invoke('threads.send', { threadId, text: 'This must not bypass consent.' }),
    ).rejects.toThrow('current raw research consent');
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });

    await expect(controller.invoke('research.setCapture', { enabled: false })).rejects.toThrow(
      'required while signed in',
    );
    expect(controller.snapshot().capture.status).toBe('recording');
    await controller.shutdown();
  });

  it('keeps internal operators out of research capture and leaves hosted Meta usable', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const acceptedAt = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
      connections: [],
      capture: {
        status: 'recording',
        pendingCount: 1,
        consentVersion: 'alpha-research-v3-raw',
        consentAcceptedAt: acceptedAt,
        promptReviewedVersion: 'alpha-research-v3-raw',
      },
      browser: { status: 'detached', grantedOrigins: [] },
      connectionOwners: {},
      schedules: [],
      cloudFeatures: {
        researchUploads: true,
        researchArchive: false,
        connectors: true,
        schedules: true,
      },
      preferences: { completionSound: false },
      usageByTurn: {},
    });
    repository.put('research', 'operator-batch', {
      batchId: 'operator-batch',
      syncEligible: true,
      format: 'raw_v1',
      consent: {
        version: 'alpha-research-v3-raw',
        acceptedAt,
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });
    repository.put('research_sync', 'operator-batch', {
      batchId: 'operator-batch',
      synced: false,
    });
    const uploadResearchBatch = vi.fn(async () => undefined);
    const cloud = {
      configured: true,
      sessionStatus: async () => ({
        admin: false,
        participant: false,
        features: {
          researchUploads: false,
          researchArchive: false,
          connectors: false,
          schedules: false,
        },
      }),
      capabilities: async () => ({
        available: true,
        models: ['super_nova_ext'],
        streaming: true,
        tools: true,
      }),
      uploadResearchBatch,
    } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: 'signed_in' as const, email: 'operator@example.com' }),
      status: () => ({ state: 'signed_in' as const, email: 'operator@example.com' }),
      startEmailSignIn: async () => ({ state: 'signed_in' as const }),
      completeEmailSignIn: async () => ({ state: 'signed_in' as const }),
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      repository,
    });

    expect(controller.snapshot().capture).toEqual({ status: 'not_consented', pendingCount: 0 });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'operator-batch', syncEligible: false },
    ]);
    expect(uploadResearchBatch).not.toHaveBeenCalled();
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'ready',
      model: 'super_nova_ext',
    });
    await expect(
      controller.invoke('research.setCapture', {
        enabled: true,
        consentVersion: 'alpha-research-v3-raw',
      }),
    ).rejects.toThrow('not enabled for this Sia account');
    await expect(
      controller.invoke('agents.save', {
        name: 'Internal model tester',
        instructions: '',
        provider: 'meta',
        model: 'super_nova_ext',
        workspace: '/tmp/sia-workspace',
      }),
    ).resolves.toMatchObject({ agentId: expect.any(String) });
    await controller.shutdown();
  });

  it('persists a completed local text turn without making it cloud-sync eligible', async () => {
    const { controller, repository } = await createHarness();
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    await controller.invoke('threads.send', { threadId, text: 'Keep this clean turn' });
    await new Promise((resolve) => setTimeout(resolve, 220));

    const batches = repository.list<ResearchBatchView>('research');
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: expect.any(String),
      syncEligible: false,
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: expect.any(String),
        purpose: 'research_evaluation_debugging',
      },
      events: [
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'user', text: 'Keep this clean turn', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
        {
          classification: 'research_allowed',
          taints: [],
          kind: 'conversation.text',
          payload: { role: 'assistant', provider: 'codex' },
          sourceEventIds: [expect.any(String)],
        },
      ],
    });
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });
    await controller.shutdown();
  });

  it('keeps legacy local captures private when cloud is added later', async () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const now = new Date().toISOString();
    repository.put('desktop', 'state', {
      agents: [],
      threads: [],
      timeline: [],
      approvals: [],
      connections: [
        { id: 'gmail', label: 'Gmail', status: 'disconnected' },
        { id: 'drive', label: 'Google Drive', status: 'disconnected' },
        { id: 'slack', label: 'Slack', status: 'disconnected' },
      ],
      capture: {
        status: 'recording',
        pendingCount: 1,
        consentVersion: 'alpha-research-v2',
        consentAcceptedAt: now,
        promptReviewedVersion: 'alpha-research-v2',
      },
      browser: { status: 'detached', grantedOrigins: [] },
      connectionOwners: {},
      schedules: [],
      preferences: { completionSound: false },
    });
    repository.put('research', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      consent: {
        version: 'alpha-research-v2',
        acceptedAt: now,
        purpose: 'research_evaluation_debugging',
      },
      events: [],
    });
    repository.put('research_sync', 'local-before-cloud', {
      batchId: 'local-before-cloud',
      synced: false,
    });

    let identityState: 'signed_out' | 'signed_in' = 'signed_out';
    const uploadResearchBatch = vi.fn();
    const cloud = { configured: true, uploadResearchBatch } as unknown as CloudClient;
    const identity = {
      initialize: async () => ({ state: identityState }),
      status: () =>
        identityState === 'signed_in'
          ? ({ state: identityState, email: 'person@example.com' } as const)
          : ({ state: identityState } as const),
      startEmailSignIn: async () => ({ state: identityState }),
      completeEmailSignIn: async () => {
        identityState = 'signed_in';
        return { state: identityState, email: 'person@example.com' } as const;
      },
      signOut: async () => ({ state: 'signed_out' as const }),
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];

    const { controller } = await createHarness({
      cloud,
      identity,
      fakeServices: false,
      repository,
    });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(controller.snapshot().capture).toMatchObject({
      status: 'not_consented',
      pendingCount: 0,
    });

    await controller.invoke('auth.complete', { code: '12345678' });
    expect(repository.list<ResearchBatchView>('research')).toMatchObject([
      { batchId: 'local-before-cloud', syncEligible: false },
    ]);
    expect(controller.snapshot().capture).toMatchObject({
      status: 'recording',
      pendingCount: 0,
    });
    expect(uploadResearchBatch).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('discards a spoofed Sia-tool event that has no matching gateway invocation', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'Before the tool' }],
            delta: true,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'tool' as const,
          payload: {
            callId: 'call-1',
            name: 'computer_list',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 3,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Use a tool' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );
    expect(repository.list('research')).toHaveLength(0);
    await controller.shutdown();
  });

  it('captures bounded provider-native trajectory metadata without arguments or output', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'native-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printenv SECRET_VALUE' },
            result: 'never collect provider output',
            presentation: {
              kind: 'command' as const,
              command: 'printenv SECRET_VALUE',
              output: 'never collect provider output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-1',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'The check completed.' }],
            delta: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 3,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Run the safe check' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const serialized = JSON.stringify(repository.list<ResearchBatchView>('research'));
    expect(serialized).toContain('"kind":"trajectory.step"');
    expect(serialized).toContain('"name":"shell_command"');
    expect(serialized).toContain('"presentation":"command"');
    expect(serialized).not.toContain('printenv');
    expect(serialized).not.toContain('never collect provider output');
    await controller.shutdown();
  });

  it('captures organized raw provider events under the v3 research consent', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'raw-call-1',
            name: 'shell_command',
            phase: 'completed' as const,
            native: true,
            arguments: { command: 'printf raw-fixture' },
            result: 'raw command output',
            presentation: {
              kind: 'command' as const,
              command: 'printf raw-fixture',
              output: 'raw command output',
              exitCode: 0,
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Raw research',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Capture this exact turn' });
    await vi.waitFor(() => expect(repository.list('research').length).toBeGreaterThan(0));

    const batches = repository.list<ResearchBatchView & { format?: string; scope?: unknown }>(
      'research',
    );
    const serialized = JSON.stringify(batches);
    expect(batches.every(({ format }) => format === 'raw_v1')).toBe(true);
    expect(serialized).toContain('provider.tool');
    expect(serialized).toContain('Capture this exact turn');
    expect(serialized).toContain('printf raw-fixture');
    expect(serialized).toContain('raw command output');
    expect(serialized).toContain(threadId);
    await controller.shutdown();
  });

  it('excludes an entire Google Workspace action turn from research capture', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const record = vi.fn();
    const excludeTurn = vi.fn();
    const trajectory = {
      rootDirectory: '/tmp/sia-trajectories',
      record,
      excludeTurn,
    } as unknown as NonNullable<
      ConstructorParameters<typeof DesktopController>[0]['trajectory']
    >;
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'before-google-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will search the test inbox.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'mail_search',
          arguments: { account_id: 'gmail', query: 'private fixture' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
      trajectory,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Found a private fixture',
          data: { message: 'private Google Workspace result' },
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v3-raw',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Google policy fixture',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Search my test inbox' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );

    expect(repository.list('research')).toHaveLength(0);
    expect(excludeTurn).toHaveBeenCalledWith(threadId, expect.any(String));
    expect(
      record.mock.calls
        .map(([event]) => event)
        .some((event) => event.type === 'action_result' && event.name === 'mail_search'),
    ).toBe(false);
    await controller.shutdown();
  });

  it('captures one bounded screenshot only from an explicitly safe computer snapshot', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const image = Buffer.from('bounded screenshot fixture').toString('base64');
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        await gateway.invoke({
          name: 'computer_snapshot',
          arguments: { app_id: 'app-1', window_id: 'window-1' },
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'snapshot-1',
            name: 'computer_snapshot',
            phase: 'completed' as const,
            native: false,
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({ fakeServices: false, runtime });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({
          outcome: 'verified',
          summary: 'Captured safe fixture',
          images: [{ mimeType: 'image/png', dataBase64: image }],
        }),
      },
      onInvocation: controller.actionInvocationObserver(),
      onResult: controller.actionResultObserver(),
    });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'Inspect the safe fixture' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const events = repository.list<ResearchBatchView>('research')[0]?.events ?? [];
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'trajectory.step',
          payload: expect.objectContaining({
            source: 'sia_action',
            type: 'action_result',
            name: 'computer_snapshot',
            outcome: 'verified',
          }),
        }),
        expect.objectContaining({
          kind: 'trajectory.screenshot',
          payload: {
            source: 'sia_action',
            tool: 'computer_snapshot',
            mimeType: 'image/png',
            dataBase64: image,
          },
        }),
      ]),
    );
    await controller.shutdown();
  });

  it('taints research at the action gateway even when provider tool telemetry is absent', async () => {
    let runtimeThreadId = '';
    let gateway!: ActionGateway;
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'message' as const,
          payload: {
            messageId: 'assistant-before-action',
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: 'I will inspect the browser.' }],
            delta: false,
          },
        };
        await gateway.invoke({
          name: 'browser_tabs',
          arguments: {},
          context: {
            sessionId: 'session-1',
            threadId: runtimeThreadId,
            turnId: input.turnId,
            provider: 'codex',
            workspace: '/tmp/sia-workspace',
          },
        });
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
    });
    gateway = new ActionGateway({
      backend: {
        invoke: async () => ({ outcome: 'verified', summary: 'Browser tabs listed' }),
      },
      onInvocation: controller.actionInvocationObserver(),
    });
    await controller.invoke('research.setCapture', {
      enabled: true,
      consentVersion: 'alpha-research-v2',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', {
      agentId: created.agentId,
    });
    runtimeThreadId = threadId;

    await controller.invoke('threads.send', { threadId, text: 'List my browser tabs' });
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(repository.list('research')).toHaveLength(0);
    expect(
      controller
        .snapshot()
        .timeline.some((event) => event.turnId && event.toolName === 'browser_tabs'),
    ).toBe(false);
    await controller.shutdown();
  });

  it('prioritizes the Chrome process that owns the remote-debugging port when attaching', async () => {
    const listWindows = new Map<number, unknown>();
    const attachedPids: number[] = [];
    const computer = {
      permissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      requestPermissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      call: async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              { pid: 111, name: 'Google Chrome', bundle_id: 'com.google.Chrome', active: true },
              {
                pid: 222,
                name: 'Google Chrome',
                bundle_id: 'com.google.Chrome',
                active: false,
              },
            ],
          };
        }
        if (tool === 'list_windows') {
          const pid = Number(args.pid);
          return {
            windows: [
              {
                window_id: pid + 1,
                pid,
                title: `w${pid}`,
                is_on_screen: true,
                minimized: false,
                bounds: { width: 800, height: 600 },
                z_index: 1,
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attachedPids.push(Number(args.pid));
          // Only the port owner (222) accepts the cdp_port route.
          if (Number(args.pid) !== 222)
            throw new Error('CUA refused: browser_route_unavailable');
          return { targets: [{ target_id: 't', tab_id: 'tab', url: 'https://example.test/' }] };
        }
        if (tool === 'get_browser_state') {
          return { target_id: 't', tab_id: 'tab', url: 'https://example.test/' };
        }
        return {};
      },
      shutdown: async () => undefined,
    };
    const { controller } = await createHarness({
      computer: computer as never,
      runCommand: async () => 'p222\nf5\n',
    });
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    // Explicit trusted mode tries the port owner first and needs no window pick.
    await controller.ensureBrowserAttachedForActions();
    expect(controller.snapshot().browser.status).toBe('attached');
    expect(attachedPids[0]).toBe(222);
    await controller.shutdown();
  });

  it('answers driver-level computer authorization automatically in trusted mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    expect(controller.snapshot().computer.trust).toBe('auto');
    await expect(
      controller.authorizeComputer(
        {
          adapterId: 'desktop_input',
          riskClass: 'r2',
          permissionMode: 'standard',
          publicSession: started.turnId,
          requestDigest: 'digest-auto',
          humanSummary: 'Control the selected Notes window',
          resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
          expiresUnixMs: BigInt(Date.now() + 30_000),
        },
        { kind: 'turn', threadId, turnId: started.turnId },
      ),
    ).resolves.toBe('allow');
    expect(controller.snapshot().approvals).toHaveLength(0);
    await controller.shutdown();
  });

  it('uses content-bounded, correctly classified computer approvals in confirmation mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    expect(controller.snapshot().computer.trust).toBe('ask');
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    const decision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'digest-1',
        humanSummary: 'Control the selected Notes window',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval).toMatchObject({
      kind: 'native_tool',
      title: 'Allow computer access',
      target: 'Notes, Draft',
      reversible: false,
    });
    expect(approval.title).not.toContain('Chrome');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve',
    });
    await expect(decision).resolves.toBe('allow');
    await controller.shutdown();
  });

  it('shows exact connector recipients and content in the approval preview', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Send the email',
    });
    const body = `${'x'.repeat(17_000)} exact-tail`;
    const pending = controller.approvalBroker().requestApproval({
      id: 'approval-call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('mail_send')!,
      arguments: {
        account_id: 'gmail',
        to: ['person@example.com'],
        subject: 'Quarterly status',
        body,
      },
      targetDigest: 'target-digest',
      reason: 'This sends an email.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe('email recipients: person@example.com');
    expect(approval.account).toBe('demo@google.test');
    expect(approval.dataLeaving).toContain('To: person@example.com');
    expect(approval.dataLeaving).toContain('Subject: Quarterly status');
    expect(approval.dataLeaving).toContain(`Body:\n${body}`);
    expect(approval.dataLeaving).not.toContain('omitted');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('authorizes connector changes without an approval card in autonomous mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('connections.start', { connectionId: 'slack' });
    const connectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'slack')?.connectionId;
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Post the update',
    });

    await expect(
      controller.approvalBroker().requestApproval({
        id: 'automatic-slack-call',
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('slack_post')!,
        arguments: { account_id: 'slack', channel_id: 'C1', text: 'Ready.' },
        targetDigest: 'automatic-slack-digest',
        reason: 'This posts a Slack message.',
      }),
    ).resolves.toEqual({ approved: true });
    expect(controller.snapshot().approvals).toHaveLength(0);
    expect(controller.connectionIdForAction('slack', 'slack', 'automatic-slack-call')).toBe(
      connectionId,
    );
    await controller.shutdown();
  });

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

  it('pins connector approvals to the exact connection and consumes them once', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const originalConnectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'gmail')?.connectionId;
    expect(originalConnectionId).toEqual(expect.any(String));
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Send email' });
    const requestApproval = (id: string) =>
      controller.approvalBroker().requestApproval({
        id,
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('mail_send')!,
        arguments: {
          account_id: 'gmail',
          to: ['person@example.com'],
          subject: 'Status',
          body: 'Ready.',
        },
        targetDigest: `digest-${id}`,
        reason: 'This sends an email.',
      });

    const first = requestApproval('connector-call-1');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(first).resolves.toEqual({ approved: true });
    expect(controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1')).toBe(
      originalConnectionId,
    );
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1'),
    ).toBeUndefined();

    const stale = requestApproval('connector-call-2');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(stale).resolves.toEqual({ approved: true });
    await controller.invoke('connections.disconnect', { connectionId: 'gmail' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    expect(
      controller.snapshot().connections.find(({ id }) => id === 'gmail')?.connectionId,
    ).not.toBe(originalConnectionId);
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-2'),
    ).toBeUndefined();
    await controller.shutdown();
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

  it('uses host-resolved element labels for browser and computer approvals', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const trustedApprovalTarget = vi.fn(
      () =>
        'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    controller.attachBrowserCapabilitySink({
      acceptBrowserState: () => undefined,
      resetBrowserCapabilities: () => undefined,
      trustedApprovalTarget,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Compose' });
    const pending = controller.approvalBroker().requestApproval({
      id: 'call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('browser_action')!,
      arguments: {
        tab_id: 'tab-1',
        snapshot_id: 'snapshot-1',
        action: 'click',
        element_ref: 'model-ref',
        origin: 'https://mail.example.test',
      },
      targetDigest: 'digest',
      reason: 'This changes the page.',
    });

    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe(
      'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    expect(trustedApprovalTarget).toHaveBeenCalledWith(
      'browser_action',
      expect.objectContaining({ element_ref: 'model-ref' }),
    );
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('answers a provider question through Scotty and resumes the same runtime turn', async () => {
    let runtimeThreadId = '';
    const answered = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: { turnId: string }, signal?: AbortSignal) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: randomUUID(),
          sequence: 1,
          type: 'question' as const,
          payload: {
            requestId: 'calendar-question',
            phase: 'requested' as const,
            prompt: 'Which calendar should I use?',
          },
        };
        if (signal?.aborted) return;
        signal?.addEventListener('abort', () => answered.resolve(), { once: true });
        await answered.promise;
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      respondToRequest: vi.fn(async () => {
        answered.resolve();
      }),
      cancel: vi.fn(async () => {
        answered.resolve();
      }),
      dispose: vi.fn(async () => {
        answered.resolve();
      }),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Personal',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const created = await controller.invoke('threads.create', { agentId: agent.agentId });
      runtimeThreadId = created.threadId;
      const started = await controller.invoke('threads.send', {
        threadId: created.threadId,
        text: 'Help with my calendar',
      });
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === created.threadId)
            ?.status,
        ).toBe('waiting'),
      );
      const tasks = new ScottyTasks();
      const settings = { enabled: true, size: 'medium' as const, motion: true };
      const question = tasks
        .view(controller.snapshot(), settings, true)
        .tasks.find((task) => task.id === created.threadId)!;
      expect(question.question).toBe('Which calendar should I use?');
      await tasks.act(
        { kind: 'reply', token: question.token, text: 'My work calendar' },
        controller,
        settings,
        vi.fn(),
      );
      expect(runtime.respondToRequest).toHaveBeenCalledExactlyOnceWith(created.threadId, {
        requestId: 'calendar-question',
        text: 'My work calendar',
      });
      expect(
        controller.snapshot().timeline.findLast((item) => item.kind === 'user')?.turnId,
      ).toBe(started.turnId);
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === created.threadId)
            ?.status,
        ).toBe('idle'),
      );
    } finally {
      answered.resolve();
      await controller.shutdown();
    }
  });

  it('revokes provider and computer approvals before a cancelled turn can release', async () => {
    let runtimeThreadId = '';
    let receivedLease:
      { holds(resource: { kind: 'workspace_writer'; id: string }): boolean } | undefined;
    const runtime = {
      async *runTurn(
        input: {
          turnId: string;
          lease?: { holds(resource: { kind: 'workspace_writer'; id: string }): boolean };
        },
        signal?: AbortSignal,
      ) {
        receivedLease = input.lease;
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'approval' as const,
          payload: {
            requestId: 'provider-request-1',
            phase: 'requested' as const,
            title: 'Run a command',
            description: 'Run the pending provider command',
            choices: [
              { id: 'allow_once', label: 'Allow once', kind: 'allow_once' as const },
              { id: 'deny', label: 'Deny', kind: 'deny' as const },
            ],
          },
        };
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    const started = await controller.invoke('threads.send', { threadId, text: 'Do the task' });
    await vi.waitFor(() => {
      expect(controller.snapshot().approvals.some(({ status }) => status === 'pending')).toBe(
        true,
      );
    });
    expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
      true,
    );
    const computerDecision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'computer-request-1',
        humanSummary: 'Click in Notes',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approvalIds = controller
      .snapshot()
      .approvals.filter(({ status }) => status === 'pending')
      .map(({ id }) => id);

    await controller.invoke('threads.cancel', { threadId });

    await expect(computerDecision).resolves.toBe('cancel');
    expect(runtime.cancel).toHaveBeenCalledWith(threadId, started.turnId);
    await vi.waitFor(() =>
      expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
        false,
      ),
    );
    expect(runtime.respondToRequest).toHaveBeenCalledWith(threadId, {
      requestId: 'provider-request-1',
      choiceId: 'deny',
    });
    expect(
      controller.snapshot().approvals.filter(({ id }) => approvalIds.includes(id)),
    ).toEqual(
      expect.arrayContaining(
        approvalIds.map((id) => expect.objectContaining({ id, status: 'expired' })),
      ),
    );
    for (const approvalId of approvalIds) {
      await expect(
        controller.invoke('approvals.resolve', { approvalId, decision: 'approve' }),
      ).rejects.toThrow('expired');
    }
    await controller.shutdown();
  });

  it('uses deterministic fake Codex readiness without reopening sign-in', async () => {
    const openExternal = vi.fn(async () => undefined);
    const { controller } = await createHarness({ openExternal });
    expect(controller.snapshot().providers.find(({ id }) => id === 'codex')).toMatchObject({
      status: 'ready',
      version: '0.147.0',
      account: 'Deterministic test runtime',
    });
    await controller.invoke('providers.login', { providerId: 'codex' });
    expect(openExternal).not.toHaveBeenCalled();
    await expect(controller.invoke('providers.login', { providerId: 'meta' })).rejects.toThrow(
      'configured Sia cloud',
    );
    await expect(controller.invoke('providers.login', { providerId: 'grok' })).rejects.toThrow(
      'external alpha',
    );
    await controller.shutdown();
  });

  it('installs Codex once, blocks new turns, and restarts without claiming authentication', async () => {
    let finish!: () => void;
    const installCodex = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const restartApp = vi.fn();
    const openExternal = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      openExternal,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? { ...provider, status: 'needs_install' as const }
            : provider,
        ),
    });
    try {
      const pending = controller.invoke('providers.login', { providerId: 'codex' });
      await vi.waitFor(() => expect(installCodex).toHaveBeenCalledOnce());
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('in progress');
      await expect(
        controller.invoke('threads.send', { threadId: 'none', text: 'Do work' }),
      ).rejects.toThrow('in progress');
      await expect(controller.invoke('voice.capture.acquire', undefined)).rejects.toThrow(
        'in progress',
      );
      await expect(
        controller.invoke('terminal.start', { threadId: 'none', command: 'sleep 30' }),
      ).rejects.toThrow('in progress');
      await expect(
        controller.invoke('terminal.run', { threadId: 'none', command: 'sleep 30' }),
      ).rejects.toThrow('in progress');
      expect(restartApp).not.toHaveBeenCalled();
      finish();
      const result = await pending;
      expect(restartApp).toHaveBeenCalledOnce();
      expect(openExternal).not.toHaveBeenCalled();
      expect(result.snapshot.providers.find(({ id }) => id === 'codex')?.status).toBe(
        'needs_install',
      );
      await expect(controller.invoke('threads.retry', { threadId: 'none' })).rejects.toThrow(
        'in progress',
      );
    } finally {
      await controller.shutdown();
    }
  });

  it('does not install or restart while a user background terminal is running', async () => {
    let busy = true;
    const installCodex = vi.fn(async () => undefined);
    const restartApp = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      workspaceOperations: { hasRunningTerminals: () => busy } as never,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? { ...provider, status: 'needs_install' as const }
            : provider,
        ),
    });
    try {
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('terminal process');
      expect(installCodex).not.toHaveBeenCalled();
      expect(restartApp).not.toHaveBeenCalled();
      busy = false;
      await controller.invoke('providers.login', { providerId: 'codex' });
      expect(restartApp).toHaveBeenCalledOnce();
    } finally {
      await controller.shutdown();
    }
  });

  it('allows a failed Codex download to be retried without restarting early', async () => {
    const installCodex = vi
      .fn()
      .mockRejectedValueOnce(new Error('Download failed'))
      .mockResolvedValue(undefined);
    const restartApp = vi.fn();
    const { controller } = await createHarness({
      fakeServices: false,
      installCodex,
      restartApp,
      providerProbe: async (id) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex' ? { ...provider, status: 'incompatible' as const } : provider,
        ),
    });
    try {
      await expect(
        controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('Download failed');
      expect(restartApp).not.toHaveBeenCalled();
      await controller.invoke('providers.login', { providerId: 'codex' });
      expect(installCodex).toHaveBeenCalledTimes(2);
      expect(restartApp).toHaveBeenCalledOnce();
    } finally {
      await controller.shutdown();
    }
  });

  it('opens and completes the managed Codex ChatGPT login before marking it connected', async () => {
    let signedIn = false;
    const providerProbe = vi.fn(async (providerId?: Parameters<typeof probeProviders>[0]) =>
      (await deterministicProviderProbe(providerId)).map((provider) => {
        if (provider.id !== 'codex') return provider;
        const { account: _account, ...withoutAccount } = provider;
        return signedIn
          ? { ...provider, status: 'ready' as const, account: 'Connected to ChatGPT' }
          : { ...withoutAccount, status: 'needs_login' as const };
      }),
    );
    const openExternal = vi.fn(async () => undefined);
    const runtime = {
      startCodexChatGptLogin: vi.fn(async () => ({
        loginId: 'login-1',
        authUrl: 'https://auth.openai.com/authorize?client_id=sia-test',
      })),
      waitForCodexChatGptLogin: vi.fn(async () => {
        signedIn = true;
      }),
      cancelCodexChatGptLogin: vi.fn(async () => undefined),
      listModels: vi.fn(async () => []),
      resetSessions: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({
      fakeServices: false,
      providerProbe,
      openExternal,
      runtime,
    });

    const result = await controller.invoke('providers.login', { providerId: 'codex' });

    expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith(
      'https://auth.openai.com/authorize?client_id=sia-test',
    );
    expect(runtime.waitForCodexChatGptLogin).toHaveBeenCalledWith('login-1');
    expect(result.snapshot.providers.find(({ id }) => id === 'codex')).toMatchObject({
      status: 'ready',
      account: 'Connected to ChatGPT',
    });
    expect(runtime.cancelCodexChatGptLogin).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it.each(['needs_install', 'incompatible'] as const)(
    'continues %s setup through restart and browser sign-in with no second setup click',
    async (initialStatus) => {
      let installed = false;
      let signedIn = false;
      let finishLogin!: () => void;
      const providerProbe = async (id?: Parameters<typeof probeProviders>[0]) =>
        (await deterministicProviderProbe(id)).map((provider) =>
          provider.id === 'codex'
            ? {
                ...provider,
                status: signedIn
                  ? ('ready' as const)
                  : installed
                    ? ('needs_login' as const)
                    : initialStatus,
              }
            : provider,
        );
      const openExternal = vi.fn(async () => undefined);
      const runtime = {
        startCodexChatGptLogin: vi.fn(async () => ({
          loginId: 'setup-login',
          authUrl: 'https://auth.openai.com/authorize?client_id=fixture',
        })),
        waitForCodexChatGptLogin: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finishLogin = () => {
                signedIn = true;
                resolve();
              };
            }),
        ),
        cancelCodexChatGptLogin: vi.fn(async () => undefined),
        listModels: vi.fn(async () => []),
        dispose: vi.fn(async () => undefined),
      };
      const first = await createHarness({
        fakeServices: false,
        providerProbe,
        installCodex: async () => {
          installed = true;
        },
        restartApp: vi.fn(),
        openExternal,
      });
      const result = await first.controller.invoke('providers.login', { providerId: 'codex' });
      expect(result.snapshot.providers.find(({ id }) => id === 'codex')?.setup?.phase).toBe(
        'restarting',
      );
      expect(openExternal).not.toHaveBeenCalled();
      // Reopen persisted records in a fresh repository, as a real process restart does.
      const savedState = first.repository.get('desktop', 'state');
      const continuation = first.repository.get('setup', 'codex-login');
      await first.controller.shutdown();
      const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
      repository.put('desktop', 'state', savedState);
      repository.put('setup', 'codex-login', continuation);
      const restored = await createHarness({
        fakeServices: false,
        repository,
        providerProbe,
        runtime,
        openExternal,
      });
      const pending = restored.controller.resumeCodexSetup();
      await vi.waitFor(() => expect(runtime.waitForCodexChatGptLogin).toHaveBeenCalledOnce());
      const waiting = restored.controller.snapshot();
      expect(waiting.providers.find(({ id }) => id === 'codex')?.setup?.phase).toBe(
        'signing-in',
      );
      expect(JSON.stringify(waiting)).not.toContain('auth.openai.com/authorize');
      expect(restored.repository.get('setup', 'codex-login')).toBeUndefined();
      await restored.controller.resumeCodexSetup();
      await expect(
        restored.controller.invoke('providers.login', { providerId: 'codex' }),
      ).rejects.toThrow('in progress');
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
      finishLogin();
      await pending;
      expect(
        restored.controller.snapshot().providers.find(({ id }) => id === 'codex'),
      ).toMatchObject({ status: 'ready' });
      expect(
        restored.controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup,
      ).toBeUndefined();
      expect(openExternal).toHaveBeenCalledExactlyOnceWith(
        'https://auth.openai.com/authorize?client_id=fixture',
      );
      await restored.controller.resumeCodexSetup();
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledOnce();
      await restored.controller.shutdown();
    },
  );

  it.each(['ordinary', 'expired', 'connected', 'failed'] as const)(
    'does not reopen browser sign-in after %s setup',
    async (scenario) => {
      const openExternal = vi.fn(async () => undefined);
      const runtime = {
        startCodexChatGptLogin: vi.fn(async () => ({
          loginId: 'setup-login',
          authUrl: 'https://auth.openai.com/authorize?client_id=fixture',
        })),
        waitForCodexChatGptLogin: vi.fn(async () => {
          throw new Error('Sign-in cancelled');
        }),
        cancelCodexChatGptLogin: vi.fn(async () => undefined),
        listModels: vi.fn(async () => []),
        dispose: vi.fn(async () => undefined),
      };
      const { controller, repository } = await createHarness({
        fakeServices: false,
        openExternal,
        runtime,
        providerProbe: async (id) =>
          (await deterministicProviderProbe(id)).map((provider) =>
            provider.id === 'codex' && scenario !== 'connected'
              ? { ...provider, status: 'needs_login' as const }
              : provider,
          ),
      });
      if (scenario !== 'ordinary')
        repository.put('setup', 'codex-login', {
          expiresAt: Date.now() + (scenario === 'expired' ? -1 : 60_000),
        });
      await controller.resumeCodexSetup();
      await controller.resumeCodexSetup();
      expect(runtime.startCodexChatGptLogin).toHaveBeenCalledTimes(
        scenario === 'failed' ? 1 : 0,
      );
      expect(repository.get('setup', 'codex-login')).toBeUndefined();
      if (scenario === 'failed') {
        expect(runtime.cancelCodexChatGptLogin).toHaveBeenCalledWith('setup-login');
        expect(
          controller.snapshot().providers.find(({ id }) => id === 'codex')?.setup?.phase,
        ).toBe('error');
        await expect(
          controller.invoke('providers.login', { providerId: 'codex' }),
        ).rejects.toThrow('cancelled');
        expect(runtime.startCodexChatGptLogin).toHaveBeenCalledTimes(2);
      }
      await controller.shutdown();
    },
  );

  it('grants only top-level attached tab origins, never nested link URLs', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome' }] };
        }
        if (tool === 'list_windows') return { windows: [{ pid: 42, window_id: 7 }] };
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [
              {
                tab_id: 'tab-1',
                url: 'https://mail.example.test/inbox',
                elements: [
                  { role: 'link', url: 'https://evil.example.test/capture' },
                  { role: 'iframe', origin: 'https://embedded.example.test' },
                ],
              },
            ],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.example.test'],
    });
    await controller.shutdown();
  });

  it('attaches the Chrome application instead of a helper process', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              {
                pid: 41,
                name: 'Google Chrome Helper (Renderer)',
                bundle_id: 'com.google.Chrome.helper',
              },
              { pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' },
            ],
          };
        }
        if (tool === 'list_windows') {
          expect(args).toEqual({ pid: 42 });
          return { windows: [{ pid: 42, window_id: 7 }] };
        }
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://example.test'],
    });
    await controller.shutdown();
  });

  it('does not target Chrome remote-debugging consent dialogs', async () => {
    const attemptedWindowIds: number[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              { pid: 42, window_id: 7, title: 'Allow remote debugging?' },
              { pid: 42, window_id: 8, title: 'Fixture page' },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attemptedWindowIds.push(Number(args.window_id));
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});

    expect(attemptedWindowIds).toEqual([8]);
    await controller.shutdown();
  });

  it('explains Chrome-owned remote-debugging consent refusals', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_wrong_target_refused');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/chrome:\/\/inspect.*Allow remote debugging/i),
    });
    await controller.shutdown();
  });

  it('explains the one-time Chrome permission when reconnect waits for consent', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_reconnect_exhausted');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/Click Allow.*one-time Chrome security step/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_reconnect_exhausted');
    await controller.shutdown();
  });

  it('explains ambiguous duplicate Chrome windows without exposing driver codes', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Duplicate page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_binding_ambiguous');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/unique page.*close the duplicate.*retry/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_binding_ambiguous');
    await controller.shutdown();
  });

  it('offers an explicit picker for multiple Chrome windows and attaches the selection', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 8,
                title: 'Fixture one',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
              {
                pid: 42,
                window_id: 9,
                title: 'Fixture two',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          expect(args).toMatchObject({
            pid: 42,
            window_id: 9,
            session: expect.stringMatching(/^sia-browser-/),
          });
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture-two.example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller, repository } = await createHarness({ computer: browserComputer });

    const choiceSnapshot = await controller.invoke('browser.attach', {});

    expect(choiceSnapshot.browser).toMatchObject({
      status: 'detached',
      detail: expect.stringMatching(/Choose the signed-in Chrome window/i),
      availableWindows: [
        { id: 8, label: 'Chrome window 1', detail: 'Fixture one' },
        { id: 9, label: 'Chrome window 2', detail: 'Fixture two' },
      ],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
    expect(
      repository.get<{ browser: { availableWindows?: unknown } }>('desktop', 'state')?.browser
        .availableWindows,
    ).toBeUndefined();

    const attachedSnapshot = await controller.invoke('browser.attach', { windowId: 9 });

    expect(attachedSnapshot.browser).toMatchObject({
      status: 'attached',
      profileLabel: 'Chrome window 2',
      grantedOrigins: ['https://fixture-two.example.test'],
    });
    expect(attachedSnapshot.browser.availableWindows).toBeUndefined();
    await controller.shutdown();
  });

  it('opens a user-entered site in an attached signed-in profile and grants its origin', async () => {
    let currentUrl = 'chrome://newtab/';
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Signed-in profile',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare' || tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: currentUrl }],
          };
        }
        if (tool === 'browser_navigate') {
          expect(args).toMatchObject({
            session: expect.stringMatching(/^sia-browser-/),
            target_id: 'target-2',
            tab_id: 'tab-2',
            url: 'https://mail.google.com/',
          });
          currentUrl = String(args.url);
          return { effect: 'confirmed' };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const attached = await controller.invoke('browser.attach', {});
    expect(attached.browser).toMatchObject({ status: 'attached', grantedOrigins: [] });

    const opened = await controller.invoke('browser.open', { url: 'mail.google.com' });
    expect(opened.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.google.com'],
    });
    await controller.shutdown();
  });

  it('mints a fresh browser session after detach so reattach does not require restart', async () => {
    const preparedSessions: string[] = [];
    const endedSessions: string[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Local fixture',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          preparedSessions.push(String(args.session));
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'end_session') {
          endedSessions.push(String(args.session));
          return { ended: true };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});
    await controller.invoke('browser.detach', undefined);
    const reattached = await controller.invoke('browser.attach', {});

    expect(reattached.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://fixture.example.test'],
    });
    expect(preparedSessions).toHaveLength(2);
    expect(preparedSessions[0]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).not.toBe(preparedSessions[0]);
    expect(endedSessions).toEqual([preparedSessions[0]]);
    await controller.shutdown();
  });

  it('rejects a stale Chrome window choice and returns the current choices', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [{ pid: 42, window_id: 8, title: 'Current fixture' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', { windowId: 999 });

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/changed or closed/i),
      availableWindows: [{ id: 8, label: 'Chrome window 1', detail: 'Current fixture' }],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
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

  it('keeps Meta fail-closed without an authenticated relay capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const { controller } = await createHarness({
      cloud: new CloudClient('https://api.example.test', {
        read: async () => undefined,
      }),
      identity,
    });
    expect(controller.snapshot()).toMatchObject({
      agents: [],
      threads: [],
      providers: [],
      cloud: { auth: 'signed_out' },
    });
    await controller.invoke('auth.complete', { code: '123456' });
    expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'unavailable',
    });
    await controller.invoke('auth.signOut', undefined);
    expect(controller.snapshot()).toMatchObject({
      agents: [],
      threads: [],
      providers: [],
      cloud: { auth: 'signed_out' },
    });
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

  it('marks Meta ready only after an authenticated live capability probe', async () => {
    let state: 'signed_out' | 'signed_in' = 'signed_out';
    const refreshSession = vi.fn(async () => ({
      state: 'signed_in' as const,
      email: 'person@example.com',
    }));
    const identity = {
      initialize: async () => ({ state }),
      status: () =>
        state === 'signed_in' ? { state, email: 'person@example.com' } : { state },
      startEmailSignIn: async () => ({ state }),
      completeEmailSignIn: async () => {
        state = 'signed_in';
        return { state, email: 'person@example.com' };
      },
      refreshSession,
      signOut: async () => {
        state = 'signed_out';
        return { state };
      },
    } satisfies ConstructorParameters<typeof DesktopController>[0]['identity'];
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/v1/session')) {
        return Response.json({
          admin: false,
          features: {
            researchUploads: true,
            researchArchive: false,
            connectors: true,
            schedules: true,
          },
        });
      }
      if (url.endsWith('/v1/meta/capabilities')) {
        return Response.json({
          available: true,
          models: ['super_nova_ext'],
          streaming: true,
          tools: true,
        });
      }
      if (url.endsWith('/v1/catalog')) {
        return Response.json({
          schemaVersion: 1,
          providers: [
            {
              id: 'meta',
              name: 'Muse Spark',
              kind: 'hosted',
              credentialMode: 'managed',
              available: true,
              defaultModel: 'super_nova_ext',
              models: [
                {
                  id: 'super_nova_ext',
                  name: 'Muse Spark',
                  apiProtocols: ['openai_chat_completions'],
                },
              ],
              capabilities: { streaming: true, tools: true },
              execution: {
                defaultHarnessId: 'sia_direct',
                routes: [
                  {
                    model: 'super_nova_ext',
                    harnessId: 'sia_direct',
                    harnessModelId: 'super_nova_ext',
                    credentialSource: 'sia_managed',
                    apiProtocol: 'openai_chat_completions',
                  },
                ],
              },
              limits: { dailyRequests: 100, dailyTokens: 250_000, maxOutputTokens: 4_096 },
            },
          ],
        });
      }
      throw new Error(`Unexpected cloud request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { controller } = await createHarness({
        fakeServices: false,
        defaultWorkspaceRoot: '/tmp/Sia/Agents',
        createDirectory: async () => undefined,
        cloud: new CloudClient('https://api.example.test', {
          read: async () => 'test-id-token',
        }),
        identity,
      });

      await controller.invoke('auth.complete', { code: '123456' });

      expect(controller.snapshot().providers.find(({ id }) => id === 'meta')).toMatchObject({
        status: 'ready',
        model: 'super_nova_ext',
      });
      const created = await controller.invoke('agents.save', {
        name: 'Included model tester',
        instructions: '',
        provider: 'meta',
        model: 'super_nova_ext',
      });
      expect(
        created.snapshot.threads.find(({ id }) => id === created.snapshot.activeThreadId),
      ).toMatchObject({
        resolvedExecutionTarget: {
          harnessId: 'sia_direct',
          resolutionSource: 'backend_default',
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        new URL('https://api.example.test/v1/meta/capabilities'),
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: 'Bearer test-id-token' }),
        }),
      );
      await controller.invoke('providers.probe', { providerId: 'meta' });
      expect(refreshSession).toHaveBeenCalledOnce();
      await controller.shutdown();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

class CountingRepository implements RecordRepository {
  readonly #inner = new SqliteRecordRepository(':memory:', new EphemeralPayloadCipher());
  desktopStateWrites = 0;
  writesAfterClose = 0;
  closedTimelineText: string[] = [];
  #closed = false;

  get<T>(scope: string, id: string): T | undefined {
    return this.#inner.get<T>(scope, id);
  }

  list<T>(scope: string): T[] {
    return this.#inner.list<T>(scope);
  }

  put<T>(scope: string, id: string, value: T): void {
    if (this.#closed) {
      this.writesAfterClose += 1;
      throw new Error('write after close');
    }
    if (scope === 'desktop' && id === 'state') this.desktopStateWrites += 1;
    this.#inner.put(scope, id, value);
  }

  remove(scope: string, id: string): void {
    this.#inner.remove(scope, id);
  }

  clearAll(): void {
    this.#inner.clearAll();
  }

  close(): void {
    this.closedTimelineText =
      this.#inner
        .get<{ timeline: Array<{ text?: string }> }>('desktop', 'state')
        ?.timeline.flatMap((item) => (item.text ? [item.text] : [])) ?? [];
    this.#closed = true;
    this.#inner.close();
  }
}

describe('connect Chrome and continue', () => {
  async function recoveryHarness(options: { fail?: boolean; pause?: Promise<void> } = {}) {
    const nativeCall = vi.fn(async (tool: string, args: Record<string, unknown>) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
      if (tool === 'list_windows')
        return {
          windows: [
            { pid: 42, window_id: 7, title: 'Canvas' },
            { pid: 42, window_id: 8, title: 'Other window' },
          ],
        };
      if (tool === 'browser_prepare') {
        if (options.pause) await options.pause;
        if (options.fail) throw new Error('CUA refused: browser_reconnect_exhausted');
        return { prepared: true };
      }
      if (tool === 'get_browser_state')
        return {
          target_id: 'target-1',
          tabs: [{ tab_id: 'tab-1', url: 'https://canvas.example.test/' }],
        };
      return {};
    });
    const { controller } = await createHarness({
      computer: { ...computer, call: nativeCall },
      runCommand: async () => '',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Study',
      instructions: '',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const threadId = created.snapshot.activeThreadId!;
    await controller.invoke('threads.send', { threadId, text: 'Find my Canvas finals' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find((t) => t.id === threadId)?.status).toBe('idle'),
    );
    const userMessageId = controller
      .snapshot()
      .timeline.findLast((item) => item.threadId === threadId && item.kind === 'user')!.id;
    return { controller, nativeCall, threadId, userMessageId };
  }
  it('offers window choice first, then continues exactly once in the pinned conversation and preserves drafts', async () => {
    const h = await recoveryHarness();
    const { controller, threadId, userMessageId } = h;
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    try {
      const choice = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
      });
      expect(choice.browser.availableWindows).toHaveLength(2);
      expect(choice.timeline.filter((item) => item.kind === 'user')).toHaveLength(1);
      expect(h.nativeCall.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
      await controller.invoke('threads.draft', { threadId, text: 'Keep my unsent draft' });
      const next = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      expect(next.browser.status).toBe('attached');
      expect(next.computer.trust).toBe('ask');
      expect(next.threads.find((t) => t.id === threadId)?.draft).toBe('Keep my unsent draft');
      const users = next.timeline.filter((item) => item.kind === 'user');
      expect(users).toHaveLength(2);
      expect(users[1]?.text).toContain('Continue my previous request');
      expect(users[1]?.threadId).toBe(threadId);
      await expect(
        controller.invoke('browser.connectAndContinue', {
          threadId,
          userMessageId,
          windowId: 7,
        }),
      ).rejects.toThrow('request changed');
    } finally {
      await controller.shutdown();
    }
  });
  it('keeps the original task on connection failure without starting a model turn', async () => {
    const { controller, threadId, userMessageId } = await recoveryHarness({ fail: true });
    try {
      const result = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      expect(result.browser.status).toBe('error');
      expect(result.browser.detail).toContain('permission');
      expect(result.timeline.filter((item) => item.kind === 'user')).toHaveLength(1);
    } finally {
      await controller.shutdown();
    }
  });
  it('rejects duplicate connections and a stale request after async attachment', async () => {
    let finish!: () => void;
    const pause = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const h = await recoveryHarness({ pause });
    const { controller, threadId, userMessageId } = h;
    try {
      const pending = controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      await vi.waitFor(() =>
        expect(h.nativeCall.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(true),
      );
      await expect(
        controller.invoke('browser.connectAndContinue', {
          threadId,
          userMessageId,
          windowId: 7,
        }),
      ).rejects.toThrow('already in progress');
      await controller.invoke('threads.send', { threadId, text: 'A different request' });
      finish();
      await expect(pending).rejects.toThrow('request changed');
      expect(
        controller.snapshot().timeline.filter((item) => item.kind === 'user'),
      ).toHaveLength(2);
    } finally {
      finish();
      await controller.shutdown();
    }
  });
});

describe('global voice routing', () => {
  it('pins the focused thread and creates a correctly resolved thread for background requests', async () => {
    const requestMicrophonePermission = vi.fn(async () => {});
    const voice = {
      view: () => ({ status: 'connected' as const, voices: [] }),
      configure: vi.fn(),
      refresh: vi.fn(),
      select: vi.fn(),
      disconnect: vi.fn(),
      transcribe: vi.fn(),
      speak: vi.fn(),
      startRealtime: vi.fn(async () => ({ sessionId: 'voice-session' })),
      appendRealtime: vi.fn(),
      stopRealtime: vi.fn(async (_id: string, commit: boolean) => (commit ? 'Voice task' : '')),
    };
    const { controller } = await createHarness({
      voice,
      requestMicrophonePermission,
      defaultWorkspaceRoot: '/tmp/sia-voice-agents',
      createDirectory: vi.fn(async () => undefined),
    });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const first = await controller.invoke('agents.save', {
      name: 'Voice agent',
      instructions: 'Help with tasks.',
      model: 'gpt-5.6-sol',
    });
    const firstThread = first.snapshot.activeThreadId!;
    const second = await controller.invoke('agents.save', {
      name: 'Other agent',
      instructions: 'Help with writing.',
      model: 'gpt-5.6-sol',
    });
    let focused = true;
    const nativeSend = vi.fn();
    let emit!: Parameters<VoiceHelperFactory>[0];
    controller.attachPushToTalk({
      available: true,
      isFocused: () => focused,
      createHelper: (callback) => {
        emit = callback;
        return { send: nativeSend, stop: vi.fn() };
      },
    });
    expect(requestMicrophonePermission).not.toHaveBeenCalled();
    await controller.invoke('voice.pushToTalk.configure', {
      enabled: true,
      agentId: first.agentId,
    });
    expect(requestMicrophonePermission).toHaveBeenCalledOnce();
    await controller.invoke('threads.select', { threadId: firstThread });
    emit({ type: 'hold', id: '00000000-0000-4000-8000-000000000001' });
    await Promise.resolve();
    emit({ type: 'recording', id: '00000000-0000-4000-8000-000000000001' });
    await controller.invoke('threads.select', { threadId: second.snapshot.activeThreadId! });
    emit({ type: 'released', id: '00000000-0000-4000-8000-000000000001' });
    emit({ type: 'stopped', id: '00000000-0000-4000-8000-000000000001', hasSpeech: true });
    await vi.waitFor(() =>
      expect(
        controller
          .snapshot()
          .timeline.some(
            (item) =>
              item.threadId === firstThread &&
              item.kind === 'user' &&
              item.text === 'Voice task',
          ),
      ).toBe(true),
    );
    await vi.waitFor(() => expect(controller.snapshot().voice.pushToTalk?.phase).toBe('idle'));
    focused = false;
    const before = controller.snapshot().threads.length;
    emit({ type: 'hold', id: '00000000-0000-4000-8000-000000000002' });
    await Promise.resolve();
    emit({ type: 'recording', id: '00000000-0000-4000-8000-000000000002' });
    emit({ type: 'released', id: '00000000-0000-4000-8000-000000000002' });
    emit({ type: 'stopped', id: '00000000-0000-4000-8000-000000000002', hasSpeech: true });
    await vi.waitFor(() => expect(controller.snapshot().threads).toHaveLength(before + 1));
    const snapshot = controller.snapshot();
    const created = snapshot.threads.find((thread) => thread.id === snapshot.activeThreadId)!;
    expect(created).toMatchObject({
      agentId: first.agentId,
      harnessId: 'codex_app_server',
      resolvedExecutionTarget: { credentialSource: 'provider_subscription' },
    });
    expect(
      snapshot.timeline.some(
        (item) =>
          item.threadId === created.id && item.kind === 'user' && item.text === 'Voice task',
      ),
    ).toBe(true);
    expect(controller.computerTrust()).toBe('ask');
    await vi.waitFor(() =>
      expect(nativeSend).toHaveBeenCalledWith({ type: 'task', phase: 'working' }),
    );
    await vi.waitFor(() =>
      expect(nativeSend).toHaveBeenCalledWith({ type: 'task', phase: 'idle' }),
    );
    await controller.shutdown();
  });
});

it('runs a saved workflow through the canonical turn queue and persists editable memory separately', async () => {
  const { controller, repository } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  await controller.invoke('computer.setTrust', { trust: 'ask' });
  try {
    const created = await controller.invoke('agents.save', {
      name: 'Workflow agent',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const agentId = created.agentId;
    const memory = await controller.invoke('assistant.library', {
      operation: 'saveMemory',
      entry: { agentId, title: 'Style', text: 'Keep it concise.', enabled: true },
    });
    expect(repository.get('assistant', 'library')).toMatchObject({
      memories: [{ text: 'Keep it concise.' }],
    });
    const workflows = await controller.invoke('assistant.library', {
      operation: 'saveWorkflow',
      entry: {
        agentId,
        title: 'Plan',
        parameters: ['topic'],
        steps: [
          { instruction: 'Make a plan for {{topic}}', expected: 'A concise plan is shown.' },
        ],
      },
    });
    const result = await controller.invoke('assistant.library', {
      operation: 'run',
      id: workflows.workflows[0]!.id,
      values: { topic: 'my day' },
    });
    expect(result.threadId).toBeTruthy();
    const snapshot = controller.snapshot();
    expect(snapshot.threads.find((thread) => thread.id === result.threadId)).toMatchObject({
      agentId,
      title: 'Plan',
    });
    expect(
      snapshot.timeline.find(
        (item) => item.threadId === result.threadId && item.kind === 'user',
      )?.text,
    ).toContain('"topic":"my day"');
    expect(snapshot.computer.trust).toBe('ask');
    await controller.invoke('assistant.library', {
      operation: 'deleteMemory',
      id: memory.memories[0]!.id,
    });
    expect(
      (await controller.invoke('assistant.library', { operation: 'list' })).memories,
    ).toEqual([]);
  } finally {
    await controller.shutdown();
  }
});

it('learns only for the active opted-in agent and consolidates after the task completes', async () => {
  const { controller } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Learning agent',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Use short paragraphs.',
    });
    const request = {
      name: 'memory_learn' as const,
      arguments: { title: 'Writing style', lesson: 'Use short paragraphs.' },
      descriptor: getActionToolDescriptor('memory_learn')!,
      context: {
        sessionId: 'test-session',
        threadId,
        turnId,
        provider: 'codex' as const,
        workspace: '/tmp/Sia/Agents',
      },
    };
    await expect(controller.assistantAction(request, vi.fn())).rejects.toThrow(
      'Enable automatic memory',
    );
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    expect((await controller.assistantAction(request, vi.fn())).outcome).toBe('verified');
    await expect(
      controller.assistantAction(
        { ...request, context: { ...request.context, turnId: 'old-turn' } },
        vi.fn(),
      ),
    ).rejects.toThrow('active turn');
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find((entry) => entry.id === threadId)?.status).toBe(
        'idle',
      ),
    );
    const view = await controller.invoke('assistant.library', {
      operation: 'consolidate',
      agentId,
    });
    expect(view.memories).toEqual([
      expect.objectContaining({ agentId, text: 'Use short paragraphs.', learned: true }),
    ]);
    expect(view.journal?.some((entry) => entry.kind === 'task')).toBe(true);
    await expect(controller.assistantAction(request, vi.fn())).rejects.toThrow('active turn');
  } finally {
    await controller.shutdown();
  }
});

it('shows the exact skill source for approval even in trusted mode', async () => {
  const controller = await createController();
  try {
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Skills',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Save this routine.',
    });
    const source = "sia_action computer_list '{}'";
    const decision = controller.approvalBroker().requestApproval({
      id: 'skill-approval',
      sessionId: 'test-session',
      threadId,
      turnId,
      tool: getActionToolDescriptor('skill_save')!,
      arguments: { title: 'Apps', description: 'List apps', source },
      targetDigest: 'exact-skill',
      reason: 'Review this Bash source.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.status).toBe('pending');
    expect(approval.dataLeaving).toContain(source);
    await controller.invoke('approvals.resolve', { approvalId: approval.id, decision: 'deny' });
    await expect(decision).resolves.toEqual({ approved: false });
  } finally {
    await controller.shutdown();
  }
});

it('resolves a saved skill by hash for exact-source approval without model-supplied code', async () => {
  const controller = await createController();
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Saved skill',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const source = "printf 'a saved script\\n'";
    const library = await controller.invoke('assistant.library', {
      operation: 'saveSkill',
      entry: { agentId, title: 'Saved', description: 'Example', source },
    });
    const skill = library.skills![0]!;
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Run the saved routine.',
    });
    const decision = controller.approvalBroker().requestApproval({
      id: 'run-approval',
      sessionId: 'test-session',
      threadId,
      turnId,
      tool: getActionToolDescriptor('skill_run')!,
      arguments: { id: skill.id, revision: skill.revision, input: { label: 'Example' } },
      targetDigest: 'id-revision-input',
      reason: 'Review the saved source.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.dataLeaving).toContain(source);
    expect(approval.dataLeaving).toContain('Example');
    await controller.invoke('approvals.resolve', { approvalId: approval.id, decision: 'deny' });
    await expect(decision).resolves.toEqual({ approved: false });
  } finally {
    await controller.shutdown();
  }
});

it('does not start queued work when an active turn releases its lease during shutdown', async () => {
  const records = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  const close = vi.spyOn(records, 'close').mockImplementation(() => undefined);
  const { controller } = await createHarness({ repository: records });
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Queued skills',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const first = await controller.invoke('threads.create', { agentId });
    const second = await controller.invoke('threads.create', { agentId });
    await controller.invoke('threads.send', { threadId: first.threadId, text: 'First task' });
    await controller.invoke('threads.send', { threadId: second.threadId, text: 'Queued task' });
    expect(
      controller.snapshot().threads.find((entry) => entry.id === second.threadId)?.status,
    ).toBe('queued');
    await controller.shutdown();
    expect(
      controller
        .snapshot()
        .timeline.some(
          (entry) => entry.threadId === second.threadId && entry.toolName === 'runtime.start',
        ),
    ).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    close.mockRestore();
    records.close();
  }
});

it('memory reviews pin the owning agent and restrict host actions, including trusted mode', async () => {
  const { controller } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Reviewer',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    await expect(
      controller.invoke('assistant.library', { operation: 'review', agentId }),
    ).rejects.toThrow('Enable learning');
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    const review = await controller.invoke('assistant.library', {
      operation: 'review',
      agentId,
    });
    const threadId = review.threadId!;
    expect(
      controller.snapshot().threads.find((thread) => thread.id === threadId),
    ).toMatchObject({ agentId, model: 'gpt-5.6-sol' });
    expect(controller.allowsReviewAction(threadId, 'assistant_library')).toBe(true);
    expect(controller.allowsReviewAction(threadId, 'memory_suggest')).toBe(true);
    for (const tool of [
      'memory_learn',
      'skill_save',
      'skill_run',
      'mac_automation',
      'computer_list',
      'browser_tabs',
      'mail_search',
    ])
      expect(controller.allowsReviewAction(threadId, tool)).toBe(false);
    await expect(
      controller.invoke('assistant.library', { operation: 'review', agentId }),
    ).rejects.toThrow('current tasks');
    await vi.waitFor(() =>
      expect(
        controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
      ).toBe('idle'),
    );
    expect(
      (await controller.invoke('assistant.library', { operation: 'list' })).journal,
    ).toEqual([]);
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    expect(controller.allowsReviewAction(threadId, 'memory_suggest')).toBe(false);
  } finally {
    await controller.shutdown();
  }
});

it('background reviews wait for unlocked idle time and preserve the active conversation', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { controller, repository } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Background reviewer',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    await controller.invoke('assistant.library', {
      operation: 'backgroundReview',
      agentId,
      enabled: true,
    });
    new AssistantLibrary(repository).record({
      agentId,
      threadId,
      turnId: 'completed-test-task',
      kind: 'task',
      title: 'Task finished',
      text: 'complete',
    });
    const before = controller.snapshot().threads.length;
    controller.suspendVoice(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before);
    controller.suspendVoice(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before + 1);
    expect(controller.snapshot().activeThreadId).toBe(threadId);
    await controller.invoke('assistant.library', {
      operation: 'backgroundReview',
      agentId,
      enabled: false,
    });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.some((thread) => thread.status === 'running')).toBe(
        false,
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before + 1);
  } finally {
    await controller.shutdown();
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'consolidates the shared vault without executing scripts (background: %s)',
  async (background) => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-native-learning-'));
    const { controller, repository } = await createHarness({ defaultWorkspaceRoot: directory });
    try {
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background });
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Native learning',
        instructions: '',
        model: 'gpt-5.6-sol',
      });
      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: true,
      });
      const library = new AssistantLibrary(repository);
      for (let i = 0; i < 2; i++)
        library.recordMacTask({
          agentId,
          threadId: randomUUID(),
          turnId: randomUUID(),
          request: 'Inspect Finder',
          outcome: 'complete',
          result: {
            success: true,
            response: 'Read the Finder folder.',
            steps: ['Read Finder with its AppleScript dictionary'],
          },
        });
      const review = await controller.invoke('assistant.library', {
        operation: 'review',
        agentId,
      });
      const threadId = review.threadId!;
      const turnId = controller
        .snapshot()
        .timeline.find(
          (entry) => entry.threadId === threadId && entry.kind === 'user',
        )!.turnId!;
      const invoke = vi.fn();
      const result = await controller.assistantAction(
        {
          name: 'memory_vault',
          descriptor: getActionToolDescriptor('memory_vault')!,
          context: {
            sessionId: 'review',
            threadId,
            turnId,
            provider: 'codex',
            workspace: directory,
          },
          arguments: {
            operation: 'write',
            name: 'skills/finder-folder.sh',
            revision: '',
            text: '#!/bin/bash\n# skill: Finder folder\n# description: Read the current Finder folder\nprintf never-executed\n',
          },
        },
        invoke,
      );
      expect(result.summary).toContain('Saved and read back');
      expect(invoke).not.toHaveBeenCalled();
      const view = await controller.invoke('assistant.library', { operation: 'list' });
      expect(view.suggestions).toEqual([]);
      expect(view.skills).toEqual([
        expect.objectContaining({
          agentId,
          execution: 'native',
          title: 'Finder folder',
          source: expect.stringContaining('# description:'),
        }),
      ]);
      expect(library.view().skills).toEqual([]);
      const skill = view.skills![0]!;
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((entry) => entry.id === threadId)?.status,
        ).toBe('idle'),
      );
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
      await expect(
        controller.invoke('assistant.library', {
          operation: 'runSkill',
          id: skill.id,
          input: {},
        }),
      ).rejects.toThrow('On my screen');
      await controller.invoke('assistant.library', { operation: 'deleteSkill', id: skill.id });
      expect(
        (await controller.invoke('assistant.library', { operation: 'list' })).skills,
      ).toEqual([]);
      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: false,
      });
      expect(library.view().reviewAgents).toEqual([]);
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('shares native notes with background tasks, isolates agents, and keeps paused learning read-only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sia-shared-memory-'));
  const { controller } = await createHarness({ defaultWorkspaceRoot: directory });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Shared memory',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const workspace = controller
      .snapshot()
      .agents.find((agent) => agent.id === agentId)!.workspace;
    const vault = new NotchVault(workspace, agentId);
    vault.write('campus.md', 'Institution: CMU. Verify current courses in Canvas.', '');
    const other = new NotchVault(workspace, randomUUID());
    other.write('campus.md', 'Different agent.', '');
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Read my campus note.',
    });
    const action = (operation: string, name: string, text = '', revision = '') =>
      controller.assistantAction(
        {
          name: 'memory_vault',
          descriptor: getActionToolDescriptor('memory_vault')!,
          context: { sessionId: 'background', threadId, turnId, provider: 'codex', workspace },
          arguments: { operation, name, text, revision },
        },
        vi.fn(),
      );
    expect((await action('read', 'campus.md')).data).toMatchObject({
      text: expect.stringContaining('CMU'),
    });
    const saved = await action('write', 'calendar.md', 'Use the observed campus calendar.');
    expect(saved.outcome).toBe('verified');
    expect(vault.read('calendar.md').text).toContain('campus calendar');
    expect(other.read('calendar.md').revision).toBe('');
    await expect(action('write', 'calendar.md', 'Stale replacement')).rejects.toThrow();
    await expect(action('read', '../campus.md')).rejects.toThrow();
    await expect(action('write', 'skills/direct.sh', '#!/bin/bash\necho no')).rejects.toThrow(
      'skill_save',
    );
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    expect((await action('read', 'campus.md')).outcome).toBe('verified');
    await expect(action('write', 'paused.md', 'Must not persist.')).rejects.toThrow('paused');
    expect(vault.read('paused.md').revision).toBe('');
  } finally {
    await controller.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

it('retains background task results and failures across conversations and native mode without injecting scripts into background turns', async () => {
  const turns: RuntimeTurnInput[] = [];
  const runtime = {
    async *runTurn(input: RuntimeTurnInput) {
      turns.push(input);
      input.onMacResult?.({
        success: turns.length > 1,
        response:
          turns.length === 1 ? 'The document needs foreground access.' : 'Read the document.',
        steps: ['Observed the target document window'],
      });
      yield {
        id: randomUUID(),
        threadId: input.thread.id,
        turnId: input.turnId,
        provider: 'codex' as const,
        sequence: 1,
        timestamp: new Date().toISOString(),
        type: 'completion' as const,
        payload: { status: 'completed' as const },
      };
    },
    dispose: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
  const { controller, repository } = await createHarness({ fakeServices: false, runtime });
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Background journal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
    const library = new AssistantLibrary(repository);
    for (let i = 0; i < 3; i++) {
      if (i === 2)
        await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Read the document in its window.',
      });
      await vi.waitFor(() =>
        expect(library.view().journal?.filter((entry) => entry.kind === 'task')).toHaveLength(
          i + 1,
        ),
      );
      expect(controller.snapshot().threads.find((entry) => entry.id === threadId)?.status).toBe(
        i === 0 ? 'failed' : 'idle',
      );
      if (i === 0)
        expect(controller.snapshot().timeline).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              threadId,
              kind: 'error',
              title: 'Task needs attention',
              text: 'The document needs foreground access.',
            }),
          ]),
        );
    }
    expect(library.view().journal?.filter((entry) => entry.kind === 'task')).toEqual([
      expect.objectContaining({
        outcome: 'failed',
        text: expect.stringContaining('foreground access'),
      }),
      expect.objectContaining({
        outcome: 'complete',
        text: expect.stringContaining('Read the document'),
      }),
      expect.objectContaining({ outcome: 'complete' }),
    ]);
    expect(turns[0]!.thread.macBackgroundControl).toBe(true);
    expect(turns[1]!.text).toContain('<failures');
    expect(turns[1]!.text).toContain('foreground access');
    expect(turns[1]!.text).toContain('Observed the target document window');
    expect(turns[1]!.text).not.toContain('Native executable skills live in');
    expect(turns[1]!.text).toContain('skill_run');
    expect(turns[2]!.thread.macBackgroundControl).toBe(false);
    expect(turns[2]!.text).toContain('<memory_graph');
    expect(turns[2]!.text).toContain('<skills>');
    expect(new NotchVault('/tmp/sia-workspace', agentId).read('failures.log').text).toContain(
      'foreground access',
    );
  } finally {
    await controller.shutdown();
  }
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

it('preserves confirmations for legacy profiles without an approval preference', async () => {
  const { repository } = await createHarness();
  const stored = repository.get<{ preferences: { computerTrust?: string } }>(
    'desktop',
    'state',
  )!;
  delete stored.preferences.computerTrust;
  repository.put('desktop', 'state', stored);
  const restored = await createHarness({ repository });
  expect(restored.controller.computerTrust()).toBe('ask');
  expect(restored.controller.snapshot().computer.trust).toBe('ask');
  await restored.controller.shutdown();
});

it('persists Use my Mac separately from action confirmations and avoids Chrome preparation', async () => {
  const { controller, repository } = await createHarness();
  await controller.invoke('computer.setTrust', { trust: 'ask' });
  expect(controller.computerAccessMode()).toBe('mac');
  expect(controller.macBackgroundControl()).toBe(false);
  expect(controller.macBackgroundFallback()).toBe('pause');
  expect(controller.computerTrust()).toBe('ask');
  await controller.invoke('computer.setAccessMode', {
    mode: 'mac',
    background: true,
    backgroundFallback: 'foreground',
  });
  await controller.invoke('computer.setAccessMode', { mode: 'mac' });
  expect(controller.snapshot().computer.backgroundControl).toBe(true);
  expect(controller.snapshot().computer.accessMode).toBe('mac');
  expect(controller.computerTrust()).toBe('ask');
  expect(await controller.ensureBrowserAttachedForActions()).toContain('Use my Mac');
  expect(controller.snapshot().browser.status).toBe('detached');
  const restored = await createHarness({ repository });
  expect(restored.controller.computerAccessMode()).toBe('mac');
  expect(restored.controller.macBackgroundControl()).toBe(true);
  expect(restored.controller.macBackgroundFallback()).toBe('foreground');
  expect(restored.controller.computerTrust()).toBe('ask');
  await restored.controller.shutdown();
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
