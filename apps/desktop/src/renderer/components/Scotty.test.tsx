// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ScottyApi, ScottyState, ScottyTask } from '../../shared/scotty';
import { ScottyPanel, ScottyPet } from './Scotty';
import { ScottySprite } from './ScottySprite';
afterEach(cleanup);
function fixture() {
  const task: ScottyTask = {
    id: 'calendar',
    token: 'current-question',
    title: 'Plan my week',
    agent: 'Personal',
    status: 'input',
    progress: 'A question for you',
    question: 'Which calendar should I use?',
    response: '',
    truncated: false,
    canReply: true,
    canStop: true,
    unread: false,
  };
  const state: ScottyState = {
    revision: 1,
    settings: { enabled: true, size: 'medium', motion: true },
    available: true,
    status: 'input',
    workingCount: 0,
    attentionCount: 1,
    agents: [{ id: 'personal', name: 'Personal' }],
    tasks: [task],
    moreTasks: false,
  };
  let receive!: (state: ScottyState) => void;
  const api: ScottyApi = {
    state: vi.fn(async () => state),
    onState: (listener) => {
      receive = listener;
      return vi.fn();
    },
    action: vi.fn(async () => ({ threadId: task.id })),
    expand: vi.fn(async () => undefined),
    hide: vi.fn(async () => undefined),
    openSia: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    nudge: vi.fn(async () => undefined),
    interactive: vi.fn(),
  };
  return { state, task, api, publish: (next: ScottyState) => receive(next) };
}
it('opens a task question and sends the answer to its exact token, without opening the main app', async () => {
  const { api } = fixture();
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan my week/ }));
  const answer = screen.getByRole('textbox', { name: 'Answer Sia’s question' });
  fireEvent.change(answer, { target: { value: 'My work calendar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledExactlyOnceWith({
      kind: 'reply',
      token: 'current-question',
      text: 'My work calendar',
    }),
  );
  expect(api.openSia).not.toHaveBeenCalled();
});
it('renders exact approval details and prevents a text answer from substituting for approval', async () => {
  const { state, task, api } = fixture();
  delete task.question;
  task.canReply = false;
  task.approval = {
    id: 'approval',
    title: 'Create event',
    summary: 'Add the reviewed event.',
    target: 'Personal calendar',
    account: 'Test account',
    dataLeaving: 'Event title and date',
    reversible: true,
    requiresMainApp: false,
  };
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan my week/ }));
  expect(screen.getByText('Personal calendar')).toBeTruthy();
  expect(screen.getByText('Event title and date')).toBeTruthy();
  // Only the approval buttons can move this task forward; there is no text box to type into.
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Approve once' }));
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledWith({
      kind: 'approve',
      token: state.tasks[0]!.token,
      approvalId: 'approval',
      decision: 'approve',
    }),
  );
});
it('starts a new Sia request from the tray using the selected existing agent', async () => {
  const { api } = fixture();
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ask Sia' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Organize my notes' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  await waitFor(() =>
    expect(api.action).toHaveBeenCalledExactlyOnceWith({
      kind: 'new',
      agentId: 'personal',
      text: 'Organize my notes',
    }),
  );
});
it('keeps a failed send editable and reports the error instead of claiming success', async () => {
  const { api } = fixture();
  vi.mocked(api.action).mockRejectedValue(new Error('This task has changed.'));
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan my week/ }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Work calendar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'This task has changed.',
  );
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Work calendar');
});
it('uses the bundled sprite and can render a still frame', () => {
  const { container } = render(<ScottySprite pose="sleep" motion={false} size={112} />);
  expect(container.firstChild).toHaveProperty('dataset.animated', 'false');
  expect((container.firstChild as HTMLElement).style.backgroundImage).toContain('scotty.png');
});

it('says whether a working Mac task is on the screen or quietly in the background', async () => {
  const { api, state, task } = fixture();
  Object.assign(task, {
    status: 'working',
    progress: 'Working in the app',
    screen: 'background',
    canReply: false,
  });
  delete task.question;
  state.status = 'working';
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan my week/ }));
  expect(screen.getByText('Working quietly in the background')).toBeTruthy();
  cleanup();
  task.screen = 'foreground';
  render(<ScottyPanel api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: /Plan my week/ }));
  expect(screen.getByText('Using your screen · Press ⌃Esc to stop')).toBeTruthy();
});

function stubMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  let finish = () => undefined as void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const animate = vi.fn(() => ({ finished, cancel: vi.fn() }) as unknown as Animation);
  const original = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = animate;
  return {
    animate,
    finish: () => finish(),
    restore() {
      HTMLElement.prototype.animate = original;
      vi.unstubAllGlobals();
    },
  };
}

it('closes the tray after a short exit and arrives again only when it returns', async () => {
  const motion = stubMotion();
  try {
    const { api } = fixture();
    render(<ScottyPanel api={api} />);
    await screen.findByRole('button', { name: /Plan my week/ });
    await waitFor(() => expect(motion.animate).toHaveBeenCalledOnce());
    fireEvent.focus(window);
    expect(motion.animate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close task tray' }));
    expect(motion.animate).toHaveBeenCalledTimes(2);
    expect(api.expand).not.toHaveBeenCalled();
    motion.finish();
    await waitFor(() => expect(api.expand).toHaveBeenCalledExactlyOnceWith(false));
    fireEvent.focus(window);
    expect(motion.animate).toHaveBeenCalledTimes(3);
  } finally {
    motion.restore();
  }
});

it('keeps the tray still when Scotty motion is off', async () => {
  const motion = stubMotion();
  try {
    const { api, state } = fixture();
    state.settings.motion = false;
    render(<ScottyPanel api={api} />);
    await screen.findByRole('button', { name: /Plan my week/ });
    fireEvent.keyDown(screen.getByRole('main'), { key: 'Escape' });
    await waitFor(() => expect(api.expand).toHaveBeenCalledExactlyOnceWith(false));
    expect(motion.animate).not.toHaveBeenCalled();
  } finally {
    motion.restore();
  }
});

it('shows Scotty’s state and count on the badge and follows each change of state', async () => {
  const { api, state, publish } = fixture();
  render(<ScottyPet api={api} />);
  const badge = await screen.findByRole('button', { name: 'Open Scotty tasks' });
  await waitFor(() => expect(badge.textContent).toBe('Needs you1'));
  expect(screen.getByRole('main').dataset.status).toBe('input');
  act(() => publish({ ...state, status: 'ready', attentionCount: 0, workingCount: 0 }));
  expect(badge.textContent).toBe('Ready');
  expect(screen.getByRole('main').dataset.status).toBe('ready');
});
