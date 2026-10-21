import { CheckCircle, Gift, Plug, Sparkle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { errorMessage, usageLeftText } from '../../plainErrors';
import { providerStatusLabel } from '../../providerSetup';
import type { ProviderId, ProviderSetup } from '../../types';
import buttons from '../../styles/buttons.module.css';
import settings from './SettingsShared.module.css';
import styles from './ProvidersSettings.module.css';
import { InlineSettingsError, SettingsSectionHeader } from './SettingsShared';
import { ByokSettings, type ApiKeyInput } from './ByokSettings';

// `lab` appears only in a testing build started with a signed lab harness manifest.
const RELEASE_PROVIDERS: ProviderId[] = ['codex', 'meta', 'lab'];

export function ProvidersSettings({
  providers,
  onProbe,
  onOpenProviderSetup = onProbe,
  onCancelProviderSetup,
  onOpenCloudSettings,
  onSaveApiKey,
  onClearApiKey,
}: {
  providers: ProviderSetup[];
  onProbe(provider: ProviderId): Promise<void>;
  onOpenProviderSetup?(provider: ProviderId): Promise<void>;
  /** Stops a ChatGPT sign-in that is still waiting in the browser. */
  onCancelProviderSetup?(provider: ProviderId): Promise<void>;
  onOpenCloudSettings(): void;
  /** Present only in Settings: your own API key is an advanced option, not part of setup. */
  onSaveApiKey?(input: ApiKeyInput): Promise<void>;
  onClearApiKey?(): Promise<void>;
}) {
  const [pending, setPending] = useState<ProviderId>();
  const [error, setError] = useState<string>();
  // One engine install serves every choice that runs on it, so its progress blocks them all.
  const setup = providers.find((provider) => provider.setup)?.setup;
  const setupBusy = Boolean(setup && setup.phase !== 'error');
  const busy = Boolean(pending) || setupBusy;
  const providerStates = providers.map(({ id, status }) => `${id}:${status}`).join(',');
  useEffect(() => {
    setError(undefined);
  }, [providerStates]);
  const byok = providers.find(({ id }) => id === 'byok');
  const visibleProviders = RELEASE_PROVIDERS.flatMap((providerId) => {
    const provider = providers.find((candidate) => candidate.id === providerId);
    return provider ? [provider] : [];
  });

  const run = async (
    provider: ProviderSetup,
    action: (provider: ProviderId) => Promise<void>,
    fallback: string,
  ) => {
    setPending(provider.id);
    setError(undefined);
    try {
      await action(provider.id);
    } catch (cause) {
      setError(errorMessage(cause, fallback));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <SettingsSectionHeader
      title="AI access"
      description="The AI that does the work for your agents. Use the one that comes with your Sia account, or connect your ChatGPT plan. Sia installs and updates everything for you."
    >
      <InlineSettingsError
        message={error ?? (setup?.phase === 'error' ? setup.message : undefined)}
      />
      <div className={settings.settingsList}>
        {visibleProviders.map((provider) => (
          <div className={settings.settingsRow} key={provider.id}>
            <div
              className={settings.providerGlyph}
              data-provider={provider.id}
              data-ready={provider.status === 'ready'}
              aria-hidden="true"
            >
              <ProviderIcon provider={provider.id} />
            </div>
            <div className={settings.settingsRowBody}>
              <div className={settings.rowTitleLine}>
                <strong>{providerName(provider)}</strong>
                <ProviderStatusLabel provider={provider} />
              </div>
              {provider.setup && provider.setup.phase !== 'error' ? (
                <p role="status" aria-live="polite">
                  {provider.setup.message}
                </p>
              ) : (
                <p>{providerDescription(provider)}</p>
              )}
              {provider.id === 'codex' &&
              (provider.status === 'needs-install' || provider.status === 'incompatible') ? (
                // The technical name stays available for people who want it, off the main path.
                <details className={styles.providerDetails}>
                  <summary>Details</summary>
                  <p>Sia installs OpenAI’s Codex app, which connects to your ChatGPT plan.</p>
                </details>
              ) : null}
              {provider.limits && provider.status === 'ready' ? (
                <p className={styles.providerUsage}>
                  Plan usage: {usageLeftText(provider.limits)}
                </p>
              ) : null}
            </div>
            {provider.id === 'meta' && provider.status === 'needs-login' ? (
              <button
                type="button"
                className={buttons.primaryButton}
                disabled={busy}
                onClick={onOpenCloudSettings}
              >
                Sign in
              </button>
            ) : provider.status === 'ready' ||
              provider.status === 'disabled' ? null : provider.status === 'unavailable' ? (
              <button
                type="button"
                className={buttons.secondaryButton}
                disabled={busy}
                onClick={() =>
                  void run(provider, onProbe, `${providerName(provider)} could not be checked.`)
                }
              >
                {pending === provider.id ? 'Checking…' : 'Try again'}
              </button>
            ) : provider.setup?.phase === 'signing-in' && onCancelProviderSetup ? (
              // A browser sign-in can stall (closed tab, wrong account). Cancel starts over.
              <span className={settings.rowTitleLine}>
                <button type="button" className={buttons.primaryButton} disabled>
                  {pendingAction(provider)}
                </button>
                <button
                  type="button"
                  className={buttons.secondaryButton}
                  onClick={() => {
                    setError(undefined);
                    void onCancelProviderSetup(provider.id).catch((cause: unknown) =>
                      setError(errorMessage(cause, 'Sign-in could not be cancelled.')),
                    );
                  }}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={buttons.primaryButton}
                disabled={busy}
                onClick={() =>
                  void run(
                    provider,
                    onOpenProviderSetup,
                    `${providerName(provider)} setup could not be opened.`,
                  )
                }
              >
                {pending === provider.id || (provider.setup && provider.setup.phase !== 'error')
                  ? pendingAction(provider)
                  : provider.setup?.phase === 'error'
                    ? 'Try again'
                    : setupAction(provider)}
              </button>
            )}
          </div>
        ))}
      </div>
      {onSaveApiKey && onClearApiKey && byok ? (
        // Bringing your own key is for people who already have one, so it stays out of the way.
        <details
          className={settings.settingsDisclosure}
          open={byok.status === 'ready' || undefined}
        >
          <summary>
            <span>Advanced</span>
            <small>Use your own key from an AI company</small>
          </summary>
          <ByokSettings
            provider={byok}
            codexMissing={providers.some(
              ({ id, status }) =>
                id === 'codex' && (status === 'needs-install' || status === 'incompatible'),
            )}
            onSave={onSaveApiKey}
            onClear={onClearApiKey}
          />
        </details>
      ) : null}
    </SettingsSectionHeader>
  );
}

function providerName(provider: ProviderSetup): string {
  if (provider.id === 'meta') return 'Included AI';
  if (provider.id === 'codex') return 'ChatGPT plan';
  return provider.name;
}

function providerDescription(provider: ProviderSetup): string {
  // Included AI runs on the same engine as the ChatGPT plan, but needs no ChatGPT account.
  if (
    provider.id === 'meta' &&
    (provider.status === 'needs-install' || provider.status === 'incompatible')
  )
    return 'Sia needs to finish setting up its AI engine. One click installs it and restarts Sia.';
  if (provider.status === 'needs-install' || provider.status === 'incompatible')
    return provider.status === 'incompatible'
      ? 'Connect your ChatGPT plan. One click updates ChatGPT support, restarts Sia, and opens ChatGPT sign-in.'
      : 'Connect your ChatGPT plan. One click sets it up, restarts Sia, and opens ChatGPT sign-in.';
  if (provider.id === 'meta') {
    const labs = [
      ...new Set(
        (provider.models ?? []).flatMap(({ lab }) =>
          lab && lab.name !== 'Included model' ? [lab.name] : [],
        ),
      ),
    ];
    const from = labs.length ? ` Models from ${new Intl.ListFormat('en').format(labs)}.` : '';
    return `Comes with your Sia account, with nothing to set up.${from} Availability may vary.`;
  }
  if (provider.id === 'codex')
    return provider.status === 'needs-login'
      ? 'Sign in to ChatGPT in your browser. Sia checks the connection for you.'
      : 'Uses your ChatGPT subscription.';
  if (provider.id === 'claude')
    return 'Use the Claude plan already connected to this computer.';
  return provider.description;
}

/** Plain, brand-neutral marks: a gift for the included model, a plug for a connected plan. */
function ProviderIcon({ provider }: { provider: ProviderId }) {
  if (provider === 'meta') return <Gift size={20} />;
  if (provider === 'codex') return <Plug size={20} />;
  return <Sparkle size={20} />;
}

function setupAction(provider: ProviderSetup): string {
  if (provider.id === 'meta') return 'Finish setup';
  if (
    provider.id === 'codex' ||
    provider.status === 'needs-install' ||
    provider.status === 'incompatible'
  )
    return 'Connect ChatGPT';
  return 'Connect';
}

function pendingAction(provider: ProviderSetup): string {
  if (provider.setup?.phase === 'restarting') return 'Restarting…';
  if (provider.setup?.phase === 'signing-in') return 'Waiting for sign-in…';
  if (provider.setup?.phase === 'checking') return 'Checking connection…';
  if (provider.status === 'needs-install') return 'Installing…';
  if (provider.status === 'incompatible') return 'Updating…';
  return provider.id === 'codex' && provider.status === 'needs-login'
    ? 'Waiting for sign-in…'
    : 'Opening…';
}

function ProviderStatusLabel({ provider }: { provider: ProviderSetup }) {
  const label =
    provider.setup && provider.setup.phase !== 'error'
      ? {
          installing: 'Setting up',
          restarting: 'Restarting',
          'signing-in': 'Signing in',
          checking: 'Checking',
        }[provider.setup.phase]
      : provider.status === 'ready'
        ? provider.id === 'meta'
          ? 'Ready'
          : 'Connected'
        : providerStatusLabel(provider);
  return (
    <span className={`${settings.stateLabel} ${settings[`state_${provider.status}`]}`}>
      {provider.status === 'ready' ? <CheckCircle size={16} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
