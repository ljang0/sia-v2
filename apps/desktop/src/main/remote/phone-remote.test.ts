import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DesktopController } from '../controller/desktop-controller.js';
import type { DesktopSnapshot } from '../../shared/bridge.js';
import type { RecordRepository } from '../storage/persistence.js';
import { PhoneRemote } from './phone-remote.js';
import { remoteState, remoteVault } from './phone-remote-state.js';
import { nativeRemoteSkills } from './phone-remote-files.js';
import type { RemoteState } from '../../shared/phone-remote.js';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const agentId = '2ead9daf-3b1f-4534-ac30-248493815034';
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'sia-remote-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Sia remote</title>');
  await writeFile(join(root, 'assets', 'remote.js'), '/* remote only */');
  const state = {
    activeAgentId: agentId,
    agents: [
      {
        id: agentId,
        name: 'Sia',
        instructions: 'PRIVATE INSTRUCTIONS',
        workspace: '/private/workspace',
      },
    ],
    threads: [],
    timeline: [],
    computer: { accessMode: 'mac', trust: 'auto' },
  } as unknown as DesktopSnapshot;
  const saved = new Map<string, unknown>();
  let sendError: Error | undefined;
  const repository = {
    get: (_scope: string, id: string) => structuredClone(saved.get(id)),
    put: (_scope: string, id: string, value: unknown) => saved.set(id, structuredClone(value)),
  } as unknown as RecordRepository;
  let allowed = true;
  const invoke = vi.fn(async (method: string, input: { text?: string; threadId?: string }) => {
    if (method === 'threads.create') {
      const threadId = randomUUID();
      state.threads.push({
        id: threadId,
        agentId,
        status: 'idle',
      } as DesktopSnapshot['threads'][number]);
      state.activeThreadId = threadId;
      return { threadId, snapshot: state };
    }
    if (method === 'threads.send') {
      if (sendError) throw sendError;
      const turnId = randomUUID();
      state.timeline.push({
        id: randomUUID(),
        threadId: input.threadId!,
        turnId,
        sequence: state.timeline.length + 1,
        timestamp: '',
        kind: 'user',
        text: input.text ?? '',
      });
      state.threads.find((entry) => entry.id === input.threadId)!.status = 'running';
      return { turnId, snapshot: state };
    }
    if (method === 'threads.cancel')
      state.threads.find((entry) => entry.id === input.threadId)!.status = 'idle';
    if (method === 'threads.delete') {
      state.threads = state.threads.filter((entry) => entry.id !== input.threadId);
      if (state.activeThreadId === input.threadId) delete state.activeThreadId;
    }
    if (method === 'assistant.library')
      return {
        memories: [
          {
            id: 'memory',
            agentId,
            title: 'Preferred style',
            text: 'Keep it brief.',
            enabled: true,
          },
        ],
        workflows: [],
        context: true,
      };
    return state;
  });
  const readGeneratedResult = vi.fn(async (_threadId: string, _id: string) => ({
    name: 'Family résumé.csv',
    data: Buffer.from('food,25\n'),
  }));
  const deps = {
    readGeneratedResult,
    repository,
    controller: {
      snapshot: () => structuredClone(state),
      invoke: invoke as DesktopController['invoke'],
      remoteAccessAllowed: () => allowed,
    },
    assets: root,
    qr: async () => 'data:image/png;base64,cXI=',
    network: () => ({ address: '127.0.0.1', netmask: '255.0.0.0' }),
    port: 0,
    outbox: root,
  };
  const remote = new PhoneRemote(deps);
  cleanups.push(() => remote.dispose());
  await remote.initialize();
  const settings = await remote.configure({ operation: 'enable', agentId });
  const url = settings.url!;
  const post = (route: string, value: unknown, headers: Record<string, string> = {}) =>
    fetch(new URL(route, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(value),
    });
  return {
    remote,
    state,
    deps,
    settings,
    url,
    post,
    invoke,
    root,
    setAllowed: (value: boolean) => {
      allowed = value;
    },
    setSendError: (error: Error) => {
      sendError = error;
    },
  };
}

