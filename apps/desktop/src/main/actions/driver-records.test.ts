import { expect, it } from 'vitest';
import { windowHasProtectedControls } from './driver-records.js';

it.each([
  ['AXLink', 'ZipFile.setpassword(pwd)', false],
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
    false,
  ],
  ['AXStaticText', 'Set pwd as the default password to extract encrypted files.', false],
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
