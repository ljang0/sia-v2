import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowDown,
  ArrowClockwise,
  ChatCircle,
  CaretDown,
  CaretUp,
  Check,
  Clock,
  Copy,
  FolderSimple,
  MagnifyingGlass,
  SpeakerHigh,
  SpinnerGap,
  StopCircle,
  User,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ApprovalDecision,
  AttachmentPreview,
  RendererAttachment,
  MessageEvent,
  ThreadDetail,
  ThreadEvent,
  ThreadSummary,
} from '../types';
import { timeGreeting } from '../welcome';
import { completedReplyId } from '../task-result';
import { WelcomeRecents } from './WelcomeRecents';
import { ResultCard } from './ResultCard';
import styles from '../ui.module.css';
import { ActivityRow } from './ActivityRow';
import { AgentForm } from './AgentForm';
import { ApprovalCard } from './ApprovalCard';
import { Composer } from './Composer';
import { ConversationOutline, hasConversationOutline } from './ConversationOutline';
import { SafeMarkdown } from './SafeMarkdown';
import { DitherAurora as Aurora } from './effects/DitherAurora';
import { LiquidMetalButton } from './effects/liquid-metal-button';

interface ConversationProps {
  recentThreads?: readonly ThreadSummary[] | undefined;
  onOpenThread?: ((id: string) => void) | undefined;
  thread?: ThreadDetail | undefined;
  agentName?: string | undefined;
  agentInitials?: string | undefined;
  agentHue?: number | undefined;
  loading?: boolean | undefined;
  attachments?: readonly RendererAttachment[] | undefined;
  acceptingAttachments?: boolean | undefined;
  onPickAttachments?: (() => Promise<void> | void) | undefined;
  onRemoveAttachment?: ((attachmentId: string) => Promise<void> | void) | undefined;
  onDropAttachments?: ((files: File[]) => Promise<void> | void) | undefined;
  onPreviewAttachment?: ((attachmentId: string) => Promise<AttachmentPreview>) | undefined;
  onOpenAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
  onRevealAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
  starterPrompts?: readonly string[] | undefined;
  findOpen?: boolean | undefined;
  onFindOpenChange?: ((open: boolean) => void) | undefined;
  voiceEnabled?: boolean | undefined;
  realtimeDictation?: boolean | undefined;
  dictationEnabled?: boolean | undefined;
  globalVoiceActive?: boolean | undefined;
  onAcquireVoiceCapture?: (() => Promise<string>) | undefined;
  onReleaseVoiceCapture?: ((leaseId: string) => Promise<void>) | undefined;
  onTranscribeVoice?: ((audioBase64: string, mimeType: string) => Promise<string>) | undefined;
  onStartRealtimeVoice?: (() => Promise<string>) | undefined;
  onAppendRealtimeVoice?:
    ((sessionId: string, audioBase64: string) => Promise<void>) | undefined;
  onStopRealtimeVoice?: ((sessionId: string, commit: boolean) => Promise<string>) | undefined;
  onSpeak?:
    | ((text: string) => Promise<{ audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' }>)
    | undefined;
  completionSound?: boolean | undefined;
  onSend(content: string, attachmentIds?: readonly string[]): Promise<void>;
  onStop(): Promise<void>;
  onRetry(): Promise<void>;
  onResolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  onCreateThread?: (() => void) | undefined;
  onCreateAgent?: (() => void) | undefined;
  onOpenApps?: (() => void) | undefined;
  onDraftChange?: ((content: string) => Promise<void> | void) | undefined;
  workspaceTools?: ReactNode | undefined;
  browserRecovery?: ReactNode | undefined;
}

export function Conversation({
  recentThreads = [],
  onOpenThread,
  thread,
  agentName,
  agentHue,
  loading,
  attachments,
  acceptingAttachments,
  onPickAttachments,
  onRemoveAttachment,
  onDropAttachments,
  onPreviewAttachment,
  onOpenAttachment,
  onRevealAttachment,
  starterPrompts = [],
  findOpen = false,
  onFindOpenChange,
  voiceEnabled,
  realtimeDictation = false,
  dictationEnabled = true,
  onTranscribeVoice,
  globalVoiceActive = false,
  onAcquireVoiceCapture,
  onReleaseVoiceCapture,
  onStartRealtimeVoice,
  onAppendRealtimeVoice,
  onStopRealtimeVoice,
  onSpeak,
  completionSound = false,
  onSend,
  onStop,
  onRetry,
  onResolveApproval,
  onCreateThread,
  onCreateAgent,
  onOpenApps,
  onDraftChange,
  workspaceTools,
  browserRecovery,
}: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToLatestRef = useRef(true);
  const previousThreadIdRef = useRef<string | undefined>(undefined);
  const speechGeneration = useRef(0);
  const speechSource = useRef<AudioBufferSourceNode | undefined>(undefined);
  const speechContext = useRef<AudioContext | undefined>(undefined);
  const previousVoiceStatus = useRef<ThreadDetail['status'] | undefined>(thread?.status);
  const previousPresenceStatus = useRef<ThreadDetail['status'] | undefined>(thread?.status);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastNarratedEvent = useRef<string | undefined>(undefined);
  const [busyApprovalId, setBusyApprovalId] = useState<string>();
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [speech, setSpeech] = useState<{
    eventId?: string;
    phase: 'idle' | 'loading' | 'playing';
    error?: string;
  }>({ phase: 'idle' });
  const [voiceConversation, setVoiceConversation] = useState(false);
  useEffect(() => {
    if (globalVoiceActive) {
      setVoiceConversation(false);
      stopSpeech();
    }
  }, [globalVoiceActive]);
  const [justCompleted, setJustCompleted] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [preview, setPreview] = useState<{
    attachment: RendererAttachment;
    result?: AttachmentPreview;
  }>();
  const eventRefs = useRef(new Map<string, HTMLDivElement>());

  const lastAssistant = thread?.events.findLast(
    (event) => event.type === 'message' && event.role === 'assistant',
  );
  const errorAlreadyExplained =
    lastAssistant?.type === 'message' && lastAssistant.content.trim() === thread?.error?.trim();

  const findNeedle = findQuery.trim().toLocaleLowerCase();
  const matchingEventIds = findNeedle
    ? (thread?.events ?? [])
        .filter((event) => eventSearchText(event).includes(findNeedle))
        .map(({ id }) => id)
    : [];

  useEffect(() => {
    setFindIndex(0);
  }, [findQuery, thread?.id]);

  useEffect(() => {
    if (!findOpen || !findQuery || matchingEventIds.length === 0) return;
    eventRefs.current.get(matchingEventIds[findIndex]!)?.scrollIntoView({
      block: 'center',
      behavior: 'instant',
    });
  }, [findIndex, findOpen, findQuery, matchingEventIds.join(':')]);

  const stopSpeech = () => {
    speechGeneration.current += 1;
    releaseSpeech(speechSource, speechContext);
    setSpeech({ phase: 'idle' });
  };

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
        error: cause instanceof Error ? cause.message : 'Speech could not be played.',
      });
    }
  };

  useEffect(() => {
    speechGeneration.current += 1;
    releaseSpeech(speechSource, speechContext);
    setSpeech({ phase: 'idle' });
    setVoiceConversation(false);
    setJustCompleted(false);
    previousVoiceStatus.current = thread?.status;
    previousPresenceStatus.current = thread?.status;
    lastNarratedEvent.current = undefined;
    if (completionTimer.current) clearTimeout(completionTimer.current);
    return () => {
      speechGeneration.current += 1;
      releaseSpeech(speechSource, speechContext);
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
  }, [thread?.id, voiceEnabled]);

  useEffect(() => {
    const previous = previousPresenceStatus.current;
    previousPresenceStatus.current = thread?.status;
    const latestEvent = thread?.events.at(-1);
    const cancelled = latestEvent?.type === 'notice' && latestEvent.title === 'Task cancelled';
    const completed =
      !cancelled &&
      (previous === 'running' || previous === 'queued') &&
      thread?.status === 'idle';
    if (!completed) {
      if (thread?.status !== 'idle') setJustCompleted(false);
      return;
    }
    setJustCompleted(true);
    if (completionTimer.current) clearTimeout(completionTimer.current);
    completionTimer.current = setTimeout(() => setJustCompleted(false), 900);
    if (completionSound && !voiceConversation) playCompletionChime();
  }, [completionSound, thread?.events, thread?.status, voiceConversation]);

  useEffect(() => {
    const previous = previousVoiceStatus.current;
    previousVoiceStatus.current = thread?.status;
    if (!voiceConversation || !thread || !onSpeak) return;
    if (previous !== 'running' || thread.status !== 'idle') return;
    const reply = thread.events.findLast(
      (event): event is Extract<ThreadEvent, { type: 'message' }> =>
        event.type === 'message' && event.role === 'assistant',
    );
    if (!reply || lastNarratedEvent.current === reply.id) return;
    lastNarratedEvent.current = reply.id;
    void toggleSpeech(reply.id, reply.content);
  }, [onSpeak, thread, thread?.events, thread?.status, voiceConversation]);

  useLayoutEffect(() => {
    if (!thread) {
      previousThreadIdRef.current = undefined;
      pinnedToLatestRef.current = true;
      setShowJumpToLatest(false);
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) return;

    const switchedThreads = previousThreadIdRef.current !== thread.id;
    previousThreadIdRef.current = thread.id;
    if (thread.events.length === 0) {
      if (switchedThreads) {
        pinnedToLatestRef.current = true;
        setShowJumpToLatest(false);
        scroller.scrollTo?.({ top: 0, behavior: 'instant' });
      }
      return;
    }
    if (switchedThreads) {
      pinnedToLatestRef.current = true;
      setShowJumpToLatest(false);
      scrollToLatest(scroller, 'auto');
      return;
    }

    if (pinnedToLatestRef.current) scrollToLatest(scroller, 'auto');
    else setShowJumpToLatest(true);
  }, [thread, thread?.events, thread?.id, thread?.status]);

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const pinned = isNearLatest(scroller);
    pinnedToLatestRef.current = pinned;
    setShowJumpToLatest(!pinned && Boolean(thread?.events.length));
  };

  const jumpToLatest = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    pinnedToLatestRef.current = true;
    setShowJumpToLatest(false);
    scrollToLatest(scroller, 'smooth');
  };

  if (loading) return <ConversationSkeleton />;

  if (!thread) {
    return (
      <main className={styles.mainPane} data-companion-conversation data-scene="welcome">
        <Aurora className={styles.conversationAurora} pauseWhenUnfocused />
        <div className={styles.emptyState} data-companion-empty>
          <AgentForm identity={agentHue ?? 0} size="large" />
          <span className={styles.emptyStateKicker}>
            {agentName ? `${timeGreeting()} · ${agentName} is ready` : 'Start here'}
          </span>
          <h1 className={styles.gradientHeading}>
            {agentName ? `Start a thread with ${agentName}.` : 'Create your first agent.'}
          </h1>
          <p>
            {agentName
              ? 'Pick up a recent conversation, or start with something you want off your list.'
              : 'Give it a name and one short instruction. Sia chooses a model, color, and private folder.'}
          </p>
          {onCreateThread ? (
            <LiquidMetalButton tone="sage" onClick={onCreateThread}>
              New thread
            </LiquidMetalButton>
          ) : onCreateAgent ? (
            <LiquidMetalButton tone="sage" onClick={onCreateAgent}>
              Create your first agent
            </LiquidMetalButton>
          ) : null}
          {onOpenApps ? (
            <button className={styles.textButton} type="button" onClick={onOpenApps}>
              Connect work apps later
            </button>
          ) : null}
          <WelcomeRecents threads={recentThreads} onOpen={onOpenThread} />
        </div>
      </main>
    );
  }

  const running = thread.status === 'running';
  const queued = thread.status === 'queued';
  const waiting = thread.status === 'waiting';
  const pendingApproval = thread.events.some(
    (event) => event.type === 'approval' && event.status === 'pending',
  );
  const pendingQuestion =
    waiting &&
    !pendingApproval &&
    thread.events.some((event) => event.type === 'question' && event.status === 'pending');
  const waitingForApproval = waiting && !pendingQuestion;
  const lastUserEventIndex = thread.events.findLastIndex(
    (event) => event.type === 'message' && event.role === 'user',
  );
  const lastAssistantEventIndex = thread.events.findLastIndex(
    (event) => event.type === 'message' && event.role === 'assistant',
  );
  const currentAssistantEventId =
    lastAssistantEventIndex > lastUserEventIndex
      ? thread.events[lastAssistantEventIndex]?.id
      : undefined;
  const outlineAvailable = hasConversationOutline(thread.events);
  const resultId = completedReplyId(thread);

  return (
    <main
      className={styles.mainPane}
      data-companion-conversation
      data-scene={thread.events.length ? 'conversation' : 'welcome'}
      data-file-dragging={draggingFiles ? 'true' : undefined}
      onDragEnter={(event) => {
        if (!onDropAttachments || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDraggingFiles(true);
      }}
      onDragOver={(event) => {
        if (!onDropAttachments || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (!onDropAttachments || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDraggingFiles(false);
        const files = [...event.dataTransfer.files].slice(0, 20);
        if (files.length) void onDropAttachments(files);
      }}
    >
      <Aurora
        className={styles.conversationAurora}
        still={thread.events.length > 0}
        pauseWhenUnfocused
      />
      {findOpen ? (
        <div className={styles.conversationFind} role="search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onFindOpenChange?.(false);
              if (event.key === 'Enter' && matchingEventIds.length) {
                event.preventDefault();
                setFindIndex((current) =>
                  event.shiftKey
                    ? (current - 1 + matchingEventIds.length) % matchingEventIds.length
                    : (current + 1) % matchingEventIds.length,
                );
              }
            }}
            placeholder="Find in this thread"
            aria-label="Find in this thread"
          />
          <span>{findQuery ? `${matchingEventIds.length} found` : 'Type to find'}</span>
          <button
            type="button"
            className={styles.iconButtonSmall}
            disabled={!matchingEventIds.length}
            onClick={() =>
              setFindIndex(
                (current) => (current - 1 + matchingEventIds.length) % matchingEventIds.length,
              )
            }
            aria-label="Previous match"
          >
            <CaretUp size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButtonSmall}
            disabled={!matchingEventIds.length}
            onClick={() => setFindIndex((current) => (current + 1) % matchingEventIds.length)}
            aria-label="Next match"
          >
            <CaretDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButtonSmall}
            onClick={() => onFindOpenChange?.(false)}
            aria-label="Close find"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {draggingFiles ? (
        <div className={styles.attachmentDropOverlay} role="status">
          Drop up to 20 files to attach
        </div>
      ) : null}
      <div
        className={styles.threadScroll}
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label="Conversation"
      >
        <div className={styles.conversationColumn}>
          {queued ? (
            <div className={styles.queueBanner} role="status">
              <Clock size={17} aria-hidden="true" />
              <div>
                <strong>Queued</strong>
                <span>
                  {thread.queueReason ?? 'This turn is waiting for a local resource.'}
                </span>
              </div>
            </div>
          ) : null}

          {thread.events.length === 0 ? (
            <div className={styles.threadEmpty} data-companion-thread-empty>
              <AgentForm identity={agentHue} size="medium" />
              <span className={styles.emptyStateKicker}>
                {timeGreeting()}
                {agentName ? ` · ${agentName} is ready` : ''}
              </span>
              <h2 className={styles.gradientHeading}>What would you like to do?</h2>
              <p>Describe the outcome, attach any useful files, or choose a suggested start.</p>
              {onOpenApps ? (
                <button className={styles.textButton} type="button" onClick={onOpenApps}>
                  Connect work apps
                </button>
              ) : null}
              {starterPrompts.length ? (
                <div className={styles.starterPrompts} aria-label="Suggested starts">
                  {starterPrompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => void onSend(prompt)}>
                      <span>{prompt}</span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <WelcomeRecents threads={recentThreads} onOpen={onOpenThread} />
            </div>
          ) : (
            <div className={styles.eventList}>
              {thread.events.map((event, index) => (
                <div
                  key={event.id}
                  ref={(node) => {
                    if (node) eventRefs.current.set(event.id, node);
                    else eventRefs.current.delete(event.id);
                  }}
                  className={styles.eventSearchAnchor}
                  tabIndex={-1}
                  data-find-match={matchingEventIds.includes(event.id) ? 'true' : undefined}
                  data-find-current={
                    matchingEventIds[findIndex] === event.id ? 'true' : undefined
                  }
                >
                  <EventView
                    event={event}
                    noticeExplained={
                      event.type === 'notice' &&
                      event.tone === 'error' &&
                      thread.events[index - 1]?.type === 'message' &&
                      (thread.events[index - 1] as MessageEvent).role === 'assistant' &&
                      (thread.events[index - 1] as MessageEvent).content.trim() ===
                        event.detail.trim()
                    }
                    agentHue={agentHue}
                    busyApprovalId={busyApprovalId}
                    speechPhase={speech.eventId === event.id ? speech.phase : 'idle'}
                    speechError={speech.eventId === event.id ? speech.error : undefined}
                    streaming={running && event.id === currentAssistantEventId}
                    justCompleted={justCompleted && event.id === currentAssistantEventId}
                    completed={event.id === resultId}
                    onToggleSpeech={
                      voiceEnabled && onSpeak
                        ? (text) => toggleSpeech(event.id, text)
                        : undefined
                    }
                    onPreviewAttachment={
                      onPreviewAttachment
                        ? (attachment) => {
                            setPreview({ attachment });
                            void onPreviewAttachment(attachment.id).then(
                              (result) => setPreview({ attachment, result }),
                              (cause: unknown) =>
                                setPreview({
                                  attachment,
                                  result: attachmentPreviewFailure(cause),
                                }),
                            );
                          }
                        : undefined
                    }
                    onResolveApproval={async (approvalId, decision) => {
                      setBusyApprovalId(approvalId);
                      try {
                        await onResolveApproval(approvalId, decision);
                      } finally {
                        setBusyApprovalId(undefined);
                      }
                    }}
                  />
                </div>
              ))}
              {running ? <ThinkingRow /> : null}
              {browserRecovery}
            </div>
          )}
          {thread.error ? (
            <div
              className={styles.errorBanner}
              role="alert"
              data-testid="interrupted-turn-banner"
            >
              <WarningCircle size={18} aria-hidden="true" />
              <div>
                <strong>Task needs attention</strong>
                {!errorAlreadyExplained ? <span>{thread.error}</span> : null}
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void onRetry()}
                data-testid="interrupted-turn-retry"
              >
                <ArrowClockwise size={15} aria-hidden="true" />
                Continue task
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {showJumpToLatest || workspaceTools || outlineAvailable ? (
        <div className={styles.threadWorkspaceBar}>
          {showJumpToLatest ? (
            <button type="button" className={styles.jumpToLatest} onClick={jumpToLatest}>
              <ArrowDown size={14} aria-hidden="true" />
              Jump to latest
            </button>
          ) : null}
          {workspaceTools}
          {outlineAvailable ? (
            <ConversationOutline
              key={thread.id}
              events={thread.events}
              agentName={agentName}
              onNavigate={(eventId) => {
                const target = eventRefs.current.get(eventId);
                if (!target) return;
                pinnedToLatestRef.current = false;
                setShowJumpToLatest(true);
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                target.focus({ preventScroll: true });
              }}
            />
          ) : null}
        </div>
      ) : null}

      <Composer
        key={thread.id}
        initialValue={thread.draft ?? ''}
        disabled={queued || waitingForApproval}
        running={running || queued || waitingForApproval}
        stoppable={running || queued || waiting}
        executionLabel={providerName(thread.provider)}
        attachments={attachments?.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          kind: attachment.kind === 'image' ? 'image' : 'file',
          sizeBytes: attachment.bytes,
        }))}
        acceptingAttachments={acceptingAttachments}
        onPickAttachments={onPickAttachments}
        onRemoveAttachment={onRemoveAttachment}
        onPreviewAttachment={
          onPreviewAttachment
            ? (attachmentId) => {
                const attachment = attachments?.find(({ id }) => id === attachmentId);
                if (!attachment) return;
                setPreview({ attachment });
                void onPreviewAttachment(attachmentId).then(
                  (result) => setPreview({ attachment, result }),
                  (cause: unknown) =>
                    setPreview({ attachment, result: attachmentPreviewFailure(cause) }),
                );
              }
            : undefined
        }
        voiceEnabled={voiceEnabled && dictationEnabled}
        realtimeDictation={realtimeDictation}
        onAcquireVoiceCapture={onAcquireVoiceCapture}
        onReleaseVoiceCapture={onReleaseVoiceCapture}
        onTranscribe={onTranscribeVoice}
        onStartRealtime={onStartRealtimeVoice}
        onAppendRealtime={onAppendRealtimeVoice}
        onStopRealtime={onStopRealtimeVoice}
        voiceConversation={voiceConversation}
        voiceCanListen={Boolean(
          voiceEnabled && dictationEnabled && speech.phase === 'idle' && !globalVoiceActive,
        )}
        presence={
          speech.phase === 'playing'
            ? 'speaking'
            : speech.phase === 'loading'
              ? 'working'
              : justCompleted
                ? 'complete'
                : thread.error
                  ? 'error'
                  : running || queued
                    ? 'working'
                    : waiting
                      ? 'waiting'
                      : 'idle'
        }
        onVoiceConversationChange={(active) => {
          if (!active && voiceConversation && speech.phase !== 'idle') stopSpeech();
          setVoiceConversation(active);
        }}
        onDraftChange={onDraftChange}
        placeholder={
          queued
            ? 'This thread is queued'
            : pendingQuestion
              ? 'Reply to Sia’s question'
              : waitingForApproval
                ? 'Review the pending approval or stop this turn'
                : running
                  ? `${agentName ?? 'Sia'} is working. You can send your next message when it finishes.`
                  : thread.events.length === 0
                    ? `Ask ${agentName ?? 'Sia'} to work on something`
                    : `Ask ${agentName ?? 'Sia'} to continue`
        }
        onSend={onSend}
        onStop={onStop}
      />
      <AttachmentPreviewDialog
        preview={preview}
        onOpenChange={(open) => !open && setPreview(undefined)}
        onOpenAttachment={onOpenAttachment}
        onRevealAttachment={onRevealAttachment}
      />
    </main>
  );
}

