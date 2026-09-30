import type { BridgeRequestMap, BridgeResultMap, UpdateView } from '../../shared/bridge.js';
import { verifyUpdateManifestResponse } from '../update-manifest.js';
import type { ControllerContext } from './context.js';
import { compareVersions, isCleanHttpsUrl } from './update-feed.js';

/** Signed update checks and downloads, and the support feedback message. */
export class AppSupport {
  updates: UpdateView;

  constructor(private readonly ctx: ControllerContext) {
    this.updates = {
      status: ctx.deps.updateManifestUrl ? 'idle' : 'unconfigured',
      currentVersion: ctx.deps.appVersion,
      detail: ctx.deps.updateManifestUrl
        ? 'Ready to check the configured release feed.'
        : 'This build does not have a persistent signed update feed configured.',
    };
  }

  async composeFeedbackMessage(
    input: BridgeRequestMap['feedback.compose'],
  ): Promise<BridgeResultMap['feedback.compose']> {
    if (!this.ctx.deps.composeFeedback)
      throw new Error('Feedback handoff is unavailable in this build.');
    if (input.threadId) this.ctx.requireThread(input.threadId);
    const diagnostics = input.includeDiagnostics
      ? [
          '',
          '--- Sia diagnostics (no transcript or file contents) ---',
          `Version: ${this.ctx.deps.appVersion}`,
          ...(input.threadId ? [`Thread ID: ${input.threadId}`] : []),
          `Providers: ${this.ctx.providers.views.map(({ id, status }) => `${id}=${status}`).join(', ')}`,
        ].join('\n')
      : '';
    await this.ctx.deps.composeFeedback(
      'Sia internal feedback',
      `${input.message.trim()}${diagnostics}`,
    );
    return { opened: true };
  }

  async checkForUpdates(): Promise<UpdateView> {
    if (!this.ctx.deps.updateManifestUrl) return structuredClone(this.updates);
    if (!isCleanHttpsUrl(this.ctx.deps.updateManifestUrl)) {
      this.updates = {
        status: 'error',
        currentVersion: this.ctx.deps.appVersion,
        detail: 'The configured release feed must be a clean HTTPS URL.',
      };
      this.ctx.emit();
      return structuredClone(this.updates);
    }
    this.updates = {
      status: 'checking',
      currentVersion: this.ctx.deps.appVersion,
      detail: 'Checking the configured release feed…',
    };
    this.ctx.emit();
    try {
      if (!this.ctx.deps.updateManifestPublicKey) {
        throw new Error('The release feed does not have a pinned signing key.');
      }
      await this.ctx.deps.identity.refreshSession?.();
      const token = await this.ctx.deps.identity.read?.();
      if (!token) throw new Error('Sign in with an approved Sia account to check for updates.');
      const response = await fetch(this.ctx.deps.updateManifestUrl, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Release feed returned HTTP ${response.status}.`);
      const verified = verifyUpdateManifestResponse(
        await response.json(),
        this.ctx.deps.updateManifestPublicKey,
      );
      const latestVersion = verified.payload.version;
      const downloadUrl = verified.downloadUrl;
      const available = compareVersions(latestVersion, this.ctx.deps.appVersion) > 0;
      this.updates = {
        status: available ? 'available' : 'current',
        currentVersion: this.ctx.deps.appVersion,
        latestVersion,
        ...(available ? { downloadUrl } : {}),
        detail: available
          ? `Sia ${latestVersion} is ready to download.`
          : 'This build is up to date.',
      };
    } catch (error) {
      this.updates = {
        status: 'error',
        currentVersion: this.ctx.deps.appVersion,
        detail:
          error instanceof Error ? error.message : 'The release feed could not be checked.',
      };
    }
    this.ctx.emit();
    return structuredClone(this.updates);
  }

  async openUpdateDownload(): Promise<BridgeResultMap['updates.openDownload']> {
    if (this.updates.status !== 'available' || !this.updates.downloadUrl) {
      throw new Error('Check for updates before opening a download.');
    }
    await this.ctx.deps.openExternal(this.updates.downloadUrl);
    return { opened: true };
  }
}
