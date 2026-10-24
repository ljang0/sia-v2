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
  };
  const call = vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
    if (tool === 'list_windows')
      return { windows: [{ window_id: 91, pid: 42, title: 'Chrome' }] };
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
      return { status: 'ready' };
    }
    if (tool === 'get_browser_state') {
      if (!state.prepared) throw new Error('CUA refused: browser_consent_required');
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
          { ref: 'secret-input', role: 'textbox', input_type: 'password', label: 'Password' },
        ],
      };
    }
    if (tool === 'browser_navigate') {
      state.url = String(args.url);
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
  async function target() {
    const result = await backend.invoke(request('computer_list', {}));
    const data = result.data as { windows: { app_id: string; window_id: string }[] };
    return { app_id: data.windows[0]!.app_id, window_id: data.windows[0]!.window_id };
  }
  return { state, call, openUrl, backend, request, target };
}

describe('Mac background Chromium uses the dedicated Cua browser route', () => {
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
    expect(JSON.stringify(result)).not.toContain('secret-input');
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
