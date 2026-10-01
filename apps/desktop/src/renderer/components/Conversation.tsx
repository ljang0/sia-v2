import { ArrowClockwise, ArrowDown, Clock, WarningCircle } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityEvent,
  ApprovalDecision,
  AttachmentPreview,
  RendererAttachment,
  ThreadDetail,
  ThreadEvent,
  ThreadSummary,
} from '../types';
import type { StarterPrompt } from '../welcome';
import { completedReplyId } from '../task-result';
import { WelcomeHome } from './WelcomeHome';
import layout from '../styles/layout.module.css';
import buttons from '../styles/buttons.module.css';
import styles from './Conversation.module.css';
import { planProgress, WorkGroup, WorkingStatus } from './WorkGroup';
import { AttachmentPreviewDialog, attachmentPreviewFailure } from './ConversationAttachments';
import { Composer } from './Composer';
import { QueuedMessages } from './QueuedMessages';
import { ConversationOutline, hasConversationOutline } from './ConversationOutline';
import { ThreadErrorText } from './PlainErrorText';
import { usageWarningText } from '../plainErrors';
import type { ReplyRating } from './ReplyFeedback';
import { TurnChangesBar, turnChangeSummaries, type TurnChangeActions } from './TurnChanges';
import { DitherAurora as Aurora } from './effects/DitherAurora';
import { ConversationFind } from './conversation/ConversationFind';
import { ConversationRow, type RowActions } from './conversation/ConversationRow';
import { ConversationSkeleton, ConversationWelcome } from './conversation/ConversationStates';
import { playCompletionChime, useReadAloud } from './conversation/conversationAudio';
import {
  conversationBlocks,
  eventTime,
  waitingOnPerson,
  workGroupIdFor,
} from './conversation/conversationModel';
import { FileDropOverlay, useFileDrop } from './conversation/fileDrop';
import { useThreadFind } from './conversation/useThreadFind';

interface ConversationProps {
  /** What runs this thread, in the person's words: the model or provider display name. */
  executionLabel?: string | undefined;
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
  onPasteAttachments?: ((files: File[]) => Promise<void> | void) | undefined;
  onPreviewAttachment?: ((attachmentId: string) => Promise<AttachmentPreview>) | undefined;
  onOpenAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
  onRevealAttachment?: ((attachmentId: string) => Promise<void>) | undefined;
  starterPrompts?: readonly StarterPrompt[] | undefined;
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
  onRemoveQueued?: ((messageId: string) => Promise<void>) | undefined;
  /** "Send now" on a queued message while the thread runs. */
  onSendQueuedNow?: ((messageId: string) => Promise<void>) | undefined;
  onRetry(): Promise<void>;
  /** Edit (new text) or Try again (no text) on the last exchange once the task has ended. */
  onRedo?: ((text?: string) => Promise<void>) | undefined;
  onResolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
  /** Undo changes: where the files a reply changed stand, and putting them back or forward. */
  turnChanges?: TurnChangeActions | undefined;
  /** Thumbs up or down on a reply opens a feedback draft about it. */
  onRateReply?: ((rating: ReplyRating, reply: string) => void) | undefined;
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
  executionLabel,
  agentName,
  agentHue,
  loading,
  attachments,
  acceptingAttachments,
  onPickAttachments,
  onRemoveAttachment,
  onDropAttachments,
  onPasteAttachments,
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
  onRemoveQueued,
  onSendQueuedNow,
  onRetry,
  onRedo,
  onResolveApproval,
  turnChanges,
  onRateReply,
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
  const lastSentMessageRef = useRef<string | undefined>(undefined);
  const attentionRef = useRef<string | undefined>(undefined);
  const previousVoiceStatus = useRef<ThreadDetail['status'] | undefined>(thread?.status);
  const previousPresenceStatus = useRef<ThreadDetail['status'] | undefined>(thread?.status);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastNarratedEvent = useRef<string | undefined>(undefined);
  const [busyApprovalId, setBusyApprovalId] = useState<string>();
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const { speech, toggleSpeech, stopSpeech, cancelSpeech } = useReadAloud(onSpeak);
  const [voiceConversation, setVoiceConversation] = useState(false);
  useEffect(() => {
    if (globalVoiceActive) {
      setVoiceConversation(false);
      stopSpeech();
    }
  }, [globalVoiceActive, stopSpeech]);
  const [justCompleted, setJustCompleted] = useState(false);
  const [openWorkGroups, setOpenWorkGroups] = useState<ReadonlySet<string>>(() => new Set());
  const { draggingFiles, dropTargetProps } = useFileDrop(onDropAttachments);
  const [preview, setPreview] = useState<{
    attachment: RendererAttachment;
    result?: AttachmentPreview;
  }>();
  const eventRefs = useRef(new Map<string, HTMLDivElement>());
  const {
    findQuery,
    setFindQuery,
    findIndex,
    setFindIndex,
    matchingEventIds,
    matchingEventIdSet,
  } = useThreadFind(thread, findOpen, openWorkGroups, setOpenWorkGroups, eventRefs);

