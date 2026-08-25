import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
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
  updates = DEFAULT_UPDATES,
  onCheckForUpdates = async () => undefined,
  onOpenUpdateDownload = async () => undefined,
}: {
  providers: ProviderSetup[];
  onProbe(provider: ProviderId): Promise<void>;
  onOpenCloudSettings(): void;
  updates?: import('../../types').RendererSnapshot['updates'] | undefined;
  onCheckForUpdates?: (() => Promise<void>) | undefined;
  onOpenUpdateDownload?: (() => Promise<void>) | undefined;
}) {
  const [pending, setPending] = useState<ProviderId>();
  const [error, setError] = useState<string>();
  const [setupOpened, setSetupOpened] = useState<Set<ProviderId>>(() => new Set());
  const [updatePending, setUpdatePending] = useState(false);

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
                {provider.usage ? (
                  <div className={styles.providerUsage}>
                    <strong>{provider.usage.requests} requests</strong>
                    <span>{compactNumber(provider.usage.inputTokens)} in</span>
                    <span>{compactNumber(provider.usage.outputTokens)} out</span>
                    <span>{compactNumber(provider.usage.cachedInputTokens)} cached</span>
                    <small>Provider-reported activity · not an invoice</small>
                  </div>
                ) : null}
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
      <div className={styles.settingsList}>
        <div className={styles.settingsRow}>
          <div className={styles.providerGlyph} aria-hidden="true">
            <ArrowClockwise size={18} />
          </div>
          <div className={styles.settingsRowBody}>
            <div className={styles.rowTitleLine}>
              <strong>Desktop updates</strong>
              <span className={styles.stateLabel}>v{updates.currentVersion}</span>
            </div>
            <p>{updates.detail}</p>
            {updates.latestVersion ? (
              <div className={styles.rowMeta}>Latest release: {updates.latestVersion}</div>
            ) : null}
          </div>
          {updates.status === 'available' ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void onOpenUpdateDownload()}
            >
              <DownloadSimple size={15} aria-hidden="true" />
              Download
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={updates.status === 'unconfigured' || updatePending}
              onClick={() => {
                setUpdatePending(true);
                void onCheckForUpdates().finally(() => setUpdatePending(false));
              }}
            >
              {updatePending ? 'Checking…' : 'Check now'}
            </button>
          )}
        </div>
      </div>
    </SettingsSectionHeader>
  );
}

const DEFAULT_UPDATES: import('../../types').RendererSnapshot['updates'] = {
  status: 'unconfigured',
  currentVersion: 'unknown',
  detail: 'This build does not expose an update feed.',
};

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
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
