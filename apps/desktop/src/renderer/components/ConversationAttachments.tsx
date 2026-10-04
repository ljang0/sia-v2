import * as Dialog from '@radix-ui/react-dialog';
import { FolderSimple, ImageSquare, SpinnerGap, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../plainErrors';
import type { AttachmentPreview, RendererAttachment } from '../types';
import buttons from '../styles/buttons.module.css';
import dialogs from '../styles/dialogs.module.css';
import primitives from '../styles/primitives.module.css';
import styles from './Conversation.module.css';
import { SafeMarkdown } from './SafeMarkdown';

// Thumbnails of sent images, kept for the session so scrolling back does not reload them.
const thumbnailCache = new Map<string, string>();

const THUMBNAIL_CACHE_LIMIT = 40;

/** A sent attachment: a small thumbnail for an image, otherwise a file icon and its name. */
export function AttachmentChip({
  attachment,
  onPreview,
  onLoadThumbnail,
}: {
  attachment: RendererAttachment;
  onPreview?: ((attachment: RendererAttachment) => void) | undefined;
  onLoadThumbnail?:
    ((attachment: RendererAttachment) => Promise<string | undefined>) | undefined;
}) {
  const [thumbnail, setThumbnail] = useState(() => thumbnailCache.get(attachment.id));
  useEffect(() => {
    if (thumbnail || attachment.kind !== 'image' || !onLoadThumbnail) return;
    let current = true;
    onLoadThumbnail(attachment).then(
      (dataUrl) => {
        if (!dataUrl) return;
        thumbnailCache.set(attachment.id, dataUrl);
        if (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT)
          thumbnailCache.delete(thumbnailCache.keys().next().value!);
        if (current) setThumbnail(dataUrl);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [attachment, onLoadThumbnail, thumbnail]);
  return (
    <button
      type="button"
      onClick={() => onPreview?.(attachment)}
      disabled={!onPreview}
      data-thumbnail={thumbnail ? 'true' : undefined}
      aria-label={attachment.generated ? `Preview result: ${attachment.name}` : undefined}
    >
      {thumbnail ? (
        <img className={styles.attachmentThumbnail} src={thumbnail} alt="" />
      ) : attachment.kind === 'image' ? (
        <ImageSquare size={13} aria-hidden="true" />
      ) : (
        <FolderSimple size={13} aria-hidden="true" />
      )}
      {attachment.name}
    </button>
  );
}

export function AttachmentPreviewDialog({
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
  // Closing a preview must not wait for animationend in an occluded/background window.
  if (!preview) return null;
  return (
    <Dialog.Root open={Boolean(preview)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogs.dialogOverlay} />
        <Dialog.Content className={`${dialogs.alertDialogContent} ${styles.attachmentPreview}`}>
          <div className={styles.attachmentPreviewHeader}>
            <Dialog.Title>{preview?.attachment.name}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className={buttons.iconButton} aria-label="Close preview">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>
            {preview?.attachment.generated
              ? 'Saved result. Preview it here, open it in its app, or show it in Finder.'
              : 'This local preview uses a short-lived file grant that expires after one hour.'}
          </Dialog.Description>
          <div className={styles.attachmentPreviewBody}>
            {!preview?.result ? (
              <SpinnerGap className={primitives.spin} size={22} aria-label="Loading preview" />
            ) : preview.result.kind === 'image' ? (
              <img src={preview.result.dataUrl} alt={preview.attachment.name} />
            ) : preview.result.kind === 'text' &&
              /\.(md|markdown|mdown)$/i.test(preview.attachment.name) ? (
              <article
                className={styles.attachmentMarkdownPreview}
                aria-label="Document preview"
              >
                <SafeMarkdown content={preview.result.content} />
              </article>
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
          <div className={dialogs.dialogActions}>
            {onRevealAttachment && preview ? (
              <button
                type="button"
                className={buttons.secondaryButton}
                onClick={() => void onRevealAttachment(preview.attachment.id)}
              >
                Reveal in Finder
              </button>
            ) : null}
            {onOpenAttachment && preview ? (
              <button
                type="button"
                className={buttons.primaryButton}
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

export function attachmentPreviewFailure(cause: unknown): AttachmentPreview {
  return {
    kind: 'unavailable',
    detail: errorMessage(cause, 'This file is no longer available in the current Sia session.'),
  };
}