  const lastAssistant = thread?.events.findLast(
    (event) => event.type === 'message' && event.role === 'assistant',
  );
  const errorAlreadyExplained =
    lastAssistant?.type === 'message' &&
    (lastAssistant.content ?? '').trim() === thread?.error?.trim();
  // The Task needs attention banner explains the current failure next to Continue task,
  // so the conversation notice that reported it keeps only its title.
  const bannerNoticeId =
    thread?.error && !errorAlreadyExplained
      ? thread.events.findLast(
          (event) =>
            event.type === 'notice' &&
            event.tone === 'error' &&
            (event.detail ?? '').trim() === thread.error?.trim(),
        )?.id
      : undefined;

  useEffect(() => {
    stopSpeech();
    setVoiceConversation(false);
    setJustCompleted(false);
    previousVoiceStatus.current = thread?.status;
    previousPresenceStatus.current = thread?.status;
    lastNarratedEvent.current = undefined;
    if (completionTimer.current) clearTimeout(completionTimer.current);
    return () => {
      cancelSpeech();
      if (completionTimer.current) clearTimeout(completionTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per thread; the status read here is the starting point.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleSpeech is recreated every render.
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
    // A new approval, question, or failure needs the person: bring it into view once when it
    // arrives, then leave scrolling to them.
    const attention = waitingOnPerson(thread)?.key;
    const newAttention = Boolean(attention) && attention !== attentionRef.current;
    attentionRef.current = attention;
    if (newAttention && !switchedThreads) pinnedToLatestRef.current = true;
    // Sending a message always brings the reader to it, as it does in Codex and Claude.
    const lastSent = thread.events.findLast(
      (event) => event.type === 'message' && event.role === 'user',
    )?.id;
    if (lastSent !== lastSentMessageRef.current && !switchedThreads)
      pinnedToLatestRef.current = true;
    lastSentMessageRef.current = lastSent;
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
      scrollToLatest(scroller, 'instant');
      return;
    }

    if (pinnedToLatestRef.current) scrollToLatest(scroller, 'instant');
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

  // Rows call the latest handlers through one stable object, so a memoized row re-renders only
  // when its own event or state changes, not on every streamed token.
  const latestRowActions = useRef<RowActions | undefined>(undefined);
  useLayoutEffect(() => {
    latestRowActions.current = {
      registerRow: () => undefined,
      toggleSpeech: (eventId, text) => toggleSpeech(eventId, text),
      previewAttachment: (attachment) => {
        if (!onPreviewAttachment) return;
        setPreview({ attachment });
        void onPreviewAttachment(attachment.id).then(
          (result) => setPreview({ attachment, result }),
          (cause: unknown) =>
            setPreview({
              attachment,
              result: attachmentPreviewFailure(cause),
            }),
        );
      },
      loadThumbnail: async (attachment) => {
        if (!onPreviewAttachment || attachment.kind !== 'image') return undefined;
        const result = await onPreviewAttachment(attachment.id);
        return result.kind === 'image' ? result.dataUrl : undefined;
      },
      rateReply: (rating, reply) => onRateReply?.(rating, reply),
      redo: (text) => onRedo?.(text) ?? Promise.resolve(),
      resolveApproval: async (approvalId, decision) => {
        setBusyApprovalId(approvalId);
        try {
          await onResolveApproval(approvalId, decision);
        } finally {
          setBusyApprovalId(undefined);
        }
      },
    };
  });
  const rowActions = useMemo<RowActions>(
    () => ({
      registerRow: (eventId, node) => {
        if (node) eventRefs.current.set(eventId, node);
        else eventRefs.current.delete(eventId);
      },
      toggleSpeech: (eventId, text) =>
        latestRowActions.current?.toggleSpeech(eventId, text) ?? Promise.resolve(),
      previewAttachment: (attachment) =>
        latestRowActions.current?.previewAttachment(attachment),
      loadThumbnail: (attachment) =>
        latestRowActions.current?.loadThumbnail(attachment) ?? Promise.resolve(undefined),
      rateReply: (rating, reply) => latestRowActions.current?.rateReply(rating, reply),
      redo: (text) => latestRowActions.current?.redo(text) ?? Promise.resolve(),
      resolveApproval: (approvalId, decision) =>
        latestRowActions.current?.resolveApproval(approvalId, decision) ?? Promise.resolve(),
    }),
    [],
  );
  const latestTurnChanges = useRef(turnChanges);
  useLayoutEffect(() => {
    latestTurnChanges.current = turnChanges;
  });
  const turnChangeActions = useMemo<TurnChangeActions>(
    () => ({
      read: (eventId) => latestTurnChanges.current!.read(eventId),
      apply: (eventId, direction) => latestTurnChanges.current!.apply(eventId, direction),
    }),
    [],
  );
  const events = useMemo(() => thread?.events ?? [], [thread?.events]);
  const blocks = useMemo(() => conversationBlocks(events), [events]);
  const changedTurns = useMemo(() => turnChangeSummaries(events), [events]);
  // What the thread held when it opened. Rows added after that (a sent message, a new step,
  // the reply) ease in; reopening a thread shows its history still.
  const openedEventIds = useMemo(
    () => new Set((thread?.events ?? []).map(({ id }) => id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot the rows present when the thread opened.
    [thread?.id],
  );
  if (loading) return <ConversationSkeleton />;

  if (!thread) {
    return (
      <ConversationWelcome
        agentName={agentName}
        agentHue={agentHue}
        recentThreads={recentThreads}
        onOpenThread={onOpenThread}
        onCreateThread={onCreateThread}
        onCreateAgent={onCreateAgent}
        onOpenApps={onOpenApps}
      />
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
  const sentMessages = thread.events.flatMap((event) =>
    event.type === 'message' && event.role === 'user' && event.content.trim()
      ? [event.content]
      : [],
  );
  const resultId = completedReplyId(thread);
  // Edit and Try again change only the last exchange, and only once nothing is in flight.
  const redoable =
    Boolean(onRedo) &&
    (thread.status === 'idle' || thread.status === 'error') &&
    !thread.queuedMessages?.length &&
    lastUserEventIndex >= 0;
  const editableEventId = redoable ? thread.events[lastUserEventIndex]?.id : undefined;
  const tryAgainEventId = redoable ? currentAssistantEventId : undefined;
  const turnActive = running || waiting;
  const currentStep = running
    ? thread.events
        .slice(lastUserEventIndex + 1)
        .findLast(
          (event): event is ActivityEvent =>
            event.type === 'activity' && event.status === 'running',
        )
    : undefined;
  const usageWarning = usageWarningText(thread?.usageLimit);
  const currentPlan = running
    ? thread.events
        .slice(lastUserEventIndex + 1)
        .findLast(
          (event): event is ActivityEvent =>
            event.type === 'activity' && event.presentation?.kind === 'plan',
        )?.presentation
    : undefined;
  const currentPlanProgress =
    currentPlan?.kind === 'plan' ? planProgress(currentPlan.steps) : undefined;
  const renderEvent = (event: ThreadEvent, index: number) => {
    const previous = events[index - 1];
    return (
      <ConversationRow
        key={event.id}
        event={event}
        actions={rowActions}
        findMatch={matchingEventIdSet.has(event.id)}
        findCurrent={matchingEventIds[findIndex] === event.id}
        entering={!openedEventIds.has(event.id)}
        agentName={agentName}
        usageResetsAt={
          event.type === 'notice' && event.tone === 'error'
            ? thread?.usageLimit?.resetsAt
            : undefined
        }
        noticeExplained={
          event.id === bannerNoticeId ||
          (event.type === 'notice' &&
            event.tone === 'error' &&
            previous?.type === 'message' &&
            previous.role === 'assistant' &&
            (previous.content ?? '').trim() === (event.detail ?? '').trim())
        }
        agentHue={agentHue}
        busyApprovalId={event.type === 'approval' ? busyApprovalId : undefined}
        speechPhase={speech.eventId === event.id ? speech.phase : 'idle'}
        speechError={speech.eventId === event.id ? speech.error : undefined}
        streaming={running && event.id === currentAssistantEventId}
        justCompleted={justCompleted && event.id === currentAssistantEventId}
        completed={event.id === resultId}
        speakable={Boolean(voiceEnabled && onSpeak)}
        previewable={Boolean(onPreviewAttachment)}
        rateable={Boolean(onRateReply)}
        editable={event.id === editableEventId}
        retryable={event.id === tryAgainEventId}
      />
    );
  };

  // Undo changes sits under a finished reply that changed files; the running reply has none yet.
  const renderTurnChanges = (end: number) => {
    const summary = turnChanges ? changedTurns.get(end) : undefined;
    if (!summary || !turnChanges || (turnActive && end > lastUserEventIndex)) return null;
    return (
      <TurnChangesBar
        key={`changes:${summary.eventId}`}
        eventId={summary.eventId}
        fileCount={summary.fileCount}
        busy={running || waiting || queued}
        actions={turnChangeActions}
      />
    );
  };

  return (
    <main
      className={layout.mainPane}
      data-companion-conversation
      data-scene={thread.events.length ? 'conversation' : 'welcome'}
      data-file-dragging={draggingFiles ? 'true' : undefined}
      {...dropTargetProps}
    >
      <Aurora
        className={layout.conversationAurora}
        still={thread.events.length > 0}
        pauseWhenUnfocused
      />
      {findOpen ? (
        <ConversationFind
          query={findQuery}
          onQueryChange={setFindQuery}
          index={findIndex}
          onIndexChange={setFindIndex}
          matchCount={matchingEventIds.length}
          onClose={() => onFindOpenChange?.(false)}
        />
      ) : null}
      {draggingFiles ? <FileDropOverlay /> : null}
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
            <WelcomeHome
              agentName={agentName}
              agentHue={agentHue}
              prompts={starterPrompts}
              recentThreads={recentThreads}
              onSend={(prompt) => void onSend(prompt)}
              onOpenThread={onOpenThread}
              onOpenApps={onOpenApps}
            />
          ) : (
            <div className={styles.eventList}>
              {blocks.map((block) => [
                block.kind === 'event' ? (
                  renderEvent(block.event, block.index)
                ) : (
                  <WorkGroup
                    key={block.id}
                    events={block.events}
                    live={turnActive && block.start > lastUserEventIndex}
                    startedAt={eventTime(thread.events[block.start - 1])}
                    endedAt={eventTime(thread.events[block.end + 1])}
                    open={openWorkGroups.has(block.id)}
                    onToggle={() =>
                      setOpenWorkGroups((current) => {
                        const next = new Set(current);
                        if (!next.delete(block.id)) next.add(block.id);
                        return next;
                      })
                    }
                    renderStep={(event, position) => renderEvent(event, block.start + position)}
                  />
                ),
                renderTurnChanges(block.kind === 'event' ? block.index : block.end),
              ])}
              {running ? (
                <WorkingStatus
                  since={eventTime(thread.events[lastUserEventIndex])}
                  step={currentStep}
                  writing={Boolean(currentAssistantEventId)}
                  thinking={thread.thinking}
                  plan={currentPlanProgress}
                />
              ) : null}
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
                <ThreadErrorText
                  error={thread.error}
                  explained={errorAlreadyExplained}
                  usageResetsAt={thread.usageLimit?.resetsAt}
                />
              </div>
              <button
                type="button"
                className={`${buttons.secondaryButton} ${styles.bannerAction}`}
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
            <button
              type="button"
              className={styles.jumpToLatest}
              onClick={jumpToLatest}
              data-attention={waitingOnPerson(thread) ? 'true' : undefined}
            >
              <ArrowDown size={14} aria-hidden="true" />
              {waitingOnPerson(thread)?.label ?? 'Jump to latest'}
            </button>
          ) : null}
          {workspaceTools}
          {outlineAvailable ? (
            <ConversationOutline
              key={thread.id}
              events={thread.events}
              agentName={agentName}
              onNavigate={(eventId) => {
                const groupId = workGroupIdFor(thread.events, eventId);
                if (groupId && !openWorkGroups.has(groupId)) {
                  setOpenWorkGroups((current) => new Set(current).add(groupId));
                  requestAnimationFrame(() =>
                    eventRefs.current
                      .get(eventId)
                      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
                  );
                }
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

      {usageWarning ? (
        <p className={styles.usageWarning} role="status" data-testid="usage-warning">
          <WarningCircle size={14} aria-hidden="true" />
          {usageWarning}
        </p>
      ) : null}
      <QueuedMessages
        messages={thread.queuedMessages ?? []}
        agentName={agentName}
        onRemove={onRemoveQueued}
        onSendNow={running ? onSendQueuedNow : undefined}
      />
      <Composer
        key={thread.id}
        initialValue={thread.draft ?? ''}
        running={running || queued || waitingForApproval}
        stoppable={running || queued || waiting}
        executionLabel={executionLabel}
        attachments={attachments?.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          kind: attachment.kind === 'image' ? 'image' : 'file',
          sizeBytes: attachment.bytes,
        }))}
        acceptingAttachments={acceptingAttachments}
        onPickAttachments={onPickAttachments}
        onRemoveAttachment={onRemoveAttachment}
        onPasteFiles={onPasteAttachments}
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
        queued={queued}
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
        history={sentMessages}
        placeholder={
          pendingQuestion
            ? `Reply to ${agentName ?? 'Sia'}’s question`
            : waitingForApproval
              ? `Add a follow-up — ${agentName ?? 'Sia'} will pick it up after the approval`
              : running || queued
                ? `Add a follow-up — ${agentName ?? 'Sia'} will pick it up next`
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
