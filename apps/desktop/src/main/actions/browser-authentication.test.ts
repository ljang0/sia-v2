import { expect, it } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { fakeCua, request } from './test-support.js';
import { browserHasAuthenticationControls } from './driver-records.js';
import { browserUrlIsAuthentication, browserUrlLooksSensitive } from './browser-urls.js';

it.each([
  'https://login.cmu.edu/idp/profile/SAML2/Redirect/SSO',
  'https://sso.example.edu/',
  'https://student.example.edu/idp/profile/SAML2/Redirect/SSO',
  'https://student.example.edu/cas/login',
  'https://accounts.google.com/signin',
])('protects an observed institutional authentication URL: %s', (url) => {
  expect(browserUrlIsAuthentication(url)).toBe(true);
  expect(browserUrlLooksSensitive(url)).toBe(true);
});

it.each([
  'https://canvas.cmu.edu/courses',
  'https://cmu.joinhandshake.com/stu/events',
  'https://docs.python.org/3/library/zipfile.html',
])('preserves ordinary app and public pages: %s', (url) => {
  expect(browserUrlIsAuthentication(url)).toBe(false);
  expect(browserUrlLooksSensitive(url)).toBe(false);
});

it('does not mistake a public sign-in link and search box for an authentication form', () => {
  expect(
    browserHasAuthenticationControls({
      outline: '- heading "Public events"',
      elements: [
        { ref: 'search', role: 'textbox', label: 'Search' },
        { ref: 'signin', role: 'button', label: 'Sign in' },
      ],
    }),
  ).toBe(false);
});

it.each(['institutional redirect', 'unlabelled semantic password', 'typed secure field'])(
  'returns no form content, screenshots or input capability for %s',
  async (kind) => {
    let protectedPage = false;
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected input ${tool}`);
      return {
        value: {
          target_id: 'target',
          tab_id: 'tab',
          url:
            protectedPage && kind === 'institutional redirect'
              ? 'https://login.cmu.edu/idp/profile/SAML2/Redirect/SSO'
              : 'https://portal.example.edu/student',
          outline: protectedPage
            ? '- textbox "AndrewID"\n- statictext "Password"\n- textbox\n- button "Login"'
            : '- button "Courses"',
          refs: protectedPage
            ? kind === 'typed secure field'
              ? [
                  {
                    ref: 'password',
                    role: 'textbox',
                    input_type: 'password',
                    value: 'fixture-sensitive-value',
                  },
                ]
              : [
                  {
                    ref: 'andrew',
                    role: 'textbox',
                    label: 'AndrewID',
                    value: 'fixture-sensitive-value',
                  },
                  { ref: 'password', role: 'textbox' },
                  { ref: 'login', role: 'button', label: 'Login' },
                ]
            : [{ ref: 'courses', role: 'button', label: 'Courses' }],
        },
        images: [{ mimeType: 'image/png', dataBase64: 'fixture-pixels' }],
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target',
      tab_id: 'tab',
      url: 'https://portal.example.edu/student',
    });
    const before = await backend.invoke(request('browser_snapshot', { tab_id: 'tab' }));
    const snapshot = before.data as {
      snapshot_id: string;
      elements: { element_ref: string }[];
    };
    expect(before.outcome).toBe('verified');
    protectedPage = true;
    const blocked = await backend.invoke(request('browser_snapshot', { tab_id: 'tab' }));
    expect(blocked.outcome).toBe('refused');
    expect(blocked.data).toMatchObject({
      observed_authentication: true,
      blocker_code: 'authentication_surface',
    });
    expect(blocked.images).toBeUndefined();
    expect(blocked.data).not.toHaveProperty('snapshot_id');
    expect(blocked.data).not.toHaveProperty('elements');
    expect(JSON.stringify(blocked)).not.toContain('fixture-sensitive-value');
    expect(JSON.stringify(blocked)).not.toContain('fixture-pixels');
    expect(
      (
        await backend.invoke(
          request('browser_action', {
            tab_id: 'tab',
            snapshot_id: snapshot.snapshot_id,
            element_ref: snapshot.elements[0]!.element_ref,
            action: 'click',
          }),
        )
      ).outcome,
    ).toBe('stale');
    expect(cua.call.mock.calls.every(([tool]) => tool === 'get_browser_state')).toBe(true);
  },
);
