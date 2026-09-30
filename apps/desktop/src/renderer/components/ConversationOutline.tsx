import {
  CaretRight,
  ChatCircleText,
  Check,
  Circle,
  ListBullets,
  ListChecks,
  Robot,
  SpinnerGap,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { activityLabel } from '../../shared/activity-label';
import { clipText, plainText } from '../../shared/plain-text';
import type { ActivityEvent, ThreadEvent } from '../types';
import buttons from '../styles/buttons.module.css';
import styles from '../ui.module.css';

type OutlineStatus = ActivityEvent['status'];

interface ConversationOutlineStep {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ConversationOutlineEntry {
  id: string;
  eventId: string;
  kind: 'message' | 'activity' | 'plan' | 'subagent';
  label: string;
  preview: string;
  status?: OutlineStatus | undefined;
  steps?: ConversationOutlineStep[] | undefined;
}

interface ConversationOutlineProps {
  events: readonly ThreadEvent[];
  agentName?: string | undefined;
  onNavigate(eventId: string): void;
}

export function hasConversationOutline(events: readonly ThreadEvent[]): boolean {
  return events.some((event) => event.type === 'message' || event.type === 'activity');
}

export function projectConversationOutline(
  events: readonly ThreadEvent[],
  agentName = 'Sia',
): ConversationOutlineEntry[] {
  return events.flatMap((event): ConversationOutlineEntry[] => {
    if (event.type === 'message') {
      return [
        {
          id: event.id,
          eventId: event.id,
          kind: 'message',
          label: event.role === 'user' ? 'You' : agentName,
          preview: outlinePreview(event.content, 'Message'),
        },
      ];
    }

    if (event.type !== 'activity') return [];
    if (event.presentation?.kind === 'plan') {
      const completed = event.presentation.steps.filter(
        ({ status }) => status === 'completed',
      ).length;
      const total = event.presentation.steps.length;
      return [
        {
          id: event.id,
          eventId: event.id,
          kind: 'plan',
          label: event.title || 'Plan',
          preview:
            total === 0
              ? outlinePreview(event.detail ?? '', 'Plan is taking shape')
              : `${completed} of ${total} ${total === 1 ? 'step' : 'steps'} finished`,
          status: event.status,
          steps: event.presentation.steps.map((step) => ({ ...step })),
        },
      ];
    }

    if (event.presentation?.kind === 'subagent') {
      return [
        {
          id: event.id,
          eventId: event.id,
          kind: 'subagent',
          label: event.presentation.name || 'Parallel work',
          preview: outlinePreview(
            event.presentation.text ?? '',
            subagentPhaseLabel(event.presentation.phase),
          ),
          status: event.status,
        },
      ];
    }

    return [
      {
        id: event.id,
        eventId: event.id,
        kind: 'activity',
        label: activityLabel(event.toolName, event.presentation?.kind ?? event.kind),
        preview: outlinePreview(event.detail ?? '', activityKindLabel(event.kind)),
        status: event.status,
      },
    ];
  });
}

export function ConversationOutline({
  events,
  agentName,
  onNavigate,
}: ConversationOutlineProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // Every message and tool step gets one entry. Count them cheaply and build the previews only
  // while the outline is open, so a streaming reply does not re-summarize the whole thread.
  const messageCount = events.filter(({ type }) => type === 'message').length;
  const workCount = events.filter(({ type }) => type === 'activity').length;
  const entries = useMemo(
    () => (open ? projectConversationOutline(events, agentName) : []),
    [agentName, events, open],
  );

  useLayoutEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('[data-outline-item]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [open]);

  if (messageCount + workCount === 0) return null;

  const navigate = (eventId: string) => {
    setOpen(false);
    onNavigate(eventId);
  };

  return (
    <div className={styles.conversationOutlineRoot}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.conversationOutlineTrigger}
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="Thread outline"
        title="Thread outline"
        onClick={() => setOpen((current) => !current)}
      >
        <ListBullets size={15} aria-hidden="true" />
        <span>Outline</span>
        <small>{messageCount + workCount}</small>
      </button>

      {open ? (
        <aside
          ref={panelRef}
          id={panelId}
          className={styles.conversationOutlinePanel}
          aria-label="Conversation outline"
        >
          <header>
            <div>
              <span>Thread trail</span>
              <h2>How this conversation unfolded</h2>
              <p>{outlineSummary(messageCount, workCount)}</p>
            </div>
            <button
              type="button"
              className={buttons.iconButtonSmall}
              onClick={() => {
                setOpen(false);
                requestAnimationFrame(() => triggerRef.current?.focus());
              }}
              aria-label="Close thread outline"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <ol className={styles.conversationOutlineList}>
            {entries.map((entry) => (
              <OutlineEntry key={entry.id} entry={entry} onNavigate={navigate} />
            ))}
          </ol>
        </aside>
      ) : null}
    </div>
  );
}

function OutlineEntry({
  entry,
  onNavigate,
}: {
  entry: ConversationOutlineEntry;
  onNavigate(eventId: string): void;
}) {
  const Icon =
    entry.kind === 'message'
      ? ChatCircleText
      : entry.kind === 'plan'
        ? ListChecks
        : entry.kind === 'subagent'
          ? Robot
          : CaretRight;

  return (
    <li data-kind={entry.kind} data-status={entry.status}>
      <button type="button" data-outline-item onClick={() => onNavigate(entry.eventId)}>
        <span className={styles.conversationOutlineIcon} aria-hidden="true">
          <Icon size={15} />
        </span>
        <span className={styles.conversationOutlineCopy}>
          <strong>{entry.label}</strong>
          <small>{entry.preview}</small>
        </span>
        {entry.status ? <OutlineStatus status={entry.status} /> : null}
      </button>
      {entry.steps?.length ? (
        <ol className={styles.conversationOutlineSteps} aria-label={`${entry.label} steps`}>
          {entry.steps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <button type="button" onClick={() => onNavigate(entry.eventId)}>
                <span aria-hidden="true">
                  {step.status === 'completed' ? (
                    <Check size={12} weight="bold" />
                  ) : step.status === 'in_progress' ? (
                    <SpinnerGap size={12} />
                  ) : (
                    <Circle size={8} />
                  )}
                </span>
                <span>{step.text}</span>
                <span className={styles.visuallyHidden}>{stepStatusLabel(step.status)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function OutlineStatus({ status }: { status: OutlineStatus }) {
  const label = activityStatusLabel(status);
  return (
    <span className={styles.conversationOutlineStatus} data-status={status} title={label}>
      {status === 'error' ? (
        <WarningCircle size={13} aria-hidden="true" />
      ) : status === 'complete' ? (
        <Check size={12} weight="bold" aria-hidden="true" />
      ) : status === 'running' ? (
        <SpinnerGap size={13} aria-hidden="true" />
      ) : (
        <Circle size={8} aria-hidden="true" />
      )}
      <span className={styles.visuallyHidden}>{label}</span>
    </span>
  );
}

function outlinePreview(value: string, fallback: string): string {
  const normalized = plainText(value);
  return normalized ? clipText(normalized, 104) : fallback;
}

function outlineSummary(messages: number, work: number): string {
  const messageLabel = `${messages} ${messages === 1 ? 'message' : 'messages'}`;
  const workLabel = `${work} ${work === 1 ? 'work note' : 'work notes'}`;
  return `${messageLabel} · ${workLabel}`;
}

function activityKindLabel(kind: ActivityEvent['kind']): string {
  if (kind === 'browser') return 'Browser work';
  if (kind === 'computer') return 'Computer work';
  if (kind === 'connector') return 'Connected app';
  if (kind === 'plan') return 'Plan';
  if (kind === 'other') return 'Work step';
  return 'Command';
}

function subagentPhaseLabel(phase: 'started' | 'message' | 'completed' | 'failed'): string {
  if (phase === 'completed') return 'Parallel work finished';
  if (phase === 'failed') return 'Parallel work stopped';
  if (phase === 'message') return 'Shared an update';
  return 'Working in parallel';
}

function activityStatusLabel(status: OutlineStatus): string {
  if (status === 'complete') return 'Complete';
  if (status === 'error') return 'Stopped with an error';
  if (status === 'queued') return 'Queued';
  return 'In progress';
}

function stepStatusLabel(status: ConversationOutlineStep['status']): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In progress';
  return 'Pending';
}
