import { isLocalConnection } from './connection-ids.js';
import type { ModelRoute } from '@sia/protocol';
import { BUILTIN_HARNESS_DEFINITIONS, HarnessRegistry, admitHostedRoutes } from '@sia/runtime';
import type {
  BridgeResultMap,
  DesktopSnapshot,
  ProviderId,
  ProviderUsageLimitView,
  ProviderUsageView,
  ProviderView,
} from '../../shared/bridge.js';
import { providerPlan } from '../providers/provider-probe.js';
import type { ControllerContext } from './context.js';
import { modelRouteKey } from './execution-routes.js';

/** The parts of the controller context ProviderAccess uses. */
type ProviderAccessContext = Pick<
  ControllerContext,
  | 'account'
  | 'commit'
  | 'connections'
  | 'deps'
  | 'emit'
  | 'releaseAccessLocked'
  | 'requireSignedInReleaseAccount'
  | 'resultSnapshot'
  | 'runtime'
  | 'shuttingDown'
  | 'speech'
  | 'state'
  | 'turns'
  | 'workspace'
>;

/**
 * Model provider views and readiness, Codex sign-in and setup, Meta provider state, and the
 * model routes the signed-in account may use.
 */
export class ProviderAccess {
  views: ProviderView[] = [];

  /** Plan usage windows reported during this session; kept apart so a provider refresh keeps them. */
  readonly usageLimits = new Map<ProviderId, ProviderUsageLimitView>();

  codexSetupPending = false;

  /** Aborts a ChatGPT browser sign-in that is still waiting on the person. */
  private codexLoginAbort: AbortController | undefined;

  codexSetup: ProviderView['setup'];
  readonly backendModelRoutes = new Map<string, ModelRoute>();
  readonly allowedModelRoutes = new Map<string, readonly ModelRoute[]>();

  constructor(private readonly ctx: ProviderAccessContext) {}

  /**
   * Takes the views from the startup probe. In fake-services mode Codex is replaced with the
   * deterministic test runtime.
   */
  setInitialViews(views: ProviderView[]): void {
    this.views = views;
    if (this.ctx.deps.fakeServices) {
      const codexIndex = this.views.findIndex(({ id }) => id === 'codex');
      const fakeCodex: ProviderView = {
        id: 'codex',
        label: 'Codex',
        ...(providerPlan('codex') ? { plan: providerPlan('codex')! } : {}),
        status: 'ready',
        model: 'gpt-5.6-sol',
        version: '0.147.0',
        account: 'Practice mode',
        detail: 'Practice replies for testing Sia.',
        billing: 'Nothing is billed in practice mode.',
        models: [
          {
            id: 'gpt-5.6-sol',
            label: 'GPT-5.6 Sol',
            description: 'Practice model.',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoningEffort: 'high',
          },
          {
            id: 'gpt-5.6-terra',
            label: 'GPT-5.6 Terra',
            description: 'Second practice model.',
            reasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoningEffort: 'medium',
          },
        ],
      };
      if (codexIndex >= 0) this.views[codexIndex] = fakeCodex;
      else this.views.push(fakeCodex);
    }
    this.applyByok();
    this.applyLabHarnesses();
  }

  /**
   * Adds the lab harnesses of a verified testing manifest as the `lab` provider. Each model is
   * routed only to its own harness; Codex stays the default everywhere else.
   */
  applyLabHarnesses(): void {
    for (const routes of [this.allowedModelRoutes, this.backendModelRoutes])
      for (const key of routes.keys()) if (key.startsWith('lab\u0000')) routes.delete(key);
    const index = this.views.findIndex(({ id }) => id === 'lab');
    const harnesses = this.ctx.deps.labHarnesses;
    if (!harnesses.length) {
      if (index >= 0) this.views.splice(index, 1);
      return;
    }
    const view: ProviderView = {
      id: 'lab',
      label: `Lab harness: ${harnesses.map(({ name }) => name).join(', ')}`,
      plan: 'Lab harness test',
      status: 'ready',
      model: harnesses[0]!.models[0]!.id,
      detail: harnesses.map(({ name, disclosure }) => `${name}: ${disclosure}`).join(' '),
      billing: 'Provided by the model lab for testing.',
      models: harnesses.flatMap(({ name, models }) =>
        models.map((model) => ({
          id: model.id,
          label: model.label,
          description: `Runs in ${name}’s own harness.`,
          reasoningEfforts: [],
        })),
      ),
    };
    if (index >= 0) this.views[index] = view;
    else this.views.push(view);
    for (const harness of harnesses)
      for (const model of harness.models) {
        const route: ModelRoute = {
          provider: 'lab',
          model: model.id,
          harnessId: harness.id,
          harnessModelId: model.id,
          credentialSource: 'provider_api',
        };
        this.allowedModelRoutes.set(modelRouteKey('lab', model.id), [route]);
        this.backendModelRoutes.set(modelRouteKey('lab', model.id), route);
      }
  }

