import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_TOOL_DESCRIPTORS,
  ActionGateway,
  DefaultActionAuthorizationPolicy,
  LocalLeaseCoordinator,
  OneShotGrantStore,
  actionTargetDigest,
  getActionToolDescriptor,
  isPathInsideWorkspace,
  parseActionArguments,
  type ActionBackend,
  type ActionContext,
} from './index.js';

const context: ActionContext = {
  sessionId: 'session-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  provider: 'codex',
  workspace: '/Users/person/project',
};

function verifiedBackend(): ActionBackend & { invoke: ReturnType<typeof vi.fn> } {
  return {
    invoke: vi.fn(async () => ({ outcome: 'verified' as const, summary: 'Done' })),
  };
}

describe('curated tool surface', () => {
  it('removes unavailable capabilities from discovery and refuses stale invocations', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({
      backend,
      isToolAvailable: (name) => !name.startsWith('mail_'),
    });

    expect(gateway.listTools().some(({ name }) => name === 'mail_search')).toBe(false);
    await expect(
      gateway.invoke({
        name: 'mail_search',
        arguments: { account_id: 'gmail', query: 'newer_than:1d' },
        context,
      }),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: 'Tool mail_search is unavailable for this account',
    });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('requires exact email contents at the send approval boundary', () => {
    expect(() =>
      parseActionArguments('mail_send', {
        account_id: 'gmail',
        prepared_action_id: 'opaque-draft',
        confirmation_digest: 'opaque-digest',
      }),
    ).toThrow();
    expect(
      parseActionArguments('mail_send', {
        account_id: 'gmail',
        to: ['friend@example.com'],
        subject: 'A visible subject',
        body: 'The exact body shown for approval.',
      }),
    ).toMatchObject({
      to: ['friend@example.com'],
      subject: 'A visible subject',
      body: 'The exact body shown for approval.',
    });
    expect(() =>
      parseActionArguments('mail_send', {
        account_id: 'gmail',
        to: ['friend@example.com'],
        subject: 'A visible subject',
        body: 'The exact body shown for approval.',
        thread_id: 'existing-thread',
      }),
    ).toThrow();
    expect(
      parseActionArguments('mail_create_draft', {
        account_id: 'gmail',
        to: ['friend@example.com'],
        subject: 'A reply draft',
        body: 'Draft body.',
        thread_id: 'existing-thread',
      }),
    ).toMatchObject({ thread_id: 'existing-thread' });
  });

  it('contains only stable snake_case tools and no raw escape hatches', () => {
    const names = ACTION_TOOL_DESCRIPTORS.map((tool) => tool.name);
    expect(names).toHaveLength(50);
    expect(names.every((name) => /^[a-z][a-z0-9_]*$/.test(name))).toBe(true);
    expect(names.join(' ')).not.toMatch(/visual|canvas|javascript|cdp|cookie|profile|shell/i);
    expect(names).toContain('computer_action');
    expect(names).toContain('computer_open_app');
    expect(names).toContain('computer_open_url');
    expect(names).toContain('slack_post');
    expect(names).toContain('slack_find_users');
    expect(names).toContain('slack_open_dm');
    expect(names).toContain('messages_send');
    expect(names).toContain('docs_create');
    expect(names).toContain('sheets_update');
    expect(names).toContain('slides_append');
    expect(names).toContain('schedule_create');
    expect(names).toContain('schedule_list');
    const mutationNames = [
      'browser_navigate',
      'browser_action',
      'browser_upload',
      'computer_open_app',
      'computer_open_url',
      'computer_action',
      'mail_create_draft',
      'mail_send',
      'drive_upload',
      'drive_share',
      'docs_create',
      'docs_append',
      'sheets_create',
      'sheets_update',
      'sheets_append',
      'slides_create',
      'slides_append',
      'slack_post',
      'messages_send',
      'schedule_create',
      'schedule_update',
      'schedule_delete',
    ];
    for (const name of mutationNames) {
      expect(
        ACTION_TOOL_DESCRIPTORS.find((tool) => tool.name === name)?.annotations,
      ).toMatchObject({
        readOnly: false,
        requiresApproval: true,
      });
    }
  });
  it('enforces the original tool allowlist on nested actions before authorization or dispatch', async () => {
    const backend = {
      invoke: vi.fn(async () => ({ outcome: 'verified' as const, summary: 'done' })),
    };
    const gateway = new ActionGateway({
      backend,
      policy: { evaluate: () => ({ decision: 'allow' }) },
    });
    const pinned = { ...context, allowedTools: new Set(['computer_read_file']) };
    expect(
      (await gateway.invoke({ name: 'browser_tabs', arguments: {}, context: pinned })).outcome,
    ).toBe('refused');
    expect(backend.invoke).not.toHaveBeenCalled();
    expect(
      (
        await gateway.invoke({
          name: 'computer_read_file',
          arguments: { name: 'report.md' },
          context: pinned,
        })
      ).outcome,
    ).toBe('verified');
    expect(backend.invoke).toHaveBeenCalledOnce();
  });

  it('admits only ordinary credential-free web URLs for native browser opening', () => {
    expect(
      parseActionArguments('computer_open_url', { url: 'https://canvas.cmu.edu/' }),
    ).toEqual({ url: 'https://canvas.cmu.edu/' });
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://person:secret@example.com/',
    ]) {
      expect(() => parseActionArguments('computer_open_url', { url })).toThrow();
    }
  });

  it('makes desktop text insertion, replacement, and shortcuts unambiguous', () => {
    const base = {
      app_id: 'app:notes',
      window_id: 'window:notes',
      snapshot_id: 'snapshot:notes',
      element_ref: 'w:snapshot:0',
    };
    expect(
      parseActionArguments('computer_action', {
        ...base,
        action: 'set',
        text: 'Exact replacement',
      }),
    ).toMatchObject({ action: 'set', text: 'Exact replacement' });
    expect(
      parseActionArguments('computer_action', {
        ...base,
        action: 'key',
        value: 'a',
        modifiers: ['cmd'],
      }),
    ).toMatchObject({ action: 'key', value: 'a', modifiers: ['cmd'] });
    expect(() =>
      parseActionArguments('computer_action', {
        ...base,
        action: 'key',
        value: 'CMD+A',
      }),
    ).toThrow();
    expect(
      parseActionArguments('computer_action', {
        app_id: 'app:slack',
        window_id: 'window:slack',
        snapshot_id: 'snapshot:slack',
        action: 'type',
        text: 'Focused-field fallback',
      }),
    ).toMatchObject({ action: 'type', text: 'Focused-field fallback' });
    expect(() =>
      parseActionArguments('computer_action', {
        app_id: 'app:slack',
        window_id: 'window:slack',
        snapshot_id: 'snapshot:slack',
        action: 'click',
      }),
    ).toThrow(/element reference/);
  });

  it('accepts natural-language schedule plans only through the bounded schedule schema', () => {
    expect(
      parseActionArguments('schedule_create', {
        task: 'Search the web for new Sia coverage and summarize material changes.',
        cadence: 'hourly',
      }),
    ).toEqual({
      task: 'Search the web for new Sia coverage and summarize material changes.',
      cadence: 'hourly',
    });
    expect(() =>
      parseActionArguments('schedule_create', {
        task: 'Run arbitrary cron',
        cadence: '*/5 * * * *',
      }),
    ).toThrow();
    expect(() =>
      parseActionArguments('schedule_update', { schedule_id: 'schedule-1' }),
    ).toThrow();
  });

  it('bounds Google editor reads and writes without exposing raw batch requests', () => {
    expect(
      parseActionArguments('docs_create', {
        account_id: 'docs',
        title: 'Launch notes',
        markdown: '# Launch',
      }),
    ).toMatchObject({ account_id: 'docs', title: 'Launch notes' });
    expect(
      parseActionArguments('sheets_read', {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1:C20',
      }),
    ).toMatchObject({ start_row: 1, end_row: 500 });
    expect(() =>
      parseActionArguments('sheets_append', {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'A:C',
        values: [['missing sheet name']],
      }),
    ).toThrow(/sheet name/i);
    expect(() =>
      parseActionArguments('sheets_update', {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1:K500',
        values: Array.from({ length: 500 }, () => Array(11).fill('x')),
      }),
    ).toThrow(/5,000 cells/i);
    expect(() =>
      parseActionArguments('sheets_update', {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1',
        values: [[null]],
      }),
    ).toThrow();
    expect(
      parseActionArguments('sheets_append', {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A:A',
        values: [[null]],
      }),
    ).toMatchObject({ values: [[null]] });
    expect(() =>
      parseActionArguments('slides_append', {
        account_id: 'slides',
        presentation_id: 'deck-1',
        markdown: '# Added slide',
        requests: [{ deleteObject: { objectId: 'unsafe' } }],
      }),
    ).toThrow();
  });

  it('advertises the same stable connector selectors that its parsers require', () => {
    const selectors = {
      mail_search: 'gmail',
      mail_read_thread: 'gmail',
      mail_create_draft: 'gmail',
      mail_send: 'gmail',
      drive_search: 'drive',
      drive_read: 'drive',
      drive_upload: 'drive',
      drive_share: 'drive',
      docs_create: 'docs',
      docs_read: 'docs',
      docs_append: 'docs',
      sheets_create: 'sheets',
      sheets_read: 'sheets',
      sheets_update: 'sheets',
      sheets_append: 'sheets',
      slides_create: 'slides',
      slides_read: 'slides',
      slides_append: 'slides',
      slack_search: 'slack',
      slack_find_users: 'slack',
      slack_open_dm: 'slack',
      slack_read_thread: 'slack',
      slack_post: 'slack',
    } as const;
    for (const [name, selector] of Object.entries(selectors)) {
      const descriptor = getActionToolDescriptor(name)!;
      const properties = descriptor.inputSchema.properties as Record<
        string,
        Record<string, unknown>
      >;
      expect(properties.account_id?.enum).toEqual([selector]);
    }
  });

  it('rejects unknown tools and strict-schema extras before the backend', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({ backend });
    expect(await gateway.invoke({ name: 'visualize', arguments: {}, context })).toMatchObject({
      outcome: 'refused',
    });
    expect(
      await gateway.invoke({ name: 'browser_tabs', arguments: { raw_cdp: true }, context }),
    ).toMatchObject({ outcome: 'refused' });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('records read-only connector, browser, and computer invocations before execution', async () => {
    const order: string[] = [];
    const backend: ActionBackend = {
      invoke: vi.fn(async (request) => {
        order.push(`backend:${request.name}`);
        return { outcome: 'verified' as const, summary: 'Done' };
      }),
    };
    const gateway = new ActionGateway({
      backend,
      onInvocation: (invocation) => {
        order.push(`observe:${invocation.name}`);
      },
    });

    await gateway.invoke({ name: 'computer_list', arguments: {}, context });
    await gateway.invoke({ name: 'browser_tabs', arguments: {}, context });
    await gateway.invoke({
      name: 'mail_search',
      arguments: { account_id: 'gmail', query: 'status' },
      context,
    });

    expect(order).toEqual([
      'observe:computer_list',
      'backend:computer_list',
      'observe:browser_tabs',
      'backend:browser_tabs',
      'observe:mail_search',
      'backend:mail_search',
    ]);
  });

  it('reports validated backend results without letting research recording break an action', async () => {
    const onResult = vi.fn(() => {
      throw new Error('research storage unavailable');
    });
    const gateway = new ActionGateway({ backend: verifiedBackend(), onResult });

    await expect(
      gateway.invoke({ name: 'computer_list', arguments: {}, context }),
    ).resolves.toMatchObject({ outcome: 'verified' });
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'computer_list',
        context,
        result: expect.objectContaining({ outcome: 'verified' }),
      }),
    );
  });

  it('fails closed before execution when invocation recording fails', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({
      backend,
      onInvocation: () => {
        throw new Error('privacy store unavailable');
      },
    });

    await expect(
      gateway.invoke({ name: 'browser_tabs', arguments: {}, context }),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: 'Action invocation could not be recorded safely',
    });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('hard-denies generic browser, terminal, secure-field, private-window, and secret-file targets', async () => {
    const backend = verifiedBackend();
    const approvals = { requestApproval: vi.fn(async () => ({ approved: true })) };
    const gateway = new ActionGateway({ backend, approvals });
    const calls = [
      gateway.invoke({
        name: 'computer_action',
        arguments: {
          app_id: 'com.google.Chrome',
          window_id: 'w',
          snapshot_id: 's',
          action: 'key',
          element_ref: 'e',
          value: 'Enter',
        },
        context,
      }),
      gateway.invoke({
        name: 'computer_action',
        arguments: {
          app_id: 'terminal',
          window_id: 'w',
          snapshot_id: 's',
          action: 'key',
          element_ref: 'e',
          value: 'Enter',
        },
        context,
      }),
      gateway.invoke({
        name: 'browser_action',
        arguments: {
          tab_id: 't',
          snapshot_id: 's',
          action: 'type',
          element_ref: 'e',
          text: 'secret',
          target_role: 'secure text field',
        },
        context,
      }),
      gateway.invoke({
        name: 'browser_snapshot',
        arguments: { tab_id: 't', private: true },
        context,
      }),
      gateway.invoke({
        name: 'browser_upload',
        arguments: {
          tab_id: 't',
          snapshot_id: 's',
          element_ref: 'e',
          file_paths: ['/Users/person/.ssh/id_rsa'],
          origin: 'https://example.com',
        },
        context,
      }),
      gateway.invoke({
        name: 'browser_upload',
        arguments: {
          tab_id: 't',
          snapshot_id: 's',
          element_ref: 'e',
          file_paths: ['/Users/person/.codex/auth.json'],
          origin: 'https://example.com',
        },
        context,
      }),
    ];
    const results = await Promise.all(calls);
    expect(results.every((result) => result.outcome === 'refused')).toBe(true);
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('rejects raw computer coordinates and requires exact snapshot refs', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({ backend });

    await expect(
      gateway.invoke({
        name: 'computer_action',
        arguments: {
          app_id: 'app:opaque',
          window_id: 'window:opaque',
          snapshot_id: 'snapshot:opaque',
          action: 'click',
          coordinate: { x: 20, y: 30 },
        },
        context,
      }),
    ).resolves.toMatchObject({ outcome: 'refused' });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('publishes focused-field fallback while keeping app and snapshot identity required', () => {
    const descriptor = getActionToolDescriptor('computer_action');
    expect(descriptor?.inputSchema.required).not.toContain('element_ref');
    expect(descriptor?.inputSchema.required).toEqual(
      expect.arrayContaining(['app_id', 'window_id', 'snapshot_id', 'action']),
    );
    expect(descriptor?.inputSchema.required).not.toContain('app_name');
    expect(descriptor?.inputSchema.properties).not.toHaveProperty('app_name');
  });

  it('requires an exact approval before connector mutations', async () => {
    const backend = verifiedBackend();
    const approvals = { requestApproval: vi.fn(async () => ({ approved: true })) };
    const gateway = new ActionGateway({ backend, approvals });
    const args = { account_id: 'slack', channel_id: 'C123', text: 'Ship it' };
    const result = await gateway.invoke({ name: 'slack_post', arguments: args, context });
    expect(result.outcome).toBe('verified');
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: expect.objectContaining({ name: 'slack_post' }),
        targetDigest: actionTargetDigest('slack_post', args),
      }),
      undefined,
    );
    expect(backend.invoke).toHaveBeenCalledTimes(1);
    expect(backend.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: expect.any(String),
      }),
    );
  });

  it('does not advertise the unavailable embedded browser-download primitive', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({
      backend,
      approvals: { requestApproval: async () => ({ approved: true }) },
    });
    expect(getActionToolDescriptor('browser_download')).toBeUndefined();
    expect(
      await gateway.invoke({
        name: 'browser_download',
        arguments: {
          tab_id: 'tab-1',
          url: 'https://example.com/file',
        },
        context,
      }),
    ).toMatchObject({ outcome: 'refused' });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('honors denial and never calls the backend', async () => {
    const backend = verifiedBackend();
    const gateway = new ActionGateway({
      backend,
      approvals: { requestApproval: async () => ({ approved: false }) },
    });
    expect(
      await gateway.invoke({
        name: 'drive_share',
        arguments: {
          account_id: 'drive',
          resource_id: 'r',
          recipient: 'person@example.com',
          role: 'reader',
        },
        context,
      }),
    ).toMatchObject({ outcome: 'refused', reason: 'User denied the action' });
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('runs computer and browser actions without a broker in trusted local mode', async () => {
    const backend = verifiedBackend();
    const requestApproval = vi.fn(async () => ({ approved: true }));
    let trusted = true;
    const gateway = new ActionGateway({
      backend,
      policy: new DefaultActionAuthorizationPolicy({ trustLocalActions: () => trusted }),
      approvals: { requestApproval },
    });
    const browserArguments = {
      tab_id: 't',
      snapshot_id: 's',
      origin: 'https://example.com',
      action: 'click',
      element_ref: 'e',
    };
    const first = await gateway.invoke({
      name: 'browser_action',
      arguments: browserArguments,
      context,
    });
    expect(first, JSON.stringify(first)).toMatchObject({ outcome: 'verified' });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(backend.invoke).toHaveBeenCalledOnce();

    // Connector writes still cross the approval broker. The desktop controller may satisfy
    // that broker automatically when its autonomous mode is enabled.
    await gateway.invoke({
      name: 'slack_post',
      arguments: { account_id: 'slack', channel_id: 'C1', text: 'hi' },
      context,
    });
    expect(requestApproval).toHaveBeenCalledOnce();

    trusted = false;
    await gateway.invoke({ name: 'browser_action', arguments: browserArguments, context });
    expect(requestApproval).toHaveBeenCalledTimes(2);
  });

  it('withholds trusted local mode from individual turns', async () => {
    const backend = verifiedBackend();
    const requestApproval = vi.fn(async () => ({ approved: false }));
    const gateway = new ActionGateway({
      backend,
      policy: new DefaultActionAuthorizationPolicy({
        trustLocalActions: (request) => request.context.turnId !== 'phone-turn',
      }),
      approvals: { requestApproval },
    });
    const result = await gateway.invoke({
      name: 'browser_action',
      arguments: {
        tab_id: 't',
        snapshot_id: 's',
        origin: 'https://example.com',
        action: 'click',
        element_ref: 'e',
      },
      context: { ...context, turnId: 'phone-turn' },
    });
    expect(result).toMatchObject({ outcome: 'refused' });
    expect(requestApproval).toHaveBeenCalledOnce();
    expect(backend.invoke).not.toHaveBeenCalled();
  });

  it('binds one-shot grants to session, tool, arguments, and expiry', () => {
    let now = 1_000;
    const grants = new OneShotGrantStore({ now: () => now, maximumTtlMs: 100 });
    const targetDigest = actionTargetDigest('slack_post', { text: 'hello' });
    const grant = grants.issue({
      sessionId: 's',
      toolName: 'slack_post',
      targetDigest,
      ttlMs: 50,
    });
    expect(
      grants.consume({
        id: grant.id,
        sessionId: 'wrong',
        toolName: 'slack_post',
        targetDigest,
      }),
    ).toBe(false);
    expect(
      grants.consume({ id: grant.id, sessionId: 's', toolName: 'slack_post', targetDigest }),
    ).toBe(true);
    expect(
      grants.consume({ id: grant.id, sessionId: 's', toolName: 'slack_post', targetDigest }),
    ).toBe(false);
    const expired = grants.issue({
      sessionId: 's',
      toolName: 'slack_post',
      targetDigest,
      ttlMs: 20,
    });
    now += 21;
    expect(
      grants.consume({ id: expired.id, sessionId: 's', toolName: 'slack_post', targetDigest }),
    ).toBe(false);
  });

  it('checks workspace containment without prefix confusion', () => {
    expect(isPathInsideWorkspace('/work/project/file.txt', '/work/project')).toBe(true);
    expect(isPathInsideWorkspace('/work/project-other/file.txt', '/work/project')).toBe(false);
  });
});

describe('local lease coordinator', () => {
  it('limits active turns to four and queues in FIFO order', async () => {
    const coordinator = new LocalLeaseCoordinator();
    const active = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        coordinator.startTurn({ turnId: `t${index}`, threadId: `h${index}` }),
      ),
    );
    let fifthGranted = false;
    const fifthPromise = coordinator
      .startTurn({ turnId: 't4', threadId: 'h4' })
      .then((lease) => {
        fifthGranted = true;
        return lease;
      });
    await Promise.resolve();
    expect(fifthGranted).toBe(false);
    expect(coordinator.snapshotQueue()[0]).toMatchObject({ turnId: 't4', reason: 'capacity' });
    active[0]!.release();
    const fifth = await fifthPromise;
    expect(fifthGranted).toBe(true);
    fifth.release();
    active.slice(1).forEach((lease) => lease.release());
  });

  it('allows one active turn per thread', async () => {
    const coordinator = new LocalLeaseCoordinator();
    const first = await coordinator.startTurn({ turnId: 'a', threadId: 'same' });
    const secondPromise = coordinator.startTurn({ turnId: 'b', threadId: 'same' });
    expect(coordinator.snapshotQueue()[0]?.reason).toBe('thread_busy');
    first.release();
    const second = await secondPromise;
    second.release();
  });

  it('serializes tab, window, workspace writer, and global focus resources', async () => {
    const coordinator = new LocalLeaseCoordinator();
    const first = await coordinator.startTurn({ turnId: 'a', threadId: 'one' });
    const second = await coordinator.startTurn({ turnId: 'b', threadId: 'two' });
    const held = await first.acquire({ kind: 'browser_tab', id: 'tab-1' });
    let acquired = false;
    const waiting = second.acquire({ kind: 'browser_tab', id: 'tab-1' }).then((lease) => {
      acquired = true;
      return lease;
    });
    await Promise.resolve();
    expect(acquired).toBe(false);
    expect(coordinator.snapshotQueue()[0]).toMatchObject({
      reason: 'resource_busy',
      resource: { kind: 'browser_tab', id: 'tab-1' },
    });
    held.release();
    const secondTab = await waiting;
    expect(acquired).toBe(true);
    secondTab.release();
    first.release();
    second.release();
  });

  it('removes aborted queued leases', async () => {
    const coordinator = new LocalLeaseCoordinator(1);
    const first = await coordinator.startTurn({ turnId: 'a', threadId: 'one' });
    const controller = new AbortController();
    const waiting = coordinator.startTurn({
      turnId: 'b',
      threadId: 'two',
      signal: controller.signal,
    });
    controller.abort(new Error('cancelled'));
    await expect(waiting).rejects.toThrow('cancelled');
    expect(coordinator.snapshotQueue()).toHaveLength(0);
    first.release();
  });
});

