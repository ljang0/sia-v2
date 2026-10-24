import { expect, it } from 'vitest';
import { windowHasProtectedControls } from './driver-records.js';

it.each([
  ['AXLink', 'ZipFile.setpassword(pwd)', false],
  ['AXHeading', 'ZipFile.setpassword()', false],
  ['AXTextField', 'UserPassword', true],
  ['AXTextArea', 'AccountPassword', true],
  ['AXSecureTextField', '', true],
  ['AXStaticText', 'password: [omitted]', true],
  ['AXStaticText', 'UserPassword', true],
  ['AXStaticText', 'account.user_password', true],
  ['AXStaticText', 'account.user_password: [omitted]', true],
  ['AXStaticText', 'account.user_password = [omitted]', true],
  ['AXLink', 'Reset password', true],
  ['AXTextField', 'Sign in', true],
] as const)(
  'classifies protected metadata without blocking API identifiers: %s %s',
  (role, label, protectedControl) => {
    expect(windowHasProtectedControls({ elements: [{ role, label }] })).toBe(protectedControl);
  },
);
