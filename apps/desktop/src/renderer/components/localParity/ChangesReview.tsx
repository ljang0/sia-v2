import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  ArrowCounterClockwise,
  Camera,
  Check,
  File,
  GitDiff,
  MagnifyingGlass,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import type { WorkspaceSnapshot } from '../../types';
import buttons from '../../styles/buttons.module.css';
import dialogs from '../../styles/dialogs.module.css';
import surface from './localParity.module.css';
import ui from '../../ui.module.css';
import styles from './ChangesReview.module.css';
import { shortDateTime } from '../../format';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  additions: number;
  deletions: number;
  staged: boolean;
  patch: string;
}

interface ChangesReviewProps {
  workspace: string;
  files: readonly ChangedFile[];
  busyPath?: string | undefined;
  onStage(path: string): Promise<void> | void;
  onRestore(path: string): Promise<void> | void;
  onReview?(): Promise<void> | void;
  reviewing?: boolean | undefined;
  snapshots?: readonly WorkspaceSnapshot[] | undefined;
  snapshotBusy?: string | undefined;
  onCreateSnapshot?(): Promise<void> | void;
  onRestoreSnapshot?(snapshotId: string): Promise<void> | void;
  onDeleteSnapshot?(snapshotId: string): Promise<void> | void;
}

export function ChangesReview({
  workspace,
  files,
  busyPath,
  onStage,
  onRestore,
  onReview,
  reviewing,
  snapshots = [],
  snapshotBusy,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}: ChangesReviewProps) {
  const [selectedPath, setSelectedPath] = useState(files[0]?.path);
  const [restorePath, setRestorePath] = useState<string>();
  const titleId = useId();
  const selected = files.find((file) => file.path === selectedPath) ?? files[0];

  useEffect(() => {
    if (!selected && files[0]) setSelectedPath(files[0].path);
  }, [files, selected]);

  return (
    <section className={surface.changesReview} aria-labelledby={titleId}>
      <div className={surface.localSurfaceHeader}>
        <div>
          <span className={ui.sectionLabel} title={workspace}>
            Workspace · {workspace.split('/').filter(Boolean).at(-1) ?? workspace}
          </span>
          <h2 id={titleId}>Changes</h2>
        </div>
        <div className={styles.localHeaderActions}>
          <span className={styles.changeCount}>
            <GitDiff size={15} aria-hidden="true" />
            {files.length} {files.length === 1 ? 'file' : 'files'}
          </span>
          {onReview && files.length ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              onClick={() => void onReview()}
              disabled={reviewing}
              data-testid="code-review-start"
            >
              <MagnifyingGlass size={14} aria-hidden="true" />
              {reviewing ? 'Starting…' : 'Review'}
            </button>
          ) : null}
          {onCreateSnapshot && files.length ? (
            <button
              type="button"
              className={buttons.secondaryButton}
              onClick={() => void onCreateSnapshot()}
              disabled={Boolean(snapshotBusy)}
              data-testid="workspace-snapshot-create"
            >
              <Camera size={14} aria-hidden="true" />
              Snapshot
            </button>
          ) : null}
        </div>
      </div>

      {snapshots.length ? (
        <details className={styles.workspaceSnapshots} data-testid="workspace-snapshot-list">
          <summary>
            {snapshots.length} saved {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
          </summary>
          <div>
            {snapshots.map((snapshot) => (
              <div key={snapshot.id}>
                <time dateTime={snapshot.createdAt}>{shortDateTime(snapshot.createdAt)}</time>
                <span>
                  <button
                    type="button"
                    className={`${buttons.textButton} ${styles.snapshotAction}`}
                    disabled={Boolean(snapshotBusy) || files.length > 0}
                    title={files.length ? 'Restore into a clean workspace' : 'Restore snapshot'}
                    onClick={() => void onRestoreSnapshot?.(snapshot.id)}
                    data-testid="workspace-snapshot-restore"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className={`${buttons.textButtonDanger} ${styles.snapshotAction}`}
                    disabled={Boolean(snapshotBusy)}
                    aria-label={`Delete snapshot from ${shortDateTime(snapshot.createdAt)}`}
                    onClick={() => void onDeleteSnapshot?.(snapshot.id)}
                    data-testid="workspace-snapshot-delete"
                  >
                    <Trash size={13} aria-hidden="true" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {selected ? (
        <div className={styles.changesLayout}>
          <div className={styles.changeFileList} aria-label="Changed files">
            {files.map((file) => (
              <button
                type="button"
                key={file.path}
                className={file.path === selected.path ? styles.changeFileSelected : ''}
                aria-pressed={file.path === selected.path}
                onClick={() => setSelectedPath(file.path)}
                data-testid="git-change-row"
              >
                <File size={15} aria-hidden="true" />
                <span title={file.path}>{file.path}</span>
                <small data-status={file.status}>{statusLabel(file.status)}</small>
                <span className={styles.changeStats}>
                  <span>+{file.additions}</span>
                  <span>−{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.diffPane}>
            <header>
              <strong title={selected.path}>{selected.path}</strong>
              <div>
                {!selected.staged ? (
                  <button
                    type="button"
                    className={buttons.secondaryButton}
                    disabled={busyPath === selected.path}
                    onClick={() => void onStage(selected.path)}
                    data-testid="git-stage"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Stage
                  </button>
                ) : (
                  <span className={styles.changeStaged} data-testid="git-staged-group">
                    {selected.path} · Staged
                  </span>
                )}
                <button
                  type="button"
                  className={buttons.textButtonDanger}
                  disabled={busyPath === selected.path}
                  onClick={() => setRestorePath(selected.path)}
                  data-testid="git-restore"
                >
                  <ArrowCounterClockwise size={14} aria-hidden="true" />
                  Restore
                </button>
              </div>
            </header>
            <UnifiedDiff patch={selected.patch} />
          </div>
        </div>
      ) : (
        <p className={surface.localEmpty}>
          No file changes yet. When Sia edits files in this folder, you can review them here.
        </p>
      )}

      <AlertDialog.Root
        open={Boolean(restorePath)}
        onOpenChange={(open) => !open && setRestorePath(undefined)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogs.dialogOverlay} />
          <AlertDialog.Content className={dialogs.alertDialogContent}>
            <div>
              <ArrowCounterClockwise size={20} aria-hidden="true" />
            </div>
            <AlertDialog.Title>Discard changes to this file?</AlertDialog.Title>
            <AlertDialog.Description>
              This restores {restorePath} from the workspace baseline. Uncommitted edits in this
              file cannot be recovered by Sia.
            </AlertDialog.Description>
            <div className={dialogs.dialogActions}>
              <AlertDialog.Cancel asChild>
                <button type="button" className={buttons.secondaryButton}>
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  type="button"
                  className={buttons.dangerButton}
                  onClick={() => {
                    if (restorePath) void onRestore(restorePath);
                    setRestorePath(undefined);
                  }}
                >
                  Restore file
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}

function UnifiedDiff({ patch }: { patch: string }) {
  return (
    <pre className={styles.unifiedDiff} tabIndex={0} aria-label="Unified diff">
      {patch.split('\n').map((line, index) => {
        const kind =
          line.startsWith('+') && !line.startsWith('+++')
            ? 'addition'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'deletion'
              : line.startsWith('@@')
                ? 'hunk'
                : 'context';
        return (
          <span key={`${index}-${line}`} data-kind={kind}>
            <span aria-hidden="true">
              {kind === 'addition' ? (
                <Check size={11} />
              ) : kind === 'deletion' ? (
                <X size={11} />
              ) : null}
            </span>
            {line || ' '}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}

function statusLabel(status: ChangedFile['status']) {
  return status === 'modified'
    ? 'M'
    : status === 'added'
      ? 'A'
      : status === 'deleted'
        ? 'D'
        : 'U';
}
