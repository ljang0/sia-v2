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

/**
 * A voice's name for a picker. Stock voices show just their name; the provider's catalog words
 * (such as “premade”) are not something a person chose, so only a meaningful kind is added.
 */
export function voiceOptionLabel(voice: {
  name: string;
  category?: string | undefined;
}): string {
  const kind = voice.category?.trim().toLowerCase();
  if (!kind || kind === 'premade') return voice.name;
  if (kind === 'cloned' || kind === 'professional') return `${voice.name} · Your voice`;
  return voice.name;
}
