import {
  ArrowClockwise,
  ChatCircle,
  Check,
  Copy,
  PencilSimple,
  SpeakerHigh,
  SpinnerGap,
  StopCircle,
  User,
  WarningCircle,
} from '@phosphor-icons/react';
import { memo, useEffect, useRef, useState } from 'react';
import type { ApprovalDecision, RendererAttachment, ThreadEvent } from '../../types';
import buttons from '../../styles/buttons.module.css';
import primitives from '../../styles/primitives.module.css';
import styles from '../Conversation.module.css';
import { ActivityRow } from '../ActivityRow';
import { AgentForm } from '../AgentForm';
import { ApprovalCard } from '../ApprovalCard';
import { AttachmentChip } from '../ConversationAttachments';
import { RowErrorBoundary } from '../ErrorBoundary';
import { NoticeText } from '../PlainErrorText';
import { ReplyFeedbackButtons, type ReplyRating } from '../ReplyFeedback';
import { ReplyReadyMark, ReplySurface } from '../ResultCard';
import { SafeMarkdown } from '../SafeMarkdown';

interface EventViewProps {
  agentName?: string | undefined;
  completed?: boolean | undefined;
  noticeExplained?: boolean;
  /** When the thread's plan usage window resets, for a usage-limit failure. */
  usageResetsAt?: string | undefined;
  event: ThreadEvent;
  agentHue?: number | undefined;
  busyApprovalId?: string | undefined;
  speechPhase: 'idle' | 'loading' | 'playing';
  speechError?: string | undefined;
  streaming?: boolean | undefined;
  justCompleted?: boolean | undefined;
  onToggleSpeech?: ((text: string) => Promise<void>) | undefined;
  onRateReply?: ((rating: ReplyRating, reply: string) => void) | undefined;
  /** Replaces the last message with new text and asks again. */
  onEditMessage?: ((text: string) => Promise<void>) | undefined;
  /** Asks the last message again for a new reply. */
  onTryAgain?: (() => Promise<void>) | undefined;
  onPreviewAttachment?: ((attachment: RendererAttachment) => void) | undefined;
  onLoadThumbnail?:
    ((attachment: RendererAttachment) => Promise<string | undefined>) | undefined;
  onResolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
}

export interface RowActions {
  registerRow(eventId: string, node: HTMLDivElement | null): void;
  toggleSpeech(eventId: string, text: string): Promise<void>;
  previewAttachment(attachment: RendererAttachment): void;
  loadThumbnail(attachment: RendererAttachment): Promise<string | undefined>;
  rateReply(rating: ReplyRating, reply: string): void;
  redo(text?: string): Promise<void>;
  resolveApproval(approvalId: string, decision: ApprovalDecision): Promise<void>;
}

interface ConversationRowProps extends Omit<
  EventViewProps,
  | 'onToggleSpeech'
  | 'onPreviewAttachment'
  | 'onLoadThumbnail'
  | 'onResolveApproval'
  | 'onRateReply'
  | 'onEditMessage'
  | 'onTryAgain'
> {
  actions: RowActions;
  findMatch: boolean;
  findCurrent: boolean;
  /** Added after the thread opened; the row eases in once when it mounts. */
  entering: boolean;
  speakable: boolean;
  previewable: boolean;
  rateable: boolean;
  editable: boolean;
  retryable: boolean;
}

/** One transcript row. Memoized so streaming into the last reply leaves earlier rows alone. */
export const ConversationRow = memo(function ConversationRow({
  actions,
  findMatch,
  findCurrent,
  entering,
  speakable,
  previewable,
  rateable,
  editable,
  retryable,
  ...view
}: ConversationRowProps) {
  const { event } = view;
  return (
    <div
      ref={(node) => actions.registerRow(event.id, node)}
      className={styles.eventSearchAnchor}
      tabIndex={-1}
      data-entering={entering ? 'true' : undefined}
      data-find-match={findMatch ? 'true' : undefined}
      data-find-current={findCurrent ? 'true' : undefined}
    >
      <EventView
        {...view}
        onToggleSpeech={speakable ? (text) => actions.toggleSpeech(event.id, text) : undefined}
        onPreviewAttachment={previewable ? actions.previewAttachment : undefined}
        onLoadThumbnail={previewable ? actions.loadThumbnail : undefined}
        onRateReply={rateable ? actions.rateReply : undefined}
        onEditMessage={editable ? (text) => actions.redo(text) : undefined}
        onTryAgain={retryable ? () => actions.redo() : undefined}
        onResolveApproval={actions.resolveApproval}
      />
    </div>
  );
});

/** One conversation row; a rendering failure stays inside the row. */
function EventView(props: EventViewProps) {
  return (
    <RowErrorBoundary resetKey={props.event}>
      <EventViewContent {...props} />
    </RowErrorBoundary>
  );
}

