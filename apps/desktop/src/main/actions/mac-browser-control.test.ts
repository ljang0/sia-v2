import { describe, expect, it, vi } from 'vitest';
import {
  getActionToolDescriptor,
  parseActionArguments,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';

function harness() {
  const state = {
    prepared: false,
    url: 'chrome://whats-new',
    focusChanged: false,
    unavailable: false,
    captureUrl: '',
    inputError: '',
    observationError: '',
    observationRefused: false,
    afterNavigateError: '',
    windowId: 91,
    requireSessionGrant: false,
    grantedSessions: new Set<string>(),
    expiredSessions: new Set<string>(),
  };
  const call = vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
    if (tool === 'list_windows')
      return { windows: [{ window_id: state.windowId, pid: 42, title: 'Chrome' }] };
    if (tool === 'browser_prepare') {
      if (state.unavailable)
        return {
          status: 'refused',
          refusal: {
            code: 'background_unavailable',
            message: 'No background preparation route',
          },
        };
      state.prepared = true;
      state.grantedSessions.add(String(args.session));
      return { status: 'ready' };
    }
    if (tool === 'get_browser_state') {
      if (state.expiredSessions.has(String(args.session)))
        throw new Error('CUA refused: session_ended');
      if (
        !state.prepared ||
        (state.requireSessionGrant && !state.grantedSessions.has(String(args.session)))
      )
        throw new Error('CUA refused: browser_consent_required');
      if (args.pid)
        return {
          target_id: 'native-target',
          tabs: [{ tab_id: 'native-tab', url: state.url, title: 'Course page', active: true }],
        };
      if (state.observationError) throw new Error(state.observationError);
      if (state.observationRefused) return { error_code: 'browser_tab_not_found' };
      return {
        target_id: 'native-target',
        tab_id: 'native-tab',
        url: state.captureUrl || state.url,
        outline: 'Verified fixture course content',
        elements: [
          { ref: 'native-link', role: 'link', label: 'Assignments' },
          { ref: 'native-input', role: 'textbox', label: 'Search' },
        ],
      };
    }
    if (tool === 'browser_navigate') {
      state.url = String(args.url);
      state.observationError = state.afterNavigateError;
      return { effect: 'confirmed' };
    }
    if (tool === 'browser_click' || tool === 'browser_type' || tool === 'browser_pointer') {
      if (state.inputError) throw new Error(state.inputError);
      return state.focusChanged ? { background_focus_changed: true } : { effect: 'confirmed' };
    }
    throw new Error(`Unexpected native route ${tool}`);
  });
  const openUrl = vi.fn();
  const backend = new DesktopActionBackend({
    cua: { call },
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => ({ status: 'protected' }),
    openUrl,
  });
  const request = (
    name: ValidatedActionInvocation['name'],
    args: Record<string, unknown>,
    turnId = 'turn',
  ): ValidatedActionInvocation => ({
    name,
    descriptor: getActionToolDescriptor(name)!,
    arguments: args,
    context: {
      sessionId: 'session',
      threadId: 'thread',
      turnId,
      provider: 'codex',
      workspace: '/tmp/sia-browser-fixture',
      backgroundOnly: true,
    },
  });
  async function target(turnId = 'turn') {
    const result = await backend.invoke(request('computer_list', {}, turnId));
    const data = result.data as { windows: { app_id: string; window_id: string }[] };
    return { app_id: data.windows[0]!.app_id, window_id: data.windows[0]!.window_id };
  }
  return { state, call, openUrl, backend, request, target };
}

