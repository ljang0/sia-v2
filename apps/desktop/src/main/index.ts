import { BrowserWindowService } from './browser-window.js';
import { AutomationPermissionService } from './automation-permissions.js';
import { developmentRelaunchArguments } from './development-relaunch.js';
import { PhoneRemote } from './phone-remote.js';
import { remoteQR, advertiseRemote } from './phone-remote-native.js';
import { createScottyCompanion } from './scotty-window.js';
import { createCommandLauncher } from './command-launcher.js';
import { runMacAutomation } from './mac-automation.js';
import { installedApplications, launchInstalledApplication } from './application-catalog.js';
import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  app,
  clipboard,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerMonitor,
  session,
  shell,
} from 'electron';

import { ActionGateway, DefaultActionAuthorizationPolicy } from '@sia/action-gateway';
import { TrajectoryRecorder } from './trajectory-recorder.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  chromeRemoteDebuggingStatus,
  ensureChromeRemoteDebuggingEnabled,
} from './chrome-debug-setup.js';

const execFileAsync = promisify(execFile);
import { MessagesService } from './messages-service.js';

import { CloudClient } from './cloud-client.js';
import { HostedResponsesProxy } from './hosted-responses-proxy.js';
import { loadCloudConfiguration } from './cloud-config.js';
import { DesktopController } from './controller.js';
import { CuaService } from './cua-service.js';
import { DesktopActionBackend } from './action-backend.js';
import { CapabilitySocketHost } from './capability-host.js';
import { registerDesktopIpc } from './ipc.js';
import {
  ElectronPayloadCipher,
  EphemeralPayloadCipher,
  openRecoverableRecordRepository,
  PlaintextTestCipher,
  SqliteRecordRepository,
} from './persistence.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';
import { CognitoIdentityManager } from './identity.js';
import { configureMetaCloudAvailability, probeProviders } from './provider-probe.js';
import { discoverCodexInstallation } from './codex-installation.js';
import { macProviderPath } from './provider-path.js';
import { WorkspaceOperationsService } from './workspace-operations.js';
import { MacVoiceService, createMacSpeechTransport } from './mac-voice-service.js';
import { ElevenLabsVoiceService } from './voice-service.js';
import { nativeVoiceHelperFactory } from './push-to-talk.js';

const APP_ORIGIN = 'app://sia';
const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
const DEVELOPMENT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
// This is the exact inline bootstrap in renderer/index.html. The bootstrap adds
// a meta policy, covering file:// responses even on Electron versions where
// webRequest response headers are not applied to local files.
const CSP_BOOTSTRAP_HASH = "'sha256-F+rjpeIQGVxefQ+2vStX3rQ5COZyOXaVGCqUREOZlH0='";
const PRODUCTION_HEADER_CSP = PRODUCTION_CSP.replace(
  "script-src 'self'",
  `script-src 'self' ${CSP_BOOTSTRAP_HASH}`,
);
let phoneRemote: PhoneRemote | undefined;
let scotty: ReturnType<typeof createScottyCompanion> | undefined;
let commandLauncher: ReturnType<typeof createCommandLauncher> | undefined;
let mainWindow: BrowserWindow | undefined;
let controller: DesktopController | undefined;
let unregisterIpc: (() => void) | undefined;
let sessionSecurityConfigured = false;
let shutdownStarted = false;
let creationInFlight: Promise<void> | undefined;
let startupFailureReported = false;
let unsubscribeDockBadge: (() => void) | undefined;
const notificationTimes = new Map<string, number>();

if (!app.isPackaged && process.env.SIA_TEST_USER_DATA) {
  app.setPath('userData', process.env.SIA_TEST_USER_DATA);
}

const gotLock = app.requestSingleInstanceLock();
app.setName('Sia');
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showOrCreateApplicationWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', showOrCreateApplicationWindow);

  app.on('before-quit', (event) => {
    phoneRemote?.dispose();
    phoneRemote = undefined;
    scotty?.dispose();
    scotty = undefined;
    commandLauncher?.dispose();
    commandLauncher = undefined;
    unsubscribeDockBadge?.();
    unsubscribeDockBadge = undefined;
    if (!shutdownStarted && controller) {
      event.preventDefault();
      shutdownStarted = true;
      unregisterIpc?.();
      unregisterIpc = undefined;
      const closingController = controller;
      controller = undefined;
      void completeShutdown(closingController).finally(() => app.quit());
      return;
    }
    unregisterIpc?.();
    unregisterIpc = undefined;
  });

  void app.whenReady().then(createApplication).catch(reportStartupFailure);
}

