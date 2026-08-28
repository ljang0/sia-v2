import { CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
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
      description="Codex is recommended for the pilot. The included model is available when its provider is healthy."
    >
      <InlineSettingsError message={error} />
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
              <p>{providerDescription(provider)}</p>
            </div>
            {provider.id === 'meta' && provider.status === 'needs-login' ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={Boolean(pending)}
                onClick={onOpenCloudSettings}
              >
                Sign in
              </button>
            ) : provider.id === 'meta' &&
              (provider.status === 'needs-install' || provider.status === 'incompatible') ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={Boolean(pending)}
                onClick={() =>
                  void run(
                    provider,
                    () => onOpenProviderSetup('codex'),
                    'Codex harness setup could not be opened.',
                  )
                }
              >
                {pending === provider.id
                  ? 'Opening…'
                  : provider.status === 'incompatible'
                    ? 'Update Codex harness'
                    : 'Install Codex harness'}
              </button>
            ) : provider.status === 'ready' ||
              provider.status === 'disabled' ? null : provider.status === 'unavailable' ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={Boolean(pending)}
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
                disabled={Boolean(pending)}
                onClick={() =>
                  void run(
                    provider,
                    onOpenProviderSetup,
                    `${providerName(provider)} setup could not be opened.`,
                  )
                }
              >
                {pending === provider.id ? pendingAction(provider) : setupAction(provider)}
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
  if (provider.id === 'meta')
    return 'Provided with your Sia account. No API key needed; availability may vary during the pilot.';
  if (provider.id === 'codex')
    return 'Recommended for the pilot. Uses the Codex access in your ChatGPT plan.';
  if (provider.id === 'claude')
    return 'Use the Claude plan already connected to this computer.';
  return provider.description;
}

function providerMonogram(provider: ProviderId): string {
  return { meta: 'M', codex: 'C', claude: 'Cl', grok: 'G', gemini: 'Ge' }[provider];
}

function setupAction(provider: ProviderSetup): string {
  if (provider.status === 'needs-install') return 'Install Codex';
  if (provider.status === 'incompatible') return 'Update Codex';
  if (provider.id === 'codex' && provider.status === 'needs-login')
    return 'Sign in with ChatGPT';
  return 'Connect';
}

function pendingAction(provider: ProviderSetup): string {
  return provider.id === 'codex' && provider.status === 'needs-login'
    ? 'Waiting for sign-in…'
    : 'Opening…';
}

function ProviderStatusLabel({ provider }: { provider: ProviderSetup }) {
  const label =
    provider.status === 'ready'
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
