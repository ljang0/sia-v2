/** The title the main process gives a conversation before its first message names it. */
const UNTITLED_THREAD_TITLE = 'New thread';

/** What people see for a conversation's title; untitled ones read as new conversations. */
export function threadDisplayTitle(title: string): string {
  return title === UNTITLED_THREAD_TITLE ? 'New conversation' : title;
}