async function completeShutdown(closingController: DesktopController): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  await Promise.race([
    closingController.shutdown().catch(() => undefined),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, 10_000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
}

function showOrCreateApplicationWindow(): void {
  if (shutdownStarted) return;
  void createApplication()
    .then(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    })
    .catch(reportStartupFailure);
}

function createApplication(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) return Promise.resolve();
  if (mainWindow?.isDestroyed()) {
    unregisterIpc?.();
    unregisterIpc = undefined;
    mainWindow = undefined;
  }
  if (creationInFlight) return creationInFlight;
  creationInFlight = performApplicationCreation().finally(() => {
    creationInFlight = undefined;
  });
  return creationInFlight;
}

async function performApplicationCreation(): Promise<void> {
  installApplicationMenu();
  configureSessionSecurity();
  await configureProviderPath();
  const developmentMode = !app.isPackaged;
  const fakeServices = developmentMode && process.env.SIA_FAKE_SERVICES === '1';
  const rendererDevUrl = developmentMode ? process.env.ELECTRON_RENDERER_URL : undefined;
  const cloudConfiguration = await loadCloudConfiguration({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    environment: process.env,
  });
  configureMetaCloudAvailability(Boolean(cloudConfiguration.apiBaseUrl));

  if (!controller) {
    const codexCommand = fakeServices ? undefined : await discoverCodexInstallation();
    const databasePath = join(app.getPath('userData'), 'sia.sqlite');
    const plaintextTestStorage =
      !app.isPackaged && process.env.SIA_TEST_PLAINTEXT_STORAGE === '1';
    const { repository, startupNotice } = openApplicationRepository(
      databasePath,
      plaintextTestStorage,
    );
    const identity = new CognitoIdentityManager({
      repository,
      ...(cloudConfiguration.cognitoRegion ? { region: cloudConfiguration.cognitoRegion } : {}),
      ...(cloudConfiguration.cognitoClientId
        ? { clientId: cloudConfiguration.cognitoClientId }
        : {}),
      ...(developmentMode && process.env.SIA_DEV_ID_TOKEN
        ? { developmentIdToken: process.env.SIA_DEV_ID_TOKEN }
        : {}),
    });
    const cloud = new CloudClient(cloudConfiguration.apiBaseUrl, identity);
    const hostedResponsesProxy = fakeServices ? undefined : new HostedResponsesProxy(cloud);
    let activeController!: DesktopController;
    const computer = new CuaService({
      authorize: (request, context) => activeController.authorizeComputer(request, context),
    });
    const fakeTurnDelayMs = fakeServices
      ? testFakeTurnDelay(process.env.SIA_TEST_FAKE_TURN_DELAY_MS)
      : undefined;
    const trajectory = new TrajectoryRecorder({
      rootDirectory: join(app.getPath('userData'), 'trajectories'),
      enabled: () => activeController?.trajectoryLogEnabled() ?? true,
    });
    const messagesService = new MessagesService();
    const browserWindows = new BrowserWindowService(
      app.isPackaged
        ? join(process.resourcesPath, 'native', 'SiaVoiceHelper')
        : join(app.getAppPath(), 'build', 'native', 'SiaVoiceHelper'),
    );
    const automationPermissions = new AutomationPermissionService({
      helperPath: app.isPackaged
        ? join(process.resourcesPath, 'native', 'SiaVoiceHelper')
        : join(app.getAppPath(), 'build', 'native', 'SiaVoiceHelper'),
      fake: fakeServices,
      openSettings: () =>
        shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
        ),
    });
    activeController = new DesktopController({
      captureMacContext: () => browserWindows.macContext(),
      providerProbe: (only) =>
        probeProviders(
          only,
          process.env,
          undefined,
          codexCommand ? { codex: codexCommand } : {},
        ),
      repository,
      cloud,
      computer,
      identity,
      fakeServices,
      ...(fakeTurnDelayMs ? { fakeTurnDelayMs } : {}),
      trajectory,
      capabilitySetup: {
        automationPermissions: (request) => automationPermissions.check(request),
        messagesStatus: () => messagesService.status(),
        chromeDebugStatus: () => chromeRemoteDebuggingStatus(),
      },
      revealDirectory: async (path) => {
        shell.showItemInFolder(path);
      },
      openExternal: openSafeExternal,
      openMessages: () => shell.openExternal('sms:', { activate: true }),
      openMessagesPermissions: () =>
        shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
        ),
      restartApp: () => {
        // Allow the typed IPC reply to arrive before the normal shutdown drains work.
        setTimeout(() => {
          if (process.platform === 'darwin' && !app.isPackaged) {
            app.relaunch({
              execPath: '/usr/bin/open',
              args: developmentRelaunchArguments(
                process.execPath,
                app.getAppPath(),
                process.env,
              ),
            });
          } else app.relaunch();
          app.quit();
        }, 250);
      },
      chooseDirectory,
      defaultWorkspaceRoot:
        !app.isPackaged && process.env.SIA_TEST_WORKSPACE
          ? process.env.SIA_TEST_WORKSPACE
          : join(app.getPath('home'), 'Sia', 'Agents'),
      chooseFiles,
      exportJson,
      openPath: async (path) => {
        const error = await shell.openPath(path);
        if (error) throw new Error(error);
      },
      composeFeedback: async (subject, body) => {
        const mailto = new URL('mailto:support@superintelligentagents.ai');
        mailto.searchParams.set('subject', subject);
        mailto.searchParams.set('body', body);
        await shell.openExternal(mailto.toString(), { activate: true });
      },
      appVersion: app.getVersion(),
      ...(cloudConfiguration.updateManifestUrl
        ? {
            updateManifestUrl: cloudConfiguration.updateManifestUrl,
            updateManifestPublicKey: cloudConfiguration.updateManifestPublicKey,
          }
        : {}),
      notify: ({ threadId, title, body }) => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return;
        if (!Notification.isSupported()) return;
        const now = Date.now();
        if (now - (notificationTimes.get(threadId) ?? 0) < 5_000) return;
        notificationTimes.set(threadId, now);
        const notification = new Notification({ title, body, silent: false });
        notification.on('click', () => {
          void activeController.invoke('threads.select', { threadId }).finally(() => {
            showOrCreateApplicationWindow();
          });
        });
        notification.show();
      },
      workspaceOperations: new WorkspaceOperationsService({
        privateWorktreeRoot: join(app.getPath('userData'), 'worktrees'),
      }),
      voice:
        process.platform === 'darwin' && !fakeServices
          ? new MacVoiceService(repository, () =>
              createMacSpeechTransport(
                app.isPackaged
                  ? join(process.resourcesPath, 'native', 'SiaVoiceHelper')
                  : join(app.getAppPath(), 'build', 'native', 'SiaVoiceHelper'),
              ),
            )
          : new ElevenLabsVoiceService({ repository, gateway: cloud }),
      ...(startupNotice ? { startupNotice } : {}),
    });
    const actionBackend = new DesktopActionBackend({
      macAutomation: runMacAutomation,
      assistantAction: (request) =>
        activeController.assistantAction(request, (name, args, skillSignal) =>
          gateway.invoke({
            name,
            arguments: args,
            context: {
              ...request.context,
              signal: request.context.signal
                ? AbortSignal.any([request.context.signal, skillSignal])
                : skillSignal,
            },
          }),
        ),
      cua: computer,
      cloud,
      installedApplications,
      openApplication: launchInstalledApplication,
      openUrl: openWebExternal,
      messages: messagesService,
      openFullDiskAccessSettings: async () => {
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
        );
      },
      isBrowserOriginAllowed: (origin) => activeController.isBrowserOriginAllowed(origin),
      ensureBrowserAttached: () => activeController.ensureBrowserAttachedForActions(),
      macBrowserAccess: () => activeController.computerAccessMode() === 'mac',
      macBackgroundControl: () => activeController.macBackgroundControl(),
      inspectBrowserWindow: (pid, windowId) => browserWindows.inspect(pid, windowId),
      readImageText: (dataBase64) => browserWindows.imageText(dataBase64),
      readWindowContext: (pid, windowId) => browserWindows.context(pid, windowId),
      resolveConnectionId: (app, selector, approvalId) =>
        activeController.connectionIdForAction(app, selector, approvalId),
      onConnectionReconnectRequired: (app, connectionId) =>
        activeController.markConnectionReconnectRequired(app, connectionId),
      schedules: {
        create: (threadId, input) => activeController.createScheduleFromAction(threadId, input),
        list: (threadId) => activeController.listSchedulesForAction(threadId),
        update: (threadId, input) => activeController.updateScheduleFromAction(threadId, input),
        delete: (threadId, scheduleId) =>
          activeController.deleteScheduleFromAction(threadId, scheduleId),
      },
    });
    activeController.attachBrowserCapabilitySink(actionBackend);
    const defaultPolicy = new DefaultActionAuthorizationPolicy({
      trustLocalActions: () => activeController.computerTrust() === 'auto',
    });
    const gateway = new ActionGateway({
      backend: actionBackend,
      policy: {
        evaluate: (request) =>
          activeController.allowsReviewAction(request.context.threadId, request.name)
            ? defaultPolicy.evaluate(request)
            : {
                decision: 'deny',
                reason: 'Memory reviews can only read the library and propose suggestions.',
              },
      },
      approvals: activeController.approvalBroker(),
      onInvocation: activeController.actionInvocationObserver(),
      onResult: activeController.actionResultObserver(),
      isToolAvailable: (name) => activeController.actionToolAvailable(name),
    });
    let activeRuntime!: RuntimeCoordinator;
    let capabilityHost: CapabilitySocketHost | undefined;
    if (!fakeServices) {
      capabilityHost = new CapabilitySocketHost({
        tools: () => gateway.listTools(),
        invoker: {
          invoke: (sessionId, toolName, argumentsValue) =>
            activeRuntime.invokeCapability(sessionId, toolName, argumentsValue),
        },
      });
      await capabilityHost.start({
        temporaryDirectory: app.getPath('temp'),
        electronExecutable: process.execPath,
        entryPath: join(import.meta.dirname, 'tool-bridge.js'),
      });
    }
    activeRuntime = new RuntimeCoordinator(gateway, {
      ...(codexCommand ? { codexCommand } : {}),
      macContext: () => browserWindows.macContext(),
      metaTransport: cloud,
      ...(hostedResponsesProxy
        ? {
            hostedCodexProvider: (providerSession) =>
              hostedResponsesProxy.issue(providerSession.model),
          }
        : {}),
      ...(capabilityHost
        ? {
            acpMcpServerFactory: (_provider, session) => [
              capabilityHost!.mint(session.threadId),
            ],
          }
        : {}),
      ...(hostedResponsesProxy || capabilityHost
        ? {
            onDispose: async () => {
              await Promise.all([
                hostedResponsesProxy?.dispose() ?? Promise.resolve(),
                capabilityHost ? capabilityHost.stop() : Promise.resolve(),
              ]);
            },
          }
        : {}),
    });
    activeController.attachRuntime(activeRuntime);
    await activeController.initialize();
    unsubscribeDockBadge?.();
    const updateDockBadge = (snapshot: ReturnType<typeof activeController.snapshot>) => {
      const unread = snapshot.threads.filter(
        (thread) => thread.unread && !thread.archivedAt,
      ).length;
      app.dock?.setBadge(unread ? String(unread) : '');
    };
    updateDockBadge(activeController.snapshot());
    unsubscribeDockBadge = activeController.subscribe((event) => {
      if (event.type === 'snapshot') updateDockBadge(event.snapshot);
    });
    if (
      !fakeServices &&
      activeController.computerAccessMode() === 'connected' &&
      activeController.computerTrust() === 'auto'
    ) {
      // Trusted local mode also makes the signed-in Chrome reachable by default: Chrome's own
      // persistent remote-debugging toggle is enabled whenever Chrome is closed at launch, so
      // attachment needs no per-session consent prompt. Visible and revocable at
      // chrome://inspect/#remote-debugging.
      void ensureChromeRemoteDebuggingEnabled().then((result) => {
        if (result === 'enabled') {
          trajectory.record({
            type: 'chrome_debug_setup',
            threadId: 'app',
            result,
          });
        }
      });
    }
    activeController.attachPushToTalk({
      available: process.platform === 'darwin' && !fakeServices,
      createHelper: nativeVoiceHelperFactory(
        app.isPackaged
          ? join(process.resourcesPath, 'native', 'SiaVoiceHelper')
          : join(app.getAppPath(), 'build', 'native', 'SiaVoiceHelper'),
      ),
      isFocused: () =>
        Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()),
    });
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'SiaVoiceHelper')
      : join(app.getAppPath(), 'build', 'native', 'SiaVoiceHelper');
    phoneRemote = new PhoneRemote({
      controller: activeController,
      repository,
      assets: join(import.meta.dirname, '../remote'),
      qr: (url) => remoteQR(helperPath, url),
      copy: (url) => clipboard.writeText(url),
      ...(!fakeServices
        ? { advertise: (port: number) => advertiseRemote(helperPath, port) }
        : {}),
    });
    activeController.attachPhoneRemote((command) => phoneRemote!.configure(command));
    scotty = createScottyCompanion(
      activeController,
      repository,
      showOrCreateApplicationWindow,
      rendererDevUrl,
    );
    activeController.attachScotty(scotty.configure);
    let voiceAsleep = false;
    let voiceScreenLocked =
      process.platform === 'darwin' && powerMonitor.getSystemIdleState(1) === 'locked';
    const updateVoiceSuspension = () => {
      activeController.suspendVoice(voiceAsleep || voiceScreenLocked);
      commandLauncher?.suspend(voiceAsleep || voiceScreenLocked);
      phoneRemote?.suspend(voiceAsleep || voiceScreenLocked);
      scotty?.suspend(voiceAsleep || voiceScreenLocked);
    };
    // Waking the Mac must not re-enable capture while its screen remains locked.
    powerMonitor.on('suspend', () => {
      voiceAsleep = true;
      updateVoiceSuspension();
    });
    powerMonitor.on('lock-screen', () => {
      voiceScreenLocked = true;
      updateVoiceSuspension();
    });
    powerMonitor.on('resume', () => {
      voiceAsleep = false;
      updateVoiceSuspension();
    });
    powerMonitor.on('unlock-screen', () => {
      voiceScreenLocked = false;
      updateVoiceSuspension();
    });
    updateVoiceSuspension();
    await phoneRemote.initialize();
    scotty.initialize();
    controller = activeController;
  }
  const activeController = controller;
  commandLauncher ??= createCommandLauncher(
    activeController,
    showOrCreateApplicationWindow,
    rendererDevUrl,
  );
  commandLauncher.suspend(
    process.platform === 'darwin' && powerMonitor.getSystemIdleState(1) === 'locked',
  );
  activeController.setLauncherRegistered(commandLauncher.registered);

  const window = new BrowserWindow({
    title: 'Sia',
    width: 1220,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191b1a' : '#fafaf8',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow = window;
  unregisterIpc = registerDesktopIpc(ipcMain, window, activeController);

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererDevUrl && !url.startsWith(APP_ORIGIN)) event.preventDefault();
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    activeController.releaseRendererVoiceCapture();
    console.error('Renderer exited', { reason: details.reason, exitCode: details.exitCode });
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    activeController.releaseRendererVoiceCapture();
    unregisterIpc?.();
    unregisterIpc = undefined;
    mainWindow = undefined;
  });

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

