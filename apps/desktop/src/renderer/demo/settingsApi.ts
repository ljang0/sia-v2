import { isGoogleConnection } from '../../shared/bridge/connections';
import type { RendererApi } from '../types';
import { RESEARCH_CONSENT_VERSION } from '../../shared/bridge';
import type { DemoApiContext } from './context';
import { demoSnapshot } from './snapshot';

/** Demo accounts, connections, computer and voice access, preferences, and research. */
export function demoSettingsApi({ mutate }: DemoApiContext) {
  return {
    async setCapturePaused(paused) {
      mutate((current) => {
        if (!paused) {
          current.research.consented = true;
          current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
        }
        current.research.capture = paused ? 'paused' : 'recording';
      });
    },
    async declineResearchConsent() {
      mutate((current) => {
        current.research.consented = false;
        current.research.capture = 'paused';
        current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
      });
    },
    async openProviderSetup(provider) {
      mutate((current) => {
        const target = current.providers.find((item) => item.id === provider);
        if (target && target.status !== 'disabled') target.status = 'ready';
      });
    },
    async cancelProviderSetup(provider) {
      mutate((current) => {
        const target = current.providers.find((item) => item.id === provider);
        if (target?.setup?.phase === 'signing-in')
          target.setup = {
            phase: 'error',
            message: 'ChatGPT sign-in was cancelled. Choose Try again to start over.',
          };
      });
    },
    async refreshProvider() {
      return Promise.resolve();
    },
    async connectSelectedApps(selected) {
      mutate((current) => {
        for (const app of current.apps) {
          if (!isGoogleConnection(app.id) && app.id !== 'slack') continue;
          if (!selected.includes(app.id === 'slack' ? 'slack' : 'google')) continue;
          app.status = 'connected';
          app.enabled = true;
          app.account ??= 'lawrence@example.com';
          if (isGoogleConnection(app.id)) app.googleAccess = 'read_only';
        }
      });
    },
    async connectGoogleApps() {
      mutate((current) => {
        for (const app of current.apps) {
          if (!isGoogleConnection(app.id)) continue;
          app.status = 'connected';
          app.account = app.account ?? 'lawrence@example.com';
          app.googleAccess = 'read_only';
        }
      });
    },
    async upgradeGoogleApps() {
      mutate((current) => {
        for (const app of current.apps) {
          if (!isGoogleConnection(app.id)) continue;
          app.googleAccess = 'read_write';
          app.upgrading = false;
        }
      });
    },
    async connectApp(app) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) {
          target.status = 'connected';
          target.account = target.account ?? 'lawrence@example.com';
          if (isGoogleConnection(target.id)) target.googleAccess = 'read_only';
        }
      });
    },
    async setAppEnabled(app, enabled) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) target.enabled = enabled;
      });
    },
    async disconnectApp(app) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) {
          target.status = 'disconnected';
          target.account = undefined;
          target.googleAccess = undefined;
          target.upgrading = false;
        }
      });
    },
    async startCloudSignIn(email) {
      mutate((current) => {
        current.cloudAuth = { state: 'code-sent', email };
      });
    },
    async completeCloudSignIn() {
      mutate((current) => {
        current.cloudAuth.state = 'signed-in';
        current.connection = 'online';
      });
    },
    async beginAdminMfa() {
      return { secretCode: 'DEMOADMINMFA' };
    },
    async completeAdminMfa() {
      mutate((current) => {
        current.cloudAuth.state = 'signed-in';
        current.cloudAuth.adminMfa = true;
      });
    },
    async signOutCloud() {
      mutate((current) => {
        current.cloudAuth = { state: 'signed-out' };
        current.connection = 'offline';
      });
    },
    async deleteCloudAccount() {
      mutate((current) => {
        current.agents = [];
        current.selectedAgentId = undefined;
        current.selectedThreadId = undefined;
        current.activeThread = undefined;
        current.apps = current.apps.map((app) => ({
          ...app,
          status: 'disconnected',
          account: undefined,
        }));
        current.browser = {
          status: 'detached',
          profileName: 'Chrome',
          attached: false,
          availableWindows: [],
          tabs: [],
        };
        current.research = {
          consented: false,
          capture: 'paused',
          allowedOrigins: [],
          excludedPaths: [],
          pendingItems: 0,
          pendingBytes: 0,
        };
        current.cloudAuth = { state: 'signed-out' };
        current.connection = 'offline';
      });
    },
    async connectBrowserAndContinue() {},
    async attachBrowser(windowId) {
      mutate((current) => {
        void windowId;
        current.browser.status = 'attached';
        current.browser.attached = true;
        current.browser.availableWindows = [];
      });
    },
    async openBrowserSite(url) {
      mutate((current) => {
        const origin = new URL(url.includes('://') ? url : `https://${url}`).origin;
        current.browser.tabs = [
          { id: 'demo-site', title: origin, origin, active: true, granted: true },
        ];
      });
    },
    async detachBrowser() {
      mutate((current) => {
        current.browser.status = 'detached';
        current.browser.attached = false;
        current.browser.tabs = current.browser.tabs.map((tab) => ({ ...tab, granted: false }));
      });
    },
    async setComputerAccessMode(mode, background, backgroundFallback) {
      mutate((current) => {
        current.computer.accessMode = mode;
        if (background !== undefined) current.computer.backgroundControl = background;
        if (backgroundFallback !== undefined)
          current.computer.backgroundFallback = backgroundFallback;
      });
    },
    async setComputerTrust(trust) {
      mutate((current) => {
        current.computer.trust = trust;
      });
    },
    async setTrajectoryLog(enabled) {
      mutate((current) => {
        current.computer.trajectoryLog = enabled;
      });
    },
    async revealTrajectories() {},
    async refreshComputerPermissions() {},
    async requestComputerPermissions(permission) {
      mutate((current) => {
        if (permission !== 'screenRecording') current.computer.accessibility = 'allowed';
        if (permission !== 'accessibility') current.computer.screenRecording = 'allowed';
      });
    },
    async openMessages() {
      return Promise.resolve();
    },
    async configurePushToTalk() {
      throw new Error('Fn push-to-talk requires the macOS app.');
    },
    async acquireVoiceCapture() {
      return 'demo-voice';
    },
    async releaseVoiceCapture() {},
    async configureVoice() {
      mutate((current) => {
        current.voice = structuredClone(demoSnapshot.voice);
      });
    },
    async refreshVoices() {
      return Promise.resolve();
    },
    async selectVoice(voiceId) {
      mutate((current) => {
        const selected = current.voice.voices.find((voice) => voice.id === voiceId);
        if (!selected) return;
        current.voice.selectedVoiceId = selected.id;
        current.voice.selectedVoiceName = selected.name;
      });
    },
    async disconnectVoice() {
      mutate((current) => {
        current.voice = { status: 'disconnected', voices: [] };
      });
    },
    async assistantLibrary() {
      return { memories: [], workflows: [], context: false };
    },
    async restartForOnboarding() {
      mutate((current) => {
        current.preferences.onboarding = {
          ...current.preferences.onboarding,
          step: 'verify',
          restarted: true,
        };
        current.browser.attached = false;
        current.browser.status = 'detached';
      });
    },
    async setupMessages() {},
    async requestAutomationPermission(app) {
      mutate((current) => {
        current.computer.automation = {
          calendar: 'needs_permission',
          reminders: 'needs_permission',
          finder: 'needs_permission',
          messages: 'needs_permission',
          ...current.computer.automation,
          [app]: 'ready',
        };
      });
    },
    async setOnboarding(step, permissionSetup) {
      mutate((current) => {
        current.preferences.onboarding = {
          step,
          ...(permissionSetup ? { permissionSetup } : {}),
          ...(current.selectedAgentId ? { agentId: current.selectedAgentId } : {}),
        };
      });
    },
    async setAppearance(appearance) {
      mutate((current) => {
        current.preferences.appearance = appearance;
      });
    },
    async setTheme(theme) {
      mutate((current) => {
        current.preferences.theme = theme;
      });
    },
    async setTextSize(textSize) {
      mutate((current) => {
        current.preferences.textSize = textSize;
      });
    },
    async setCompletionSound(enabled) {
      mutate((current) => {
        current.preferences.completionSound = enabled;
      });
    },
    async setOpenAtLogin(enabled) {
      mutate((current) => {
        current.preferences.openAtLogin = enabled;
      });
    },
    async setDeveloperTools(enabled) {
      mutate((current) => {
        current.preferences.developerTools = enabled;
      });
    },
    async composeFeedback() {},
    async checkForUpdates() {
      mutate((current) => {
        current.updates = {
          ...current.updates,
          status: 'current',
          detail: 'This demo is current.',
        };
      });
    },
    async openUpdateDownload() {},
    async transcribeVoice() {
      return 'Dictated request';
    },
    async startRealtimeVoice() {
      return crypto.randomUUID();
    },
    async appendRealtimeVoice() {
      return Promise.resolve();
    },
    async stopRealtimeVoice(_sessionId, commit) {
      return commit ? 'Realtime voice request' : '';
    },
    async speakText() {
      return { audioBase64: 'AQID', mimeType: 'audio/mpeg' };
    },
    async exportResearchData() {
      return Promise.resolve();
    },
    async deleteResearchData() {
      mutate((current) => {
        current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
        current.research.consented = false;
        current.research.capture = 'paused';
        current.research.allowedOrigins = [];
        current.research.pendingItems = 0;
        current.research.pendingBytes = 0;
      });
    },
    async listResearchInvites() {
      return { invites: [], limit: 20 };
    },
    async createResearchInvite(email) {
      return {
        email,
        invitedAt: new Date().toISOString(),
        status: 'invited',
      };
    },
    async listResearchParticipants() {
      return [];
    },
    async listResearchBatches() {
      return [];
    },
    async readResearchBatch() {
      return undefined;
    },
  } satisfies Partial<RendererApi>;
}
