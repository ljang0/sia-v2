import { WifiHigh, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import type { MessageEvent, RendererAttachment } from './types';
import styles from './components/AppStates.module.css';

/** Whether this Mac has a network connection, kept current by the browser's online events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => currentlyOnline());
  useEffect(() => {
    const update = () => setOnline(currentlyOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** How long “Back online” stays after the connection returns. */
export const BACK_ONLINE_MS = 2400;

/**
 * The offline banner while the Mac is offline, then a brief “Back online” confirmation so the
 * banner does not simply vanish. Nothing shows on a launch that starts online.
 */
export function ConnectionBanner({ online }: { online: boolean }) {
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBackOnline(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBackOnline(true);
    const timer = window.setTimeout(() => setBackOnline(false), BACK_ONLINE_MS);
    return () => window.clearTimeout(timer);
  }, [online]);
  if (!online) return <OfflineBanner />;
  if (!backOnline) return null;
  return (
    <div className={styles.onlineBanner} role="status" data-testid="online-banner">
      <WifiHigh size={18} aria-hidden="true" />
      <span>
        <strong>Back online</strong> — sending anything that was waiting.
      </span>
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className={styles.offlineBanner} role="status" data-testid="offline-banner">
      <WifiSlash size={18} aria-hidden="true" />
      <span>
        <strong>You’re offline</strong> — Sia will send when you’re back.
      </span>
    </div>
  );
}

export interface HeldMessage {
  id: string;
  threadId: string;
  content: string;
  attachments: readonly RendererAttachment[];
  timestamp: string;
}

/**
 * Holds messages sent while the Mac is offline and sends them, in order, once it is back.
 * A send that still fails stays held until the connection comes back again, so nothing the
 * person wrote is dropped.
 */
export function useOfflineOutbox(
  online: boolean,
  send: (message: HeldMessage) => Promise<unknown>,
) {
  const [held, setHeld] = useState<readonly HeldMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const flushing = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!online) setPaused(false);
  }, [online]);

  useEffect(() => {
    const next = held[0];
    if (!online || paused || !next || flushing.current) return;
    flushing.current = true;
    void sendRef.current(next).then(
      () => {
        flushing.current = false;
        setHeld((current) => current.filter(({ id }) => id !== next.id));
      },
      () => {
        flushing.current = false;
        setPaused(true);
      },
    );
  }, [held, online, paused]);

  return {
    held,
    hold(message: Omit<HeldMessage, 'id' | 'timestamp'>) {
      setPaused(false);
      setHeld((current) => [
        ...current,
        { ...message, id: `held-${crypto.randomUUID()}`, timestamp: new Date().toISOString() },
      ]);
    },
    remove(id: string) {
      setHeld((current) => current.filter((message) => message.id !== id));
    },
    isHeld(id: string) {
      return held.some((message) => message.id === id);
    },
  };
}

/** Held messages appear with the thread's queued follow-ups. */
export function heldAsQueued(
  held: readonly HeldMessage[],
  threadId: string | undefined,
): MessageEvent[] {
  return held
    .filter((message) => message.threadId === threadId)
    .map((message) => ({
      id: message.id,
      type: 'message',
      role: 'user',
      content: message.content,
      timestamp: message.timestamp,
      ...(message.attachments.length ? { attachments: [...message.attachments] } : {}),
    }));
}

function currentlyOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