it('explains an unavailable assistant model before creating an empty phone conversation', async () => {
  const { post, state, invoke } = await setup();
  state.agents[0]!.provider = 'codex';
  state.agents[0]!.model = 'retired-model';
  state.providers = [
    {
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      model: 'gpt-6-astra',
      detail: 'Connected',
      billing: '',
      models: [
        {
          id: 'gpt-6-astra',
          label: 'GPT-6 Astra',
          description: '',
          reasoningEfforts: [],
        },
      ],
    },
  ];
  const response = await post('command', {
    id: randomUUID(),
    text: 'How are you?',
    session: null,
  });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('choose an available model');
  expect(state.threads).toHaveLength(0);
  expect(invoke).not.toHaveBeenCalledWith('threads.create', expect.anything());
});

it('explains that an older phone conversation still uses its pinned, unavailable model', async () => {
  const { url, post, state, invoke } = await setup();
  state.agents[0]!.provider = 'codex';
  state.agents[0]!.model = 'gpt-5.6-sol';
  state.providers = [
    {
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      model: 'gpt-5.6-sol',
      detail: 'Connected',
      billing: '',
      models: [
        {
          id: 'gpt-5.6-sol',
          label: 'GPT-5.6-Sol',
          description: '',
          reasoningEfforts: [],
        },
      ],
    },
  ];
  const threadId = randomUUID();
  state.threads.push({
    id: threadId,
    agentId,
    provider: 'codex',
    model: 'gpt-6-astra',
    status: 'idle',
  } as DesktopSnapshot['threads'][number]);
  state.activeThreadId = threadId;
  state.timeline.push({
    id: randomUUID(),
    threadId,
    sequence: 1,
    timestamp: '',
    kind: 'user',
    text: 'Earlier question',
  } as DesktopSnapshot['timeline'][number]);
  const session = ((await (await fetch(new URL('state', url))).json()) as RemoteState).session;
  expect(session).toBeTruthy();
  const response = await post('command', { id: randomUUID(), text: 'Continue', session });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('Start a new chat');
  expect(invoke).not.toHaveBeenCalledWith('threads.send', expect.anything());
});

it('shows a safe turn-start error and removes the empty thread created by a failed phone send', async () => {
  const { post, state, invoke, setSendError } = await setup();
  setSendError(new Error('Codex setup is in progress. Follow the setup status in Sia.'));
  const response = await post('command', {
    id: randomUUID(),
    text: 'How are you?',
    session: null,
  });
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe(
    'Codex setup is in progress. Follow the setup status in Sia.',
  );
  expect(state.threads).toHaveLength(0);
  expect(invoke).toHaveBeenCalledWith(
    'threads.delete',
    expect.objectContaining({ threadId: expect.any(String) }),
  );
});

