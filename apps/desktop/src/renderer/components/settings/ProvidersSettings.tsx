import { CheckCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { providerStatusLabel } from '../../providerSetup';
import type { ProviderId, ProviderSetup } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

const RELEASE_PROVIDERS: ProviderId[] = ['codex', 'meta'];

export function ProvidersSettings({
  providers,
  onProbe,
  onOpenProviderSetup = onProbe,
  onOpenCloudSettings,
}: {
  providers: ProviderSetup[];
  onProbe(provider: ProviderId): Promise<void>;
  onOpenProviderSetup?(provider: ProviderId): Promise<void>;
  onOpenCloudSettings(): void;
}) {
  const [pending, setPending] = useState<ProviderId>();
  const [error, setError] = useState<string>();
  const setup = providers.find(({ id }) => id === 'codex')?.setup;
  const setupBusy = Boolean(setup && setup.phase !== 'error');
  const busy = Boolean(pending) || setupBusy;
  const providerStates = providers.map(({ id, status }) => `${id}:${status}`).join(',');
  useEffect(() => {
    setError(undefined);
  }, [providerStates]);
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
      description="Connect your ChatGPT plan. Sia handles Codex installation, updates, and browser sign-in."
    >
      <InlineSettingsError
        message={error ?? (setup?.phase === 'error' ? setup.message : undefined)}
      />
      <div className={styles.settingsList}>
        {visibleProviders.map((provider) => (
          <div className={styles.settingsRow} key={provider.id}>
            <div
              className={styles.providerGlyph}
              data-provider={provider.id}
              aria-hidden="true"
            >
              {providerMonogram(provider.id)}
            </div>
            <div className={styles.settingsRowBody}>
              <div className={styles.rowTitleLine}>
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
            </div>
            {provider.id === 'meta' && provider.status === 'needs-login' ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={onOpenCloudSettings}
              >
                Sign in
              </button>
            ) : provider.id === 'meta' &&
              (provider.status === 'needs-install' || provider.status === 'incompatible') ? (
              visibleProviders.some(({ id }) => id === 'codex') ? null : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      provider,
                      () => onOpenProviderSetup('codex'),
                      'Codex harness setup could not be opened.',
                    )
                  }
                >
                  {pending === provider.id ? pendingAction(provider) : 'Set up Codex'}
                </button>
              )
            ) : provider.status === 'ready' ||
              provider.status === 'disabled' ? null : provider.status === 'unavailable' ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() =>
                  void run(provider, onProbe, `${providerName(provider)} could not be checked.`)
                }
              >
                {pending === provider.id ? 'Checking…' : 'Try again'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={() =>
                  void run(
                    provider,
                    onOpenProviderSetup,
                    `${providerName(provider)} setup could not be opened.`,
                  )
                }
              >
                {pending === provider.id || (provider.id === 'codex' && setupBusy)
                  ? pendingAction(provider)
                  : setupAction(provider)}
              </button>
            )}
          </div>
        ))}
      </div>
    </SettingsSectionHeader>
  );
}

function providerName(provider: ProviderSetup): string {
  if (provider.id === 'meta') return 'Included model';
  if (provider.id === 'codex') return 'Codex plan';
  return provider.name;
}

function providerDescription(provider: ProviderSetup): string {
  if (provider.status === 'needs-install' || provider.status === 'incompatible')
    return provider.status === 'incompatible'
      ? 'One button updates Codex, restarts Sia, and continues to ChatGPT sign-in. No terminal needed.'
      : 'One button downloads Codex, restarts Sia, and continues to ChatGPT sign-in. No terminal needed.';
  if (provider.id === 'meta')
    return 'Provided with your Sia account. No API key needed; availability may vary during the pilot.';
  if (provider.id === 'codex')
    return provider.status === 'needs-login'
      ? 'Sign in with ChatGPT in your browser. Sia checks the connection automatically.'
      : 'Uses the Codex access in your ChatGPT plan.';
  if (provider.id === 'claude')
    return 'Use the Claude plan already connected to this computer.';
  return provider.description;
}

function providerMonogram(provider: ProviderId): string {
  return { meta: 'M', codex: 'C', claude: 'Cl', grok: 'G', gemini: 'Ge' }[provider];
}

function setupAction(provider: ProviderSetup): string {
  if (
    provider.id === 'codex' ||
    provider.status === 'needs-install' ||
    provider.status === 'incompatible'
  )
    return 'Set up Codex';
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
    <span className={`${styles.stateLabel} ${styles[`state_${provider.status}`]}`}>
      {provider.status === 'ready' ? <CheckCircle size={14} aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
