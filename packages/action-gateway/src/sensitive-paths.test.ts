import { describe, expect, it } from 'vitest';
import { isSensitiveLocalPath } from './sensitive-paths.js';

describe('isSensitiveLocalPath', () => {
  it.each([
    '/Users/me/.ssh/id_ed25519',
    '/Users/me/.aws/credentials',
    '/Users/me/.gnupg/private-keys-v1.d/key',
    '/Users/me/.codex/auth.json',
    '/Users/me/.kube/config',
    '/Users/me/.config/gh/hosts.yml',
    '/Users/me/.docker/config.json',
    '/Users/me/.netrc',
    '/Users/me/.npmrc',
    '/Users/me/project/.env.local',
    '/Users/me/Downloads/id_rsa.pub',
    '/Users/me/Library/Keychains/login.keychain-db',
    '/Users/me/Library/Cookies/Cookies.binarycookies',
    '/Users/me/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies',
    '/Users/me/Library/Application Support/Google/Chrome/Default/Cookies',
    '/Users/me/Library/Application Support/Google/Chrome/Profile 1/Login Data',
    '/Users/me/Library/Application Support/Google/Chrome/Default/Login Data For Account',
    '/Users/me/Library/Application Support/Firefox/Profiles/abc.default/cookies.sqlite',
    '/Users/me/Library/Application Support/Firefox/Profiles/abc.default/logins.json',
    '/Users/me/Library/Application Support/Firefox/Profiles/abc.default/key4.db',
    '/Users/me/LIBRARY/keychains/x',
    '/Users/me/Documents/../.ssh/config',
  ])('refuses %s', (path) => {
    expect(isSensitiveLocalPath(path)).toBe(true);
  });

  it.each([
    '/Users/me/Documents/report.pdf',
    '/Users/me/Documents/cookies-recipe.pdf',
    '/Users/me/Documents/environment.txt',
    '/Users/me/Documents/ssh-notes.md',
    '/Users/me/Library/Application Support/Sia/export.json',
  ])('allows %s', (path) => {
    expect(isSensitiveLocalPath(path)).toBe(false);
  });
});
