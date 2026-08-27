import { ArrowClockwise, CheckCircle, ShieldCheck, SpeakerHigh } from '@phosphor-icons/react';
import { useState } from 'react';
import type { VoiceSettingsState } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

interface VoiceSettingsProps {
  voice: VoiceSettingsState;
  completionSound: boolean;
  onConfigure(): Promise<void>;
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
              <strong>Included voice ready</strong>
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
              {pending === 'disconnect' ? 'Turning off…' : 'Turn off'}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.voiceSetup}>
          <span className={styles.voiceMark} aria-hidden="true">
            <ShieldCheck size={18} />
          </span>
          <div className={styles.voiceSetupBody}>
            <strong>Voice is included with Sia</strong>
            <p>
              {voice.detail ?? 'Sign in to use dictation and read aloud. No API key is needed.'}
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={Boolean(pending)}
              onClick={() => void run('connect', onConfigure)}
            >
              {pending === 'connect' ? 'Enabling…' : 'Enable voice'}
            </button>
            <p className={styles.voicePrivacyNote}>
              Sia mints a single-use voice session only after you choose Dictate or Read aloud.
              Long-lived provider credentials never reach this Mac or an agent.
            </p>
          </div>
        </div>
      )}
    </SettingsSectionHeader>
  );
}
