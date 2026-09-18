import { ArrowClockwise, CheckCircle, ShieldCheck, SpeakerHigh } from '@phosphor-icons/react';
import { useState } from 'react';
import type { VoiceSettingsState } from '../../types';
import styles from '../../ui.module.css';
import { errorMessage, InlineSettingsError, SettingsSectionHeader } from './SettingsShared';

interface VoiceSettingsProps {
  voice: VoiceSettingsState;
  completionSound: boolean;
  agents?: readonly { id: string; name: string }[];
  onConfigurePushToTalk?:
    ((enabled: boolean, agentId?: string, speakReplies?: boolean) => Promise<void>) | undefined;
  onStartSetup?: (() => void) | undefined;
  onConfigure(): Promise<void>;
  onRefresh(): Promise<void>;
  onSelect(voiceId: string): Promise<void>;
  onDisconnect(): Promise<void>;
  onSetCompletionSound(enabled: boolean): Promise<void>;
}

export function VoiceSettings({
  voice,
  completionSound,
  agents = [],
  onConfigurePushToTalk,
  onStartSetup,
  onConfigure,
  onRefresh,
  onSelect,
  onDisconnect,
  onSetCompletionSound,
}: VoiceSettingsProps) {
  const [pending, setPending] = useState<
    'connect' | 'refresh' | 'select' | 'disconnect' | 'sound' | 'push-to-talk'
  >();
  const [error, setError] = useState<string>();
  const [voiceAgent, setVoiceAgent] = useState(voice.pushToTalk?.agentId ?? '');
  const agentId = voiceAgent || agents[0]?.id;
  const pushToTalk = voice.pushToTalk;
  const nativeVoice = voice.engine === 'macos';

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
      description={
        nativeVoice
          ? 'Hear replies with the voices installed on your Mac. Supported dictation is processed on this Mac.'
          : 'Dictate a message or hear a reply. Voice audio goes to ElevenLabs only when you use a voice control.'
      }
    >
      <InlineSettingsError message={error} />
      {onStartSetup ? (
        <button className={styles.secondaryButton} onClick={onStartSetup}>
          Walk me through setup
        </button>
      ) : null}
      {voice.status === 'connected' ? (
        <div className={styles.voiceConnected}>
          <div className={styles.voiceStatusLine}>
            <span className={styles.voiceMark} aria-hidden="true">
              <SpeakerHigh size={18} />
            </span>
            <div>
              <strong>{nativeVoice ? 'Read aloud ready' : 'ElevenLabs voice ready'}</strong>
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
            <strong>
              {nativeVoice ? 'Use your Mac’s built-in voice' : 'Use ElevenLabs voice'}
            </strong>
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
              {nativeVoice
                ? 'Read aloud needs no microphone permission, cloud account, or API key. Dictation requires separate Speech Recognition permission and an available on-device recognizer.'
                : 'Audio is sent only when you dictate, hold Fn, or choose Read aloud. You can turn voice off at any time.'}
            </p>
          </div>
        </div>
      )}
      {pushToTalk && onConfigurePushToTalk ? (
        <div className={styles.voiceShortcut}>
          <div className={styles.voiceSetupBody}>
            {voice.dictationDetail ? (
              <p className={styles.voicePrivacyNote} role="status">
                {voice.dictationDetail}
              </p>
            ) : null}
            <label className={styles.voicePreference}>
              <span>
                <strong>Hold Fn to talk to Sia</strong>
                <small>
                  Hold until the screen edges glow, speak, then release to send. Escape cancels.
                </small>
              </span>
              <input
                type="checkbox"
                checked={pushToTalk.enabled}
                disabled={
                  Boolean(pending) ||
                  (!pushToTalk.enabled &&
                    (!pushToTalk.available ||
                      voice.status !== 'connected' ||
                      voice.dictationAvailable === false ||
                      !agentId))
                }
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  void run('push-to-talk', () => onConfigurePushToTalk(enabled, agentId));
                }}
              />
            </label>
            <label className={styles.voicePreference}>
              <span>
                <strong>Speak Fn replies</strong>
                <small>
                  Hear a brief result without opening Sia. Hold Fn or press Escape to stop it.
                </small>
              </span>
              <input
                type="checkbox"
                checked={pushToTalk.speakReplies !== false}
                disabled={Boolean(pending) || !pushToTalk.enabled}
                onChange={(event) => {
                  const speakReplies = event.currentTarget.checked;
                  void run('push-to-talk', () =>
                    onConfigurePushToTalk(pushToTalk.enabled, agentId, speakReplies),
                  );
                }}
              />
            </label>
            <label className={styles.voiceSelect}>
              <span>Voice agent when Sia is in the background</span>
              <select
                value={agentId ?? ''}
                disabled={Boolean(pending) || !agents.length}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setVoiceAgent(next);
                  if (pushToTalk.enabled)
                    void run('push-to-talk', () => onConfigurePushToTalk(true, next));
                }}
              >
                {!agents.length ? <option value="">Create an agent first</option> : null}
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.voicePrivacyNote}>
              Uses the current conversation while Sia is focused, or starts a new conversation
              with your voice agent in the background. Sia must stay open. Microphone and
              Accessibility access are required
              {nativeVoice ? ', along with Speech Recognition permission' : ''}; screen
              recording is not used.
            </p>
            {pushToTalk.detail ? <p role="status">{pushToTalk.detail}</p> : null}
            {!pushToTalk.available ? (
              <p>Fn push-to-talk is available in the macOS app.</p>
            ) : null}
          </div>
        </div>
      ) : null}
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
    </SettingsSectionHeader>
  );
}
