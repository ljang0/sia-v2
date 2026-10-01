import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CloudClient } from '../cloud-client.js';
import type { RecordRepository } from '../persistence.js';
import { probeProviders } from '../provider-probe.js';
import type { TrajectoryRecorder } from '../trajectory-recorder.js';
import type { VoiceOperations } from '../voice-service.js';
import { defaultRunCommand } from './async-utils.js';
import type { ComputerAutomation, ControllerOptions } from './types.js';
import { normalizeWorkspace } from './workspace-paths.js';

/** The host capabilities a desktop controller runs with, with defaults applied. */
export interface ControllerDeps {
  readonly notchHelperPath: string;
  readonly repository: RecordRepository;
  readonly cloud: CloudClient;
  readonly computer: ComputerAutomation;
  readonly identity: ControllerOptions['identity'];
  readonly fakeServices: boolean;
  readonly fakeTurnDelayMs: number;
  readonly openExternal: (url: string) => Promise<void>;
  readonly trajectory: TrajectoryRecorder | undefined;
  readonly capabilitySetup: ControllerOptions['capabilitySetup'];
  readonly keepAwake: ControllerOptions['keepAwake'];
  readonly runCommand: (file: string, args: readonly string[]) => Promise<string>;
  readonly providerProbe: typeof probeProviders;
  readonly captureMacContext: ControllerOptions['captureMacContext'];
  readonly revealDirectory: ((path: string) => Promise<void>) | undefined;
  readonly openMessages: (() => Promise<void>) | undefined;
  readonly openMessagesPermissions: (() => Promise<void>) | undefined;
  readonly requestMicrophonePermission: (() => Promise<void>) | undefined;
  readonly restartApp: (() => void) | undefined;
  readonly installCodex: (() => Promise<void>) | undefined;
  readonly chooseDirectory: () => Promise<string | null>;
  readonly defaultWorkspaceRoot: string | undefined;
  readonly createDirectory: (path: string) => Promise<void>;
  readonly chooseFiles: (() => Promise<string[]>) | undefined;
  readonly pastedAttachmentRoot: string | undefined;
  readonly openPath: ((path: string) => Promise<void>) | undefined;
  readonly composeFeedback: ((subject: string, body: string) => Promise<void>) | undefined;
  readonly setOpenAtLogin: ((enabled: boolean) => void) | undefined;
  readonly appVersion: string;
  readonly updateManifestUrl: string | undefined;
  readonly updateManifestPublicKey: string | undefined;
  readonly exportJson: (value: unknown) => Promise<string | null>;
  readonly notify:
    ((notice: { threadId: string; title: string; body: string }) => void) | undefined;
  readonly workspaceOperations: ControllerOptions['workspaceOperations'];
  readonly voice: VoiceOperations | undefined;
  readonly startupNotice: ControllerOptions['startupNotice'];
}

export function resolveControllerDeps(options: ControllerOptions): ControllerDeps {
  return {
    notchHelperPath:
      options.notchHelperPath ??
      resolve(import.meta.dirname, '../../../build/native/SiaVoiceHelper'),
    repository: options.repository,
    cloud: options.cloud,
    computer: options.computer,
    identity: options.identity,
    fakeServices: options.fakeServices,
    fakeTurnDelayMs: options.fakeTurnDelayMs ?? 160,
    openExternal: options.openExternal,
    trajectory: options.trajectory,
    capabilitySetup: options.capabilitySetup,
    keepAwake: options.keepAwake,
    runCommand: options.runCommand ?? defaultRunCommand,
    providerProbe: options.providerProbe ?? probeProviders,
    captureMacContext: options.captureMacContext,
    revealDirectory: options.revealDirectory,
    openMessages: options.openMessages,
    openMessagesPermissions: options.openMessagesPermissions,
    requestMicrophonePermission: options.requestMicrophonePermission,
    restartApp: options.restartApp,
    installCodex: options.installCodex,
    chooseDirectory: options.chooseDirectory,
    defaultWorkspaceRoot: options.defaultWorkspaceRoot
      ? normalizeWorkspace(options.defaultWorkspaceRoot)
      : undefined,
    createDirectory:
      options.createDirectory ??
      (async (path) => {
        await mkdir(path, { recursive: true, mode: 0o700 });
      }),
    chooseFiles: options.chooseFiles,
    pastedAttachmentRoot: options.pastedAttachmentRoot,
    openPath: options.openPath,
    composeFeedback: options.composeFeedback,
    setOpenAtLogin: options.setOpenAtLogin,
    appVersion: options.appVersion ?? 'development',
    updateManifestUrl: options.updateManifestUrl,
    updateManifestPublicKey: options.updateManifestPublicKey,
    exportJson: options.exportJson,
    notify: options.notify,
    workspaceOperations: options.workspaceOperations,
    voice: options.voice,
    startupNotice: options.startupNotice,
  };
}
