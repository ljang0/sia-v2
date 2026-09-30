/** Shared harness and fakes for the DesktopController tests. */

import { CloudClient } from '../cloud-client.js';
import {
  EphemeralPayloadCipher,
  PlaintextTestCipher,
  type RecordRepository,
  SqliteRecordRepository,
} from '../persistence.js';
import { probeProviders } from '../provider-probe.js';
import { DesktopController } from './desktop-controller.js';

export const computer = {
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

export interface ResearchBatchView {
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

export async function createHarness(
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
    setOpenAtLogin?: (enabled: boolean) => void;
    appVersion?: string;
    updateManifestUrl?: string;
    updateManifestPublicKey?: string;
    defaultWorkspaceRoot?: string;
    createDirectory?: (path: string) => Promise<void>;
    notify?: ConstructorParameters<typeof DesktopController>[0]['notify'];
    keepAwake?: ConstructorParameters<typeof DesktopController>[0]['keepAwake'];
    notchHelperPath?: string;
    pastedAttachmentRoot?: string;
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
    ...(options.setOpenAtLogin ? { setOpenAtLogin: options.setOpenAtLogin } : {}),
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
    ...(options.notify ? { notify: options.notify } : {}),
    ...(options.keepAwake ? { keepAwake: options.keepAwake } : {}),
    ...(options.notchHelperPath ? { notchHelperPath: options.notchHelperPath } : {}),
    ...(options.pastedAttachmentRoot
      ? { pastedAttachmentRoot: options.pastedAttachmentRoot }
      : {}),
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

export async function deterministicProviderProbe(
  providerId?: Parameters<typeof probeProviders>[0],
) {
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

export async function createController(): Promise<DesktopController> {
  return (await createHarness()).controller;
}

export class CountingRepository implements RecordRepository {
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
