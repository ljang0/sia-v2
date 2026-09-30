import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { DesktopSnapshot, TimelineItemView } from '../shared/bridge.js';
import type { ScottySettings } from '../shared/scotty.js';
import type { DesktopController } from './controller.js';
import { ScottyTasks } from './scotty-state.js';
const settings: ScottySettings = { enabled: true, size: 'medium', motion: true };
const agentId = randomUUID();
function snapshot(
  status: DesktopSnapshot['threads'][number]['status'] = 'idle',
): DesktopSnapshot {
  const id = randomUUID();
  return {
    revision: 1,
    agents: [{ id: agentId, name: 'Personal', instructions: 'private agent instructions' }],
    threads: [
      { id, agentId, title: 'Plan my week', status, updatedAt: '2026-09-14T10:00:00Z' },
    ],
    timeline: [
      { id: randomUUID(), threadId: id, sequence: 1, kind: 'user', text: 'Plan my week' },
      {
        id: randomUUID(),
        threadId: id,
        sequence: 2,
        kind: 'assistant',
        text: 'Your plan is ready.',
      },
    ],
    approvals: [],
  } as unknown as DesktopSnapshot;
}
function host(state: DesktopSnapshot) {
  return {
    taskSnapshot: () => state,
    remoteAccessAllowed: () => true,
    invoke: vi.fn(async () => ({})),
  } as unknown as Pick<DesktopController, 'taskSnapshot' | 'invoke' | 'remoteAccessAllowed'>;
}
it('prioritizes questions, failed unread work, results, then running work without exposing raw tool output', () => {
  const states = [
    snapshot('running'),
    snapshot('idle'),
    snapshot('failed'),
    snapshot('waiting'),
  ];
  states[1]!.threads[0]!.unread = true;
  states[2]!.threads[0]!.unread = true;
  const state = states[0]!;
  const combined = {
    ...state,
    threads: states.flatMap((item) => item.threads),
    timeline: states.flatMap((item) => item.timeline),
  };
  combined.timeline.push({
    id: randomUUID(),
    threadId: state.threads[0]!.id,
    sequence: 3,
    kind: 'activity',
    status: 'running',
    toolName: 'mail_search',
    detail: 'private raw payload',
    timestamp: '',
  });
  const view = new ScottyTasks().view(combined, settings, true);
  expect(view.tasks.map((task) => task.status)).toEqual([
    'input',
    'blocked',
    'ready',
    'working',
  ]);
  expect(view.status).toBe('input');
  expect(view.workingCount).toBe(1);
  expect(view.attentionCount).toBe(2);
  expect(view.tasks[3]?.progress).toBe('Searching your mail');
  expect(JSON.stringify(view)).not.toMatch(/private raw payload|private agent instructions/);
});
it('answers the exact pending question and invalidates controls for a replacement question or turn', async () => {
  const state = snapshot('waiting');
  const tasks = new ScottyTasks();
  const question: TimelineItemView = {
    id: randomUUID(),
    threadId: state.threads[0]!.id,
    sequence: 3,
    kind: 'question',
    status: 'pending',
    text: 'Which calendar?',
    timestamp: '',
  };
  state.timeline.push(question);
  const first = tasks.view(state, settings, true).tasks[0]!;
  expect(first.question).toBe('Which calendar?');
  expect(first.canReply).toBe(true);
  const controller = host(state);
  await tasks.act(
    { kind: 'reply', token: first.token, text: 'Work calendar' },
    controller,
    settings,
    vi.fn(),
  );
  expect(controller.invoke).toHaveBeenCalledExactlyOnceWith('threads.send', {
    threadId: first.id,
    text: 'Work calendar',
  });
  question.status = 'complete';
  state.timeline.push({
    ...question,
    id: randomUUID(),
    sequence: 4,
    status: 'pending',
    text: 'Which date?',
  });
  await expect(
    tasks.act(
      { kind: 'reply', token: first.token, text: 'old answer' },
      controller,
      settings,
      vi.fn(),
    ),
  ).rejects.toThrow('changed');
  const next = tasks.view(state, settings, true).tasks[0]!;
  expect(next.question).toBe('Which date?');
  state.threads[0]!.status = 'running';
  state.timeline.push({
    ...question,
    id: randomUUID(),
    sequence: 5,
    kind: 'user',
    text: 'A replacement turn',
  });
  await expect(
    tasks.act({ kind: 'cancel', token: next.token }, controller, settings, vi.fn()),
  ).rejects.toThrow('changed');
  expect(tasks.view(state, settings, true).tasks[0]?.response).toBe('');
});
it('rejects stale, foreign, expired, oversized and hidden approvals while using the canonical approval route', async () => {
  const state = snapshot('waiting');
  const id = randomUUID();
  state.approvals.push({
    id,
    threadId: state.threads[0]!.id,
    callId: 'call',
    title: 'Create event',
    kind: 'native_tool',
    summary: 'Add the event you requested',
    target: 'Work calendar',
    reversible: true,
    expiresAt: new Date(Date.now() + 10000).toISOString(),
    status: 'pending',
  });
  const tasks = new ScottyTasks();
  const controller = host(state);
  const task = tasks.view(state, settings, true).tasks[0]!;
  const action = { kind: 'approve', token: task.token, approvalId: id, decision: 'approve' };
  expect(task.canReply).toBe(false);
  expect(task.approval?.target).toBe('This Mac');
  await expect(
    tasks.act({ kind: 'reply', token: task.token, text: 'yes' }, controller, settings, vi.fn()),
  ).rejects.toThrow('approval');
  await expect(
    tasks.act({ ...action, approvalId: randomUUID() }, controller, settings, vi.fn()),
  ).rejects.toThrow('approval');
  await tasks.act(action, controller, settings, vi.fn());
  expect(controller.invoke).toHaveBeenCalledExactlyOnceWith('approvals.resolve', {
    approvalId: id,
    decision: 'approve',
  });
  state.approvals[0]!.target = 'x'.repeat(8001);
  await expect(tasks.act(action, controller, settings, vi.fn())).rejects.toThrow('approval');
  state.approvals[0]!.target = 'Work calendar';
  state.approvals[0]!.expiresAt = new Date(Date.now() - 1).toISOString();
  const expiredToken = tasks.view(state, settings, true).tasks[0]!.token;
  await expect(
    tasks.act({ ...action, token: expiredToken }, controller, settings, vi.fn()),
  ).rejects.toThrow('approval');
  await expect(
    tasks.act(action, controller, { ...settings, enabled: false }, vi.fn()),
  ).rejects.toThrow('sign in');
});
it('clears private task views on lock/sign-out and rejects old controls after unlocking', async () => {
  const state = snapshot();
  const tasks = new ScottyTasks();
  const task = tasks.view(state, settings, true).tasks[0]!;
  expect(tasks.view(state, settings, false)).toMatchObject({
    available: false,
    agents: [],
    tasks: [],
  });
  await expect(
    tasks.act(
      { kind: 'reply', token: task.token, text: 'Continue' },
      host(state),
      settings,
      vi.fn(),
    ),
  ).rejects.toThrow('changed');
  const next = tasks.view(state, settings, true).tasks[0]!;
  state.threads[0]!.archivedAt = new Date().toISOString();
  await expect(
    tasks.act({ kind: 'open', token: next.token }, host(state), settings, vi.fn()),
  ).rejects.toThrow('changed');
});
it('bounds responses and keeps error text separate from successful completion', () => {
  const state = snapshot('failed');
  state.timeline[1]!.text = 'x'.repeat(25000);
  const task = new ScottyTasks().view(state, settings, true).tasks[0]!;
  expect(task.status).toBe('blocked');
  expect(task.truncated).toBe(true);
  expect(task.response).toHaveLength(24000);
});
it('creates requests through Sia with the selected agent and prevents empty or arbitrary actions', async () => {
  const tasks = new ScottyTasks();
  const state = snapshot();
  const threadId = randomUUID();
  const controller = host(state);
  vi.mocked(controller.invoke).mockResolvedValue({ threadId } as never);
  await tasks.act(
    { kind: 'new', agentId, text: 'Find my next appointment' },
    controller,
    settings,
    vi.fn(),
  );
  expect(controller.invoke).toHaveBeenNthCalledWith(1, 'threads.create', {
    agentId,
    title: 'Find my next appointment',
  });
  expect(controller.invoke).toHaveBeenNthCalledWith(2, 'threads.send', {
    threadId,
    text: 'Find my next appointment',
  });
  await expect(
    tasks.act({ kind: 'new', agentId, text: '' }, controller, settings, vi.fn()),
  ).rejects.toThrow();
  await expect(
    tasks.act({ kind: 'shell', command: 'echo unsafe' }, controller, settings, vi.fn()),
  ).rejects.toThrow();
});