function EventViewContent({
  agentName = 'Sia',
  completed,
  event,
  noticeExplained,
  usageResetsAt,
  agentHue,
  busyApprovalId,
  speechPhase,
  speechError,
  streaming,
  justCompleted,
  onToggleSpeech,
  onRateReply,
  onEditMessage,
  onTryAgain,
  onPreviewAttachment,
  onLoadThumbnail,
  onResolveApproval,
}: EventViewProps) {
  const [editDraft, setEditDraft] = useState<string>();
  const [redoing, setRedoing] = useState(false);
  const editing = editDraft !== undefined && Boolean(onEditMessage);
  const redo = (action: () => Promise<void>) => {
    setRedoing(true);
    void action()
      .then(
        () => setEditDraft(undefined),
        () => undefined,
      )
      .finally(() => setRedoing(false));
  };
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
      <div
        className={`${primitives.notice} ${primitives[`notice_${event.tone}`]}`}
        role="status"
      >
        <WarningCircle size={17} aria-hidden="true" />
        <div>
          <NoticeText
            title={event.title}
            detail={event.detail}
            tone={event.tone}
            explained={noticeExplained}
            usageResetsAt={usageResetsAt}
          />
        </div>
      </div>
    );
  }
  if (event.type === 'question') {
    return (
      <div className={primitives.notice} role="status">
        <ChatCircle size={17} aria-hidden="true" />
        <div>
          <strong>{agentName} has a question</strong>
          <SafeMarkdown content={event.prompt} />
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
        <span>{event.role === 'user' ? 'You' : agentName}</span>
        {event.role === 'assistant' ? <ReplyReadyMark ready={Boolean(completed)} /> : null}
        <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
        {/* A reply still being written has nothing whole to copy, read, or rate yet. */}
        {streaming ? null : <CopyMessageButton content={event.content} />}
        {event.role === 'user' && onEditMessage && !editing ? (
          <button
            type="button"
            className={styles.messageActionButton}
            onClick={() => setEditDraft(event.content)}
            aria-label="Edit message"
            title="Edit message"
            data-testid="message-edit"
          >
            <PencilSimple size={14} aria-hidden="true" />
          </button>
        ) : null}
        {event.role === 'assistant' && onTryAgain && !streaming ? (
          <button
            type="button"
            className={styles.messageActionButton}
            onClick={() => redo(onTryAgain)}
            disabled={redoing}
            aria-label="Try again"
            title="Ask again for a new reply"
            data-testid="message-try-again"
          >
            <ArrowClockwise size={14} aria-hidden="true" />
          </button>
        ) : null}
        {event.role === 'assistant' && onToggleSpeech && !streaming ? (
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
              <SpinnerGap className={primitives.spin} size={14} aria-hidden="true" />
            ) : speechPhase === 'playing' ? (
              <StopCircle size={14} weight="fill" aria-hidden="true" />
            ) : (
              <SpeakerHigh size={14} aria-hidden="true" />
            )}
          </button>
        ) : null}
        {event.role === 'assistant' && onRateReply && !streaming ? (
          <ReplyFeedbackButtons onRate={(rating) => onRateReply(rating, event.content)} />
        ) : null}
      </header>
      <div
        className={`${styles.messageContent} ${streaming ? styles.streamingContent : ''}`}
        data-streaming={streaming ? 'true' : undefined}
      >
        {editing ? (
          <form
            className={styles.messageEditor}
            onSubmit={(submit) => {
              submit.preventDefault();
              const text = editDraft.trim();
              if (text) redo(() => onEditMessage!(text));
            }}
          >
            <textarea
              aria-label="Edit message"
              value={editDraft}
              autoFocus
              rows={Math.min(8, Math.max(2, editDraft.split('\n').length))}
              onChange={(change) => setEditDraft(change.target.value)}
              onKeyDown={(key) => {
                if (key.key === 'Escape') {
                  key.preventDefault();
                  key.stopPropagation();
                  setEditDraft(undefined);
                } else if (
                  key.key === 'Enter' &&
                  !key.shiftKey &&
                  !key.nativeEvent.isComposing
                ) {
                  key.preventDefault();
                  key.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div>
              <button
                type="button"
                className={buttons.secondaryButton}
                onClick={() => setEditDraft(undefined)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={buttons.primaryButton}
                disabled={redoing || !editDraft.trim()}
              >
                {redoing ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        ) : event.role === 'user' ? (
          // What the person typed is shown verbatim; snake_case must not become italics.
          <p>{event.content}</p>
        ) : (
          <SafeMarkdown content={event.content} />
        )}
        {event.attachments?.length ? (
          <div className={styles.messageAttachments} aria-label="Message attachments">
            {event.attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onPreview={onPreviewAttachment}
                onLoadThumbnail={onLoadThumbnail}
              />
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
  // Every reply keeps the same frame, so it never moves when it becomes (or stops being) the
  // result; only the card's paint changes.
  return event.role === 'assistant' ? (
    <ReplySurface ready={Boolean(completed)}>{message}</ReplySurface>
  ) : (
    message
  );
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
      title={copied ? undefined : 'Copy message'}
      data-copied={copied ? 'true' : undefined}
    >
      {copied ? (
        <Check size={14} weight="bold" className={styles.copiedCheck} aria-hidden="true" />
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
      {copied ? (
        <span className={styles.copiedTip} aria-hidden="true">
          Copied
        </span>
      ) : null}
    </button>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
