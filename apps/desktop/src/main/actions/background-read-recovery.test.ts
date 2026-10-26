import { expect, it } from 'vitest';
import { LocalLeaseCoordinator, type ActionExecutionResult } from '@sia/action-gateway';
import { ComputerGrants } from './computer-grants.js';
import { BackgroundReadRecovery } from './background-read-recovery.js';
import type { WindowSnapshotCapability } from './computer-grants.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { actionResult } from './action-results.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

const snapshot: WindowSnapshotCapability = {
  id: 'snapshot',
  appId: 'app',
  publicWindowId: 'window',
  pid: 42,
  windowId: 91,
  capturedAt: Date.now(),
  protectedControls: false,
  elements: new Map(),
  browserUrl: 'https://example.edu/course?view=current',
};
const initialScroll = request('computer_action', {
  app_id: 'app',
  window_id: 'window',
  snapshot_id: 'snapshot',
  action: 'scroll',
});
const scroll = {
  ...initialScroll,
  context: { ...initialScroll.context, backgroundOnly: true },
};
const conflict: ActionExecutionResult = {
  outcome: 'needs_foreground',
  summary: 'Focus changed',
  data: { background_interrupted: true, background_other_app_changed: true },
};

it('pins two reconciliation reads to the original window and page while permanently blocking input in that turn', () => {
  const recovery = new BackgroundReadRecovery();
  expect(recovery.observe(scroll, snapshot, conflict).data).toMatchObject({
    computer_read_only_recovery: true,
    input_paused_for_turn: true,
  });
  const read = request('computer_snapshot', {
    app_id: 'app',
    window_id: 'window',
    expected_url: 'https://wrong.example/',
  });
  expect(
    recovery.prepare({ ...read, arguments: { ...read.arguments, window_id: 'another' } }),
  ).toMatchObject({ result: { outcome: 'refused' } });
  for (let i = 0; i < 2; i++) {
    const prepared = recovery.prepare(read);
    expect('request' in prepared && prepared.request.arguments.expected_url).toBe(
      snapshot.browserUrl,
    );
  }
  expect(recovery.prepare(read)).toMatchObject({ result: { outcome: 'refused' } });
  expect(recovery.prepare(scroll)).toMatchObject({
    result: { data: { input_paused_for_turn: true } },
  });
  const next = { ...scroll, context: { ...scroll.context, turnId: 'next-turn' } };
  expect(recovery.prepare(next)).toEqual({ request: next });
});

it('does not permit recovery for another window, a write, unknown focus or target-app activation', () => {
  const recovery = new BackgroundReadRecovery();
  for (const [input, capability, result] of [
    [{ ...scroll, arguments: { ...scroll.arguments, action: 'click' } }, snapshot, conflict],
    [scroll, { ...snapshot, appId: 'another' }, conflict],
    [scroll, { ...snapshot, protectedControls: true }, conflict],
    [scroll, snapshot, { ...conflict, data: { background_interrupted: true } }],
  ] as const)
    expect(recovery.observe(input, capability, result)).toBe(result);
  expect(recovery.prepare(scroll)).toEqual({ request: scroll });
  for (const native of [{ foregrounded_window: true }, { restored_frontmost_app: true }])
    expect(
      dataRecord(
        actionResult(
          { ...native, background_focus_changed: true, background_other_app_changed: true },
          'scroll',
        ).data,
      ).background_other_app_changed,
    ).toBeUndefined();
});

it('gives an explicitly continued attempt fresh authority while retaining its public turn id', async () => {
  const leases = new LocalLeaseCoordinator();
  const recovery = new BackgroundReadRecovery();
  const grants = new ComputerGrants();
  const firstLease = await leases.startTurn({
    threadId: scroll.context.threadId,
    turnId: scroll.context.turnId,
  });
  const first = { ...scroll, context: { ...scroll.context, lease: firstLease } };
  const originalSession = grants.session(first);
  recovery.observe(first, snapshot, conflict);
  expect(recovery.prepare(first)).toHaveProperty('result');
  firstLease.release();
  const secondLease = await leases.startTurn({
    threadId: scroll.context.threadId,
    turnId: scroll.context.turnId,
  });
  try {
    const continued = { ...scroll, context: { ...scroll.context, lease: secondLease } };
    expect(recovery.prepare(continued)).toEqual({ request: continued });
    expect(grants.session(continued)).not.toBe(originalSession);
  } finally {
    secondLease.release();
  }
});

it('enforces the pause at the real backend even after fresh input refs are minted', async () => {
  let url = 'https://example.edu/course';
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, title: 'Course' }] };
    if (tool === 'get_window_state')
      return {
        elements: [{ role: 'AXLink', label: 'Due today', element_token: 's00000001:1' }],
      };
    if (tool === 'scroll')
      return { background_focus_changed: true, background_other_app_changed: true };
    throw new Error(`Unexpected input: ${tool}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => ({ status: 'ready', url, bundleID: 'com.apple.Safari' }),
  });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  const observed = dataRecord(
    (await backend.invoke(request('computer_snapshot', { ...ids, include_image: false }))).data,
  );
  const initialAction = request('computer_action', {
    ...ids,
    snapshot_id: observed.snapshot_id,
    action: 'scroll',
    direction: 'down',
    amount: 1,
  });
  const action = {
    ...initialAction,
    context: { ...initialAction.context, backgroundOnly: true },
  };
  expect((await backend.invoke(action)).data).toMatchObject({
    computer_read_only_recovery: true,
  });
  const fresh = dataRecord(
    (await backend.invoke(request('computer_snapshot', { ...ids, include_image: false }))).data,
  );
  const calls = cua.call.mock.calls.length;
  expect(
    (
      await backend.invoke(
        request('computer_action', {
          ...ids,
          snapshot_id: fresh.snapshot_id,
          action: 'click',
          element_ref: (fresh.elements as { element_ref: string }[])[0]!.element_ref,
        }),
      )
    ).data,
  ).toMatchObject({ input_paused_for_turn: true });
  expect(cua.call).toHaveBeenCalledTimes(calls);
  url = 'https://another.example/';
  expect(
    (await backend.invoke(request('computer_snapshot', { ...ids, include_image: false })))
      .outcome,
  ).toBe('stale');
  expect(
    (await backend.invoke(request('computer_snapshot', { ...ids, include_image: false })))
      .outcome,
  ).toBe('refused');
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'scroll')).toHaveLength(1);
});
