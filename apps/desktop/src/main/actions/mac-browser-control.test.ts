import { describe, expect, it, vi } from 'vitest';
import {
  LocalLeaseCoordinator,
  type TurnLease,
  getActionToolDescriptor,
  parseActionArguments,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';

function harness() {
  const state = {
    prepared: false,
    preparationError: '',
    extraTabs: [] as Record<string, unknown>[],
    linkHref: '',
    linkStateUrl: '',
    url: 'chrome://whats-new',
    focusChanged: false,
    unavailable: false,
    captureUrl: '',
    inputError: '',
    inputRefusal: false,
    afterClickUrl: '',
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
      if (state.preparationError) throw new Error(state.preparationError);
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
          tabs: [
            { tab_id: 'native-tab', url: state.url, title: 'Course page', active: true },
            ...state.extraTabs,
          ],
        };
      if (args.snapshot_format === 'dom_refs_v1')
        return {
          target_id: 'native-target',
          tab_id: 'native-tab',
          url: state.linkStateUrl || state.url,
          refs: [{ ref: 'dom-link', node: 'a', label: state.linkHref }],
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
      if (state.afterClickUrl) state.url = state.afterClickUrl;
      if (state.inputRefusal) return { error_code: 'browser_input_trust_unavailable' };
      if (state.inputError) throw new Error(state.inputError);
      return state.focusChanged ? { background_focus_changed: true } : { effect: 'confirmed' };
    }
    throw new Error(`Unexpected native route ${tool}`);
  });
  const openUrl = vi.fn();
  const onBrowserSessionEnded = vi.fn();
  const backend = new DesktopActionBackend({
    cua: { call },
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => ({ status: 'protected' }),
    openUrl,
    onBrowserSessionEnded,
  });
  const request = (
    name: ValidatedActionInvocation['name'],
    args: Record<string, unknown>,
    turnId = 'turn',
    lease?: TurnLease,
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
      ...(lease ? { lease, threadId: lease.threadId } : {}),
    },
  });
  async function target(turnId = 'turn', lease?: TurnLease) {
    const result = await backend.invoke(request('computer_list', {}, turnId, lease));
    const data = result.data as { windows: { app_id: string; window_id: string }[] };
    return { app_id: data.windows[0]!.app_id, window_id: data.windows[0]!.window_id };
  }
  return { state, call, openUrl, onBrowserSessionEnded, backend, request, target };
}

