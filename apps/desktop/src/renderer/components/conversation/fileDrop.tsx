import { Paperclip } from '@phosphor-icons/react';
import { type DragEvent, useState } from 'react';
import styles from '../Conversation.module.css';

/** Dropping files anywhere on the conversation attaches them (at most 20 at once). */
export function useFileDrop(
  onDropFiles: ((files: File[]) => Promise<void> | void) | undefined,
) {
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dropTargetProps = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!onDropFiles || !hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      setDraggingFiles(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!onDropFiles || !hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDraggingFiles(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!onDropFiles || !hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      setDraggingFiles(false);
      const files = [...event.dataTransfer.files].slice(0, 20);
      if (files.length) void onDropFiles(files);
    },
  };
  return { draggingFiles, dropTargetProps };
}

export function FileDropOverlay() {
  return (
    <div className={styles.attachmentDropOverlay} role="status">
      <span className={styles.attachmentDropCard}>
        <Paperclip size={22} aria-hidden="true" />
        <strong>Drop to attach</strong>
        <small>Up to 20 files or images</small>
      </span>
    </div>
  );
}

function hasFiles(dataTransfer: DataTransfer): boolean {
  return [...dataTransfer.types].includes('Files');
}
