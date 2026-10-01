import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../../plainErrors';

export interface SpeechState {
  eventId?: string;
  phase: 'idle' | 'loading' | 'playing';
  error?: string;
}

type Speak = (
  text: string,
) => Promise<{ audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' }>;

/** Reads one reply aloud at a time; a newer request or a stop cancels the one in flight. */
export function useReadAloud(onSpeak: Speak | undefined) {
  const speechGeneration = useRef(0);
  const speechSource = useRef<AudioBufferSourceNode | undefined>(undefined);
  const speechContext = useRef<AudioContext | undefined>(undefined);
  const [speech, setSpeech] = useState<SpeechState>({ phase: 'idle' });

  /** Silences playback and invalidates pending requests without touching state (for cleanup). */
  const cancelSpeech = useCallback(() => {
    speechGeneration.current += 1;
    releaseSpeech(speechSource, speechContext);
  }, []);

  const stopSpeech = useCallback(() => {
    cancelSpeech();
    setSpeech({ phase: 'idle' });
  }, [cancelSpeech]);

  const toggleSpeech = async (eventId: string, text: string) => {
    if (speech.eventId === eventId && speech.phase !== 'idle') {
      stopSpeech();
      return;
    }
    if (!onSpeak) return;

    speechGeneration.current += 1;
    const generation = speechGeneration.current;
    releaseSpeech(speechSource, speechContext);
    setSpeech({ eventId, phase: 'loading' });
    try {
      const result = await onSpeak(text);
      if (generation !== speechGeneration.current) return;
      const bytes = base64Bytes(result.audioBase64);
      const context = new AudioContext();
      speechContext.current = context;
      await context.resume();
      const buffer = await context.decodeAudioData(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
      if (generation !== speechGeneration.current) {
        void context.close();
        return;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.addEventListener(
        'ended',
        () => {
          if (generation !== speechGeneration.current) return;
          speechSource.current = undefined;
          speechContext.current = undefined;
          setSpeech({ phase: 'idle' });
          void context.close();
        },
        { once: true },
      );
      speechSource.current = source;
      setSpeech({ eventId, phase: 'playing' });
      source.start();
    } catch (cause) {
      if (generation !== speechGeneration.current) return;
      releaseSpeech(speechSource, speechContext);
      setSpeech({
        eventId,
        phase: 'idle',
        error: errorMessage(cause, 'Speech could not be played.'),
      });
    }
  };

  return { speech, toggleSpeech, stopSpeech, cancelSpeech };
}

function base64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function releaseSpeech(
  sourceRef: { current: AudioBufferSourceNode | undefined },
  contextRef: { current: AudioContext | undefined },
) {
  const source = sourceRef.current;
  const context = contextRef.current;
  sourceRef.current = undefined;
  contextRef.current = undefined;
  try {
    source?.stop();
  } catch {
    // A source may already have ended.
  }
  if (context) void context.close();
}

/** A short rising tone when a task finishes. */
export function playCompletionChime() {
  if (typeof AudioContext === 'undefined') return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587, start);
    oscillator.frequency.exponentialRampToValueAtTime(784, start + 0.12);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
    oscillator.start(start);
    oscillator.stop(start + 0.3);
    void context.resume().catch(() => context.close());
  } catch {
    // Sound is optional; visual completion feedback remains available.
  }
}