function reportStartupFailure(error: unknown): void {
  if (startupFailureReported) return;
  startupFailureReported = true;
  const message = error instanceof Error ? error.message : 'Sia could not start.';
  dialog.showErrorBox('Sia could not start', message);
  app.exit(1);
}

function openApplicationRepository(
  databasePath: string,
  plaintextTestStorage: boolean,
): {
  repository: SqliteRecordRepository;
  startupNotice?: { title: string; detail: string };
} {
  if (plaintextTestStorage) {
    return {
      repository: new SqliteRecordRepository(databasePath, new PlaintextTestCipher()),
    };
  }

  let cipher: ElectronPayloadCipher;
  try {
    cipher = new ElectronPayloadCipher();
  } catch {
    return {
      repository: new SqliteRecordRepository(':memory:', new EphemeralPayloadCipher()),
      startupNotice: {
        title: 'Secure storage is temporarily unavailable',
        detail:
          'Sia opened a temporary session without changing your saved data. Changes in this session will not be saved; unlock macOS Keychain and restart Sia.',
      },
    };
  }

  const opened = openRecoverableRecordRepository(databasePath, cipher);
  return {
    repository: opened.repository,
    ...(opened.archivedPath
      ? {
          startupNotice: {
            title: 'Sia recovered from unreadable local data',
            detail: `The previous encrypted database could not be opened, so Sia preserved it as ${basename(opened.archivedPath)} and started with a fresh local store.`,
          },
        }
      : {}),
  };
}

