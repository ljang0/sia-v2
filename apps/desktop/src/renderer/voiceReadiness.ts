import type { VoiceSettingsState } from './types';

export function dictationReady(voice: VoiceSettingsState): boolean {
  const ptt = voice.pushToTalk;
  return (
    voice.status === 'connected' &&
    voice.dictationAvailable !== false &&
    (voice.engine !== 'macos' || voice.speechRecognition === 'allowed') &&
    Boolean(ptt?.enabled && ptt.accessibility && ptt.microphone)
  );
}
