import { Key } from '@phosphor-icons/react';
import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '../../plainErrors';
import type { ProviderSetup } from '../../types';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import settings from './SettingsShared.module.css';
import styles from './ProvidersSettings.module.css';

export interface ApiKeyInput {
  baseUrl?: string;
  model: string;
  apiKey: string;
}

/**
 * Optional: run agents on a model the person pays for with their own API key. The key goes to
 * Sia's main process once and is never shown again; only the model and endpoint host come back.
 */
export function ByokSettings({
  provider,
  codexMissing,
  onSave,
  onClear,
}: {
  provider: ProviderSetup | undefined;
  /** Your own model still runs through Codex, so Codex must be installed. */
  codexMissing: boolean;
  onSave(input: ApiKeyInput): Promise<void>;
  onClear(): Promise<void>;
}) {
  const formId = useId();
  const configured = provider?.status === 'ready';
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState<'save' | 'clear'>();
  const [error, setError] = useState<string>();

  const close = () => {
    setEditing(false);
    setApiKey('');
    setError(undefined);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending('save');
    setError(undefined);
    try {
      await onSave({ ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), model, apiKey });
      close();
    } catch (cause) {
      setError(errorMessage(cause, 'That key could not be saved.'));
    } finally {
      // The key is cleared from the form either way; it is never kept in renderer state.
      setApiKey('');
      setPending(undefined);
    }
  };
  const clear = async () => {
    setPending('clear');
    setError(undefined);
    try {
      await onClear();
    } catch (cause) {
      setError(errorMessage(cause, 'That key could not be removed.'));
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className={settings.settingsRow}>
      <div
        className={settings.providerGlyph}
        data-provider="byok"
        data-ready={configured}
        aria-hidden="true"
      >
        <Key size={17} />
      </div>
      <div className={settings.settingsRowBody}>
        <div className={settings.rowTitleLine}>
          <strong>Your own API key</strong>
          <span className={settings.stateLabel}>{configured ? 'Saved' : 'Optional'}</span>
        </div>
        <p>
          {configured
            ? `Uses ${provider.model} at ${provider.account ?? 'your provider'}. Your provider bills this key.`
            : 'Use a model from any provider with an OpenAI-compatible Responses API. Your key stays encrypted on this Mac.'}
        </p>
        {codexMissing ? (
          <p className={styles.providerUsage}>Set up Codex above first; it runs your model.</p>
        ) : null}
        {editing ? (
          <form
            className={styles.byokForm}
            onSubmit={(event) => void save(event)}
            aria-label="Add your own API key"
          >
            <label className={dialogs.field}>
              <span>Model</span>
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-5"
                autoComplete="off"
                spellCheck={false}
                disabled={Boolean(pending)}
                required
              />
            </label>
            <label className={dialogs.field}>
              <span>API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={Boolean(pending)}
                required
              />
            </label>
            <label className={dialogs.field}>
              <span>Endpoint (optional)</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com/v1"
                autoComplete="off"
                spellCheck={false}
                disabled={Boolean(pending)}
                aria-describedby={`${formId}-endpoint`}
              />
              <small id={`${formId}-endpoint`}>
                Leave empty for OpenAI. Labs give you their own address.
              </small>
            </label>
            <div className={settings.rowTitleLine}>
              <button
                type="submit"
                className={buttons.primaryButton}
                disabled={Boolean(pending)}
              >
                {pending === 'save' ? 'Checking key…' : 'Save key'}
              </button>
              <button
                type="button"
                className={buttons.secondaryButton}
                disabled={Boolean(pending)}
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        {error ? (
          <p className={styles.byokError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
      {editing ? null : configured ? (
        <span className={settings.rowTitleLine}>
          <button
            type="button"
            className={buttons.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() => setEditing(true)}
          >
            Change
          </button>
          <button
            type="button"
            className={buttons.secondaryButton}
            disabled={Boolean(pending)}
            onClick={() => void clear()}
          >
            {pending === 'clear' ? 'Removing…' : 'Remove'}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={buttons.secondaryButton}
          onClick={() => setEditing(true)}
        >
          Add key
        </button>
      )}
    </div>
  );
}