function isNearLatest(scroller: HTMLDivElement) {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 72;
}

function scrollToLatest(scroller: HTMLDivElement, behavior: ScrollBehavior) {
  scroller.scrollTo?.({ top: scroller.scrollHeight, behavior });
}

interface EventViewProps {
  completed?: boolean | undefined;
  noticeExplained?: boolean;
  event: ThreadEvent;
  agentHue?: number | undefined;
  busyApprovalId?: string | undefined;
  speechPhase: 'idle' | 'loading' | 'playing';
  speechError?: string | undefined;
  streaming?: boolean | undefined;
  justCompleted?: boolean | undefined;
  onToggleSpeech?: ((text: string) => Promise<void>) | undefined;
  onPreviewAttachment?: ((attachment: RendererAttachment) => void) | undefined;
  onResolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
}

function EventView({
  completed,
  event,
  noticeExplained,
  agentHue,
  busyApprovalId,
  speechPhase,
  speechError,
  streaming,
  justCompleted,
  onToggleSpeech,
  onPreviewAttachment,
  onResolveApproval,
}: EventViewProps) {
  if (event.type === 'activity') return <ActivityRow event={event} />;
  if (event.type === 'approval') {
    return (
      <ApprovalCard
        event={event}
        busy={busyApprovalId === event.id}
        onResolve={(approvalId, decision) => void onResolveApproval(approvalId, decision)}
      />
    );
  }
  if (event.type === 'notice') {
    return (
      <div className={`${styles.notice} ${styles[`notice_${event.tone}`]}`} role="status">
        <WarningCircle size={17} aria-hidden="true" />
        <div>
          <strong>{event.title}</strong>
          {!noticeExplained ? <p>{event.detail}</p> : null}
        </div>
      </div>
    );
  }
  if (event.type === 'question') {
    return (
      <div className={styles.notice} role="status">
        <ChatCircle size={17} aria-hidden="true" />
        <div>
          <strong>Provider needs input</strong>
          <p>{event.prompt}</p>
        </div>
      </div>
    );
  }

  const message = (
    <article
      className={`${styles.message} ${
        event.role === 'user' ? styles.userMessage : styles.assistantMessage
      } ${justCompleted ? styles.messageSettled : ''}`}
      data-message-role={event.role}
      data-completed={justCompleted ? 'true' : undefined}
    >
      <span className={styles.messageAvatar} aria-hidden="true">
        {event.role === 'user' ? (
          <User size={14} weight="bold" />
        ) : (
          <AgentForm identity={agentHue} size="small" />
        )}
      </span>
      <header>
        <span>{event.role === 'user' ? 'You' : 'Sia'}</span>
        <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
        <CopyMessageButton content={event.content} />
        {event.role === 'assistant' && onToggleSpeech ? (
          <button
            type="button"
            className={styles.messageActionButton}
            onClick={() => void onToggleSpeech(event.content)}
            aria-label={
              speechPhase === 'playing'
                ? 'Stop reading reply'
                : speechPhase === 'loading'
                  ? 'Cancel read aloud'
                  : 'Read reply aloud'
            }
            title={speechPhase === 'idle' ? 'Read aloud' : 'Stop reading'}
            data-testid="message-read-aloud"
          >
            {speechPhase === 'loading' ? (
              <SpinnerGap className={styles.spin} size={14} aria-hidden="true" />
            ) : speechPhase === 'playing' ? (
              <StopCircle size={14} weight="fill" aria-hidden="true" />
            ) : (
              <SpeakerHigh size={14} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </header>
      <div
        className={`${styles.messageContent} ${streaming ? styles.streamingContent : ''}`}
        data-streaming={streaming ? 'true' : undefined}
      >
        {event.role === 'user' ? (
          // What the person typed is shown verbatim; snake_case must not become italics.
          <p>{event.content}</p>
        ) : (
          <SafeMarkdown content={event.content} />
        )}
        {event.attachments?.length ? (
          <div className={styles.messageAttachments} aria-label="Message attachments">
            {event.attachments.map((attachment) => (
              <button
                type="button"
                key={attachment.id}
                onClick={() => onPreviewAttachment?.(attachment)}
                disabled={!onPreviewAttachment}
              >
                <FolderSimple size={13} aria-hidden="true" />
                {attachment.name}
              </button>
            ))}
          </div>
        ) : null}
        {speechError ? (
          <p className={styles.messageVoiceError} role="alert">
            {speechError}
          </p>
        ) : null}
      </div>
    </article>
  );
  return completed ? <ResultCard>{message}</ResultCard> : message;
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.messageActionButton}
      onClick={() => void copy()}
      aria-label={copied ? 'Message copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy message'}
    >
      {copied ? (
        <Check size={14} weight="bold" aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
    </button>
  );
}

function AttachmentPreviewDialog({
  preview,
  onOpenChange,
  onOpenAttachment,
  onRevealAttachment,
}: {
  preview?: { attachment: RendererAttachment; result?: AttachmentPreview } | undefined;
  onOpenChange(open: boolean): void;
  onOpenAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
  onRevealAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
}) {
  return (
    <Dialog.Root open={Boolean(preview)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={`${styles.alertDialogContent} ${styles.attachmentPreview}`}>
          <Dialog.Title>{preview?.attachment.name}</Dialog.Title>
          <Dialog.Description>
            This local preview uses a short-lived file grant that expires after one hour.
          </Dialog.Description>
          <div className={styles.attachmentPreviewBody}>
            {!preview?.result ? (
              <SpinnerGap className={styles.spin} size={22} aria-label="Loading preview" />
            ) : preview.result.kind === 'image' ? (
              <img src={preview.result.dataUrl} alt={preview.attachment.name} />
            ) : preview.result.kind === 'text' ? (
              <div className={styles.attachmentTextPreview} data-format={preview.result.format}>
                <header>
                  <span>{preview.result.language ?? 'Plain text'}</span>
                  <small>
                    {preview.result.content.split('\n').length.toLocaleString()} lines
                  </small>
                </header>
                <pre>
                  <code>{preview.result.content}</code>
                </pre>
              </div>
            ) : preview.result.kind === 'pdf' ? (
              <p>
                PDFs open in your default reader so Sia does not add an unsafe document frame.
              </p>
            ) : (
              <p>{preview.result.detail}</p>
            )}
          </div>
          <div className={styles.dialogActions}>
            {onRevealAttachment && preview ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void onRevealAttachment(preview.attachment.id)}
              >
                Reveal in Finder
              </button>
            ) : null}
            {onOpenAttachment && preview ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void onOpenAttachment(preview.attachment.id)}
              >
                Open file
              </button>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function eventSearchText(event: ThreadEvent): string {
  if (event.type === 'message') {
    return `${event.content} ${(event.attachments ?? []).map(({ name }) => name).join(' ')}`.toLocaleLowerCase();
  }
  if (event.type === 'activity') return event.title.toLocaleLowerCase();
  if (event.type === 'notice') return `${event.title} ${event.detail}`.toLocaleLowerCase();
  if (event.type === 'question') return event.prompt.toLocaleLowerCase();
  return `${event.request.title} ${'summary' in event.request ? event.request.summary : ''}`.toLocaleLowerCase();
}

function attachmentPreviewFailure(cause: unknown): AttachmentPreview {
  return {
    kind: 'unavailable',
    detail:
      cause instanceof Error
        ? cause.message
        : 'This file is no longer available in the current Sia session.',
  };
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes('Files');
}

function ThinkingRow() {
  return (
    <div className={styles.visuallyHidden} role="status" data-testid="turn-running">
      Sia is working
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <main className={styles.mainPane} aria-label="Loading conversation" aria-busy="true">
      <div className={styles.threadScroll}>
        <div className={styles.conversationColumn}>
          <div className={styles.skeletonMessage} />
          <div className={`${styles.skeletonMessage} ${styles.skeletonShort}`} />
          <div className={styles.skeletonActivity} />
          <div className={styles.skeletonMessage} />
        </div>
      </div>
      <div className={styles.skeletonComposer} />
    </main>
  );
}

function providerName(provider: string) {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function playCompletionChime() {
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