it('serves only the paired mobile surface and rejects missing tokens, rebinding and cross-origin actions', async () => {
  const { url, post, invoke } = await setup();
  expect((await fetch(url)).status).toBe(200);
  expect((await fetch(new URL('assets/remote.js', url))).status).toBe(200);
  expect((await fetch(new URL('assets/../../index.ts', url))).status).toBe(404);
  expect((await fetch(new URL('/state', url))).status).toBe(404);
  const rebound = await new Promise<number | undefined>((done) => {
    request(new URL('state', url), { headers: { Host: 'attacker.test' } }, (response) => {
      response.resume();
      done(response.statusCode);
    }).end();
  });
  expect(rebound).toBe(404);
  expect(
    (
      await post(
        'command',
        { id: randomUUID(), text: 'Do something', session: null },
        { Origin: 'https://attacker.test' },
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await post(
        'command',
        { id: randomUUID(), text: 'Do something', session: null },
        { 'Sec-Fetch-Site': 'cross-site' },
      )
    ).status,
  ).toBe(404);
  expect((await post('invoke', { method: 'terminal.execute', input: {} })).status).toBe(404);
  expect(invoke).not.toHaveBeenCalled();
  const response = await fetch(new URL('state', url));
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  const text = await response.text();
  expect(text).not.toContain('PRIVATE');
  expect(text).not.toContain('workspace');
});

it('dispatches once when a phone retries a lost command acknowledgement and exposes progress', async () => {
  const { url, post, invoke, state } = await setup();
  const command = { id: randomUUID(), text: 'Check the current app', session: null };
  const [first, duplicate] = await Promise.all([
    post('command', command),
    post('command', command),
  ]);
  expect(first.status).toBe(200);
  expect(duplicate.status).toBe(200);
  expect(await first.json()).toEqual(await duplicate.json());
  expect(invoke.mock.calls.filter(([method]) => method === 'threads.send')).toHaveLength(1);
  const remote = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  expect(remote.turns[0]).toMatchObject({ text: command.text, status: 'working' });
  expect((await post('command', { ...command, text: 'Different command' })).status).toBe(409);
  state.threads[0]!.status = 'idle';
  state.timeline.push({
    id: randomUUID(),
    threadId: state.activeThreadId!,
    sequence: 2,
    timestamp: '',
    kind: 'assistant',
    text: 'Done.',
  });
  const done = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  expect(done.turns[0]).toMatchObject({ status: 'done', response: 'Done.' });
  expect(
    (await post('command', { id: randomUUID(), text: 'Follow up', session: done.session }))
      .status,
  ).toBe(200);
  expect(invoke.mock.calls.filter(([method]) => method === 'threads.create')).toHaveLength(1);
});

it('marks phone turns so full bypass never applies to the plain HTTP link', async () => {
  const { url, post, invoke } = await setup();
  const command = { id: randomUUID(), text: 'Tidy my desktop', session: null };
  expect((await post('command', command)).status).toBe(200);
  expect(invoke).toHaveBeenCalledWith('threads.send', {
    threadId: expect.any(String),
    text: command.text,
    fromPhone: true,
  });
  const remote = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  expect(remote.approval).toBe('ask');
});

it('rejects stale cancel and clear requests when desktop or Fn starts a replacement turn', async () => {
  const { post, url, state } = await setup();
  await post('command', { id: randomUUID(), text: 'First', session: null });
  const previous = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  state.timeline.push({
    id: randomUUID(),
    threadId: state.activeThreadId!,
    sequence: 2,
    timestamp: '',
    kind: 'user',
    text: 'New Fn request',
  });
  expect((await post('cancel', { session: previous.session })).status).toBe(409);
  expect((await post('clear', { session: previous.session })).status).toBe(409);
  const current = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  expect((await post('cancel', { session: current.session })).status).toBe(200);
  expect((await post('clear', { session: current.session })).status).toBe(200);
  const cleared = (await (await fetch(new URL('state', url))).json()) as RemoteState;
  expect(cleared.turns).toEqual([]);
  expect(state.timeline).toHaveLength(2); // Clear never deletes the Mac's conversation.
});

it('revokes old links on rotation, survives restart, stops on lock and rejects signed-out reads', async () => {
  const { remote, url, deps, setAllowed } = await setup();
  const rotated = await remote.configure({ operation: 'rotate' });
  const oldTokenAtNewPort = new URL(new URL(url).pathname + 'state', rotated.url);
  expect((await fetch(oldTokenAtNewPort)).status).toBe(404);
  const tokenPath = new URL(rotated.url!).pathname;
  remote.dispose();
  const restarted = new PhoneRemote(deps);
  cleanups.push(() => restarted.dispose());
  await restarted.initialize();
  const restored = await restarted.configure({ operation: 'status' });
  expect(new URL(restored.url!).pathname).toBe(tokenPath);
  setAllowed(false);
  expect((await fetch(new URL('state', restored.url))).status).toBe(404);
  setAllowed(true);
  restarted.suspend(true);
  expect((await restarted.configure({ operation: 'status' })).running).toBe(false);
  restarted.suspend(false);
  expect((await restarted.configure({ operation: 'status' })).running).toBe(true);
  await restarted.configure({ operation: 'disable' });
  expect((await restarted.configure({ operation: 'status' })).running).toBe(false);
});

it('only downloads current result files, blocks symlinks and forces inert attachments', async () => {
  const { post, url, root, state } = await setup();
  await post('command', { id: randomUUID(), text: 'Make a report', session: null });
  await writeFile(join(root, 'report.html'), '<script>alert(1)</script>');
  await symlink(join(root, 'index.html'), join(root, 'linked.html'));
  state.timeline.push({
    id: randomUUID(),
    threadId: state.activeThreadId!,
    sequence: 2,
    timestamp: '',
    kind: 'assistant',
    text: `[Open result](<${join(root, 'report.html')}>)\n[Open result](<${join(root, 'linked.html')}>)`,
  });
  const file = await fetch(new URL('outbox/report.html', url));
  expect(file.status).toBe(200);
  expect(file.headers.get('content-disposition')).toContain('attachment');
  expect(file.headers.get('content-security-policy')).toContain('sandbox');
  expect((await fetch(new URL('outbox/linked.html', url))).status).not.toBe(200);
  expect((await fetch(new URL('outbox/index.html', url))).status).toBe(404);
  expect((await fetch(new URL('outbox/%2fetc%2fpasswd', url))).status).toBe(404);
});

it('bounds command inputs and keeps remote memory scoped to the chosen agent', async () => {
  const { post, url, invoke } = await setup();
  expect(
    (await post('command', { id: randomUUID(), text: 'a'.repeat(8001), session: null })).status,
  ).toBe(400);
  expect((await post('command', { id: randomUUID(), text: ' ', session: null })).status).toBe(
    400,
  );
  expect(
    (await post('command', { id: randomUUID(), text: 'Hi', session: null, shell: 'ls' }))
      .status,
  ).toBe(400);
  expect(invoke).not.toHaveBeenCalled();
  expect(await (await fetch(new URL('note?id=memory', url))).json()).toMatchObject({
    title: 'Preferred style',
    content: 'Keep it brief.',
  });
  const vault = remoteVault(
    {
      memories: [
        { id: 'one', agentId, title: 'Remember', text: 'Use [[Safari]]', enabled: true },
        { id: 'private', agentId: 'other', title: 'PRIVATE', text: 'PRIVATE', enabled: true },
      ],
      workflows: [],
      context: true,
    },
    agentId,
  );
  expect(JSON.stringify(vault)).not.toContain('PRIVATE');
  expect(vault.graph.edges).toEqual([['one', 'topic:safari']]);
});

it('shows cancellation distinctly and follows the selected agent without exposing another agent’s task', async () => {
  const { state, root } = await setup();
  state.activeThreadId = 'thread';
  state.threads = [{ id: 'thread', agentId, status: 'idle' }] as DesktopSnapshot['threads'];
  state.timeline = [
    {
      id: 'user',
      threadId: 'thread',
      kind: 'user',
      sequence: 1,
      timestamp: '',
      text: 'Stop this',
    },
    {
      id: 'notice',
      threadId: 'thread',
      kind: 'notice',
      sequence: 2,
      timestamp: '',
      title: 'Task cancelled',
    },
  ];
  expect(remoteState(state, agentId, root).turns[0]?.status).toBe('cancelled');
  state.threads[0]!.agentId = 'someone-else';
  expect(remoteState(state, agentId, root).turns).toEqual([]);
});

it('reads native Notch-format skills without following symlinks or admitting large files', async () => {
  const { root } = await setup();
  const directory = join(root, '.sia-mac', agentId, 'skills');
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'morning.sh'),
    '#!/bin/bash\n# skill: Morning\n# description: A daily summary\necho hello',
  );
  await writeFile(join(directory, 'large.sh'), 'x'.repeat(16001));
  await symlink(join(root, 'index.html'), join(directory, 'linked.sh'));
  const skills = await nativeRemoteSkills(root, agentId);
  expect(skills).toHaveLength(1);
  expect(skills[0]).toMatchObject({ id: 'native:morning.sh', title: 'Morning', kind: 'skill' });
  expect(skills[0]!.content).toContain('A daily summary');
  expect(skills[0]!.content).toContain('echo hello');
});

