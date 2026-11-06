import { useEffect, useRef, useState } from 'react';
import type { ThreadStatus } from './types';

interface OpenConversation {
  id: string;
  status: ThreadStatus;
  unread?: boolean | undefined;
}

const busy = (status: ThreadStatus) =>
  status === 'running' || status === 'queued' || status === 'waiting';
const attended = () => document.visibilityState === 'visible' && document.hasFocus();

/** Background rendering is not evidence that the person has read a conversation. */
export function useWindowAttended(): boolean {
  const [visible, setVisible] = useState(attended);
  useEffect(() => {
    const update = () => setVisible(attended());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);
  return visible;
}

/**
 * The open conversation is read as its work finishes on screen, like Codex and Claude. Work that
 * finishes while the person is elsewhere (another page, or Sia out of sight) stays unread until
 * they come back to that conversation. Only a finish clears the dot, so a conversation the
 * person marks unread themselves stays unread.
 */
export function useReadOnScreen(
  conversation: OpenConversation | undefined,
  onScreen: boolean,
  markRead: (threadId: string) => void,
) {
  const previous = useRef<{ id: string; busy: boolean }>(undefined);
  const finishedAway = useRef<string>(undefined);
  const id = conversation?.id;
  const working = conversation ? busy(conversation.status) : false;
  const unread = conversation?.unread === true;

  useEffect(() => {
    const before = previous.current;
    previous.current = id ? { id, busy: working } : undefined;
    if (!id) return;
    if (before?.id !== id) {
      finishedAway.current = undefined;
      return;
    }
    if (before.busy && !working) {
      if (!onScreen) finishedAway.current = id;
      else if (unread) markRead(id);
      return;
    }
    if (onScreen && finishedAway.current === id) {
      finishedAway.current = undefined;
      if (unread) markRead(id);
    }
  }, [id, working, unread, onScreen, markRead]);
}