describe('Mac background Chromium uses the dedicated Cua browser route', () => {
  it('propagates connection changes into isolated turn sessions and revokes their input refs', async () => {
    const h = harness();
    const leases = new LocalLeaseCoordinator();
    const a = await leases.startTurn({ turnId: 'a', threadId: 'a' });
    const b = await leases.startTurn({ turnId: 'b', threadId: 'b' });
    try {
      const first = await h.target('a', a);
      const second = await h.target('b', b);
      h.state.prepared = true;
      h.state.requireSessionGrant = true;
      h.state.url = 'https://public.example/guide';
      h.state.grantedSessions.add('approved');
      h.backend.acceptBrowserState({}, 'approved', { pid: 42, windowId: 91 });
      expect(
        (await h.backend.invoke(h.request('computer_snapshot', first, 'a', a))).outcome,
      ).toBe('verified');
      a.release();
      const read = await h.backend.invoke(h.request('computer_snapshot', second, 'b', b));
      expect(read.outcome).toBe('verified');
      const refs = read.data as { snapshot_id: string; elements: { element_ref: string }[] };
      h.backend.resetBrowserCapabilities();
      h.call.mockClear();
      const action = await h.backend.invoke(
        h.request(
          'computer_action',
          {
            ...second,
            snapshot_id: refs.snapshot_id,
            element_ref: refs.elements[0]!.element_ref,
            action: 'click',
          },
          'b',
          b,
        ),
      );
      expect(action.outcome).toBe('stale');
      expect(h.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
    } finally {
      a.release();
      b.release();
    }
  });

  it('reuses an explicitly connected exact window across turns without repeating setup', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.requireSessionGrant = true;
    h.state.unavailable = true;
    h.state.url = 'https://public.example/guide';
    h.state.grantedSessions.add('approved');
    h.backend.acceptBrowserState({}, 'approved', { pid: 42, windowId: 91 });
    for (const turn of ['first', 'second']) {
      const target = await h.target(turn);
      const result = await h.backend.invoke(h.request('computer_snapshot', target, turn));
      expect(result.outcome).toBe('verified');
    }
    expect(
      h.call.mock.calls
        .filter(([tool]) => tool === 'get_browser_state')
        .every(([, args]) => args.session === 'approved'),
    ).toBe(true);
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
  });

  it.each([
    { pid: 43, windowId: 91 },
    { pid: 42, windowId: 92 },
  ])(
    'never uses an explicit connection for a different process or window: %j',
    async (window) => {
      const h = harness();
      h.state.prepared = true;
      h.state.requireSessionGrant = true;
      h.state.grantedSessions.add('approved');
      h.backend.acceptBrowserState({}, 'approved', window);
      const result = await h.backend.invoke(h.request('computer_snapshot', await h.target()));
      expect(result.outcome).not.toBe('verified');
      expect(h.call.mock.calls.some(([, args]) => args.session === 'approved')).toBe(false);
    },
  );

  it('revokes Mac input and the reusable session when the connection is detached', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.requireSessionGrant = true;
    h.state.url = 'https://public.example/guide';
    h.state.grantedSessions.add('approved');
    h.backend.acceptBrowserState({}, 'approved', { pid: 42, windowId: 91 });
    const target = await h.target();
    const before = await h.backend.invoke(h.request('computer_snapshot', target));
    const refs = before.data as { snapshot_id: string; elements: { element_ref: string }[] };
    h.backend.resetBrowserCapabilities();
    h.call.mockClear();
    const input = await h.backend.invoke(
      h.request('computer_action', {
        ...target,
        snapshot_id: refs.snapshot_id,
        element_ref: refs.elements[0]!.element_ref,
        action: 'click',
      }),
    );
    expect(input.outcome).toBe('stale');
    const after = await h.backend.invoke(h.request('computer_snapshot', target));
    expect(after.outcome).not.toBe('verified');
    expect(h.call.mock.calls.some(([, args]) => args.session === 'approved')).toBe(false);
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
  });

  it('expires the approved host connection without automatically creating another session', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.expiredSessions.add('approved');
    h.backend.acceptBrowserState({}, 'approved', { pid: 42, windowId: 91 });
    const result = await h.backend.invoke(
      h.request('computer_open_url', {
        ...(await h.target()),
        url: 'https://public.example/guide',
        prepare_only: true,
      }),
    );
    expect(result.outcome).toBe('stale');
    expect(h.onBrowserSessionEnded).toHaveBeenCalledExactlyOnceWith('approved');
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
  });

  it('discards a late read after a new connection replaces its session', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://public.example/guide';
    h.backend.acceptBrowserState({}, 'old', { pid: 42, windowId: 91 });
    const original = h.call.getMockImplementation()!;
    h.call.mockImplementation(async (tool, args) => {
      if (tool === 'get_browser_state' && args.session === 'old')
        h.backend.acceptBrowserState({}, 'new', { pid: 42, windowId: 91 });
      return original(tool, args);
    });
    const target = await h.target();
    expect((await h.backend.invoke(h.request('computer_snapshot', target))).outcome).toBe(
      'stale',
    );
    expect((await h.backend.invoke(h.request('computer_snapshot', target))).outcome).toBe(
      'verified',
    );
    expect(h.onBrowserSessionEnded).not.toHaveBeenCalled();
  });

  it('does not revoke a replacement connection when an old page read expires late', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://public.example/guide';
    h.backend.acceptBrowserState({}, 'old', { pid: 42, windowId: 91 });
    const original = h.call.getMockImplementation()!;
    h.call.mockImplementation(async (tool, args) => {
      if (tool === 'get_browser_state' && args.session === 'old' && args.tab_id) {
        h.backend.acceptBrowserState({}, 'new', { pid: 42, windowId: 91 });
        throw new Error('CUA refused: session_ended');
      }
      return original(tool, args);
    });
    const target = await h.target();
    const prior = await h.backend.invoke(h.request('computer_snapshot', target));
    expect(prior.outcome).not.toBe('verified');
    expect(prior.data).not.toHaveProperty('snapshot_id');
    expect(h.onBrowserSessionEnded).not.toHaveBeenCalled();
    expect((await h.backend.invoke(h.request('computer_snapshot', target))).outcome).toBe(
      'verified',
    );
  });

  it('restores access and discovers inactive tabs without navigation or page capture', async () => {
    const h = harness();
    h.state.url = 'https://public.example/selected';
    h.state.extraTabs = [
      {
        tab_id: 'inactive',
        url: 'https://public.example/needed',
        title: 'Needed',
        active: false,
      },
      { tab_id: 'private', url: 'https://public.example/private', private: true },
      { tab_id: 'login', url: 'https://public.example/login' },
    ];
    const target = await h.target();
    const args = { ...target, url: 'https://public.example/needed', prepare_only: true };
    expect(parseActionArguments('computer_open_url', args)).toMatchObject({
      prepare_only: true,
    });
    const recovered = await h.backend.invoke(h.request('computer_open_url', args));
    expect(recovered.data).toMatchObject({
      tabs: [
        { source_url: 'https://public.example/selected', active: true },
        { source_url: 'https://public.example/needed', active: false },
      ],
    });
    expect(recovered.data).not.toHaveProperty('snapshot_id');
    expect(h.state.url).toBe('https://public.example/selected');
    expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_prepare')).toHaveLength(1);
    expect(
      h.call.mock.calls.some(
        ([tool, args]) =>
          tool === 'browser_navigate' || (tool === 'get_browser_state' && args.tab_id),
      ),
    ).toBe(false);
    const listed = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, tabs_only: true }),
    );
    expect(listed.data).toMatchObject({
      tabs: [
        { source_url: 'https://public.example/selected' },
        { source_url: 'https://public.example/needed' },
      ],
    });
    expect(listed.data).not.toHaveProperty('visible_text');
  });

  it('refreshes changed tab lists and revokes input from the earlier binding', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://public.example/guide';
    const target = await h.target();
    const initial = await h.backend.invoke(h.request('computer_snapshot', target));
    const prior = initial.data as { snapshot_id: string; elements: { element_ref: string }[] };
    h.state.extraTabs = [
      { tab_id: 'new-tab', url: 'https://public.example/new', active: false },
    ];
    const added = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, tabs_only: true }),
    );
    expect((added.data as { tabs: unknown[] }).tabs).toHaveLength(2);
    const staleInput = await h.backend.invoke(
      h.request('computer_action', {
        ...target,
        snapshot_id: prior.snapshot_id,
        element_ref: prior.elements[0]!.element_ref,
        action: 'click',
      }),
    );
    expect(staleInput.outcome).toBe('stale');
    h.state.extraTabs = [];
    const removed = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, tabs_only: true }),
    );
    expect((removed.data as { tabs: unknown[] }).tabs).toHaveLength(1);
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
  });

  it('does not prepare a browser as a side effect of read-only tab discovery', async () => {
    const h = harness();
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, tabs_only: true }),
    );
    expect(result.data).toMatchObject({
      blocker_code: 'background_browser_unavailable',
      browser_connection_required: true,
    });
    expect(h.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
  });

  it.each([
    [
      'href=https://public.example/assignments?week=2',
      'https://public.example/assignments?week=2',
    ],
    ['href=https://iana.org/help/example-domains', 'https://iana.org/help/example-domains'],
    ['href=/assignments', undefined],
    ['href=https://public.example/login', undefined],
    ['href=https://public.example/download?token=private-value', undefined],
    ['href=https://user:password@public.example/', undefined],
    ['href=javascript:alert(1)', undefined],
    ['aria-label=href=https://fake.example/ href=https://real.example/', undefined],
  ])('returns only unambiguous safe DOM link destinations: %s', async (label, expected) => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://public.example/guide';
    h.state.linkHref = label;
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, read_links: true }),
    );
    expect(result.outcome).toBe('verified');
    expect(result.data).toMatchObject({
      link_destinations: expected ? [expected] : [],
      links_complete: false,
    });
    expect(JSON.stringify(result)).not.toContain('dom-link');
    expect(JSON.stringify(result)).not.toContain('private-value');
    expect(
      h.call.mock.calls
        .filter(([tool, args]) => tool === 'get_browser_state' && args.tab_id)
        .map(([, args]) => args.snapshot_format),
    ).toEqual(['dom_refs_v1', 'semantic_v2']);
  });

  it('withholds links and input refs if navigation occurs between the two observations', async () => {
    const h = harness();
    h.state.prepared = true;
    h.state.url = 'https://public.example/guide';
    h.state.linkStateUrl = 'https://public.example/previous';
    h.state.linkHref = 'href=https://public.example/destination';
    const target = await h.target();
    const result = await h.backend.invoke(
      h.request('computer_snapshot', { ...target, read_links: true }),
    );
    expect(result.outcome).toBe('stale');
    expect(result.data).not.toHaveProperty('snapshot_id');
    expect(result.data).not.toHaveProperty('link_destinations');
    expect(result.data).not.toHaveProperty('elements');
  });

  it.each(['failed capture', 'refused capture', 'different requested page'])(
    'revokes earlier controls after a refresh with %s, until a fresh read succeeds',
    async (scenario) => {
      const h = harness();
      h.state.prepared = true;
      h.state.url = 'https://public.example/guide';
      const target = await h.target();
      const initial = await h.backend.invoke(h.request('computer_snapshot', target));
      const data = initial.data as {
        snapshot_id: string;
        elements: { element_ref: string }[];
      };
      if (scenario === 'failed capture') h.state.observationError = 'Capture unavailable';
      if (scenario === 'refused capture') h.state.observationRefused = true;
      const refreshed = await h.backend.invoke(
        h.request('computer_snapshot', {
          ...target,
          ...(scenario === 'different requested page'
            ? { expected_url: 'https://public.example/other' }
            : {}),
        }),
      );
      expect(refreshed.outcome).not.toBe('verified');
      h.state.observationError = '';
      h.state.observationRefused = false;
      const click = (snapshot: typeof data) =>
        h.backend.invoke(
          h.request('computer_action', {
            ...target,
            snapshot_id: snapshot.snapshot_id,
            element_ref: snapshot.elements[0]!.element_ref,
            action: 'click',
          }),
        );
      expect((await click(data)).outcome).toBe('stale');
      expect(h.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(false);
      const fresh = await h.backend.invoke(h.request('computer_snapshot', target));
      expect(fresh.outcome).toBe('verified');
      await click(fresh.data as typeof data);
      expect(h.call.mock.calls.filter(([tool]) => tool === 'browser_click')).toHaveLength(1);
    },
  );

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

  it.each(['thrown', 'returned'])(
    'treats %s browser trust failure as uncertain without replaying delivered input',
    async (kind) => {
      const h = harness();
      h.state.prepared = true;
      h.state.url = 'https://campus.example/courses';
      const target = await h.target();
      const observed = await h.backend.invoke(h.request('computer_snapshot', target));
      const data = observed.data as {
        snapshot_id: string;
        elements: { element_ref: string }[];
      };
      h.state.inputError =
        kind === 'thrown' ? 'CUA refused: browser_input_trust_unavailable' : '';
      h.state.inputRefusal = kind === 'returned';
      h.state.afterClickUrl = 'https://campus.example/assignments';
      const result = await h.backend.invoke(
        h.request('computer_action', {
          ...target,
          snapshot_id: data.snapshot_id,
          element_ref: data.elements[0]!.element_ref,
          action: 'click',
        }),
      );
      expect(result.outcome).toBe('accepted_unverified');
      expect(result.summary).toContain('do not replay');
      expect(result.data).toHaveProperty('input_delivery_uncertain', true);
      const clicks = h.call.mock.calls.filter(([name]) => name === 'browser_click');
      expect(clicks).toHaveLength(1);
      expect(clicks[0]![1]).toMatchObject({
        input_route: 'trusted',
        delivery_mode: 'background',
      });
      expect(JSON.stringify(h.call.mock.calls)).not.toContain('dom_event');
      const reread = await h.backend.invoke(
        h.request('computer_snapshot', {
          ...target,
          tab_id: (observed.data as { tab_id: string }).tab_id,
          expected_url: h.state.afterClickUrl,
        }),
      );
      expect(reread.outcome).toBe('verified');
      expect(h.state.url).toBe(h.state.afterClickUrl);
      const replay = await h.backend.invoke(
        h.request('computer_action', {
          ...target,
          snapshot_id: data.snapshot_id,
          element_ref: data.elements[0]!.element_ref,
          action: 'click',
        }),
      );
      expect(replay.outcome).toBe('stale');
      expect(h.call.mock.calls.filter(([name]) => name === 'browser_click')).toHaveLength(1);
    },
  );

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

  it.each([
    ['browser_requires_setup', true],
    ['background_unavailable', true],
    ['protected_window', false],
    ['permission_denied', false],
  ])(
    'keeps preparation refusal %s actionable without misclassifying protection',
    async (code, recovery) => {
      const h = harness();
      h.state.preparationError = `CUA refused: ${code}`;
      const target = await h.target();
      const result = await h.backend.invoke(
        h.request('computer_open_url', {
          ...target,
          url: 'https://public.example/',
          prepare_only: true,
        }),
      );
      expect(
        Boolean(
          (result.data as Record<string, unknown> | undefined)?.browser_connection_required,
        ),
      ).toBe(recovery);
      expect(result.reason).toContain(code);
      expect(h.openUrl).not.toHaveBeenCalled();
    },
  );

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
