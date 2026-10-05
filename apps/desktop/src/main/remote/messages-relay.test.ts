import { describe, expect, it, vi } from 'vitest';
import { MessagesRelay, REPLY_PREFIX } from './messages-relay.js';
import type { InboundMessage } from '../mac/messages-service.js';
import { normalizeHandle } from '../../shared/messages-relay.js';
import type { DesktopSnapshot, DesktopPushEvent } from '../../shared/bridge.js';

const AGENT = '11111111-1111-4111-8111-111111111111';
const ME = '+15551234567';

function harness() {
  const records = new Map<string, unknown>();
  const snapshot = {
    agents: [{ id: AGENT, name: 'Sia' }],
    threads: [],
    timeline: [],
    approvals: [],
  } as unknown as DesktopSnapshot;
  const listeners = new Set<(event: DesktopPushEvent) => void>();
  let rows: InboundMessage[] = [];
  let sequence = 0;
  const sent: { to: string; text: string }[] = [];
  const files: { to: string; name: string }[] = [];
  const invoke = vi.fn(async (method: string, input: Record<string, string>) => {
    if (method === 'threads.create') {
      const id = `thread-${snapshot.threads.length + 1}`;
      snapshot.threads.push({
        id,
        agentId: input.agentId,
        title: input.title,
        status: 'idle',
      } as never);
      return { threadId: id, snapshot };
    }
    if (method === 'threads.send') {
      const thread = snapshot.threads.find(({ id }) => id === input.threadId)!;
      thread.status = 'running';
      const turnId = `turn-${++sequence}`;
      snapshot.timeline.push({
        id: `user-${sequence}`,
        threadId: thread.id,
        turnId,
        sequence,
        kind: 'user',
        text: input.text ?? '',
        timestamp: '',
      });
      return { turnId, snapshot };
    }
    if (method === 'approvals.resolve') return snapshot;
    if (method === 'attachments.drop') {
      return {
        attachments: (input.paths as unknown as string[]).map((path, index) => ({
          id: `attachment-${index}`,
          name: path.split('/').at(-1),
        })),
      };
    }
    if (method === 'threads.cancel') {
      snapshot.threads.find(({ id }) => id === input.threadId)!.status = 'idle';
      return snapshot;
    }
    throw new Error(`unexpected ${method}`);
  });
  const controller = {
    snapshot: () => snapshot,
    invoke,
    remoteAccessAllowed: () => true,
    readGeneratedResult: vi.fn(async (_threadId: string, attachmentId: string) => ({
      name: `${attachmentId}.pdf`,
      data: Buffer.from('%PDF'),
    })),
    subscribe: (listener: (event: DesktopPushEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let now = 0;
  const relay = new MessagesRelay({
    controller: controller as never,
    repository: {
      get: (collection: string, id: string) => records.get(`${collection}/${id}`),
      put: (collection: string, id: string, value: unknown) =>
        records.set(`${collection}/${id}`, structuredClone(value)),
    } as never,
    messages: {
      status: () => 'ready',
      latestRowId: () => 100,
      inbound: (cursor: number) => {
        const next = rows.filter((row) => row.rowId > cursor);
        rows = [];
        return { cursor: Math.max(cursor, ...next.map((row) => row.rowId)), messages: next };
      },
      send: async (to: string, text: string) => {
        sent.push({ to, text });
      },
      sendFile: async (to: string, path: string) => {
        files.push({ to, name: path.split('/').at(-1)! });
      },
    },
    ackAfterMs: 5000,
    transcribe: async (path: string) => {
      if (path.includes('mumble')) throw new Error('no speech');
      return 'Book a table for two at 7';
    },
    now: () => now,
  });
  relay.initialize();
  const text = (
    rowId: number,
    body: string,
    from = ME,
    fromMe = false,
    attachments: string[] = [],
  ) => {
    rows.push({
      rowId,
      handle: fromMe ? '' : from,
      chatIdentifier: from,
      fromMe,
      text: body,
      attachments,
    });
  };
  const emit = () => {
    for (const listener of listeners) listener({ type: 'snapshot', snapshot });
  };
  const finish = (threadId: string, answer: string) => {
    const thread = snapshot.threads.find(({ id }) => id === threadId)!;
    const turnId = snapshot.timeline.findLast((item) => item.threadId === threadId)!.turnId!;
    snapshot.timeline.push({
      id: `a-${++sequence}`,
      threadId,
      turnId,
      sequence,
      kind: 'assistant',
      text: answer,
      timestamp: '',
    });
    thread.status = 'idle';
    emit();
  };
  const ready = async () => {
    await relay.configure({ operation: 'trust', handle: '(555) 123-4567', label: '' });
    await relay.configure({ operation: 'enable', agentId: AGENT });
  };
  return {
    relay,
    snapshot,
    sent,
    files,
    invoke,
    controller,
    text,
    finish,
    emit,
    ready,
    records,
    advance: (ms: number) => (now += ms),
  };
}

describe('normalizeHandle', () => {
  it('normalizes US numbers, international numbers and emails', () => {
    expect(normalizeHandle('(555) 123-4567')).toBe('+15551234567');
    expect(normalizeHandle('1 555 123 4567')).toBe('+15551234567');
    expect(normalizeHandle('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizeHandle(' Me@iCloud.com ')).toBe('me@icloud.com');
    expect(normalizeHandle('12345')).toBeUndefined();
    expect(normalizeHandle('call me')).toBeUndefined();
  });
});

describe('MessagesRelay', () => {
  it('stays off until a number is trusted and texting is turned on', async () => {
    const h = harness();
    await expect(h.relay.configure({ operation: 'enable', agentId: AGENT })).rejects.toThrow(
      'Add a trusted phone number first.',
    );
    h.text(101, 'hello');
    await h.relay.poll();
    expect(h.invoke).not.toHaveBeenCalled();
    await h.ready();
    expect((await h.relay.configure({ operation: 'status' })).running).toBe(true);
  });

  it('runs a trusted text as a phone turn and texts the answer back', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'What is on my calendar today?');
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('threads.create', {
      agentId: AGENT,
      title: 'Text: What is on my calendar today?',
    });
    expect(h.invoke).toHaveBeenCalledWith('threads.send', {
      threadId: 'thread-1',
      text: 'What is on my calendar today?',
      fromPhone: true,
    });
    h.finish('thread-1', 'Two meetings: [Standup](<https://cal/x>) at 10.');
    await h.relay.flush();
    expect(h.sent).toEqual([
      { to: ME, text: `${REPLY_PREFIX}Two meetings: Standup (https://cal/x) at 10.` },
    ]);
  });

  it('ignores untrusted senders, history before enabling, and Sia’s own replies', async () => {
    const h = harness();
    await h.ready();
    h.text(50, 'old message from before enabling');
    h.text(101, 'run rm -rf', '+15559999999');
    h.text(102, `${REPLY_PREFIX}Done.`, ME, true);
    await h.relay.poll();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('accepts texts to yourself once, even when Messages records two copies', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'Remind me what I asked yesterday', ME, true);
    h.text(102, 'Remind me what I asked yesterday', ME, false);
    await h.relay.poll();
    expect(h.invoke.mock.calls.filter(([m]) => m === 'threads.send')).toHaveLength(1);
  });

  it('does not treat your own texts to other people as requests', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'See you at 6', '+15550000000', true);
    await h.relay.poll();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('continues the same conversation, acknowledges slow work, and supports STOP and NEW', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'Find a dentist near me');
    await h.relay.poll();
    h.advance(6000);
    h.emit();
    h.text(102, 'also check reviews');
    await h.relay.poll();
    h.text(103, 'STOP');
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('threads.cancel', { threadId: 'thread-1' });
    h.text(104, 'Book the first one');
    await h.relay.poll();
    expect(h.invoke.mock.calls.filter(([m]) => m === 'threads.create')).toHaveLength(1);
    h.finish('thread-1', 'Booked.');
    h.text(105, 'new');
    await h.relay.poll();
    h.text(106, 'Different topic');
    await h.relay.poll();
    expect(h.invoke.mock.calls.filter(([m]) => m === 'threads.create')).toHaveLength(2);
    await h.relay.flush();
    expect(h.sent.map(({ text }) => text.slice(REPLY_PREFIX.length))).toEqual([
      "Working on it. I'll text you when it's done.",
      'Still working on your last request. Text STOP to cancel it.',
      'Stopped.',
      'Booked.',
      'Starting fresh. What should I do?',
    ]);
  });

  it('lets you allow or deny one step by replying YES or NO', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'Email Alex the report');
    await h.relay.poll();
    const ask = (id: string) => {
      h.snapshot.threads[0]!.status = 'waiting';
      h.snapshot.approvals.push({
        id,
        threadId: 'thread-1',
        title: 'Send email to Alex',
        summary: 'Gmail',
        status: 'pending',
      } as never);
      h.emit();
      h.emit();
    };
    ask('approval-1');
    await h.relay.flush();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.text).toContain('I need your OK to continue: Send email to Alex. Gmail.');
    expect(h.sent[0]!.text).toContain('Reply YES to allow this once or NO to deny');
    h.text(102, 'Yes!');
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('approvals.resolve', {
      approvalId: 'approval-1',
      decision: 'approve',
    });
    h.snapshot.approvals[0]!.status = 'approved';
    ask('approval-2');
    h.text(103, 'what is this?');
    await h.relay.poll();
    h.text(104, 'no');
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('approvals.resolve', {
      approvalId: 'approval-2',
      decision: 'deny',
    });
    await h.relay.flush();
    expect(h.sent.map(({ text }) => text.slice(REPLY_PREFIX.length))).toEqual([
      expect.stringContaining('Send email to Alex'),
      'Allowed. Continuing.',
      expect.stringContaining('Send email to Alex'),
      'Reply YES to allow this step, NO to deny it, or STOP to cancel.',
      'Denied.',
    ]);
    expect(h.invoke.mock.calls.filter(([m]) => m === 'threads.send')).toHaveLength(1);
    expect(h.invoke.mock.calls.some(([, input]) => input?.decision === 'approve_task')).toBe(
      false,
    );
  });

  it('keeps approvals on the Mac when replying YES is turned off', async () => {
    const h = harness();
    await h.ready();
    await h.relay.configure({ operation: 'preferences', textApprovals: false });
    h.text(101, 'Email Alex the report');
    await h.relay.poll();
    h.snapshot.threads[0]!.status = 'waiting';
    h.snapshot.approvals.push({
      id: 'approval-1',
      threadId: 'thread-1',
      title: 'Send email to Alex',
      summary: '',
      status: 'pending',
    } as never);
    h.emit();
    h.text(102, 'yes');
    await h.relay.poll();
    await h.relay.flush();
    expect(h.sent[0]!.text).toContain('I need your OK in Sia on your Mac to continue');
    expect(h.sent.at(-1)!.text).toContain('Still waiting for your OK in Sia on your Mac');
    expect(h.invoke.mock.calls.some(([m]) => m === 'approvals.resolve')).toBe(false);
  });

  it('does not let a YES from another trusted number answer your approval', async () => {
    const h = harness();
    await h.ready();
    await h.relay.configure({ operation: 'trust', handle: 'me@icloud.com', label: '' });
    h.text(101, 'Email Alex the report');
    await h.relay.poll();
    h.snapshot.threads[0]!.status = 'waiting';
    h.snapshot.approvals.push({
      id: 'approval-1',
      threadId: 'thread-1',
      title: 'Send email',
      summary: '',
      status: 'pending',
    } as never);
    h.emit();
    h.text(102, 'yes', 'me@icloud.com');
    await h.relay.poll();
    expect(h.invoke.mock.calls.some(([m]) => m === 'approvals.resolve')).toBe(false);
  });

  it('forgets a number’s conversation when it is removed and turns off with no numbers', async () => {
    const h = harness();
    await h.ready();
    const settings = await h.relay.configure({ operation: 'untrust', handle: ME });
    expect(settings).toMatchObject({ enabled: false, running: false, trusted: [] });
    expect(h.records.get('messages-relay/settings')).toMatchObject({ threads: {} });
  });

  it('passes photos from a text to Sia as attachments', async () => {
    const h = harness();
    await h.ready();
    h.text(101, '', ME, false, ['/Users/me/Library/Messages/Attachments/IMG_1.heic']);
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('attachments.drop', {
      threadId: 'thread-1',
      paths: ['/Users/me/Library/Messages/Attachments/IMG_1.heic'],
    });
    expect(h.invoke).toHaveBeenCalledWith('threads.send', {
      threadId: 'thread-1',
      text: '',
      fromPhone: true,
      attachmentIds: ['attachment-0'],
    });
  });

  it('sends saved results back as iMessage attachments after the reply', async () => {
    const h = harness();
    await h.ready();
    h.text(101, 'Make me a PDF of the plan');
    await h.relay.poll();
    h.snapshot.timeline.push({
      id: 'answer',
      threadId: 'thread-1',
      turnId: 'turn-1',
      sequence: 99,
      kind: 'assistant',
      text: 'Here it is.',
      attachments: [{ id: 'result-1', name: 'plan.pdf', kind: 'file', generated: true }],
      timestamp: '',
    } as never);
    h.snapshot.threads[0]!.status = 'idle';
    h.emit();
    await h.relay.flush();
    expect(h.sent.at(-1)!.text).toBe(`${REPLY_PREFIX}Here it is.`);
    expect(h.controller.readGeneratedResult).toHaveBeenCalledWith('thread-1', 'result-1');
    expect(h.files).toEqual([{ to: ME, name: 'result-1.pdf' }]);
  });

  it('texts your first number when a scheduled task finishes, unless turned off', async () => {
    const h = harness();
    await h.ready();
    const schedule = (id: string, turnId: string) => {
      h.snapshot.threads.push({
        id,
        agentId: AGENT,
        title: 'Morning brief',
        status: 'running',
      } as never);
      h.snapshot.timeline.push({
        id: `u-${turnId}`,
        threadId: id,
        turnId,
        sequence: 50,
        kind: 'user',
        text: 'Brief me',
        scheduleRunId: `run-${turnId}`,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      } as never);
      h.emit();
    };
    schedule('scheduled-1', 'turn-s1');
    h.finish('scheduled-1', 'Three meetings today.');
    await h.relay.flush();
    expect(h.sent.at(-1)).toEqual({
      to: ME,
      text: `${REPLY_PREFIX}Scheduled task “Morning brief”: Three meetings today.`,
    });
    const count = h.sent.length;
    expect(
      (await h.relay.configure({ operation: 'preferences', proactive: false })).proactive,
    ).toBe(false);
    schedule('scheduled-2', 'turn-s2');
    h.finish('scheduled-2', 'Nothing today.');
    await h.relay.flush();
    expect(h.sent).toHaveLength(count);
  });

  it('transcribes voice notes into the request and asks to type when it cannot', async () => {
    const h = harness();
    await h.ready();
    h.text(101, '', ME, false, ['/Users/me/Library/Messages/Attachments/Audio Message.caf']);
    await h.relay.poll();
    expect(h.invoke).toHaveBeenCalledWith('threads.send', {
      threadId: 'thread-1',
      text: 'Book a table for two at 7',
      fromPhone: true,
    });
    h.finish('thread-1', 'Booked.');
    h.text(102, '', ME, false, ['/Users/me/Library/Messages/Attachments/mumble.caf']);
    await h.relay.poll();
    await h.relay.flush();
    expect(h.sent.at(-1)!.text).toContain("I couldn't understand that voice note");
    expect(h.invoke.mock.calls.filter(([m]) => m === 'threads.send')).toHaveLength(1);
  });
});