async function configureProviderPath(): Promise<void> {
  if (process.platform !== 'darwin') return;
  process.env.PATH = await macProviderPath(app.getPath('home'), process.env.PATH);
}

function configureSessionSecurity(): void {
  if (sessionSecurityConfigured) return;
  sessionSecurityConfigured = true;
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    const microphoneOnly =
      permission === 'media' &&
      details.isMainFrame &&
      mediaTypes?.length === 1 &&
      mediaTypes[0] === 'audio';
    callback(
      Boolean(
        microphoneOnly &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        webContents === mainWindow.webContents,
      ),
    );
  });
  ses.setPermissionCheckHandler((webContents, permission, _origin, details) =>
    Boolean(
      permission === 'media' &&
      details.isMainFrame &&
      details.mediaType === 'audio' &&
      webContents &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      webContents === mainWindow.webContents,
    ),
  );
  ses.webRequest.onHeadersReceived((details, callback) => {
    const development = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
    const csp = development ? DEVELOPMENT_CSP : PRODUCTION_HEADER_CSP;
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

function installApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Sia',
        submenu: [
          { role: 'about' },
          {
            label: 'Show Scotty',
            click: () => {
              void scotty?.configure({ operation: 'show' }).catch(() => {
                void dialog.showMessageBox({
                  type: 'error',
                  title: 'Scotty could not open',
                  message: 'Try again from Settings → Scotty.',
                });
              });
            },
          },
          {
            label: 'Ask Sia',
            accelerator: 'Command+E',
            registerAccelerator: false,
            click: () => {
              void commandLauncher?.toggle().catch(reportStartupFailure);
            },
          },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

async function chooseDirectory(): Promise<string | null> {
  if (!app.isPackaged && process.env.SIA_TEST_WORKSPACE) {
    return process.env.SIA_TEST_WORKSPACE;
  }
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choose agent workspace',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use workspace',
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

async function chooseFiles(): Promise<string[]> {
  if (!app.isPackaged && process.env.SIA_TEST_ATTACHMENTS) {
    try {
      const paths = JSON.parse(process.env.SIA_TEST_ATTACHMENTS) as unknown;
      if (Array.isArray(paths) && paths.every((value) => typeof value === 'string')) {
        return paths;
      }
    } catch {
      throw new Error('SIA_TEST_ATTACHMENTS must be a JSON array of file paths.');
    }
  }
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Attach files',
    properties: ['openFile', 'multiSelections'],
    buttonLabel: 'Attach',
  });
  return result.canceled ? [] : result.filePaths;
}

function testFakeTurnDelay(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const milliseconds = Number(value);
  return Number.isSafeInteger(milliseconds) && milliseconds >= 0 && milliseconds <= 30_000
    ? milliseconds
    : undefined;
}

async function exportJson(value: unknown): Promise<string | null> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Sia research data',
    defaultPath: `sia-research-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    buttonLabel: 'Export',
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return result.filePath;
}

async function openSafeExternal(value: string): Promise<void> {
  if (!isSafeExternal(value)) throw new Error('Blocked an unsafe external URL.');
  await shell.openExternal(value, { activate: true });
}

async function openWebExternal(value: string, options: { background: boolean }): Promise<void> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Blocked an invalid website URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Blocked an unsafe website URL.');
  await shell.openExternal(url.toString(), { activate: !options.background });
}

function isSafeExternal(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
