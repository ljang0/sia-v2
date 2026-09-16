import { expect, it } from 'vitest';
import { getActionToolDescriptor, type ValidatedActionInvocation } from '@sia/action-gateway';
import { MacWindowHistory } from './mac-window-history.js';

function request(
  turnId = 'turn',
  threadId = 'thread',
  sessionId = 'session',
): ValidatedActionInvocation {
  return {
    name: 'computer_snapshot',
    arguments: {},
    descriptor: getActionToolDescriptor('computer_snapshot')!,
    context: { sessionId, threadId, turnId, provider: 'codex', workspace: '/tmp' },
  };
}
const window = { app_id: 'safari', window_id: 'dashboard', title: 'Dashboard' };

it('offers observed windows after a failure without retaining text or changing the outcome', () => {
  const history = new MacWindowHistory();
  const observed = {
    outcome: 'verified' as const,
    summary: 'Observed',
    data: { ...window, visible_text: 'private page text' },
  };
  expect(history.observe(request(), observed)).toBe(observed);
  const failed = history.observe(request(), {
    outcome: 'refused',
    summary: 'This window could not be identified.',
    data: { app_id: 'safari', window_id: 'unrelated' },
  });
  expect(failed).toEqual({
    outcome: 'refused',
    summary: 'This window could not be identified.',
    data: { app_id: 'safari', window_id: 'unrelated', previously_observed_windows: [window] },
  });
  for (const other of [
    request('other'),
    request('turn', 'other'),
    request('turn', 'thread', 'other'),
  ])
    expect(history.observe(other, { outcome: 'refused', summary: 'Blocked' }).data).toEqual({
      previously_observed_windows: [],
    });
});

it.each([{ loading: true }, { observation_pending: true }])(
  'does not use unfinished observations for recovery: %j',
  (state) => {
    const history = new MacWindowHistory();
    expect(
      history.observe(request(), {
        outcome: 'accepted_unverified',
        summary: 'Loading',
        data: { ...window, ...state },
      }).data,
    ).toMatchObject({ ...state, previously_observed_windows: [] });
    expect(history.observe(request(), { outcome: 'refused', summary: 'Blocked' }).data).toEqual(
      { previously_observed_windows: [] },
    );
  },
);

it('keeps the six most recently observed targets and evicts old turns', () => {
  const history = new MacWindowHistory();
  const observe = (windowId: string, turnId = 'turn', appId = 'safari') =>
    history.observe(request(turnId), {
      outcome: 'verified',
      summary: 'Observed',
      data: { app_id: appId, window_id: windowId },
    });
  for (let i = 0; i < 7; i++) observe(String(i));
  observe('1');
  observe('1', 'turn', 'notes');
  expect(history.observe(request(), { outcome: 'refused', summary: 'Blocked' }).data).toEqual({
    previously_observed_windows: [
      ...['3', '4', '5', '6', '1'].map((id) => ({ app_id: 'safari', window_id: id })),
      { app_id: 'notes', window_id: '1' },
    ],
  });
  for (let i = 0; i < 8; i++) observe('window', `turn-${i}`);
  expect(history.observe(request(), { outcome: 'refused', summary: 'Blocked' }).data).toEqual({
    previously_observed_windows: [],
  });
});
