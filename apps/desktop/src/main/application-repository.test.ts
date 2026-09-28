import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const encryptionAvailable = vi.hoisted(() => vi.fn(() => false));
vi.mock('electron', () => ({ safeStorage: { isEncryptionAvailable: encryptionAvailable } }));
import { openApplicationRepository } from './application-repository.js';
import { SecureStorageUnavailableError } from './persistence.js';

afterEach(() => vi.clearAllMocks());

it('leaves existing data byte-for-byte intact and creates no disposable session when Keychain is locked', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sia-keychain-denied-'));
  const path = join(directory, 'sia.sqlite');
  try {
    const initial = openApplicationRepository(path, true);
    initial.repository.put('desktop', 'state', { agents: ['saved'] });
    initial.repository.close();
    const before = readFileSync(path);
    expect(() => openApplicationRepository(path, false)).toThrow(SecureStorageUnavailableError);
    expect(readFileSync(path)).toEqual(before);
    expect(readdirSync(directory)).toEqual(['sia.sqlite']);
    const reopened = openApplicationRepository(path, true);
    expect(reopened.repository.get('desktop', 'state')).toEqual({ agents: ['saved'] });
    reopened.repository.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('does not create a database on first launch when Keychain is unavailable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sia-keychain-first-run-'));
  try {
    const path = join(directory, 'sia.sqlite');
    expect(() => openApplicationRepository(path, false)).toThrow(SecureStorageUnavailableError);
    expect(existsSync(path)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
