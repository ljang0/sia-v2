import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  openRecoverableRecordRepository,
  type PayloadCipher,
  PlaintextTestCipher,
  SqliteRecordRepository,
} from './persistence.js';

describe('SqliteRecordRepository', () => {
  it('loads legacy records in timestamp order without sorting encrypted payloads to disk', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-persistence-index-'));
    const path = join(directory, 'sia.sqlite');
    const cipher = prefixedCipher('existing-key');
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE records (
      scope TEXT NOT NULL, id TEXT NOT NULL, payload BLOB NOT NULL,
      updated_at INTEGER NOT NULL, PRIMARY KEY (scope, id)
    ) STRICT;`);
    const insert = legacy.prepare('INSERT INTO records VALUES (?, ?, ?, ?)');
    insert.run('research', 'z', cipher.encrypt(JSON.stringify({ id: 'z' })), 1);
    insert.run('research', 'b', cipher.encrypt(JSON.stringify({ id: 'b' })), 2);
    insert.run('research', 'a', cipher.encrypt(JSON.stringify({ id: 'a' })), 2);
    insert.run('agents', 'other', cipher.encrypt(JSON.stringify({ id: 'other' })), 0);
    const before = legacy.prepare('SELECT * FROM records ORDER BY scope, id').all();
    legacy.close();

    try {
      const opened = openRecoverableRecordRepository(path, cipher);
      try {
        expect(opened.archivedPath).toBeUndefined();
        expect(opened.repository.list('research')).toEqual([
          { id: 'z' },
          { id: 'a' },
          { id: 'b' },
        ]);
        const inspection = new DatabaseSync(path, { readOnly: true });
        try {
          expect(inspection.prepare('SELECT * FROM records ORDER BY scope, id').all()).toEqual(
            before,
          );
          const plan = inspection
            .prepare(
              'EXPLAIN QUERY PLAN SELECT payload FROM records WHERE scope = ? ORDER BY updated_at ASC, id ASC',
            )
            .all('research');
          expect(plan.map((row) => row.detail).join('\n')).not.toContain('TEMP B-TREE');
        } finally {
          inspection.close();
        }
      } finally {
        opened.repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

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