  /**
   * Reflects the saved API key, if any, as the `byok` provider and its single model route. The
   * key itself never leaves the main process; the view carries only the model and host.
   */
  applyByok(): void {
    for (const routes of [this.allowedModelRoutes, this.backendModelRoutes])
      for (const key of routes.keys()) if (key.startsWith('byok\u0000')) routes.delete(key);
    const index = this.views.findIndex(({ id }) => id === 'byok');
    if (!this.ctx.deps.byok) {
      if (index >= 0) this.views.splice(index, 1);
      return;
    }
    const base = index >= 0 ? this.views[index]! : undefined;
    const summary = this.ctx.deps.byok.summary();
    const view: ProviderView = {
      id: 'byok',
      label: 'Your API key',
      plan: 'Your API key',
      billing: base?.billing ?? 'Billed by your model provider to your own API key.',
      ...(summary
        ? {
            status: 'ready' as const,
            model: summary.model,
            account: summary.host,
            detail: `Uses ${summary.model} at ${summary.host} through the Codex harness.`,
            models: [
              {
                id: summary.model,
                label: summary.model,
                description: `Your own model at ${summary.host}.`,
                reasoningEfforts: [],
              },
            ],
          }
        : {
            status: 'needs_login' as const,
            model: '',
            detail: 'Add an API key to use your own model.',
          }),
    };
    if (index >= 0) this.views[index] = view;
    else this.views.push(view);
    if (!summary) return;
    const route: ModelRoute = {
      provider: 'byok',
      model: summary.model,
      harnessId: 'codex_app_server',
      harnessModelId: summary.model,
      credentialSource: 'user_byok',
    };
    this.allowedModelRoutes.set(modelRouteKey('byok', summary.model), [route]);
    this.backendModelRoutes.set(modelRouteKey('byok', summary.model), route);
  }

