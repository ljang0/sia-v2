import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import {
  providerSetupHref,
  providerSetupLabel,
  providerStatusLabel,
} from '../../providerSetup';
import type { ProviderId, ProviderSetup } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

export function ProvidersSettings({
  providers,
  onProbe,
  onOpenCloudSettings,
}: {
  providers: ProviderSetup[];
  onProbe(provider: ProviderId): Promise<void>;
  onOpenCloudSettings(): void;
}) {
  const [pending, setPending] = useState<ProviderId>();
  const [error, setError] = useState<string>();
  const [setupOpened, setSetupOpened] = useState<Set<ProviderId>>(() => new Set());

  const probe = async (provider: ProviderSetup) => {
    setPending(provider.id);
    setError(undefined);
    try {
      await onProbe(provider.id);
      setSetupOpened((current) => {
        const next = new Set(current);
        next.delete(provider.id);
        return next;
      });
    } catch (cause) {
      setError(errorMessage(cause, 'The provider could not be checked.'));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <SettingsSectionHeader
      title="Providers"
      description="Sia detects official clients and service availability. Authentication stays in each provider's own flow."
    >
      <InlineSettingsError message={error} />
      <div className={styles.settingsList}>
        {providers.map((provider) => {
          const href = providerSetupHref(provider);
          const opened = setupOpened.has(provider.id);
          return (
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
                  <strong>{provider.name}</strong>
                  <ProviderStatusLabel provider={provider} />
                </div>
                <p>{provider.description}</p>
                <div className={styles.rowMeta}>
                  <span>{provider.billedBy}</span>
                  {provider.account ? <span>{provider.account}</span> : null}
                  {provider.version ? <span>CLI {provider.version}</span> : null}
                </div>
                {provider.restriction ? (
                  <div className={styles.inlineWarning}>
                    <WarningCircle size={15} aria-hidden="true" />
                    {provider.restriction}
                  </div>
                ) : null}
              </div>
              {provider.id === 'meta' && provider.status === 'needs-login' ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={Boolean(pending)}
                  onClick={onOpenCloudSettings}
                >
                  {providerSetupLabel(provider)}
                </button>
              ) : href && !opened ? (
                <a
                  className={`${styles.secondaryButton} ${styles.externalSetupLink}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setSetupOpened((current) => new Set(current).add(provider.id))}
                >
                  {providerSetupLabel(provider)}
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={provider.status === 'disabled' || Boolean(pending)}
                  onClick={() => void probe(provider)}
                >
                  {pending === provider.id
                    ? 'Checking...'
                    : opened
                      ? 'Recheck'
                      : providerSetupLabel(provider)}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </SettingsSectionHeader>
  );
}

function providerMonogram(provider: ProviderId) {
  return {
    codex: 'Cx',
    meta: 'M',
    grok: 'G',
    gemini: 'Ge',
    claude: 'Cl',
  }[provider];
}

function ProviderStatusLabel({ provider }: { provider: ProviderSetup }) {
  return (
    <span className={`${styles.stateLabel} ${styles[`state_${provider.status}`]}`}>
      {provider.status === 'ready' ? <CheckCircle size={14} aria-hidden="true" /> : null}
      {providerStatusLabel(provider)}
    </span>
  );
}
