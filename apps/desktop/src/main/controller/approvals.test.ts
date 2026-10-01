import { randomUUID } from 'node:crypto';
import { getActionToolDescriptor } from '@sia/action-gateway';
import { describe, expect, it, vi } from 'vitest';
import { PlaintextTestCipher, SqliteRecordRepository } from '../persistence.js';
import { createController, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('drops settled approvals without a transcript row a week after they expired', async () => {
    const initial = await createHarness();
    const persisted = structuredClone(
      initial.repository.get<{
        approvals: Array<Record<string, unknown>>;
        timeline: Array<Record<string, unknown>>;
      }>('desktop', 'state')!,
    );
    await initial.controller.shutdown();
    const approval = (id: string, expiresAt: string, status = 'approved') => ({
      id,
      threadId: 'thread-1',
      callId: `call-${id}`,
      kind: 'computer_action',
      title: 'Use the Mac',
      summary: 'Click Save',
      target: 'TextEdit',
      reversible: false,
      expiresAt,
      status,
    });
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    persisted.approvals.push(
      approval('old-settled', old),
      approval('old-in-transcript', old, 'denied'),
      approval('recent-settled', recent, 'expired'),
    );
    persisted.timeline.push({
      id: 'approval-row',
      threadId: 'thread-1',
      sequence: 1,
      kind: 'approval',
      approvalId: 'old-in-transcript',
      status: 'denied',
      timestamp: old,
    });
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('desktop', 'state', persisted);
    const { controller } = await createHarness({ repository });
    expect(controller.snapshot().approvals.map(({ id }) => id)).toEqual([
      'old-in-transcript',
      'recent-settled',
    ]);
    await controller.shutdown();
  });

  it('returns to running after a provider approval and settles rows when a turn is cancelled', async () => {
    let runtimeThreadId = '';
    let waitForCancel = false;
    const runtime = {
      async *runTurn(input: { turnId: string }, signal: AbortSignal) {
        if (waitForCancel)
          await new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            }),
          );
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 1,
          type: 'approval' as const,
          payload: {
            phase: 'requested',
            requestId: 'r1',
            title: 'Run command',
            description: 'ls',
          },
        } as never;
        await new Promise((resolve) => setTimeout(resolve, 200));
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const status = (id: string) =>
      controller.snapshot().threads.find((t) => t.id === id)?.status;

    const approved = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = approved.threadId;
    await controller.invoke('threads.send', {
      threadId: approved.threadId,
      text: 'List files',
    });
    await vi.waitFor(() => expect(status(approved.threadId)).toBe('waiting'));
    const approval = controller
      .snapshot()
      .approvals.find((a) => a.threadId === approved.threadId)!;
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve',
    });
    expect(status(approved.threadId)).toBe('running');
    await vi.waitFor(() => expect(status(approved.threadId)).toBe('idle'));

    waitForCancel = true;
    const cancelled = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = cancelled.threadId;
    await controller.invoke('threads.send', { threadId: cancelled.threadId, text: 'Wait' });
    await controller.invoke('threads.cancel', { threadId: cancelled.threadId });
    await vi.waitFor(() =>
      expect(
        controller
          .snapshot()
          .timeline.filter((item) => item.threadId === cancelled.threadId)
          .filter((item) => item.status === 'running'),
      ).toEqual([]),
    );
    await controller.shutdown();
  });

  it('notifies once when a task pauses for an approval or a question', async () => {
    let runtimeThreadId = '';
    // Each turn waits on its own gate so cancelling the first can't finish the second.
    let release = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        const approval = {
          type: 'approval' as const,
          payload: {
            phase: 'requested',
            requestId: 'command-1',
            title: 'Allow Mac action',
            description: 'Run a command: pnpm test',
          },
        };
        const question = {
          type: 'question' as const,
          payload: {
            phase: 'requested' as const,
            requestId: 'question-1',
            prompt: 'Which calendar should I use?',
          },
        };
        // A provider may repeat a pending request; the person hears about it once.
        const gate = release;
        yield { ...base, id: randomUUID(), sequence: 1, ...approval } as never;
        yield { ...base, id: randomUUID(), sequence: 2, ...approval } as never;
        yield { ...base, id: randomUUID(), sequence: 3, ...question };
        yield { ...base, id: randomUUID(), sequence: 4, ...question };
        await gate.promise;
      },
      dispose: vi.fn(async () => release.resolve()),
      cancel: vi.fn(async () => release.resolve()),
      respondToRequest: vi.fn(async () => undefined),
    };
    const notify = vi.fn();
    const { controller } = await createHarness({ fakeServices: false, runtime, notify });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Juniper',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      runtimeThreadId = threadId;
      await controller.invoke('threads.send', { threadId, text: 'Run the tests' });
      await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(notify.mock.calls).toEqual([
        [{ threadId, title: 'Juniper needs your OK', body: 'Run a command: pnpm test' }],
        [{ threadId, title: 'Juniper has a question', body: 'Which calendar should I use?' }],
      ]);
      expect(
        controller.snapshot().approvals.find((approval) => approval.threadId === threadId)
          ?.expiresAt,
      ).toBeUndefined();

      await controller.invoke('threads.cancel', { threadId });
      notify.mockClear();
      release = Promise.withResolvers<void>();
      await controller.invoke('agents.setNotifications', {
        agentId: agent.agentId,
        enabled: false,
      });
      const quiet = await controller.invoke('threads.create', { agentId: agent.agentId });
      runtimeThreadId = quiet.threadId;
      await controller.invoke('threads.send', { threadId: quiet.threadId, text: 'Again' });
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find(({ id }) => id === quiet.threadId)?.status,
        ).toBe('waiting'),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(notify).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await controller.shutdown();
    }
  });

  it('notifies when a Sia action waits for approval', async () => {
    const notify = vi.fn();
    const { controller } = await createHarness({ notify });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const agent = await controller.invoke('agents.save', {
      name: 'Juniper',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Email Sam' });
    notify.mockClear();
    const pending = controller.approvalBroker().requestApproval({
      id: 'approval-notify-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('mail_send')!,
      arguments: {
        account_id: 'gmail',
        to: ['person@example.com'],
        subject: 'Status',
        body: 'Hello',
      },
      targetDigest: 'target-digest',
      reason: 'This sends an email.',
    });
    expect(notify).toHaveBeenCalledExactlyOnceWith({
      threadId,
      title: 'Juniper needs your OK',
      body: 'Sending your mail',
    });
    const status = () =>
      controller.snapshot().threads.find(({ id }) => id === threadId)?.status;
    // The thread shows it needs the person, not "Working", until they answer.
    expect(status()).toBe('waiting');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'deny',
    });
    expect(status()).toBe('running');
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('keeps approvals waiting for the person instead of skipping them after two minutes', async () => {
    let runtimeThreadId = '';
    const gate = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        yield {
          id: randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
          sequence: 1,
          type: 'approval' as const,
          payload: {
            phase: 'requested',
            requestId: 'command-wait',
            title: 'Allow Mac action',
            description: 'Run a command: pnpm test',
          },
        } as never;
        // A real turn stays open while it waits on the person.
        await gate.promise;
      },
      dispose: vi.fn(async () => gate.resolve()),
      cancel: vi.fn(async () => gate.resolve()),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Juniper',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      runtimeThreadId = threadId;
      await controller.invoke('threads.send', { threadId, text: 'Run the tests' });
      await vi.waitFor(() => expect(controller.snapshot().approvals).toHaveLength(1));
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      vi.useRealTimers();
      const approval = controller.snapshot().approvals[0]!;
      expect(approval).toMatchObject({ threadId, status: 'pending' });
      expect(approval.expiresAt).toBeUndefined();
      expect(runtime.respondToRequest).not.toHaveBeenCalled();
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'waiting',
      );
    } finally {
      vi.useRealTimers();
      gate.resolve();
      await controller.shutdown();
    }
  });

  it('answers driver-level computer authorization automatically in trusted mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    expect(controller.snapshot().computer.trust).toBe('auto');
    await expect(
      controller.authorizeComputer(
        {
          adapterId: 'desktop_input',
          riskClass: 'r2',
          permissionMode: 'standard',
          publicSession: started.turnId,
          requestDigest: 'digest-auto',
          humanSummary: 'Control the selected Notes window',
          resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
          expiresUnixMs: BigInt(Date.now() + 30_000),
        },
        { kind: 'turn', threadId, turnId: started.turnId },
      ),
    ).resolves.toBe('allow');
    expect(controller.snapshot().approvals).toHaveLength(0);
    await controller.shutdown();
  });

  it('asks on the Mac for phone turns even in trusted mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Use Notes',
      fromPhone: true,
    });
    const decision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'digest-phone',
        humanSummary: 'Control the selected Notes window',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval).toMatchObject({ kind: 'native_tool', title: 'Allow computer access' });
    // Phone turns never offer, or accept, "Allow for this task".
    expect(approval.allowForTask).toBeUndefined();
    await expect(
      controller.invoke('approvals.resolve', {
        approvalId: approval.id,
        decision: 'approve_task',
      }),
    ).rejects.toThrow('only be allowed once');
    await controller.invoke('approvals.resolve', { approvalId: approval.id, decision: 'deny' });
    await expect(decision).resolves.toBe('deny');
    await controller.shutdown();
  });

  it('allows equivalent computer and Sia actions for the rest of the task only', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    const computer = (turnId: string, app: string, digest: string) =>
      controller.authorizeComputer(
        {
          adapterId: 'desktop_input',
          riskClass: 'r2',
          permissionMode: 'standard',
          publicSession: turnId,
          requestDigest: digest,
          humanSummary: `Control the selected ${app} window`,
          resourceJson: JSON.stringify({ app_name: app, window_title: 'Draft' }),
          expiresUnixMs: BigInt(Date.now() + 30_000),
        },
        { kind: 'turn', threadId, turnId },
      );
    const message = (recipient: string, text: string) =>
      controller.approvalBroker().requestApproval({
        id: randomUUID(),
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('messages_send')!,
        arguments: { recipient, text },
        targetDigest: 'digest',
        reason: 'This sends a message.',
      });

    const first = computer(started.turnId, 'Notes', 'digest-1');
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.allowForTask).toBe(true);
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve_task',
    });
    await expect(first).resolves.toBe('allow');
    expect(controller.snapshot().approvals.at(-1)).toMatchObject({
      id: approval.id,
      status: 'approved',
      scope: 'task',
    });
    const count = controller.snapshot().approvals.length;
    await expect(computer(started.turnId, 'Notes', 'digest-2')).resolves.toBe('allow');
    expect(controller.snapshot().approvals).toHaveLength(count);
    const other = computer(started.turnId, 'TextEdit', 'digest-3');
    const textEdit = controller.snapshot().approvals.at(-1)!;
    expect(textEdit).toMatchObject({ target: 'TextEdit, Draft', status: 'pending' });
    await controller.invoke('approvals.resolve', { approvalId: textEdit.id, decision: 'deny' });
    await expect(other).resolves.toBe('deny');

    const sent = message('+15555550100', 'On my way');
    const send = controller.snapshot().approvals.at(-1)!;
    expect(send.allowForTask).toBe(true);
    await controller.invoke('approvals.resolve', {
      approvalId: send.id,
      decision: 'approve_task',
    });
    await expect(sent).resolves.toEqual({ approved: true });
    await expect(message('+15555550100', 'Running late')).resolves.toEqual({ approved: true });
    const stranger = message('+15555550199', 'Hello');
    const asked = controller.snapshot().approvals.at(-1)!;
    expect(asked).toMatchObject({ status: 'pending', target: 'recipient: +15555550199' });
    await controller.invoke('approvals.resolve', { approvalId: asked.id, decision: 'deny' });
    await expect(stranger).resolves.toEqual({ approved: false });

    // The grant ends with its task.
    await controller.invoke('threads.cancel', { threadId });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).not.toBe(
        'running',
      ),
    );
    const next = await controller.invoke('threads.send', { threadId, text: 'Use Notes again' });
    const again = computer(next.turnId, 'Notes', 'digest-4');
    const renewed = controller.snapshot().approvals.at(-1)!;
    expect(renewed).toMatchObject({ status: 'pending', target: 'Notes, Draft' });
    await controller.invoke('approvals.resolve', { approvalId: renewed.id, decision: 'deny' });
    await expect(again).resolves.toBe('deny');
    await controller.shutdown();
  });

  it('passes "Allow for this task" to native provider requests that offer it', async () => {
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }, signal?: AbortSignal) {
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'approval' as const,
          payload: {
            requestId: 'provider-request-1',
            phase: 'requested' as const,
            title: 'Allow Mac action',
            description: 'Run a command: open -a TextEdit',
            choices: [
              { id: 'allow_once', label: 'Allow once', kind: 'allow_once' as const },
              { id: 'allow_task', label: 'Allow for this task', kind: 'allow_task' as const },
              { id: 'deny', label: 'Deny', kind: 'deny' as const },
            ],
          },
        };
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    await controller.invoke('threads.send', { threadId, text: 'Open TextEdit' });
    await vi.waitFor(() =>
      expect(controller.snapshot().approvals.at(-1)?.status).toBe('pending'),
    );
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.allowForTask).toBe(true);
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve_task',
    });
    expect(runtime.respondToRequest).toHaveBeenCalledWith(threadId, {
      requestId: 'provider-request-1',
      choiceId: 'allow_task',
    });
    expect(controller.snapshot().approvals.at(-1)).toMatchObject({
      status: 'approved',
      scope: 'task',
    });
    await controller.invoke('threads.cancel', { threadId });
    await controller.shutdown();
  });

  it('uses content-bounded, correctly classified computer approvals in confirmation mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    expect(controller.snapshot().computer.trust).toBe('ask');
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    const decision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'digest-1',
        humanSummary: 'Control the selected Notes window',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval).toMatchObject({
      kind: 'native_tool',
      title: 'Allow computer access',
      target: 'Notes, Draft',
      reversible: false,
    });
    expect(approval.title).not.toContain('Chrome');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve',
    });
    await expect(decision).resolves.toBe('allow');
    await controller.shutdown();
  });

  it('keeps a computer approval open until the driver deadline instead of two minutes', async () => {
    const gate = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn() {
        await gate.promise;
      },
      dispose: vi.fn(async () => gate.resolve()),
      cancel: vi.fn(async () => gate.resolve()),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Use Notes' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const decision = controller.authorizeComputer(
        {
          adapterId: 'desktop_input',
          riskClass: 'r2',
          permissionMode: 'standard',
          publicSession: started.turnId,
          requestDigest: 'digest-wait',
          humanSummary: 'Control the selected Notes window',
          resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
          expiresUnixMs: BigInt(Date.now() + 30 * 60_000),
        },
        { kind: 'turn', threadId, turnId: started.turnId },
      );
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const approval = controller.snapshot().approvals.at(-1)!;
      expect(approval.status).toBe('pending');
      await controller.invoke('approvals.resolve', {
        approvalId: approval.id,
        decision: 'approve',
      });
      await expect(decision).resolves.toBe('allow');
    } finally {
      vi.useRealTimers();
      gate.resolve();
      await controller.shutdown();
    }
  });

  it('shows exact connector recipients and content in the approval preview', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Send the email',
    });
    const body = `${'x'.repeat(17_000)} exact-tail`;
    const pending = controller.approvalBroker().requestApproval({
      id: 'approval-call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('mail_send')!,
      arguments: {
        account_id: 'gmail',
        to: ['person@example.com'],
        subject: 'Quarterly status',
        body,
      },
      targetDigest: 'target-digest',
      reason: 'This sends an email.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe('email recipients: person@example.com');
    expect(approval.account).toBe('demo@google.test');
    expect(approval.dataLeaving).toContain('To: person@example.com');
    expect(approval.dataLeaving).toContain('Subject: Quarterly status');
    expect(approval.dataLeaving).toContain(`Body:\n${body}`);
    expect(approval.dataLeaving).not.toContain('omitted');
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('authorizes connector changes without an approval card in autonomous mode', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('connections.start', { connectionId: 'slack' });
    const connectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'slack')?.connectionId;
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', {
      threadId,
      text: 'Post the update',
    });

    await expect(
      controller.approvalBroker().requestApproval({
        id: 'automatic-slack-call',
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('slack_post')!,
        arguments: { account_id: 'slack', channel_id: 'C1', text: 'Ready.' },
        targetDigest: 'automatic-slack-digest',
        reason: 'This posts a Slack message.',
      }),
    ).resolves.toEqual({ approved: true });
    expect(controller.snapshot().approvals).toHaveLength(0);
    expect(controller.connectionIdForAction('slack', 'slack', 'automatic-slack-call')).toBe(
      connectionId,
    );
    await controller.shutdown();
  });

  it('pins connector approvals to the exact connection and consumes them once', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    const originalConnectionId = controller
      .snapshot()
      .connections.find(({ id }) => id === 'gmail')?.connectionId;
    expect(originalConnectionId).toEqual(expect.any(String));
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Send email' });
    const requestApproval = (id: string) =>
      controller.approvalBroker().requestApproval({
        id,
        sessionId: 'session-1',
        threadId,
        turnId: started.turnId,
        tool: getActionToolDescriptor('mail_send')!,
        arguments: {
          account_id: 'gmail',
          to: ['person@example.com'],
          subject: 'Status',
          body: 'Ready.',
        },
        targetDigest: `digest-${id}`,
        reason: 'This sends an email.',
      });

    const first = requestApproval('connector-call-1');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(first).resolves.toEqual({ approved: true });
    expect(controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1')).toBe(
      originalConnectionId,
    );
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-1'),
    ).toBeUndefined();

    const stale = requestApproval('connector-call-2');
    await controller.invoke('approvals.resolve', {
      approvalId: controller.snapshot().approvals.at(-1)!.id,
      decision: 'approve',
    });
    await expect(stale).resolves.toEqual({ approved: true });
    await controller.invoke('connections.disconnect', { connectionId: 'gmail' });
    await controller.invoke('connections.start', { connectionId: 'gmail' });
    expect(
      controller.snapshot().connections.find(({ id }) => id === 'gmail')?.connectionId,
    ).not.toBe(originalConnectionId);
    expect(
      controller.connectionIdForAction('gmail', 'gmail', 'connector-call-2'),
    ).toBeUndefined();
    await controller.shutdown();
  });

  it('uses host-resolved element labels for browser and computer approvals', async () => {
    const controller = await createController();
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const trustedApprovalTarget = vi.fn(
      () =>
        'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    controller.attachBrowserCapabilitySink({
      acceptBrowserState: () => undefined,
      resetBrowserCapabilities: () => undefined,
      trustedApprovalTarget,
    });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    const started = await controller.invoke('threads.send', { threadId, text: 'Compose' });
    const pending = controller.approvalBroker().requestApproval({
      id: 'call-1',
      sessionId: 'session-1',
      threadId,
      turnId: started.turnId,
      tool: getActionToolDescriptor('browser_action')!,
      arguments: {
        tab_id: 'tab-1',
        snapshot_id: 'snapshot-1',
        action: 'click',
        element_ref: 'model-ref',
        origin: 'https://mail.example.test',
      },
      targetDigest: 'digest',
      reason: 'This changes the page.',
    });

    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.target).toBe(
      'https://mail.example.test: click “Compose” (button, exact snapshot ref b:snapshot:0)',
    );
    expect(trustedApprovalTarget).toHaveBeenCalledWith(
      'browser_action',
      expect.objectContaining({ element_ref: 'model-ref' }),
    );
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'deny',
    });
    await expect(pending).resolves.toEqual({ approved: false });
    await controller.shutdown();
  });

  it('revokes provider and computer approvals before a cancelled turn can release', async () => {
    let runtimeThreadId = '';
    let receivedLease:
      { holds(resource: { kind: 'workspace_writer'; id: string }): boolean } | undefined;
    const runtime = {
      async *runTurn(
        input: {
          turnId: string;
          lease?: { holds(resource: { kind: 'workspace_writer'; id: string }): boolean };
        },
        signal?: AbortSignal,
      ) {
        receivedLease = input.lease;
        yield {
          id: crypto.randomUUID(),
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'approval' as const,
          payload: {
            requestId: 'provider-request-1',
            phase: 'requested' as const,
            title: 'Run a command',
            description: 'Run the pending provider command',
            choices: [
              { id: 'allow_once', label: 'Allow once', kind: 'allow_once' as const },
              { id: 'deny', label: 'Deny', kind: 'deny' as const },
            ],
          },
        };
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const agent = await controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
    runtimeThreadId = threadId;
    const started = await controller.invoke('threads.send', { threadId, text: 'Do the task' });
    await vi.waitFor(() => {
      expect(controller.snapshot().approvals.some(({ status }) => status === 'pending')).toBe(
        true,
      );
    });
    expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
      true,
    );
    const computerDecision = controller.authorizeComputer(
      {
        adapterId: 'desktop_input',
        riskClass: 'r2',
        permissionMode: 'standard',
        publicSession: started.turnId,
        requestDigest: 'computer-request-1',
        humanSummary: 'Click in Notes',
        resourceJson: JSON.stringify({ app_name: 'Notes', window_title: 'Draft' }),
        expiresUnixMs: BigInt(Date.now() + 30_000),
      },
      { kind: 'turn', threadId, turnId: started.turnId },
    );
    const approvalIds = controller
      .snapshot()
      .approvals.filter(({ status }) => status === 'pending')
      .map(({ id }) => id);

    await controller.invoke('threads.cancel', { threadId });

    await expect(computerDecision).resolves.toBe('cancel');
    expect(runtime.cancel).toHaveBeenCalledWith(threadId, started.turnId);
    await vi.waitFor(() =>
      expect(receivedLease?.holds({ kind: 'workspace_writer', id: '/tmp/sia-workspace' })).toBe(
        false,
      ),
    );
    expect(runtime.respondToRequest).toHaveBeenCalledWith(threadId, {
      requestId: 'provider-request-1',
      choiceId: 'deny',
    });
    expect(
      controller.snapshot().approvals.filter(({ id }) => approvalIds.includes(id)),
    ).toEqual(
      expect.arrayContaining(
        approvalIds.map((id) => expect.objectContaining({ id, status: 'expired' })),
      ),
    );
    for (const approvalId of approvalIds) {
      await expect(
        controller.invoke('approvals.resolve', { approvalId, decision: 'approve' }),
      ).rejects.toThrow('expired');
    }
    await controller.shutdown();
  });
});
