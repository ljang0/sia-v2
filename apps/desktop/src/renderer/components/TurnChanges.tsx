import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowArcLeft, ArrowArcRight, CheckCircle, SpinnerGap } from '@phosphor-icons/react';
import { memo, useState } from 'react';
import { reversibleFileChange } from '../../shared/turn-changes';
import type { ThreadEvent, TurnChanges } from '../types';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import styles from '../ui.module.css';
import local from './TurnChanges.module.css';

export interface TurnChangeActions {
  read(eventId: string): Promise<TurnChanges>;
  apply(eventId: string, direction: 'undo' | 'redo'): Promise<TurnChanges>;
}

export interface TurnChangeSummary {
  /** A file-change step of the reply; the main process finds the whole reply from it. */
  eventId: string;
  fileCount: number;
}

/**
 * Replies that changed files, keyed by the index of the reply's last event. A reply is offered
 * Undo only when every file change in it carries a complete record to play back.
 */
export function turnChangeSummaries(
  events: readonly ThreadEvent[],
): Map<number, TurnChangeSummary> {
  const summaries = new Map<number, TurnChangeSummary>();
  let files = new Set<string>();
  let eventId: string | undefined;
  let complete = true;
  const close = (end: number) => {
    if (eventId && complete && files.size)
      summaries.set(end, { eventId, fileCount: files.size });
    files = new Set();
    eventId = undefined;
    complete = true;
  };
  events.forEach((event, index) => {
    if (event.type === 'message' && event.role === 'user') close(index - 1);
    if (
      event.type !== 'activity' ||
      event.status !== 'complete' ||
      event.presentation?.kind !== 'file_change'
    )
      return;
    for (const file of event.presentation.files) {
      if (!reversibleFileChange(file)) complete = false;
      if (file.movePath) files.delete(file.path);
      files.add(file.movePath ?? file.path);
    }
    eventId = event.id;
  });
  close(events.length - 1);
  return summaries;
}

const CHANGE_WORDS: Record<TurnChanges['files'][number]['change'], string> = {
  added: 'Removed',
  edited: 'Back to before',
  deleted: 'Restored',
  renamed: 'Old name back',
};

/**
 * The line under a reply that changed files: "Changed 2 files · Undo changes". Undo asks first
 * and lists what goes back; afterwards the line reads "Changes undone" with Redo. The disk is
 * checked each time, so a file edited since is never overwritten.
 */
export const TurnChangesBar = memo(function TurnChangesBar({
  eventId,
  fileCount,
  busy,
  actions,
}: TurnChangeSummary & { busy: boolean; actions: TurnChangeActions }) {
  const [undone, setUndone] = useState(false);
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState<TurnChanges>();
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(plainMessage(cause));
    } finally {
      setPending(false);
    }
  };
  // The disk decides: a reply undone before Sia last opened reads as undone here too.
  const check = () =>
    run(async () => {
      const current = await actions.read(eventId);
      if (current.state === 'undone') setUndone(true);
      else setReview(current);
    });
  const apply = (direction: 'undo' | 'redo') =>
    run(async () => {
      const result = await actions.apply(eventId, direction);
      setUndone(result.state === 'undone');
    });

  const files = fileCount === 1 ? '1 file' : `${fileCount} files`;
  return (
    <div
      className={local.bar}
      data-testid="turn-changes"
      data-state={undone ? 'undone' : 'ready'}
    >
      {undone ? <CheckCircle size={14} className={local.doneIcon} aria-hidden="true" /> : null}
      <span className={local.label}>{undone ? 'Changes undone' : `Changed ${files}`}</span>
      <span className={local.separator} aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className={local.action}
        disabled={busy || pending}
        title={busy ? 'Available when this task ends' : undefined}
        onClick={() => void (undone ? apply('redo') : check())}
        data-testid={undone ? 'turn-changes-redo' : 'turn-changes-undo'}
      >
        {pending ? (
          <SpinnerGap size={13} className={styles.spin} aria-hidden="true" />
        ) : undone ? (
          <ArrowArcRight size={13} aria-hidden="true" />
        ) : (
          <ArrowArcLeft size={13} aria-hidden="true" />
        )}
        {undone ? 'Redo' : 'Undo changes'}
      </button>
      {error ? (
        <span className={local.error} role="alert">
          {error}
        </span>
      ) : null}
      <TurnChangesDialog
        review={review}
        onClose={() => setReview(undefined)}
        onConfirm={() => {
          setReview(undefined);
          void apply('undo');
        }}
      />
    </div>
  );
});

function TurnChangesDialog({
  review,
  onClose,
  onConfirm,
}: {
  review: TurnChanges | undefined;
  onClose(): void;
  onConfirm(): void;
}) {
  const ready = review?.state === 'ready';
  const blocked = review?.state === 'changed' || review?.state === 'unavailable';
  return (
    <AlertDialog.Root open={Boolean(review)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogs.dialogOverlay} />
        <AlertDialog.Content
          className={dialogs.alertDialogContent}
          data-testid="turn-changes-dialog"
        >
          <AlertDialog.Title>
            {ready
              ? 'Undo the changes from this reply?'
              : review?.state === 'changed'
                ? 'These files changed since'
                : 'Sia can’t undo these changes'}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className={local.body}>
              <p>
                {ready
                  ? 'These files go back to how they were before this reply:'
                  : review?.state === 'changed'
                    ? 'Putting them back would lose the newer edits, so Sia left everything as it is:'
                    : 'Sia doesn’t have a full record of these files, or they’re in a place Sia doesn’t change:'}
              </p>
              <ul className={local.files}>
                {blocked
                  ? review.blocked.map((path) => (
                      <li key={path}>
                        <span className={local.path}>{path}</span>
                      </li>
                    ))
                  : review?.files.map((file) => (
                      <li key={file.path}>
                        <span className={local.path}>{file.path}</span>
                        <span className={local.change}>{CHANGE_WORDS[file.change]}</span>
                      </li>
                    ))}
              </ul>
              {ready ? (
                <p className={local.note}>
                  Only these files go back. Messages or emails that were sent, and anything done
                  in other apps or on websites, stay as they are.
                </p>
              ) : null}
            </div>
          </AlertDialog.Description>
          <div className={dialogs.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button type="button" className={buttons.secondaryButton}>
                {ready ? 'Cancel' : 'OK'}
              </button>
            </AlertDialog.Cancel>
            {ready ? (
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={buttons.primaryButton}
                  onClick={onConfirm}
                  data-testid="turn-changes-confirm"
                >
                  Undo changes
                </button>
              </AlertDialog.Action>
            ) : null}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function plainMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return (
    message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').trim() ||
    'Sia couldn’t finish that. Try again.'
  );
}
