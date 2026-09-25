import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThreadSummary } from '../types';
import styles from './navigation.module.css';

export function TaskPreviewButton({
  thread,
  selected,
  className,
  onSelect,
  children,
}: {
  thread: ThreadSummary;
  selected: boolean;
  className: string | undefined;
  onSelect(): void;
  children: ReactNode;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clear = () => {
    clearTimeout(timer.current);
  };
  const close = () => {
    clear();
    setOpen(false);
  };
  const leave = () => {
    clear();
    timer.current = setTimeout(() => setOpen(false), 100);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !button.current || !card.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = card.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(
          (button.current.closest('aside')?.getBoundingClientRect().right ?? anchor.right) + 12,
          window.innerWidth - box.width - 12,
        ),
      ),
      top: Math.max(12, Math.min(anchor.top - 8, window.innerHeight - box.height - 12)),
    });
  }, [open, thread.preview?.text, thread.draft]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);
  const state = {
    idle: thread.unread ? 'Unread reply' : 'Ready',
    running: 'Working',
    queued: 'Queued',
    waiting: 'Waiting for you',
    error: 'Needs attention',
  }[thread.status];
  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={thread.title}
        aria-current={selected ? 'page' : undefined}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          clear();
          timer.current = setTimeout(() => setOpen(true), 450);
        }}
        onPointerLeave={leave}
        onFocus={() => {
          clear();
          setOpen(true);
        }}
        onBlur={close}
        onClick={() => {
          close();
          onSelect();
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            id={id}
            role="tooltip"
            className={styles.preview}
            style={position}
            onPointerEnter={clear}
            onPointerLeave={leave}
          >
            <span className={styles.previewState} data-status={thread.status}>
              <i />
              {state}
            </span>
            <strong className={styles.previewTitle}>{thread.title}</strong>
            {thread.draft?.trim() ? (
              <>
                <span className={styles.previewLabel}>Unsent draft</span>
                <p>{thread.draft.slice(0, 420)}</p>
              </>
            ) : thread.preview ? (
              <>
                <span className={styles.previewLabel}>{thread.preview.label}</span>
                <p>{thread.preview.text}</p>
              </>
            ) : (
              <p>
                {thread.queueReason ?? 'Open this conversation to pick up where you left off.'}
              </p>
            )}
            <span className={styles.previewFooter}>Select the conversation to continue</span>
          </div>,
          document.body,
        )}
    </>
  );
}
