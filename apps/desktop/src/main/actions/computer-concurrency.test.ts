import {
  ActionGateway,
  LocalLeaseCoordinator,
  type TurnLease,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, request } from './test-support.js';

function harness() {
  const captured: number[] = [];
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return {
        apps: [
          { pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' },
          { pid: 43, name: 'Calculator', bundle_id: 'com.apple.calculator' },
        ],
      };
    if (tool === 'list_windows')
      return {
        windows: [
          { pid: 42, window_id: 91, app_name: 'TextEdit', title: 'Review notes' },
          { pid: 43, window_id: 92, app_name: 'Calculator', title: 'Calculator' },
        ],
      };
    if (tool === 'get_window_state') {
      captured.push(Number(args.window_id));
      return {
        elements: [
          {
            role: 'AXButton',
            label: 'A control',
            element_token: `native-${String(args.window_id)}`,
          },
        ],
      };
    }
    throw new Error(`Unexpected tool ${tool}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  const coordinator = new LocalLeaseCoordinator();
  const gateway = new ActionGateway({ backend });
  const start = (id: string) => coordinator.startTurn({ turnId: id, threadId: id });
  const invoke = (
    lease: TurnLease,
    invocation: ValidatedActionInvocation,
    signal?: AbortSignal,
  ) =>
    gateway.invoke({
      ...invocation,
      context: {
        ...invocation.context,
        threadId: lease.threadId,
        turnId: lease.turnId,
        lease,
        backgroundOnly: true,
        ...(signal ? { signal } : {}),
      },
    });
  const inventory = async (lease: TurnLease) => {
    const result = await invoke(lease, request('computer_list', {}));
    expect(result.outcome).toBe('verified');
    return dataRecord(result.data).windows as { app_id: string; window_id: string }[];
  };
  const snapshot = (
    lease: TurnLease,
    window: { app_id: string; window_id: string },
    signal?: AbortSignal,
  ) =>
    invoke(
      lease,
      request('computer_snapshot', {
        app_id: window.app_id,
        window_id: window.window_id,
        include_image: false,
      }),
      signal,
    );
  return { backend, coordinator, start, inventory, snapshot, captured };
}

it('retains separate turn grants and rejects another turn’s opaque references', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.start('a'), h.start('b')]);
  try {
    const first = await h.inventory(a);
    const second = await h.inventory(b);
    expect(first[0]!.window_id).not.toBe(second[0]!.window_id);
    expect((await h.snapshot(b, first[0]!)).outcome).toBe('stale');
    const results = await Promise.all([h.snapshot(a, first[0]!), h.snapshot(b, second[1]!)]);
    expect(results.map((result) => result.outcome)).toEqual(['verified', 'verified']);
    expect(h.captured.sort()).toEqual([91, 92]);
    for (let i = 0; i < results.length; i++) {
      const result = dataRecord(results[i]!.data);
      const element = (result.elements as { element_ref: string }[])[0]!;
      const target = i === 0 ? first[0]! : second[1]!;
      expect(
        h.backend.trustedApprovalTarget('computer_action', {
          ...target,
          snapshot_id: result.snapshot_id,
          element_ref: element.element_ref,
          action: 'click',
        }),
      ).toBeTruthy();
    }
    a.release();
    const resumed = await h.start('a');
    try {
      expect((await h.snapshot(resumed, first[0]!)).outcome).toBe('stale');
    } finally {
      resumed.release();
    }
    expect((await h.snapshot(b, second[1]!)).outcome).toBe('verified');
  } finally {
    a.release();
    b.release();
  }
});

it('locks the same physical window across distinct refs, cancels a waiter, and keeps the owner valid', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.start('a'), h.start('b')]);
  try {
    const first = await h.inventory(a);
    const second = await h.inventory(b);
    expect((await h.snapshot(a, first[0]!)).outcome).toBe('verified');
    const abort = new AbortController();
    const pending = h.snapshot(b, second[0]!, abort.signal);
    await vi.waitFor(() => expect(h.coordinator.snapshotQueue()).toHaveLength(1));
    expect(h.captured).toEqual([91]);
    abort.abort();
    expect((await pending).outcome).toBe('refused');
    expect((await h.snapshot(a, first[0]!)).outcome).toBe('verified');
    const retry = h.snapshot(b, second[0]!);
    await vi.waitFor(() => expect(h.coordinator.snapshotQueue()).toHaveLength(1));
    a.release();
    expect((await retry).outcome).toBe('verified');
  } finally {
    a.release();
    b.release();
  }
});
