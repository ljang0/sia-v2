import { activityLabel, completedActivityLabel } from '../../shared/activity-label';
import { clipText } from '../../shared/plain-text';
import {
  Browser,
  CaretDown,
  CheckCircle,
  CircleNotch,
  Clock,
  Desktop,
  GitDiff,
  Globe,
  ListChecks,
  PlugsConnected,
  Robot,
  Sparkle,
  TerminalWindow,
  WarningCircle,
} from '@phosphor-icons/react';
import { useState } from 'react';
import type { ActivityEvent } from '../types';
import styles from '../ui.module.css';

interface ActivityRowProps {
  event: ActivityEvent;
}

const icons = {
  command: TerminalWindow,
  browser: Browser,
  computer: Desktop,
  connector: PlugsConnected,
  plan: ListChecks,
  other: Sparkle,
};

export function ActivityRow({ event }: ActivityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = presentationIcon(event) ?? icons[event.kind];
  const StatusIcon =
    event.status === 'complete'
      ? CheckCircle
      : event.status === 'error'
        ? WarningCircle
        : Clock;
  const statusClass = event.status === 'complete' ? '' : styles[`activity_${event.status}`];
  const hasDetail = Boolean(event.title || event.detail || event.presentation);
  const runningLabel = activityLabel(event.toolName, event.presentation?.kind ?? event.kind);
  const label =
    event.status === 'complete' ? completedActivityLabel(runningLabel) : runningLabel;
  const summary = activitySummary(event, [runningLabel, label]);
  // The plain title only when the rich detail below does not already say it. Never the raw
  // tool name (computer_action, mail_send): the label above already names the step.
  const detailTitle =
    !event.presentation && summary && event.title !== event.detail ? event.title : '';

  return (
    <div className={`${styles.activityRow} ${statusClass}`}>
      <button
        type="button"
        className={styles.activityButton}
        onClick={() => hasDetail && setExpanded((value) => !value)}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        <Icon size={16} aria-hidden="true" />
        <span className={styles.activityTitle}>
          {label}
          {summary ? (
            <span
              className={
                event.presentation?.kind === 'command'
                  ? `${styles.activitySummary} ${styles.activitySummaryCode}`
                  : styles.activitySummary
              }
            >
              {summary}
            </span>
          ) : null}
        </span>
        <span className={styles.visuallyHidden}>Status: {event.status}</span>
        <StatusIcon
          size={15}
          className={event.status === 'error' ? styles.activityErrorIcon : undefined}
          aria-hidden="true"
        />
        {hasDetail ? (
          <CaretDown
            size={13}
            className={expanded ? styles.caretExpanded : styles.caret}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {expanded && hasDetail ? (
        <div className={styles.activityDetail}>
          {detailTitle ? <p>{detailTitle}</p> : null}
          <RichActivityDetail event={event} />
        </div>
      ) : null}
    </div>
  );
}

/** One specific, plain line about the step: the command, the files, or the search. */
export function activitySummary(event: ActivityEvent, labels: readonly string[]): string {
  const presentation = event.presentation;
  if (presentation?.kind === 'command') return clipText(singleLine(presentation.command), 90);
  if (presentation?.kind === 'file_change' && presentation.files.length) {
    const first = baseName(presentation.files[0]!.path);
    const more = presentation.files.length - 1;
    return more ? `${first} and ${more} more` : first;
  }
  if (presentation?.kind === 'web_search' && presentation.query)
    return clipText(singleLine(presentation.query), 90);
  const title = singleLine(event.title ?? '');
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    !title ||
    labels.some((label) => key(label).includes(key(title))) ||
    (event.toolName && key(event.toolName) === key(title))
  )
    return '';
  return clipText(title, 90);
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function baseName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

function presentationIcon(event: ActivityEvent) {
  if (event.presentation?.kind === 'file_change') return GitDiff;
  if (event.presentation?.kind === 'web_search') return Globe;
  if (event.presentation?.kind === 'subagent') return Robot;
  return undefined;
}

function RichActivityDetail({ event }: { event: ActivityEvent }) {
  const presentation = event.presentation;
  if (!presentation) return event.detail;
  if (presentation.kind === 'command') {
    return (
      <div className={styles.activityStack}>
        <code>{presentation.command}</code>
        {presentation.cwd ? <small>{presentation.cwd}</small> : null}
        {presentation.output ? (
          <pre>{presentation.output}</pre>
        ) : (
          <span>Waiting for output…</span>
        )}
        {presentation.exitCode !== undefined || presentation.durationMs !== undefined ? (
          <small>
            {presentation.exitCode === null || presentation.exitCode === undefined
              ? 'Running'
              : `Exit ${presentation.exitCode}`}
            {presentation.durationMs === null || presentation.durationMs === undefined
              ? ''
              : ` · ${formatDuration(presentation.durationMs)}`}
          </small>
        ) : null}
      </div>
    );
  }
  if (presentation.kind === 'file_change') {
    if (!presentation.files.length) {
      return (
        <span>
          {event.status === 'running'
            ? 'Preparing file changes…'
            : 'No file details were shared.'}
        </span>
      );
    }
    return (
      <ul className={styles.activityList}>
        {presentation.files.map((file) => {
          const stats = fileChangeStats(file);
          return (
            <li key={`${file.path}:${file.change}`}>
              <span>{file.movePath ? `${file.path} → ${file.movePath}` : file.path}</span>
              <small>
                {fileChangeWord(file.change)}
                {stats.added ? (
                  <span className={styles.diffAdded}>{` +${stats.added}`}</span>
                ) : null}
                {stats.removed ? (
                  <span className={styles.diffRemoved}>{` −${stats.removed}`}</span>
                ) : null}
              </small>
            </li>
          );
        })}
      </ul>
    );
  }
  if (presentation.kind === 'web_search') {
    return presentation.sources.length ? (
      <ul className={styles.activitySources}>
        {presentation.sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title || source.url}
            </a>
          </li>
        ))}
      </ul>
    ) : (
      <span>{presentation.query || 'Searching the public web…'}</span>
    );
  }
  if (presentation.kind === 'plan') {
    return (
      <ol className={styles.activityPlan}>
        {presentation.steps.map((step) => (
          <li
            key={step.id}
            data-status={step.status}
            aria-current={step.status === 'in_progress' ? 'step' : undefined}
          >
            <span aria-hidden="true">
              {step.status === 'completed' ? (
                '✓'
              ) : step.status === 'in_progress' ? (
                <CircleNotch size={11} className={styles.workingSpinner} />
              ) : (
                '·'
              )}
            </span>
            {step.text}
          </li>
        ))}
      </ol>
    );
  }
  if (presentation.kind === 'subagent') {
    return (
      <div className={styles.activityStack}>
        <span>{presentation.text || subagentSummary(presentation.phase)}</span>
        {presentation.model || presentation.reasoningEffort ? (
          <small>
            {[presentation.model, presentation.reasoningEffort].filter(Boolean).join(' · ')}
          </small>
        ) : null}
      </div>
    );
  }
  if (presentation.kind === 'image') return <span>{presentation.path}</span>;
  if (presentation.kind === 'review') return <span>{presentation.review}</span>;
  if (presentation.kind === 'compaction') {
    return <span>Sia reduced older context while keeping the current task active.</span>;
  }
  return event.detail;
}

/** Plain word for a Codex patch kind; unknown kinds are shown as sent. */
export function fileChangeWord(change: string): string {
  const words: Record<string, string> = {
    add: 'Added',
    delete: 'Deleted',
    update: 'Edited',
    rename: 'Renamed',
  };
  return words[change] ?? change;
}

/**
 * Line counts for one changed file. Codex sends the whole file as `diff` for an add or a
 * delete and a unified diff for an update.
 */
export function fileChangeStats(file: { change: string; diff?: string | undefined }): {
  added: number;
  removed: number;
} {
  const diff = file.diff ?? '';
  if (!diff) return { added: 0, removed: 0 };
  const lines = diff.replace(/\n$/, '').split('\n');
  if (file.change === 'add') return { added: lines.length, removed: 0 };
  if (file.change === 'delete') return { added: 0, removed: lines.length };
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { added, removed };
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1_000).toFixed(1)} s`;
}

function subagentSummary(phase: 'started' | 'message' | 'completed' | 'failed'): string {
  if (phase === 'completed') return 'Finished';
  if (phase === 'failed') return 'Stopped with an error';
  if (phase === 'message') return 'Shared an update';
  return 'Working in parallel';
}
