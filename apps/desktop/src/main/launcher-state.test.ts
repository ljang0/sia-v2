import { expect, it } from 'vitest';
import type { DesktopSnapshot } from '../shared/bridge.js';
import { LauncherSession } from './launcher-state.js';
function snapshot(status = 'idle'): DesktopSnapshot {
  return {
    activeAgentId: 'agent',
    agents: [{ id: 'agent', name: 'Personal', instructions: 'private instructions' }],
    threads: [{ id: 'thread', agentId: 'agent', title: 'Mail summary', status }],
    timeline: [
      {
        id: 'old',
        threadId: 'thread',
        turnId: 'old',
        sequence: 1,
        kind: 'assistant',
        text: 'Old response',
      },
      {
        id: 'user',
        threadId: 'thread',
        turnId: 'turn',
        sequence: 2,
        kind: 'user',
        text: 'Summarize mail',
      },
      {
        id: 'response',
        threadId: 'thread',
        turnId: 'turn',
        sequence: 3,
        kind: 'assistant',
        text: 'Latest response',
      },
    ],
  } as unknown as DesktopSnapshot;
}
it('exposes only the bound current turn and rejects stale or removed targets', () => {
  const session = new LauncherSession();
  session.bind('thread');
  const state = snapshot();
  const view = session.view(state);
  expect(view.agents).toEqual([{ id: 'agent', name: 'Personal' }]);
  expect(view.task?.response).toBe('Latest response');
  expect(session.target(view.task!.sessionId, state)).toBe('thread');
  session.bind('thread');
  expect(() => session.target(view.task!.sessionId, state)).toThrow('panel has changed');
  state.threads = [];
  expect(session.view(state).task).toBeUndefined();
});
it('clears private results when sign-in redaction removes agents', () => {
  const session = new LauncherSession();
  session.bind('thread');
  const state = snapshot();
  const id = session.view(state).task!.sessionId;
  state.agents = [];
  expect(session.view(state).task).toBeUndefined();
  state.agents = snapshot().agents;
  expect(() => session.target(id, state)).toThrow();
});
it('bounds results, distinguishes failed and waiting, and never invents task details', () => {
  const session = new LauncherSession();
  session.bind('thread');
  const state = snapshot('running');
  state.timeline[2]!.text = 'x'.repeat(25000);
  state.timeline.push({
    id: 'tool',
    threadId: 'thread',
    turnId: 'turn',
    sequence: 4,
    timestamp: '',
    kind: 'activity',
    status: 'running',
    toolName: 'mail_search',
    detail: 'raw private tool payload',
  });
  expect(session.view(state).task).toMatchObject({
    status: 'running',
    progress: 'Searching your mail',
    truncated: true,
  });
  expect(session.view(state).task!.response).toHaveLength(24000);
  state.threads[0]!.status = 'waiting';
  expect(session.view(state).task!.status).toBe('waiting');
  state.threads[0]!.status = 'failed';
  expect(session.view(state).task!.status).toBe('error');
});
it('invalidates old controls when another surface starts a new turn in the same thread', () => {
  const session = new LauncherSession();
  session.bind('thread');
  const state = snapshot();
  const old = session.view(state).task!.sessionId;
  state.timeline.push({
    id: 'next-user',
    threadId: 'thread',
    turnId: 'next-turn',
    sequence: 4,
    timestamp: '',
    kind: 'user',
    text: 'Next request',
  });
  expect(() => session.target(old, state)).toThrow();
  expect(session.view(state).task!.response).toBe('');
});
