import { ArrowClockwise, CheckCircle, Key, SpeakerHigh } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { VoiceSettingsState } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

interface VoiceSettingsProps {
  voice: VoiceSettingsState;
  completionSound: boolean;
  onConfigure(apiKey: string): Promise<void>;
  onRefresh(): Promise<void>;
  onSelect(voiceId: string): Promise<void>;
  onDisconnect(): Promise<void>;
  onSetCompletionSound(enabled: boolean): Promise<void>;
}

export function VoiceSettings({
  voice,
  completionSound,
  onConfigure,
  onRefresh,
  onSelect,
  onDisconnect,
  onSetCompletionSound,
}: VoiceSettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [pending, setPending] = useState<
    'connect' | 'refresh' | 'select' | 'disconnect' | 'sound'
  >();
  const [error, setError] = useState<string>();

  const run = async (kind: NonNullable<typeof pending>, action: () => Promise<void>) => {
    setPending(kind);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause, 'Voice could not be updated.'));
    } finally {
      setPending(undefined);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = apiKey.trim();
    if (!value || pending) return;
    void run('connect', async () => {
      await onConfigure(value);
      setApiKey('');
    });
  };

  return (
    <SettingsSectionHeader
      title="Voice"
      description="Dictate a message or hear a reply. Voice audio goes to ElevenLabs only when you use a voice control."
    >
      <InlineSettingsError message={error} />
      <label className={styles.voicePreference}>
        <span>
          <strong>Completion sound</strong>
          <small>Play a quiet local chime when a task finishes.</small>
        </span>
        <input
          type="checkbox"
          checked={completionSound}
          disabled={Boolean(pending)}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            void run('sound', () => onSetCompletionSound(enabled));
          }}
        />
      </label>
      {voice.status === 'connected' ? (
        <div className={styles.voiceConnected}>
          <div className={styles.voiceStatusLine}>
            <span className={styles.voiceMark} aria-hidden="true">
              <SpeakerHigh size={18} />
            </span>
            <div>
              <strong>ElevenLabs connected</strong>
              <span>
                <CheckCircle size={13} aria-hidden="true" />
                {voice.selectedVoiceName ?? 'Voice ready'}
              </span>
            </div>
          </div>

          <label className={styles.voiceSelect}>
            <span>Voice</span>
            <select
              value={voice.selectedVoiceId ?? ''}
              disabled={Boolean(pending)}
              onChange={(event) =>
                void run('select', () => onSelect(event.currentTarget.value))
              }
            >
              {voice.voices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.category ? ` · ${option.category}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.voiceActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={Boolean(pending)}
              onClick={() => void run('refresh', onRefresh)}
            >
              <ArrowClockwise size={14} aria-hidden="true" />
              {pending === 'refresh' ? 'Refreshing…' : 'Refresh voices'}
            </button>
            <button
              type="button"
              className={styles.textButtonDanger}
              disabled={Boolean(pending)}
              onClick={() => void run('disconnect', onDisconnect)}
            >
              {pending === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.voiceSetup} onSubmit={submit}>
          <span className={styles.voiceMark} aria-hidden="true">
            <Key size={18} />
          </span>
          <div className={styles.voiceSetupBody}>
            <strong>Connect your ElevenLabs account</strong>
            <p>Use a restricted key with speech access and a credit limit in ElevenLabs.</p>
            <label className={styles.voiceKeyField}>
              <span>API key</span>
              <div>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  placeholder="Paste API key"
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={Boolean(pending)}
                />
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={!apiKey.trim() || Boolean(pending)}
                >
                  {pending === 'connect' ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </label>
            <p className={styles.voicePrivacyNote}>
              The key is encrypted on this Mac and never shown to an agent.{' '}
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                Create a restricted key
              </a>
            </p>
          </div>
        </form>
      )}
    </SettingsSectionHeader>
  );
}
