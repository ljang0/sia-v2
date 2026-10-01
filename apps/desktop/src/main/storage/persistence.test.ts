import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  openRecoverableRecordRepository,
  type PayloadCipher,
  PlaintextTestCipher,
  SqliteRecordRepository,
} from './persistence.js';

describe('SqliteRecordRepository', () => {
  it('round-trips, lists, removes, and securely clears records', () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('agents', 'a', { id: 'a', secret: 'not plaintext in production' });
    repository.put('agents', 'b', { id: 'b' });

    expect(repository.get<{ id: string }>('agents', 'a')?.id).toBe('a');
    expect(repository.list<{ id: string }>('agents').map(({ id }) => id)).toEqual(['a', 'b']);

    repository.remove('agents', 'a');
    expect(repository.get('agents', 'a')).toBeUndefined();

    repository.clearAll();
    expect(repository.list('agents')).toEqual([]);
    repository.close();
  });

  it('preserves an undecryptable database and starts with a fresh readable store', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-persistence-'));
    const path = join(directory, 'sia.sqlite');
    const originalCipher = prefixedCipher('old');
    const replacementCipher = prefixedCipher('new');
    const original = new SqliteRecordRepository(path, originalCipher);
    original.put('desktop', 'state', { agents: ['saved'] });
    original.close();

    const opened = openRecoverableRecordRepository(path, replacementCipher, 1234);

    expect(opened.archivedPath).toBe(`${path}.unreadable-1234`);
    expect(existsSync(`${path}.unreadable-1234`)).toBe(true);
    expect(opened.repository.get('desktop', 'state')).toBeUndefined();
    opened.repository.put('desktop', 'state', { agents: [] });
    expect(opened.repository.get('desktop', 'state')).toEqual({ agents: [] });
    opened.repository.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('does not rename a database when opening fails before encrypted records are read', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-persistence-open-'));
    const path = join(directory, 'sia.sqlite');
    writeFileSync(path, 'not a sqlite database');

    expect(() =>
      openRecoverableRecordRepository(path, new PlaintextTestCipher(), 5678),
    ).toThrow();
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.unreadable-5678`)).toBe(false);
    rmSync(directory, { recursive: true, force: true });
  });
});

function prefixedCipher(prefix: string): PayloadCipher {
  return {
    encrypt: (value) => Buffer.from(`${prefix}:${value}`, 'utf8'),
    decrypt: (value) => {
      const raw = Buffer.from(value).toString('utf8');
      if (!raw.startsWith(`${prefix}:`)) throw new Error('Keychain key changed.');
      return raw.slice(prefix.length + 1);
    },
  };
}