it('immediately blocks state and memory when the paired agent is removed', async () => {
  const { state, url, remote } = await setup();
  state.agents = [];
  expect((await fetch(new URL('state', url))).status).toBe(404);
  expect((await fetch(new URL('vault', url))).status).toBe(404);
  expect((await remote.configure({ operation: 'status' })).running).toBe(false);
});

it('connects actual native note links and does not duplicate the legacy journal', () => {
  const { notes, graph } = remoteVault(
    {
      memories: [],
      workflows: [],
      context: false,
      vaults: [
        {
          agentId,
          notes: [
            { name: 'MOC.md', text: '[[course]]', revision: '1', readOnly: false },
            { name: 'course.md', text: 'Verified course note', revision: '2', readOnly: false },
            { name: 'journal.md', text: 'Native activity', revision: '3', readOnly: false },
          ],
        },
        {
          agentId: 'other',
          notes: [{ name: 'private.md', text: 'PRIVATE', revision: '4', readOnly: false }],
        },
      ],
      journal: [
        {
          id: 'old',
          agentId,
          threadId: 't',
          turnId: 'u',
          timestamp: '',
          kind: 'task',
          title: 'Old',
          text: 'Legacy activity',
        },
      ],
    },
    agentId,
  );
  expect(graph.edges).toContainEqual(['vault:MOC.md', 'vault:course.md']);
  expect(notes.filter((note) => note.kind === 'journal')).toHaveLength(1);
  expect(JSON.stringify(notes)).not.toContain('PRIVATE');
});

