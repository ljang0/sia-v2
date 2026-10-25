import { expect, it } from 'vitest';
import { windowHasProtectedControls } from './driver-records.js';

it.each([
  ['AXLink', 'ZipFile.setpassword(pwd)', false],
  ['AXLink', 'setpassword()', false],
  ['AXTextField', 'setpassword()', true],
  ['AXHeading', 'ZipFile.setpassword()', false],
  ['AXTextField', 'UserPassword', true],
  ['AXTextArea', 'AccountPassword', true],
  ['AXSecureTextField', '', true],
  ['AXStaticText', 'password: [omitted]', true],
  ['AXStaticText', '"password": "[omitted]"', true],
  ['AXStaticText', 'UserPassword', true],
  ['AXStaticText', 'account.user_password', true],
  ['AXStaticText', 'account.user_password: [omitted]', true],
  ['AXStaticText', 'account.user_password = [omitted]', true],
  ['AXLink', 'Reset password', true],
  ['AXTextField', 'Sign in', true],
  [
    'AXStaticText',
    'pwd is the password used to decrypt encrypted ZIP files as a bytes object.',
    true,
  ],
  ['AXStaticText', 'Set pwd as the default password to extract encrypted files.', true],
  ['AXStaticText', 'Your password is [omitted]', true],
  ['AXStaticText', 'The username is student and the password is [omitted]', true],
  ['AXStaticText', 'Account password', true],
  ['AXTextField', 'Set pwd as the default password to extract encrypted files.', true],
] as const)(
  'classifies protected metadata without blocking API identifiers: %s %s',
  (role, label, protectedControl) => {
    expect(windowHasProtectedControls({ elements: [{ role, label }] })).toBe(protectedControl);
  },
);

it.each([
  { role: 'AXTextField', input_type: 'password' },
  { role: 'AXTextField', subrole: 'AXSecureTextField' },
  { role: 'AXTextField', autocomplete: 'current-password' },
])('honors every structural credential marker alongside an ordinary role: %j', (element) => {
  expect(windowHasProtectedControls({ elements: [element] })).toBe(true);
});

const inactiveSafariLoginTab = {
  role: 'AXRadioButton',
  label: 'login.cmu.edu',
  selected: false,
  actions: ['AXPress', 'Name:close tab\nTarget:0x123abc\nSelector:_closeButtonClicked:'],
};
const safari = { browserBundleId: 'com.apple.Safari' };

it('does not mistake an inactive native Safari tab title for the current page login form', () => {
  expect(windowHasProtectedControls({ elements: [inactiveSafariLoginTab] }, safari)).toBe(
    false,
  );
  for (const options of [{}, { browserBundleId: 'com.google.Chrome' }])
    expect(windowHasProtectedControls({ elements: [inactiveSafariLoginTab] }, options)).toBe(
      true,
    );
});

it.each([
  { selected: true },
  { selected: undefined },
  { selected: 'false' },
  { role: 'AXButton' },
  { actions: ['AXPress'] },
  { actions: ['close tab'] },
])('keeps active or ambiguous authentication controls blocked: %j', (change) => {
  expect(
    windowHasProtectedControls(
      { elements: [{ ...inactiveSafariLoginTab, ...change }] },
      safari,
    ),
  ).toBe(true);
});

it.each([
  { subrole: 'AXSecureTextField' },
  { label: 'password: [omitted]' },
  { label: 'API key: [omitted]' },
  { label: 'Verification code' },
])('never exempts sensitive metadata even on an inactive native tab: %j', (change) => {
  expect(
    windowHasProtectedControls(
      { elements: [{ ...inactiveSafariLoginTab, ...change }] },
      safari,
    ),
  ).toBe(true);
});

it('still blocks a current login form beside inactive tab chrome', () => {
  expect(
    windowHasProtectedControls(
      {
        elements: [
          inactiveSafariLoginTab,
          { role: 'AXTextField', input_type: 'password' },
          { role: 'AXButton', label: 'Sign in' },
        ],
      },
      safari,
    ),
  ).toBe(true);
});
