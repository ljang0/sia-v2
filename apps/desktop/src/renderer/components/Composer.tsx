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
import layout from '../styles/layout.module.css';
import primitives from '../styles/primitives.module.css';
import styles from './Composer.module.css';
import { SiaPresence, type SiaPresenceState } from './SiaPresence';
import { VoiceWave } from './VoiceWave';
import { LiquidMetalButton } from './effects/liquid-metal-button';
import { useVoiceCapture } from './composer/useVoiceCapture';

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
  /** Messages already sent in this conversation, oldest first; ↑ in an empty box recalls them. */
  history?: readonly string[] | undefined;
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
  history = [],
  onSend,
  onStop,
}: ComposerProps) {
  const [value, setValue] = useState(initialValue);
  // Which sent message ↑/↓ is showing, counted back from the newest; unset while typing.
  const recall = useRef<number | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingDraft = useRef<string | undefined>(undefined);
  const draftChangeHandler = useRef(onDraftChange);
  draftChangeHandler.current = onDraftChange;

  // Size the box to its text, including a multi-line draft restored when the thread opens.
  useLayoutEffect(() => {
    const input = textArea.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
  }, [value]);

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
    // Editing or clearing a recalled message makes it the person's own draft again.
    recall.current = undefined;
    setValue(content);
    persistDraftSoon(content);
  };

  const persistDraftNow = (content: string) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = undefined;
    pendingDraft.current = undefined;
    void Promise.resolve(draftChangeHandler.current?.(content)).catch(() => undefined);
  };

  const {
    voicePhase,
    voiceError,
    setVoiceError,
    voiceLevel,
    beginRecording,
    stopRecording,
    cancelActiveRecording,
  } = useVoiceCapture({
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
    onDictated: (transcript) => {
      const draft = textArea.current?.value ?? value;
      updateValue(`${draft.trimEnd()}${draft.trim() ? ' ' : ''}${transcript}`);
    },
  });

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
      recall.current = undefined;
      setValue('');
      persistDraftNow('');
    } catch {
      persistDraftNow(value);
      textArea.current?.focus();
    } finally {
      setSending(false);
    }
  };

  /** Show a sent message (0 = newest) with the caret at its end, or the empty draft. */
  const showRecalled = (index: number | undefined) => {
    recall.current = index;
    const content = index === undefined ? '' : (history[history.length - 1 - index] ?? '');
    setValue(content);
    requestAnimationFrame(() => {
      const input = textArea.current;
      input?.setSelectionRange(content.length, content.length);
    });
  };

  // ↑ in an empty box steps back through sent messages, like a terminal. Within a recalled
  // message, ↑ only leaves its first line and ↓ its last, so multi-line editing still works.
  const handleRecallKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.nativeEvent.isComposing || disabled) return false;
    const input = event.currentTarget;
    const current = recall.current;
    if (event.key === 'Escape') {
      if (current === undefined) return false;
      showRecalled(undefined);
      return true;
    }
    if (event.key === 'ArrowUp') {
      const atTop = !input.value.slice(0, input.selectionStart).includes('\n');
      const recalling = current !== undefined && atTop;
      if (!recalling && (input.value !== '' || attachments.length > 0)) return false;
      const next = (current ?? -1) + 1;
      if (next >= history.length) return current !== undefined;
      showRecalled(next);
      return true;
    }
    if (event.key === 'ArrowDown') {
      if (current === undefined) return false;
      if (input.value.slice(input.selectionEnd).includes('\n')) return false;
      showRecalled(current === 0 ? undefined : current - 1);
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleRecallKey(event)) {
      event.preventDefault();
      return;
    }
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

  return (
    <div className={styles.composerArea} data-companion-composer>
      <div
        className={`${styles.composer} ${layout.auroraSurface} ${disabled ? styles.composerDisabled : ''}`}
      >
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
                    <SpinnerGap className={primitives.spin} size={15} aria-hidden="true" />
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
            {voicePhase === 'recording' ? <VoiceWave level={voiceLevel} /> : null}
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
function pastedFiles(data: DataTransfer): File[] {
  const files = [...data.files].slice(0, 20);
  if (!files.length) return [];
  const text = data.getData('text/plain').trim();
  if (!text) return files;
  const names = new Set(files.map(({ name }) => name));
  const namesFiles = text.split(/\r?\n|\r/).every((line) => names.has(line.trim()));
  const allImages = files.every(({ type }) => type.startsWith('image/'));
  return namesFiles || !allImages ? files : [];
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${Math.round(value / 1_024)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}
