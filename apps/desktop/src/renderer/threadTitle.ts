import { UNTITLED_THREAD_TITLE } from '../shared/plain-text';

/** What people see for a conversation's title; untitled ones read as new conversations. */
export function threadDisplayTitle(title: string): string {
  return title === UNTITLED_THREAD_TITLE ? 'New conversation' : title;
}
