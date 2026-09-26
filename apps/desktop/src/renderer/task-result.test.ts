import { describe, expect, it } from 'vitest';
import { completedReplyId } from './task-result';
import type { ThreadDetail, ThreadEvent } from './types';

const user: ThreadEvent = {
  id: 'request',
  type: 'message',
  role: 'user',
  content: 'Find my schedule.',
  timestamp: '',
};
const reply: ThreadEvent = {
  ...user,
  id: 'reply',
  role: 'assistant',
  content: 'Here is your schedule.',
};
const thread = (overrides: Partial<ThreadDetail> = {}): ThreadDetail => ({
  id: 'thread',
  agentId: 'agent',
  title: 'Schedule',
  updatedAt: '',
  status: 'idle',
  provider: 'codex',
  model: 'included',
  workspace: '/tmp',
  events: [user, reply],
  ...overrides,
});
describe('task result presentation', () => {
  it('only highlights the reply to the current request', () => {
    expect(completedReplyId(thread())).toBe('reply');
    expect(
      completedReplyId(thread({ events: [user, reply, { ...user, id: 'next' }] })),
    ).toBeUndefined();
    expect(
      completedReplyId(thread({ events: [user, { ...reply, content: '  ' }] })),
    ).toBeUndefined();
  });
  it.each(['running', 'waiting', 'queued', 'error'] as const)(
    'does not present %s work as a result',
    (status) => {
      expect(completedReplyId(thread({ status }))).toBeUndefined();
    },
  );
  it('keeps cancellations, errors, and unanswered questions out of result cards', () => {
    const cancelled: ThreadEvent = {
      id: 'cancel',
      type: 'notice',
      title: 'Task cancelled',
      tone: 'info',
      detail: 'Stopped',
    };
    const question: ThreadEvent = {
      id: 'question',
      type: 'question',
      prompt: 'Which account?',
      status: 'pending',
      timestamp: '',
    };
    expect(completedReplyId(thread({ events: [user, reply, cancelled] }))).toBeUndefined();
    expect(completedReplyId(thread({ events: [user, reply, question] }))).toBeUndefined();
    expect(completedReplyId(thread({ error: 'Disconnected' }))).toBeUndefined();
    expect(completedReplyId(thread({ events: [cancelled, user, reply] }))).toBe('reply');
  });
});