it('drops the old blocker after a task continues and finishes successfully', async () => {
  const { state, root } = await setup();
  state.activeThreadId = 'thread';
  state.threads = [{ id: 'thread', agentId, status: 'idle' }] as DesktopSnapshot['threads'];
  state.timeline = [
    { kind: 'user', text: 'Finish the report' },
    { kind: 'assistant', text: 'Waiting for access' },
    { kind: 'error', text: 'Waiting for access' },
    { kind: 'notice', title: 'Continuing task' },
    { kind: 'assistant', text: 'Report verified and saved.' },
  ].map((item, sequence) => ({
    ...item,
    id: String(sequence),
    threadId: 'thread',
    sequence,
    timestamp: '',
  })) as DesktopSnapshot['timeline'];
  expect(remoteState(state, agentId, root).turns[0]).toMatchObject({
    status: 'done',
    error: '',
    response: 'Report verified and saved.',
  });
});

it('shows a repeated model and host blocker once while preserving failure status', async () => {
  const { state, root } = await setup();
  state.activeThreadId = 'thread';
  state.threads = [{ id: 'thread', agentId, status: 'failed' }] as DesktopSnapshot['threads'];
  state.timeline = [
    { kind: 'user', text: 'Check Canvas' },
    { kind: 'assistant', text: 'Opening Canvas.' },
    { kind: 'assistant', text: 'Screen access is missing.' },
    { kind: 'assistant', text: 'Screen access is missing.' },
    { kind: 'error', text: 'Screen access is missing.' },
  ].map((item, sequence) => ({
    ...item,
    id: String(sequence),
    threadId: 'thread',
    sequence,
    timestamp: '',
  })) as DesktopSnapshot['timeline'];
  expect(remoteState(state, agentId, root).turns[0]).toMatchObject({
    status: 'error',
    error: '',
    response: 'Opening Canvas.\n\nScreen access is missing.',
  });
});

it('tells the phone which step is waiting for approval on the Mac', async () => {
  const { state, root } = await setup();
  state.activeThreadId = 'thread';
  state.threads = [{ id: 'thread', agentId, status: 'waiting' }] as DesktopSnapshot['threads'];
  state.timeline = [
    { kind: 'user', text: 'Tidy my Desktop' },
    { kind: 'assistant', text: 'I will move old screenshots to the Trash.' },
  ].map((item, sequence) => ({
    ...item,
    id: String(sequence),
    threadId: 'thread',
    sequence,
    timestamp: '',
  })) as DesktopSnapshot['timeline'];
  state.approvals = [
    { id: 'done', threadId: 'thread', title: 'Old request', status: 'denied' },
    { id: 'live', threadId: 'thread', title: 'Run a command', status: 'pending' },
  ] as DesktopSnapshot['approvals'];
  expect(remoteState(state, agentId, root).turns[0]).toMatchObject({
    status: 'waiting',
    approval: 'Run a command',
  });
  state.threads[0]!.status = 'idle';
  expect(remoteState(state, agentId, root).turns[0]).not.toHaveProperty('approval');
});

it('downloads only a generated result visible in the current phone conversation', async () => {
  const { post, url, state, deps, remote } = await setup();
  await post('command', { id: randomUUID(), text: 'Make a report', session: null });
  const id = randomUUID();
  state.timeline.push({
    id: randomUUID(),
    threadId: state.activeThreadId!,
    sequence: 2,
    timestamp: '',
    kind: 'assistant',
    text: 'Your report is ready.',
    attachments: [{ id, name: 'Family résumé.csv', bytes: 8, kind: 'file', generated: true }],
  });
  const file = await fetch(new URL(`results/${id}`, url));
  expect(file.status).toBe(200);
  expect(file.headers.get('content-disposition')).toContain('attachment');
  expect(file.headers.get('content-security-policy')).toContain('sandbox');
  expect(await file.text()).toBe('food,25\n');
  expect(deps.readGeneratedResult).toHaveBeenCalledExactlyOnceWith(state.activeThreadId, id);
  expect((await fetch(new URL(`results/${randomUUID()}`, url))).status).toBe(404);
  state.timeline = [];
  expect((await fetch(new URL(`results/${id}`, url))).status).toBe(404);
  expect(deps.readGeneratedResult).toHaveBeenCalledTimes(1);
  const rotated = await remote.configure({ operation: 'rotate' });
  const revoked = new URL(`results/${id}`, url);
  revoked.port = new URL(rotated.url!).port;
  expect((await fetch(revoked)).status).toBe(404);
});
