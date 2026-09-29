import {
  ArrowUp,
  File,
  Image,
  Microphone,
  Paperclip,
  SpinnerGap,
  Stop,
  Waveform,
  X,
} from '@phosphor-icons/react';
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import styles from '../ui.module.css';
import { SiaPresence, type SiaPresenceState } from './SiaPresence';
import { LiquidMetalButton } from './effects/liquid-metal-button';

interface ComposerAttachment {
  id: string;
  name: string;
  kind: 'file' | 'image';
  sizeBytes?: number | undefined;
}

interface ComposerProps {
  initialValue?: string;
  disabled?: boolean;
  running?: boolean;
  stoppable?: boolean;
  placeholder?: string;
  executionLabel?: string | undefined;
  attachments?: readonly ComposerAttachment[] | undefined;
  acceptingAttachments?: boolean | undefined;
  onPickAttachments?: (() => Promise<void> | void) | undefined;
  onRemoveAttachment?: ((attachmentId: string) => Promise<void> | void) | undefined;
  onPreviewAttachment?: ((attachmentId: string) => void) | undefined;
  /** Pasted screenshots or files, and long pasted text as a text file. */
  onPasteFiles?: ((files: File[]) => Promise<void> | void) | undefined;
  voiceEnabled?: boolean | undefined;
  realtimeDictation?: boolean | undefined;
  onAcquireVoiceCapture?: (() => Promise<string>) | undefined;
  onReleaseVoiceCapture?: ((leaseId: string) => Promise<void>) | undefined;
  onTranscribe?: ((audioBase64: string, mimeType: string) => Promise<string>) | undefined;
  onStartRealtime?: (() => Promise<string>) | undefined;
  onAppendRealtime?: ((sessionId: string, audioBase64: string) => Promise<void>) | undefined;
  onStopRealtime?: ((sessionId: string, commit: boolean) => Promise<string>) | undefined;
  voiceConversation?: boolean | undefined;
  voiceCanListen?: boolean | undefined;
  presence?: SiaPresenceState | undefined;
  /** The turn is queued behind other work; the status line says Queued, as the sidebar does. */
  queued?: boolean | undefined;
  onVoiceConversationChange?: ((active: boolean) => void) | undefined;
  onDraftChange?: ((content: string) => Promise<void> | void) | undefined;
  onSend(content: string, attachmentIds?: readonly string[]): Promise<void> | void;
  onStop(): Promise<void> | void;
}