it('accepts bounded pixel gestures but rejects ambiguous or incomplete addresses', () => {
  const base = { app_id: 'app:1', window_id: 'window:1', snapshot_id: 'snapshot:1' };
  expect(
    parseActionArguments('computer_action', { ...base, action: 'click', x: 10, y: 20 }),
  ).toMatchObject({ x: 10, y: 20 });
  expect(
    parseActionArguments('computer_action', {
      ...base,
      action: 'drag',
      x: 10,
      y: 20,
      to_x: 100,
      to_y: 200,
    }),
  ).toMatchObject({ action: 'drag' });
  for (const args of [
    { action: 'click', x: 10 },
    { action: 'drag', x: 10, y: 20 },
    { action: 'click', x: -1, y: 20 },
    { action: 'click', x: 10, y: 20, element_ref: 'w:1' },
    { action: 'type', x: 10, y: 20, text: 'bad' },
  ])
    expect(() => parseActionArguments('computer_action', { ...base, ...args })).toThrow();
  expect(() =>
    parseActionArguments('computer_open_app', { application: '/tmp/program.app' }),
  ).toThrow();
});

it.each([
  {
    name: 'computer_action',
    arguments: {
      app_id: 'app',
      window_id: 'window',
      snapshot_id: 'snapshot',
      action: 'key',
      value: 'return',
      delivery: 'foreground',
    },
  },
  {
    name: 'computer_open_url',
    arguments: { url: 'https://example.com', delivery: 'foreground' },
  },
  {
    name: 'computer_open_app',
    arguments: { application: 'com.tinyspeck.slackmacgap', delivery: 'foreground' },
  },
])('honors background-only policy before approval or dispatch for $name', async (action) => {
  const backend = verifiedBackend();
  const requestApproval = vi.fn(async () => ({ approved: true }));
  const gateway = new ActionGateway({ backend, approvals: { requestApproval } });
  const result = await gateway.invoke({
    ...action,
    context: { ...context, backgroundOnly: true },
  });
  expect(result.outcome).toBe('needs_foreground');
  expect(backend.invoke).not.toHaveBeenCalled();
  expect(requestApproval).not.toHaveBeenCalled();
  const allowed = await gateway.invoke({
    ...action,
    context: { ...context, backgroundOnly: false },
  });
  expect(allowed.outcome).toBe('verified');
  expect(requestApproval).toHaveBeenCalledOnce();
  expect(backend.invoke).toHaveBeenCalledOnce();
});