it('does not dispatch a new turn when the Mac locks while creating its thread', async () => {
  const state = snapshot();
  const tasks = new ScottyTasks();
  const controller = host(state);
  const creating = Promise.withResolvers<{ threadId: string }>();
  vi.mocked(controller.invoke).mockImplementation(() => creating.promise as never);
  let available = true;
  const sending = tasks.act(
    { kind: 'new', agentId, text: 'A request' },
    controller,
    settings,
    vi.fn(),
    () => available,
  );
  available = false;
  creating.resolve({ threadId: randomUUID() });
  await expect(sending).rejects.toThrow('sign in');
  expect(controller.invoke).toHaveBeenCalledTimes(1);
});

it('says whether a working Mac task is on the screen or in the background', () => {
  const running = snapshot('running');
  const idle = snapshot('idle');
  const id = running.threads[0]!.id;
  const tasks = new ScottyTasks();
  const view = (screenControl: Record<string, 'foreground' | 'background'>) =>
    tasks.view(
      {
        ...running,
        threads: [...running.threads, ...idle.threads],
        timeline: [...running.timeline, ...idle.timeline],
        screenControl: { ...screenControl, [idle.threads[0]!.id]: 'foreground' },
      },
      settings,
      true,
    ).tasks;
  expect(view({ [id]: 'background' }).find((task) => task.id === id)?.screen).toBe(
    'background',
  );
  expect(view({ [id]: 'foreground' }).find((task) => task.id === id)?.screen).toBe(
    'foreground',
  );
  expect(view({}).find((task) => task.id === id)).not.toHaveProperty('screen');
  // A finished task never shows a screen status, even with a stale entry.
  expect(view({}).find((task) => task.id === idle.threads[0]!.id)).not.toHaveProperty('screen');
});