describe('Mac background Chromium uses the dedicated Cua browser route', () => {
  it('honors a requested loading wait before reading the background tab', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://campus.example/courses';
    const target = await h.target();
    h.call.mockClear();
    vi.useFakeTimers();
    try {
      const pending = h.backend.invoke(
        h.request('computer_snapshot', { ...target, wait_ms: 500 }),
      );
      await vi.advanceTimersByTimeAsync(499);
      expect(h.call).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).outcome).toBe('verified');
      expect(h.call.mock.calls.some(([name]) => name === 'get_browser_state')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not attribute a previous or redirected page to the requested destination', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.captureUrl = 'https://campus.example/previous-course';
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_open_url', {
        ...target,
        url: 'https://campus.example/current-course',
      }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.summary).toContain('not the requested destination');
    expect(result.data).toMatchObject({
      tab_id: expect.stringMatching(/^mac-tab:/),
      input_delivery_uncertain: true,
    });
    expect(result.data).not.toHaveProperty('visible_text');
    expect(result.data).not.toHaveProperty('snapshot_id');
    expect(h.call.mock.calls.filter(([name]) => name === 'browser_navigate')).toHaveLength(1);
  });

  it('uses trusted background clicks and never silently falls back when that route is refused', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://campus.example/courses';
    const target = await h.target();
    const observed = await h.backend.invoke(h.request('computer_snapshot', target));
    const data = observed.data as { snapshot_id: string; elements: { element_ref: string }[] };
    h.state.inputError = 'CUA refused: browser_input_trust_unavailable';
    const result = await h.backend.invoke(
      h.request('computer_action', {
        ...target,
        snapshot_id: data.snapshot_id,
        element_ref: data.elements[0]!.element_ref,
        action: 'click',
      }),
    );
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('browser_input_trust_unavailable');
    const clicks = h.call.mock.calls.filter(([name]) => name === 'browser_click');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]![1]).toMatchObject({
      input_route: 'trusted',
      delivery_mode: 'background',
    });
    expect(JSON.stringify(h.call.mock.calls)).not.toContain('dom_event');
    expect(result.data).not.toHaveProperty('input_delivery_uncertain', true);
  });

  it('does not prepare or read a native window as a side effect of a snapshot', async () => {
    const h = harness();
    const target = await h.target();
    const result = await h.backend.invoke(h.request('computer_snapshot', target));
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('does not establish');
    expect(
      h.call.mock.calls.some(([name]) =>
        ['browser_prepare', 'get_window_state'].includes(name),
      ),
    ).toBe(false);
  });

  it('prepares exact background access and navigates a safe start tab without an OS opener', async () => {
    const h = harness();
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_open_url', { ...target, url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('verified');
    expect(result.data).toMatchObject({
      ...target,
      browser_route: 'cua_browser',
      source_url: 'https://canvas.cmu.edu/',
      visible_text: 'Verified fixture course content',
    });
    const prepare = h.call.mock.calls.find(([name]) => name === 'browser_prepare');
    expect(prepare?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      strategy: { kind: 'existing_profile' },
      delivery_mode: 'background',
    });
    expect(h.openUrl).not.toHaveBeenCalled();
    expect(
      h.call.mock.calls.some(([name]) =>
        ['launch_app', 'get_window_state', 'hotkey', 'type_text'].includes(name),
      ),
    ).toBe(false);
    expect(JSON.stringify(result)).not.toContain('native-target');
  });

  it('does not read a startup page as account content or mint an input snapshot for it', async () => {
    const h = harness();
    h.state.prepared = true;
    const target = await h.target();
    const result = await h.backend.invoke(h.request('computer_snapshot', target));
    expect(result.data).toMatchObject({ tabs: [{ navigation_only: true }] });
    expect(result.data).not.toHaveProperty('snapshot_id');
    expect(result.data).not.toHaveProperty('visible_text');
    expect(
      h.call.mock.calls.filter(([name, args]) => name === 'get_browser_state' && !args.pid),
    ).toHaveLength(0);
  });

  it('does not replace an unrelated existing web tab without explicit selection', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://notes.example/draft';
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_open_url', { ...target, url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(h.call.mock.calls.some(([name]) => name === 'browser_navigate')).toBe(false);
  });

  it('does not relabel accepted navigation as unsent when its page observation fails', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.afterNavigateError = 'CUA refused: browser_tab_not_found';
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_open_url', { ...target, url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.data).toMatchObject({ input_delivery_uncertain: true });
    expect(result.data).not.toHaveProperty('visible_text');
    expect(h.call.mock.calls.filter(([name]) => name === 'browser_navigate')).toHaveLength(1);
  });

  it('keeps tab choices stable instead of rebinding and minting new driver ids', async () => {
    const h = harness();
    h.state.prepared = true;
    const target = await h.target();
    const first = await h.backend.invoke(h.request('computer_snapshot', target));
    const choice = (first.data as { tabs: { tab_id: string }[] }).tabs[0]!;
    const second = await h.backend.invoke(
      h.request('computer_open_url', {
        ...target,
        tab_id: choice.tab_id,
        url: 'https://canvas.cmu.edu/',
      }),
    );
    expect(second.outcome).toBe('verified');
    expect(second.data).toMatchObject({ tab_id: choice.tab_id });
    expect(
      h.call.mock.calls.filter(([name, args]) => name === 'get_browser_state' && args.pid),
    ).toHaveLength(1);
    const refreshed = await h.backend.invoke(h.request('computer_snapshot', target));
    expect(refreshed.outcome).toBe('verified');
    expect(refreshed.data).toMatchObject({ tab_id: choice.tab_id });
    expect(h.call.mock.calls.filter(([name]) => name === 'browser_navigate')).toHaveLength(1);
  });

  it('retains an exact window profile grant across tasks while revoking all old input refs', async () => {
    const h = harness();
    h.state.requireSessionGrant = true;
    const firstTarget = await h.target();
    const first = await h.backend.invoke(
      h.request('computer_open_url', { ...firstTarget, url: 'https://canvas.cmu.edu/' }),
    );
    expect(first.outcome).toBe('verified');
    const old = first.data as {
      snapshot_id: string;
      tab_id: string;
      elements: { element_ref: string }[];
    };
    const nextTarget = await h.target('next-turn');
    const next = await h.backend.invoke(
      h.request('computer_snapshot', nextTarget, 'next-turn'),
    );
    expect(next.outcome).toBe('verified');
    expect(next.data).not.toMatchObject({ snapshot_id: old.snapshot_id });
    expect(next.data).not.toMatchObject({ tab_id: old.tab_id });
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_prepare')).toHaveLength(1);
    const sessions = h.call.mock.calls
      .filter(([tool]) => tool === 'get_browser_state')
      .map(([, args]) => args.session);
    expect(new Set(sessions).size).toBe(1);
    expect(
      (
        await h.backend.invoke(
          h.request(
            'computer_action',
            {
              ...nextTarget,
              snapshot_id: old.snapshot_id,
              element_ref: old.elements[0]!.element_ref,
              action: 'click',
            },
            'next-turn',
          ),
        )
      ).outcome,
    ).toBe('stale');
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
  });

  it('does not reuse a profile grant for a different native window', async () => {
    const h = harness();
    h.state.requireSessionGrant = true;
    const first = await h.target();
    await h.backend.invoke(
      h.request('computer_open_url', { ...first, url: 'https://canvas.cmu.edu/' }),
    );
    h.state.windowId = 92;
    const other = await h.target('other-turn');
    const result = await h.backend.invoke(h.request('computer_snapshot', other, 'other-turn'));
    expect(result.outcome).toBe('refused');
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_prepare')).toHaveLength(1);
    const sessions = h.call.mock.calls
      .filter(([tool]) => tool === 'get_browser_state')
      .map(([, args]) => args.session);
    expect(new Set(sessions).size).toBe(2);
  });

  it('requires a fresh acting request to replace an expired browser session, without replaying navigation', async () => {
    const h = harness();
    h.state.requireSessionGrant = true;
    const first = await h.target();
    await h.backend.invoke(
      h.request('computer_open_url', { ...first, url: 'https://canvas.cmu.edu/' }),
    );
    const session = String(
      h.call.mock.calls.find(([tool]) => tool === 'browser_prepare')![1].session,
    );
    h.state.expiredSessions.add(session);
    const next = await h.target('later-turn');
    expect(
      (await h.backend.invoke(h.request('computer_snapshot', next, 'later-turn'))).outcome,
    ).toBe('refused');
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_prepare')).toHaveLength(1);
    expect(
      (
        await h.backend.invoke(
          h.request(
            'computer_open_url',
            { ...next, url: 'https://canvas.cmu.edu/' },
            'later-turn',
          ),
        )
      ).outcome,
    ).toBe('verified');
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_prepare')).toHaveLength(2);
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_navigate')).toHaveLength(1);
  });

  it.each(['lost acknowledgement', 'failed observation', 'refused observation'])(
    'does not replay browser input after %s',
    async (scenario) => {
      const h = harness();
      h.state.prepared = true;
      h.state.url = 'https://canvas.cmu.edu/';
      const target = await h.target();
      const snapshot = await h.backend.invoke(h.request('computer_snapshot', target));
      const data = snapshot.data as {
        snapshot_id: string;
        elements: { element_ref: string }[];
      };
      if (scenario === 'lost acknowledgement') h.state.inputError = 'Transport disconnected';
      else if (scenario === 'failed observation')
        h.state.observationError = 'CUA refused: browser_tab_not_found';
      else h.state.observationRefused = true;
      const args = {
        ...target,
        snapshot_id: data.snapshot_id,
        element_ref: data.elements[0]!.element_ref,
        action: 'click',
      };
      const result = await h.backend.invoke(h.request('computer_action', args));
      expect(result.outcome).toBe('accepted_unverified');
      expect(result.data).toMatchObject({ input_delivery_uncertain: true });
      expect((await h.backend.invoke(h.request('computer_action', args))).outcome).toBe(
        'stale',
      );
      expect(h.call.mock.calls.filter(([name]) => name === 'browser_click')).toHaveLength(1);
    },
  );

  it('never escalates setup to foreground or falls back to native input', async () => {
    const h = harness();
    h.state.unavailable = true;
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_open_url', { ...target, url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('needs_foreground');
    expect(h.call.mock.calls.filter(([name]) => name === 'browser_prepare')).toHaveLength(1);
    expect(
      h.call.mock.calls.some(([name]) =>
        ['get_window_state', 'hotkey', 'type_text', 'browser_navigate'].includes(name),
      ),
    ).toBe(false);
  });

  it('does not prepare or navigate an authentication destination', async () => {
    const h = harness();
    const target = await h.target();
    const before = h.call.mock.calls.length;
    expect(
      (
        await h.backend.invoke(
          h.request('computer_open_url', { ...target, url: 'https://canvas.cmu.edu/login' }),
        )
      ).outcome,
    ).toBe('refused');
    expect(h.call.mock.calls.length).toBe(before);
  });

  it('does not return page content after the expected URL changes during capture', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://canvas.cmu.edu/courses/1';
    h.state.captureUrl = 'https://canvas.cmu.edu/courses/2';
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, expected_url: h.state.url }),
    );
    expect(result.outcome).toBe('stale');
    expect(result.data).not.toHaveProperty('visible_text');
    expect(result.images).toBeUndefined();
  });

  it('routes text replacement through the exact tab and preserves focus interruptions without replay', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://canvas.cmu.edu/';
    const target = await h.target();
    const snapshot = await h.backend.invoke(h.request('computer_snapshot', target));
    const data = snapshot.data as {
      snapshot_id: string;
      elements: { element_ref: string; label?: string }[];
    };
    const input = data.elements.find((e) => e.label === 'Search')!;
    h.state.focusChanged = true;
    const args = {
      ...target,
      snapshot_id: data.snapshot_id,
      element_ref: input.element_ref,
      action: 'set',
      text: 'homework',
    };
    const result = await h.backend.invoke(
      h.request('computer_action', parseActionArguments('computer_action', args)),
    );
    expect(result.data).toMatchObject({
      background_interrupted: true,
      input_delivery_uncertain: true,
    });
    expect(h.call.mock.calls.find(([name]) => name === 'browser_type')?.[1]).toMatchObject({
      text: 'homework',
      replace: true,
      target_id: 'native-target',
      tab_id: 'native-tab',
    });
    expect((await h.backend.invoke(h.request('computer_action', args))).outcome).toBe('stale');
    expect(h.call.mock.calls.filter(([name]) => name === 'browser_type')).toHaveLength(1);
  });
});