  /** Saves the person's own key after checking it; the key is never returned. */
  async saveApiKey(input: {
    baseUrl?: string;
    model: string;
    apiKey: string;
  }): Promise<DesktopSnapshot> {
    this.ctx.requireSignedInReleaseAccount();
    if (!this.ctx.deps.byok)
      throw new Error('Your own API key is not available in this build.');
    await this.ctx.deps.byok.save(input);
    this.applyByok();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async clearApiKey(): Promise<DesktopSnapshot> {
    this.ctx.requireSignedInReleaseAccount();
    this.ctx.deps.byok?.clear();
    this.applyByok();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async probeProviders(providerId?: ProviderId): Promise<DesktopSnapshot> {
    if (providerId === 'meta' && this.ctx.deps.identity.status().state === 'signed_in') {
      await this.ctx.deps.identity.refreshSession?.();
      await this.ctx.account.refreshCloudSession();
    }
    const updated = await this.ctx.deps.providerProbe(providerId);
    if (providerId) {
      const value = updated[0];
      if (value) {
        const index = this.views.findIndex(({ id }) => id === providerId);
        if (index >= 0) this.views[index] = value;
        else this.views.push(value);
      }
    } else this.views = updated;
    this.applyByok();
    this.applyLabHarnesses();
    await this.refreshMetaProviderState();
    await this.refreshProviderModels(providerId);
    if (
      this.codexSetup?.phase === 'error' &&
      this.views.find(({ id }) => id === 'codex')?.status === 'ready'
    )
      this.codexSetup = undefined;
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async refreshProviderModels(providerId?: ProviderId): Promise<void> {
    if (
      this.ctx.deps.fakeServices ||
      !this.ctx.runtime ||
      (providerId && providerId !== 'codex')
    )
      return;
    const codex = this.views.find(({ id }) => id === 'codex');
    if (!codex || codex.status !== 'ready') return;
    try {
      const models = await this.ctx.runtime.listModels('codex');
      if (models.length) {
        codex.models = models.map((model) => ({
          ...model,
          reasoningEfforts: [...model.reasoningEfforts],
        }));
      }
    } catch {
      // The provider probe remains authoritative. Catalog failure leaves the
      // verified release model available instead of making Codex unusable.
    }
  }

  requireCodexSetupIdle(): void {
    if (this.codexSetupPending)
      throw new Error('Codex setup is in progress. Follow the setup status in Sia.');
  }

  private requireSafeCodexRestart(): void {
    this.ctx.requireSignedInReleaseAccount();
    if (this.ctx.account.signOutInProgress || this.ctx.account.accountDeletionInProgress)
      throw new Error('Finish the account change before setting up Codex.');
    if (
      this.ctx.turns.running.size ||
      this.ctx.turns.queued.length ||
      this.ctx.speech.pushToTalk?.captureBusy ||
      this.ctx.workspace.pendingTerminalOperations ||
      this.ctx.deps.workspaceOperations?.hasRunningTerminals?.() ||
      this.ctx.connections.setup ||
      this.ctx.state.connections.some(
        (app) => !isLocalConnection(app.id) && app.status === 'connecting',
      )
    ) {
      throw new Error(
        'Finish the current task, terminal process, recording, or account approval, then try Codex setup again.',
      );
    }
    if (this.ctx.shuttingDown)
      throw new Error('Sia is closing. Open it again to finish Codex setup.');
  }

  async providerLogin(providerId: ProviderId): Promise<BridgeResultMap['providers.login']> {
    this.requireCodexSetupIdle();
    const provider = this.views.find(({ id }) => id === providerId);
    if (!provider) throw new Error('Provider status is unavailable. Check again first.');
    if (provider.status === 'disabled') {
      throw new Error(
        provider.restriction ?? 'This provider is disabled in the current release.',
      );
    }
    if (providerId === 'meta') {
      if (provider.status === 'unavailable') {
        throw new Error('Included models require a configured Sia cloud deployment.');
      }
      if (provider.status === 'needs_login') {
        throw new Error('Sign in to Sia to use included models.');
      }
      const harness = this.views.find(({ id }) => id === 'codex')?.status;
      if (!needsManagedInstall(provider.status))
        throw new Error('Included models are already part of your Sia account.');
      if (!harness || !needsManagedInstall(harness))
        throw new Error('Sia’s AI engine is unavailable in this build. Check again later.');
      // Included models run through the Codex App Server harness, so finishing their setup
      // installs it. No ChatGPT account is involved, so no sign-in continues after restart.
      this.codexSetupPending = true;
      try {
        await this.installManagedCodexAndRestart({
          installing:
            harness === 'incompatible'
              ? 'Updating Sia’s AI engine…'
              : 'Installing Sia’s AI engine…',
          restarting: 'Restarting Sia to finish setup.',
          forwardProgress: false,
          continueChatGptSignIn: false,
        });
        return { opened: true, snapshot: this.ctx.resultSnapshot() };
      } catch (error) {
        this.setCodexSetup('error', 'Setup did not finish. Choose Try again to start over.');
        throw error;
      } finally {
        if (this.codexSetup?.phase !== 'restarting') this.codexSetupPending = false;
        this.ctx.emit();
      }
    }
    const installation = needsManagedInstall(provider.status);
    if (providerId === 'codex') {
      if (provider.status === 'ready')
        return { opened: false, snapshot: this.ctx.resultSnapshot() };
      this.codexSetupPending = true;
      try {
        if (installation) {
          await this.installManagedCodexAndRestart({
            installing:
              provider.status === 'incompatible'
                ? 'Updating Codex for Sia…'
                : 'Downloading and installing Codex…',
            restarting: 'Restarting Sia. ChatGPT sign-in will continue automatically.',
            forwardProgress: true,
            continueChatGptSignIn: true,
          });
          return { opened: true, snapshot: this.ctx.resultSnapshot() };
        }
        if (!this.ctx.runtime)
          throw new Error(
            'Codex sign-in is temporarily unavailable. Restart Sia and try again.',
          );
        this.setCodexSetup(
          'signing-in',
          'Finish signing in with ChatGPT in your browser. Sia will check the connection automatically.',
        );
        const abort = new AbortController();
        this.codexLoginAbort = abort;
        try {
          const login = await this.ctx.runtime.startCodexChatGptLogin(abort.signal);
          try {
            abort.signal.throwIfAborted();
            await this.ctx.deps.openExternal(login.authUrl);
            abort.signal.throwIfAborted();
            await this.ctx.runtime.waitForCodexChatGptLogin(login.loginId, abort.signal);
          } catch (error) {
            await this.ctx.runtime
              .cancelCodexChatGptLogin(login.loginId)
              .catch(() => undefined);
            throw error;
          }
        } catch (error) {
          if (!abort.signal.aborted) throw error;
          // The person chose Cancel. Leave a plain Try again state instead of an error.
          this.ctx.deps.repository.remove('setup', 'codex-login');
          this.setCodexSetup(
            'error',
            'ChatGPT sign-in was cancelled. Choose Try again to start over.',
          );
          return { opened: false, snapshot: this.ctx.resultSnapshot() };
        } finally {
          if (this.codexLoginAbort === abort) this.codexLoginAbort = undefined;
        }
        this.ctx.requireSignedInReleaseAccount();
        this.setCodexSetup('checking', 'Checking your ChatGPT connection…');
        const snapshot = await this.probeProviders('codex');
        if (snapshot.providers.find(({ id }) => id === 'codex')?.status !== 'ready')
          throw new Error(
            'ChatGPT sign-in finished, but Codex could not verify the connected plan. Try setup again.',
          );
        this.codexSetup = undefined;
        return { opened: true, snapshot: this.ctx.resultSnapshot() };
      } catch (error) {
        this.ctx.deps.repository.remove('setup', 'codex-login');
        this.setCodexSetup(
          'error',
          'Codex setup did not finish. Your progress is saved; try setup again.',
        );
        throw error;
      } finally {
        if (this.codexSetup?.phase !== 'restarting') this.codexSetupPending = false;
        this.ctx.emit();
      }
    }
    const urls: Partial<Record<ProviderId, string>> = {
      claude: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
    };
    const url = urls[providerId];
    if (!url) throw new Error('This provider cannot be signed in from Sia yet.');
    await this.ctx.deps.openExternal(url);
    return { opened: true, snapshot: this.ctx.resultSnapshot() };
  }

  cancelProviderLogin(): DesktopSnapshot {
    this.codexLoginAbort?.abort(new Error('ChatGPT sign-in was cancelled.'));
    return this.ctx.resultSnapshot();
  }

  /**
   * Installs (or updates) Sia's verified managed Codex runtime, then restarts Sia so the new
   * harness is picked up. Only the ChatGPT setup action asks for sign-in to continue after the
   * restart; no credential, login URL or token is persisted in that continuation.
   */
  private async installManagedCodexAndRestart(options: {
    installing: string;
    restarting: string;
    forwardProgress: boolean;
    continueChatGptSignIn: boolean;
  }): Promise<void> {
    if (!this.ctx.deps.installCodex || !this.ctx.deps.restartApp || this.ctx.deps.fakeServices)
      throw new Error('Automatic Codex setup is unavailable in this build.');
    this.requireSafeCodexRestart();
    this.setCodexSetup('installing', options.installing);
    await this.ctx.deps.installCodex((message) => {
      if (options.forwardProgress) this.setCodexSetup('installing', message);
    });
    this.requireSafeCodexRestart();
    if (options.continueChatGptSignIn) {
      this.ctx.deps.repository.put('setup', 'codex-login', {
        expiresAt: Date.now() + 15 * 60_000,
      });
      this.ctx.commit();
    }
    this.setCodexSetup('restarting', options.restarting);
    this.ctx.deps.restartApp();
  }

  /** Install progress shows on every provider that is waiting for the managed Codex runtime. */
  setupFor(provider: ProviderView): ProviderView['setup'] {
    if (!this.codexSetup) return undefined;
    if (provider.id === 'codex') return this.codexSetup;
    return provider.id === 'meta' && needsManagedInstall(provider.status)
      ? this.codexSetup
      : undefined;
  }

  private setCodexSetup(
    phase: NonNullable<ProviderView['setup']>['phase'],
    message: string,
  ): void {
    this.codexSetup = { phase, message };
    this.ctx.emit();
  }

  /** Called after the window loads, never on an ordinary launch without setup intent. */
  async resumeCodexSetup(): Promise<void> {
    if (this.codexSetupPending || this.ctx.releaseAccessLocked() || this.ctx.shuttingDown)
      return;
    const continuation = this.ctx.deps.repository.get<{ expiresAt: number }>(
      'setup',
      'codex-login',
    );
    if (!continuation) return;
    // Consume before awaiting anything: a failed/cancelled login must not reopen
    // itself on the next launch or create concurrent browser sign-in sessions.
    this.ctx.deps.repository.remove('setup', 'codex-login');
    if (!Number.isFinite(continuation.expiresAt) || continuation.expiresAt < Date.now()) return;
    const status = this.views.find(({ id }) => id === 'codex')?.status;
    if (status === 'ready') return;
    if (status !== 'needs_login') {
      this.setCodexSetup(
        'error',
        'The ChatGPT helper could not finish updating. Choose Connect ChatGPT to try again.',
      );
      return;
    }
    try {
      await this.providerLogin('codex');
    } catch {
      // The visible setup error remains actionable. Never reopen a browser in a loop.
    }
  }

  async refreshMetaProviderState(): Promise<void> {
    const index = this.views.findIndex(({ id }) => id === 'meta');
    if (index < 0) return;
    const current = this.views[index]!;
    if (!this.ctx.deps.cloud.configured) {
      this.views[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Included models require a release build configured for Sia cloud.',
      };
      return;
    }
    if (this.ctx.deps.identity.status().state !== 'signed_in') {
      this.views[index] = {
        ...current,
        status: 'needs_login',
        detail: 'Sign in to Sia before using included models.',
      };
      return;
    }
    if (this.ctx.deps.fakeServices) {
      this.views[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Included models require an authenticated live capability check.',
      };
      return;
    }
    const codexHarness = this.views.find(({ id }) => id === 'codex');
    if (
      !codexHarness ||
      codexHarness.status === 'needs_install' ||
      codexHarness.status === 'incompatible' ||
      codexHarness.status === 'disabled' ||
      codexHarness.status === 'unavailable'
    ) {
      this.views[index] = {
        ...current,
        status: codexHarness?.status === 'incompatible' ? 'incompatible' : 'needs_install',
        detail:
          codexHarness?.status === 'incompatible'
            ? 'Included models require the supported Codex harness version. Update Codex, then check again.'
            : 'Included models require the Codex harness. Install Codex, then check again.',
      };
      return;
    }
    this.views[index] = {
      ...current,
      status: 'unavailable',
      detail: 'Checking included model labs…',
    };
    try {
      const capabilities = await this.ctx.deps.cloud.capabilities();
      const catalog = await (typeof this.ctx.deps.cloud.hostedCatalog === 'function'
        ? this.ctx.deps.cloud
            .hostedCatalog()
            .catch(() => ({ schemaVersion: 1 as const, providers: [] }))
        : Promise.resolve({ schemaVersion: 1 as const, providers: [] }));
      for (const key of this.backendModelRoutes.keys()) {
        if (key.startsWith('meta\u0000')) this.backendModelRoutes.delete(key);
      }
      for (const key of this.allowedModelRoutes.keys()) {
        if (key.startsWith('meta\u0000')) this.allowedModelRoutes.delete(key);
      }
      const registry = this.hostedHarnessRegistry();
      const harnessesByModel = new Map<string, { id: string; name: string }[]>();
      for (const hostedProvider of catalog.providers) {
        if (!hostedProvider.execution) continue;
        const admitted = admitHostedRoutes({
          provider: 'meta',
          defaultHarnessId: hostedProvider.execution.defaultHarnessId,
          routes: hostedProvider.execution.routes,
          registry,
        });
        const routesByModel = Map.groupBy(admitted.allowedRoutes, ({ model }) => model);
        for (const [model, routes] of routesByModel) {
          this.allowedModelRoutes.set(modelRouteKey('meta', model), routes);
          harnessesByModel.set(
            model,
            routes.map(({ harnessId }) => ({
              id: harnessId,
              name: registry.get(harnessId)?.name ?? harnessId,
            })),
          );
        }
        for (const route of admitted.defaultRoutes) {
          this.backendModelRoutes.set(modelRouteKey('meta', route.model), route);
        }
      }
      const availableHostedProviders = catalog.providers.filter(({ available }) => available);
      const catalogModels = availableHostedProviders.flatMap(({ models }) =>
        models.map(({ id }) => id),
      );
      const model = catalogModels.includes(current.model)
        ? current.model
        : availableHostedProviders[0]?.defaultModel || capabilities.models[0] || current.model;
      if (
        (catalog.providers.length > 0 && availableHostedProviders.length === 0) ||
        !capabilities.available ||
        !capabilities.streaming ||
        !capabilities.tools
      ) {
        this.views[index] = {
          ...current,
          status: 'unavailable',
          detail:
            capabilities.reason ?? 'The included model relay is missing required capabilities.',
        };
        return;
      }
      this.views[index] = {
        ...current,
        model,
        ...(availableHostedProviders.length > 0
          ? {
              models: availableHostedProviders.flatMap((hostedProvider) =>
                hostedProvider.models.map(({ id, name }) => ({
                  id,
                  label: name,
                  description: `${hostedProvider.name} · included with Sia · up to ${hostedProvider.limits.maxOutputTokens.toLocaleString()} output tokens per turn`,
                  reasoningEfforts: [],
                  lab: { id: hostedProvider.id, name: hostedProvider.name },
                  ...((harnessesByModel.get(id)?.length ?? 0) > 1
                    ? { harnesses: harnessesByModel.get(id)! }
                    : {}),
                })),
              ),
            }
          : {}),
        status: 'ready',
        detail:
          availableHostedProviders.length > 0
            ? `${availableHostedProviders.length} model lab${availableHostedProviders.length === 1 ? '' : 's'} verified live`
            : 'Included model verified live; local tools remain on this Mac.',
      };
    } catch {
      this.views[index] = {
        ...current,
        status: 'unavailable',
        detail: 'Sia could not verify the authenticated model relay.',
      };
    }
  }

  /** Release admission, plus any built-in harness a signed testing manifest previews. */
  private hostedHarnessRegistry(): HarnessRegistry {
    const preview = new Set(this.ctx.deps.previewHarnesses);
    return new HarnessRegistry(
      BUILTIN_HARNESS_DEFINITIONS.map((definition) =>
        preview.has(definition.id) ? { ...definition, productionEnabled: true } : definition,
      ),
    );
  }

  /**
   * The lab a rating is filed under: the hosted catalog's lab for an included model, otherwise
   * the provider itself (for example Codex on the person's own plan).
   */
  labFor(providerId: ProviderId, model: string): { id: string; name: string } {
    const provider = this.views.find(({ id }) => id === providerId);
    const lab = provider?.models?.find(({ id }) => id === model)?.lab;
    return lab ? { ...lab } : { id: providerId, name: provider?.label ?? providerId };
  }

  providerReadinessError(providerId: ProviderId, model?: string): string | undefined {
    const provider = this.views.find(({ id }) => id === providerId);
    if (!provider) return 'Provider status is unavailable. Check again before starting.';
    if (
      provider.status === 'ready' &&
      model !== undefined &&
      provider.models?.length &&
      !provider.models.some(({ id }) => id === model)
    ) {
      return provider.models.length === 1
        ? `${provider.label} model must be ${provider.models[0]!.id} in this release.`
        : `${provider.label} does not currently offer model ${model}.`;
    }
    if (
      provider.status === 'ready' &&
      model !== undefined &&
      !provider.models?.length &&
      model !== provider.model
    ) {
      return `${provider.label} model must be ${provider.model} in this release.`;
    }
    if (provider.status === 'ready') return undefined;
    return `${provider.label} is not ready (${provider.status}). ${provider.detail}`;
  }

  requireReadyProvider(providerId: ProviderId, model?: string): ProviderView {
    const error = this.providerReadinessError(providerId, model);
    if (error) throw new Error(error);
    return this.views.find(({ id }) => id === providerId)!;
  }

  providerForModel(model: string): ProviderId {
    const matches = this.views.filter(
      (provider) =>
        provider.status === 'ready' &&
        (provider.model === model ||
          provider.models?.some((candidate) => candidate.id === model)),
    );
    if (matches.length !== 1) {
      throw new Error('Choose an available model before saving this agent.');
    }
    return matches[0]!.id;
  }

  defaultReasoningEffort(providerId: ProviderId, modelId: string): string | undefined {
    return this.views
      .find(({ id }) => id === providerId)
      ?.models?.find(({ id }) => id === modelId)?.defaultReasoningEffort;
  }

  providerUsage(): ProviderUsageView[] {
    const totals = new Map<ProviderId, ProviderUsageView>();
    for (const record of Object.values(this.ctx.state.usageByTurn)) {
      const current = totals.get(record.provider) ?? {
        provider: record.provider,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        lastUsedAt: record.updatedAt,
        providerReported: true as const,
      };
      current.requests += 1;
      current.inputTokens += record.inputTokens;
      current.outputTokens += record.outputTokens;
      current.cachedInputTokens += record.cachedInputTokens;
      if (record.updatedAt > current.lastUsedAt) current.lastUsedAt = record.updatedAt;
      totals.set(record.provider, current);
    }
    return [...totals.values()].sort((left, right) =>
      left.provider.localeCompare(right.provider),
    );
  }
}

function needsManagedInstall(status: ProviderView['status']): boolean {
  return status === 'needs_install' || status === 'incompatible';
}
