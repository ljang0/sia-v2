import { type RefObject, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../plainErrors';
import {
  blobBase64,
  microphoneLevel,
  pcm16Base64,
  preferredRecordingMimeType,
  releaseRealtimeAudio,
  rootMeanSquare,
} from './voiceAudio';

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing';

interface VoiceCaptureOptions {
  voiceEnabled: boolean;
  realtimeDictation: boolean;
  onAcquireVoiceCapture?: (() => Promise<string>) | undefined;
  onReleaseVoiceCapture?: ((leaseId: string) => Promise<void>) | undefined;
  onTranscribe?: ((audioBase64: string, mimeType: string) => Promise<string>) | undefined;
  onStartRealtime?: (() => Promise<string>) | undefined;
  onAppendRealtime?: ((sessionId: string, audioBase64: string) => Promise<void>) | undefined;
  onStopRealtime?: ((sessionId: string, commit: boolean) => Promise<string>) | undefined;
  voiceConversation: boolean;
  voiceCanListen: boolean;
  onVoiceConversationChange?: ((active: boolean) => void) | undefined;
  /** The composer can take no voice input right now (disabled, running, or sending). */
  disabled: boolean | undefined;
  running: boolean | undefined;
  sending: boolean;
  textArea: RefObject<HTMLTextAreaElement | null>;
  /** A voice-conversation turn: send what was said. */
  onSend(content: string, attachmentIds?: readonly string[]): Promise<void> | void;
  /** Dictation: add what was said to the draft. */
  onDictated(transcript: string): void;
}

/**
 * The composer's microphone: dictation into the draft (recorded, or streamed live when
 * realtime dictation is on) and hands-free voice conversation that stops on silence.
 */
export function useVoiceCapture({
  voiceEnabled,
  realtimeDictation,
  onAcquireVoiceCapture,
  onReleaseVoiceCapture,
  onTranscribe,
  onStartRealtime,
  onAppendRealtime,
  onStopRealtime,
  voiceConversation,
  voiceCanListen,
  onVoiceConversationChange,
  disabled,
  running,
  sending,
  textArea,
  onSend,
  onDictated,
}: VoiceCaptureOptions) {
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [voiceError, setVoiceError] = useState<string>();
  const [voiceLevel, setVoiceLevel] = useState(0);
  const captureGeneration = useRef(0);
  const captureStarting = useRef(false);
  const captureLease = useRef<string | undefined>(undefined);
  const releaseCaptureHandler = useRef(onReleaseVoiceCapture);
  releaseCaptureHandler.current = onReleaseVoiceCapture;
  const releaseCapture = () => {
    const leaseId = captureLease.current;
    captureLease.current = undefined;
    if (leaseId) void releaseCaptureHandler.current?.(leaseId).catch(() => undefined);
  };
  const mediaRecorder = useRef<MediaRecorder | undefined>(undefined);
  const mediaStream = useRef<MediaStream | undefined>(undefined);
  const recordingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordingPurpose = useRef<'dictation' | 'conversation'>('dictation');
  const discardRecording = useRef(false);
  const voiceRestartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const analyserFrame = useRef<number | undefined>(undefined);
  const analyserContext = useRef<AudioContext | undefined>(undefined);
  const audioChunks = useRef<Blob[]>([]);
  const realtimeSession = useRef<string | undefined>(undefined);
  const realtimeContext = useRef<AudioContext | undefined>(undefined);
  const realtimeSource = useRef<MediaStreamAudioSourceNode | undefined>(undefined);
  const realtimeProcessor = useRef<ScriptProcessorNode | undefined>(undefined);
  const realtimeGain = useRef<GainNode | undefined>(undefined);
  const realtimeAppend = useRef<Promise<void>>(Promise.resolve());
  const realtimeFailure = useRef<unknown>(undefined);
  const realtimeFinishing = useRef(false);
  const realtimeStopHandler = useRef(onStopRealtime);
  const voiceLevelRef = useRef(0);
  realtimeStopHandler.current = onStopRealtime;

  const updateVoiceLevel = (rms: number) => {
    const next = microphoneLevel(rms);
    if (next === voiceLevelRef.current) return;
    voiceLevelRef.current = next;
    setVoiceLevel(next);
  };

  const resetVoiceLevel = () => {
    voiceLevelRef.current = 0;
    setVoiceLevel(0);
  };

  useEffect(
    () => () => {
      captureGeneration.current += 1;
      discardRecording.current = true;
      if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
      if (voiceRestartTimer.current) clearTimeout(voiceRestartTimer.current);
      if (analyserFrame.current !== undefined) cancelAnimationFrame(analyserFrame.current);
      void analyserContext.current?.close();
      releaseRealtimeAudio(realtimeProcessor, realtimeSource, realtimeGain, realtimeContext);
      const sessionId = realtimeSession.current;
      if (sessionId)
        void realtimeStopHandler.current?.(sessionId, false).catch(() => undefined);
      if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      if (!captureStarting.current) releaseCapture();
    },
    [],
  );

  useEffect(() => {
    if (
      !voiceConversation ||
      !voiceCanListen ||
      !voiceEnabled ||
      voiceError ||
      disabled ||
      running ||
      sending ||
      voicePhase !== 'idle'
    ) {
      return;
    }
    voiceRestartTimer.current = setTimeout(() => void beginRecording('conversation'), 250);
    return () => {
      if (voiceRestartTimer.current) clearTimeout(voiceRestartTimer.current);
      voiceRestartTimer.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- beginRecording is recreated every render.
  }, [
    disabled,
    running,
    sending,
    voiceCanListen,
    voiceConversation,
    voiceEnabled,
    voiceError,
    voicePhase,
  ]);

  const beginRecording = async (purpose: 'dictation' | 'conversation' = 'dictation') => {
    if (
      !onTranscribe ||
      disabled ||
      running ||
      sending ||
      voicePhase !== 'idle' ||
      captureStarting.current
    )
      return;
    setVoiceError(undefined);
    const useRealtime =
      (purpose === 'conversation' || realtimeDictation) &&
      Boolean(onStartRealtime && onAppendRealtime && onStopRealtime);
    if (realtimeDictation && !useRealtime) {
      setVoiceError('Live dictation is unavailable. Restart Sia and try again.');
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      (useRealtime && typeof AudioContext === 'undefined') ||
      (!useRealtime && typeof MediaRecorder === 'undefined')
    ) {
      setVoiceError('Microphone recording is unavailable on this Mac.');
      return;
    }
    const generation = ++captureGeneration.current;
    captureStarting.current = true;
    recordingPurpose.current = purpose;
    setVoicePhase('starting');
    try {
      if (onAcquireVoiceCapture) {
        const leaseId = await onAcquireVoiceCapture();
        if (captureGeneration.current !== generation) {
          void releaseCaptureHandler.current?.(leaseId).catch(() => undefined);
          return;
        }
        captureLease.current = leaseId;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        video: false,
      });
      if (captureGeneration.current !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        releaseCapture();
        return;
      }
      mediaStream.current = stream;
      if (useRealtime && onStartRealtime && onAppendRealtime && onStopRealtime) {
        await beginRealtimeRecording(
          stream,
          onStartRealtime,
          onAppendRealtime,
          onStopRealtime,
          generation,
        );
        return;
      }
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      discardRecording.current = false;
      audioChunks.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) audioChunks.current.push(event.data);
      });
      recorder.addEventListener(
        'stop',
        () => void finishRecording(recorder.mimeType || mimeType || 'audio/webm'),
        { once: true },
      );
      recorder.start();
      setVoicePhase('recording');
      recordingTimeout.current = setTimeout(stopRecording, 60_000);
      if (typeof AudioContext !== 'undefined') monitorAudio(stream, purpose === 'conversation');
    } catch (cause) {
      releaseCapture();
      if (captureGeneration.current === generation) {
        onVoiceConversationChange?.(false);
        setVoicePhase('idle');
      }
      const sessionId = realtimeSession.current;
      realtimeSession.current = undefined;
      releaseRealtimeAudio(realtimeProcessor, realtimeSource, realtimeGain, realtimeContext);
      if (sessionId) void onStopRealtime?.(sessionId, false).catch(() => undefined);
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      mediaStream.current = undefined;
      if (captureGeneration.current === generation) {
        setVoiceError(
          cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? 'Allow microphone access in System Settings to dictate.'
            : cause instanceof Error
              ? cause.message
              : 'Sia could not start the microphone.',
        );
      }
    } finally {
      captureStarting.current = false;
    }
  };

  const stopRecording = (discard = false) => {
    if (realtimeSession.current) {
      void stopRealtimeRecording(!discard);
      return;
    }
    discardRecording.current ||= discard;
    if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
    recordingTimeout.current = undefined;
    stopAnalyser();
    if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
  };

  const beginRealtimeRecording = async (
    stream: MediaStream,
    start: () => Promise<string>,
    append: (sessionId: string, audioBase64: string) => Promise<void>,
    stop: (sessionId: string, commit: boolean) => Promise<string>,
    generation: number,
  ) => {
    mediaStream.current = stream;
    const sessionId = await start();
    if (captureGeneration.current !== generation) {
      stream.getTracks().forEach((track) => track.stop());
      await stop(sessionId, false).catch(() => undefined);
      releaseCapture();
      return;
    }
    realtimeSession.current = sessionId;
    realtimeAppend.current = Promise.resolve();
    realtimeFailure.current = undefined;
    realtimeFinishing.current = false;

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    // AudioWorklets created from blobs are incompatible with the renderer CSP. This
    // legacy node stays renderer-local and only converts microphone PCM to 16 kHz.
    const processor = context.createScriptProcessor(4_096, 1, 1);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);
    realtimeContext.current = context;
    realtimeSource.current = source;
    realtimeProcessor.current = processor;
    realtimeGain.current = gain;

    const startedAt = performance.now();
    let heardSpeech = false;
    let silenceAt: number | undefined;
    processor.onaudioprocess = (event) => {
      if (
        realtimeFinishing.current ||
        captureGeneration.current !== generation ||
        realtimeSession.current !== sessionId
      )
        return;
      const samples = event.inputBuffer.getChannelData(0);
      const payload = pcm16Base64(samples, context.sampleRate);
      realtimeAppend.current = realtimeAppend.current
        .then(() => {
          if (captureGeneration.current !== generation || realtimeFailure.current) return;
          return append(sessionId, payload);
        })
        .catch((cause) => {
          if (captureGeneration.current !== generation) return;
          realtimeFailure.current = cause;
          processor.onaudioprocess = null;
          if (!realtimeFinishing.current) {
            setTimeout(() => void stopRealtimeRecording(false, stop), 0);
          }
        });

      const rms = rootMeanSquare(samples);
      updateVoiceLevel(rms);
      const now = performance.now();
      if (recordingPurpose.current !== 'conversation') return;
      if (rms >= 0.025) {
        heardSpeech = true;
        silenceAt = undefined;
      } else if (heardSpeech) {
        silenceAt ??= now;
        if (now - silenceAt >= 900 && now - startedAt >= 2_200) {
          void stopRealtimeRecording(true, stop);
        }
      }
    };
    await context.resume();
    if (captureGeneration.current !== generation || realtimeSession.current !== sessionId)
      return;
    setVoicePhase('recording');
    recordingTimeout.current = setTimeout(() => void stopRealtimeRecording(true, stop), 60_000);
  };

  const stopRealtimeRecording = async (
    commit: boolean,
    stop = onStopRealtime,
  ): Promise<void> => {
    const sessionId = realtimeSession.current;
    if (!sessionId || realtimeFinishing.current || !stop) return;
    const generation = captureGeneration.current;
    realtimeFinishing.current = true;
    realtimeSession.current = undefined;
    if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
    recordingTimeout.current = undefined;
    releaseRealtimeAudio(realtimeProcessor, realtimeSource, realtimeGain, realtimeContext);
    resetVoiceLevel();
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = undefined;
    setVoicePhase(commit ? 'transcribing' : 'idle');

    try {
      await realtimeAppend.current;
      if (realtimeFailure.current) throw realtimeFailure.current;
      const transcript = await stop(sessionId, commit);
      if (commit) await acceptTranscript(transcript, generation);
    } catch (cause) {
      if (captureGeneration.current === generation && (commit || realtimeFailure.current)) {
        setVoiceError(errorMessage(cause, 'Speech could not be transcribed.'));
        if (recordingPurpose.current === 'conversation') onVoiceConversationChange?.(false);
      }
      await stop(sessionId, false).catch(() => undefined);
    } finally {
      releaseCapture();
      realtimeAppend.current = Promise.resolve();
      realtimeFailure.current = undefined;
      realtimeFinishing.current = false;
      setVoicePhase('idle');
    }
  };

  const cancelActiveRecording = () => {
    captureGeneration.current += 1;
    if (captureStarting.current) {
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      setVoicePhase('idle');
    }
    if (realtimeSession.current) void stopRealtimeRecording(false);
    else stopRecording(true);
  };

  const stopAnalyser = () => {
    if (analyserFrame.current !== undefined) cancelAnimationFrame(analyserFrame.current);
    analyserFrame.current = undefined;
    const context = analyserContext.current;
    analyserContext.current = undefined;
    if (context) void context.close();
    resetVoiceLevel();
  };

  const monitorAudio = (stream: MediaStream, stopOnSilence: boolean) => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1_024;
    context.createMediaStreamSource(stream).connect(analyser);
    analyserContext.current = context;
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let heardSpeech = false;
    let silenceAt: number | undefined;
    const measure = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = rootMeanSquare(samples);
      updateVoiceLevel(rms);
      const now = performance.now();
      if (stopOnSilence && rms >= 0.025) {
        heardSpeech = true;
        silenceAt = undefined;
      } else if (stopOnSilence && heardSpeech) {
        silenceAt ??= now;
        if (now - silenceAt >= 900 && now - startedAt >= 1_200) {
          stopRecording();
          return;
        }
      }
      analyserFrame.current = requestAnimationFrame(measure);
    };
    analyserFrame.current = requestAnimationFrame(measure);
  };

  const acceptTranscript = async (transcript: string, generation: number) => {
    if (captureGeneration.current !== generation) return;
    if (!transcript.trim())
      throw new Error('No speech was detected. Check your microphone and try again.');
    if (recordingPurpose.current === 'conversation') {
      await onSend(transcript.trim(), []);
    } else {
      onDictated(transcript);
    }
    requestAnimationFrame(() => {
      if (recordingPurpose.current === 'dictation') textArea.current?.focus();
    });
  };

  const finishRecording = async (mimeType: string) => {
    const generation = captureGeneration.current;
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    mediaStream.current = undefined;
    mediaRecorder.current = undefined;
    const blob = new Blob(audioChunks.current, { type: mimeType });
    audioChunks.current = [];
    const discarded = discardRecording.current;
    discardRecording.current = false;
    if (discarded) {
      releaseCapture();
      setVoicePhase('idle');
      return;
    }
    if (!blob.size || !onTranscribe) {
      releaseCapture();
      setVoicePhase('idle');
      return;
    }
    setVoicePhase('transcribing');
    try {
      const transcript = await onTranscribe(await blobBase64(blob), mimeType);
      await acceptTranscript(transcript, generation);
    } catch (cause) {
      if (captureGeneration.current === generation) {
        setVoiceError(errorMessage(cause, 'Speech could not be transcribed.'));
        if (recordingPurpose.current === 'conversation') onVoiceConversationChange?.(false);
      }
    } finally {
      releaseCapture();
      setVoicePhase('idle');
    }
  };

  return {
    voicePhase,
    voiceError,
    setVoiceError,
    voiceLevel,
    beginRecording,
    stopRecording,
    cancelActiveRecording,
  };
}