export function Composer({
  initialValue = '',
  disabled,
  running,
  stoppable = running,
  placeholder = 'Ask Sia to work on something',
  executionLabel,
  attachments = [],
  acceptingAttachments = false,
  onPickAttachments,
  onRemoveAttachment,
  onPreviewAttachment,
  onPasteFiles,
  voiceEnabled = false,
  realtimeDictation = false,
  onTranscribe,
  onAcquireVoiceCapture,
  onReleaseVoiceCapture,
  onStartRealtime,
  onAppendRealtime,
  onStopRealtime,
  voiceConversation = false,
  voiceCanListen = true,
  presence = 'idle',
  queued = false,
  onVoiceConversationChange,
  onDraftChange,
  onSend,
  onStop,
}: ComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [sending, setSending] = useState(false);
  const [voicePhase, setVoicePhase] = useState<
    'idle' | 'starting' | 'recording' | 'transcribing'
  >('idle');
  const [voiceError, setVoiceError] = useState<string>();
  const [voiceLevel, setVoiceLevel] = useState(0);
  const textArea = useRef<HTMLTextAreaElement>(null);
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
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingDraft = useRef<string | undefined>(undefined);
  const draftChangeHandler = useRef(onDraftChange);
  realtimeStopHandler.current = onStopRealtime;
  draftChangeHandler.current = onDraftChange;

  // Size the box to its text, including a multi-line draft restored when the thread opens.
  useLayoutEffect(() => {
    const input = textArea.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [value]);

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

  useEffect(
    () => () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      const content = pendingDraft.current;
      pendingDraft.current = undefined;
      if (content !== undefined) {
        void Promise.resolve(draftChangeHandler.current?.(content)).catch(() => undefined);
      }
    },
    [],
  );

  const persistDraftSoon = (content: string) => {
    pendingDraft.current = content;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      draftSaveTimer.current = undefined;
      const pending = pendingDraft.current;
      pendingDraft.current = undefined;
      if (pending !== undefined) {
        void Promise.resolve(draftChangeHandler.current?.(pending)).catch(() => undefined);
      }
    }, 300);
  };

  const updateValue = (content: string) => {
    setValue(content);
    persistDraftSoon(content);
  };

  const persistDraftNow = (content: string) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = undefined;
    pendingDraft.current = undefined;
    void Promise.resolve(draftChangeHandler.current?.(content)).catch(() => undefined);
  };

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

  const submit = async () => {
    const content = value.trim();
    // While a turn runs, a sent message is queued as a follow-up by the main process.
    if ((!content && attachments.length === 0) || disabled || sending) return;
    setSending(true);
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = undefined;
    pendingDraft.current = undefined;
    try {
      await onSend(
        content,
        attachments.map((attachment) => attachment.id),
      );
      setValue('');
      persistDraftNow('');
    } catch {
      persistDraftNow(value);
      textArea.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteFiles || !acceptingAttachments || disabled) return;
    const files = pastedFiles(event.clipboardData);
    if (files.length) {
      event.preventDefault();
      void onPasteFiles(files);
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (text.length > LONG_PASTE_CHARACTERS) {
      // Long pasted text rides along as a file instead of flooding the message box.
      event.preventDefault();
      void onPasteFiles([
        new globalThis.File([text], 'Pasted text.txt', { type: 'text/plain' }),
      ]);
    }
  };

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
        setVoiceError(
          cause instanceof Error ? cause.message : 'Speech could not be transcribed.',
        );
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
      const draft = textArea.current?.value ?? value;
      updateValue(`${draft.trimEnd()}${draft.trim() ? ' ' : ''}${transcript}`);
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
        setVoiceError(
          cause instanceof Error ? cause.message : 'Speech could not be transcribed.',
        );
        if (recordingPurpose.current === 'conversation') onVoiceConversationChange?.(false);
      }
    } finally {
      releaseCapture();
      setVoicePhase('idle');
    }
  };

  return (
    <div className={styles.composerArea} data-companion-composer>
      <div className={`${styles.composer} ${disabled ? styles.composerDisabled : ''}`}>
        {attachments.length ? (
          <div
            className={styles.composerAttachments}
            aria-label="Attachments"
            data-testid="composer-attachment-chip"
          >
            {attachments.map((attachment) => (
              <span className={styles.attachmentChip} key={attachment.id}>
                {attachment.kind === 'image' ? (
                  <Image size={14} aria-hidden="true" />
                ) : (
                  <File size={14} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={styles.attachmentPreviewButton}
                  title={`Preview ${attachment.name}`}
                  onClick={() => onPreviewAttachment?.(attachment.id)}
                  disabled={!onPreviewAttachment}
                >
                  {attachment.name}
                </button>
                {attachment.sizeBytes ? (
                  <small>{formatBytes(attachment.sizeBytes)}</small>
                ) : null}
                {onRemoveAttachment ? (
                  <button
                    type="button"
                    onClick={() => void onRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                    disabled={disabled || sending}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textArea}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          data-composer-input
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <div className={styles.composerControls}>
          <div className={styles.composerContextGroup}>
            {onPickAttachments ? (
              <button
                type="button"
                className={styles.composerAttachButton}
                onClick={() => void onPickAttachments()}
                disabled={disabled || sending || !acceptingAttachments}
                aria-label="Add files or images"
                data-testid="composer-attachment-add"
                title={
                  acceptingAttachments
                    ? 'Add files or images'
                    : 'Attachments are unavailable for this model'
                }
              >
                <Paperclip size={15} aria-hidden="true" />
              </button>
            ) : null}
            {voiceEnabled && onTranscribe ? (
              <>
                <button
                  type="button"
                  className={`${styles.composerVoiceButton} ${
                    voicePhase === 'recording' && !voiceConversation
                      ? styles.composerVoiceRecording
                      : ''
                  }`}
                  onClick={() =>
                    voicePhase === 'recording' ? stopRecording() : void beginRecording()
                  }
                  disabled={
                    disabled ||
                    running ||
                    sending ||
                    (voiceConversation && voicePhase !== 'recording') ||
                    voicePhase === 'transcribing' ||
                    voicePhase === 'starting'
                  }
                  aria-label={
                    voicePhase === 'recording'
                      ? voiceConversation
                        ? 'Finish speaking'
                        : 'Stop recording and transcribe'
                      : voicePhase === 'starting'
                        ? 'Starting microphone'
                        : voicePhase === 'transcribing'
                          ? 'Transcribing voice message'
                          : 'Dictate message'
                  }
                  aria-pressed={voicePhase === 'recording' && !voiceConversation}
                  title={
                    voicePhase === 'recording'
                      ? voiceConversation
                        ? 'Finish speaking'
                        : 'Stop and transcribe'
                      : 'Dictate message'
                  }
                  data-testid="composer-voice-input"
                >
                  {voicePhase === 'transcribing' && !voiceConversation ? (
                    <SpinnerGap className={styles.spin} size={15} aria-hidden="true" />
                  ) : voicePhase === 'recording' ? (
                    <Stop size={15} weight="fill" aria-hidden="true" />
                  ) : (
                    <Microphone size={15} weight="fill" aria-hidden="true" />
                  )}
                </button>
                {onVoiceConversationChange ? (
                  <button
                    type="button"
                    className={`${styles.composerVoiceButton} ${
                      voiceConversation ? styles.composerVoiceRecording : ''
                    }`}
                    onClick={() => {
                      if (voiceConversation) cancelActiveRecording();
                      else setVoiceError(undefined);
                      onVoiceConversationChange(!voiceConversation);
                    }}
                    disabled={disabled && !voiceConversation}
                    aria-label={
                      voiceConversation ? 'End voice conversation' : 'Start voice conversation'
                    }
                    aria-pressed={voiceConversation}
                    title={voiceConversation ? 'End voice conversation' : 'Voice conversation'}
                    data-testid="composer-voice-conversation"
                  >
                    <Waveform size={15} weight="bold" aria-hidden="true" />
                  </button>
                ) : null}
              </>
            ) : null}
            <SiaPresence
              state={
                voicePhase === 'recording'
                  ? 'listening'
                  : voicePhase === 'transcribing'
                    ? 'working'
                    : presence
              }
              audioLevel={voiceLevel}
            />
            <span className={styles.composerContext} role="status">
              {voiceConversation
                ? voiceError
                  ? 'Voice stopped'
                  : voicePhase === 'starting'
                    ? 'Voice · starting microphone…'
                    : voicePhase === 'transcribing'
                      ? 'Voice · transcribing…'
                      : running || !voiceCanListen
                        ? 'Voice · waiting…'
                        : voicePhase === 'recording'
                          ? 'Voice · listening…'
                          : 'Voice · ready'
                : voicePhase === 'starting'
                  ? 'Starting microphone…'
                  : voicePhase === 'recording'
                    ? 'Listening · click stop to finish'
                    : voicePhase === 'transcribing'
                      ? 'Transcribing…'
                      : presence === 'working'
                        ? `${queued ? 'Queued' : 'Working'} · ${executionLabel ?? 'Local'}`
                        : presence === 'waiting'
                          ? 'Waiting for you'
                          : presence === 'complete'
                            ? 'Done'
                            : presence === 'error'
                              ? 'Needs attention'
                              : presence === 'speaking'
                                ? 'Speaking…'
                                : (executionLabel ?? 'Local')}
            </span>
          </div>
          {stoppable ? (
            <LiquidMetalButton
              type="button"
              size="compact"
              className={styles.composerAction}
              onClick={() => void onStop()}
              aria-label="Stop current turn"
            >
              <Stop weight="fill" size={13} aria-hidden="true" />
              Stop
            </LiquidMetalButton>
          ) : null}
          <LiquidMetalButton
            type="button"
            size="compact"
            viewMode="icon"
            tone="sage"
            onClick={() => void submit()}
            disabled={disabled || (!value.trim() && attachments.length === 0) || sending}
            aria-label={running ? 'Queue follow-up message' : 'Send message'}
            title={running ? 'Queue follow-up' : undefined}
            data-testid="composer-send"
          >
            <ArrowUp weight="bold" size={16} aria-hidden="true" />
          </LiquidMetalButton>
        </div>
      </div>
      {voiceError ? (
        <p className={styles.composerError} role="alert">
          {voiceError}
        </p>
      ) : null}
    </div>
  );
}

/** Pasted text longer than this becomes a text attachment. */
export const LONG_PASTE_CHARACTERS = 4_000;

/**
 * Files on the clipboard that the person meant to attach. Office apps put a picture of the
 * copied cells beside the text; that paste stays text. A Finder copy names its files as text.
 */
export function pastedFiles(data: DataTransfer): File[] {
  const files = [...data.files].slice(0, 20);
  if (!files.length) return [];
  const text = data.getData('text/plain').trim();
  if (!text) return files;
  const names = new Set(files.map(({ name }) => name));
  const namesFiles = text.split(/\r?\n|\r/).every((line) => names.has(line.trim()));
  const allImages = files.every(({ type }) => type.startsWith('image/'));
  return namesFiles || !allImages ? files : [];
}

interface MutableSlot<T> {
  current: T | undefined;
}

function releaseRealtimeAudio(
  processorRef: MutableSlot<ScriptProcessorNode>,
  sourceRef: MutableSlot<MediaStreamAudioSourceNode>,
  gainRef: MutableSlot<GainNode>,
  contextRef: MutableSlot<AudioContext>,
) {
  if (processorRef.current) processorRef.current.onaudioprocess = null;
  processorRef.current?.disconnect();
  sourceRef.current?.disconnect();
  gainRef.current?.disconnect();
  processorRef.current = undefined;
  sourceRef.current = undefined;
  gainRef.current = undefined;
  const context = contextRef.current;
  contextRef.current = undefined;
  if (context) void context.close();
}

function rootMeanSquare(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function microphoneLevel(rms: number): number {
  if (rms < 0.012) return 0;
  if (rms < 0.025) return 1;
  if (rms < 0.05) return 2;
  if (rms < 0.1) return 3;
  return 4;
}

/** Converts browser microphone samples to little-endian mono PCM expected by Scribe. */
export function pcm16Base64(samples: Float32Array, inputSampleRate: number): string {
  const outputLength = Math.max(1, Math.round((samples.length * 16_000) / inputSampleRate));
  const output = new Uint8Array(outputLength * 2);
  const view = new DataView(output.buffer);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor((outputIndex * samples.length) / outputLength);
    const end = Math.max(
      start + 1,
      Math.floor(((outputIndex + 1) * samples.length) / outputLength),
    );
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
    }
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return btoa(String.fromCharCode(...output));
}

function preferredRecordingMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((value) =>
    MediaRecorder.isTypeSupported(value),
  );
}

async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${Math.round(value / 1_024)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}
