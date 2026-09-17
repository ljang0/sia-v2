import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { safeStorage } from 'electron';

export interface PayloadCipher {
  encrypt(value: string): Uint8Array;
  decrypt(value: Uint8Array): string;
}

export interface RecordRepository {
  get<T>(scope: string, id: string): T | undefined;
  list<T>(scope: string): T[];
  put<T>(scope: string, id: string, value: T): void;
  remove(scope: string, id: string): void;
  clearAll(): void;
  close(): void;
}

class UnreadableEncryptedPayloadError extends Error {
  constructor(cause: unknown) {
    super('The encrypted local records cannot be read with the current key.', { cause });
  }
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('macOS Keychain encryption is unavailable; saved data has not been opened.');
  }
}

export class ElectronPayloadCipher implements PayloadCipher {
  constructor() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new SecureStorageUnavailableError();
    }
  }

  encrypt(value: string): Uint8Array {
    return safeStorage.encryptString(value);
  }

  decrypt(value: Uint8Array): string {
    return safeStorage.decryptString(Buffer.from(value));
  }
}

export class PlaintextTestCipher implements PayloadCipher {
  encrypt(value: string): Uint8Array {
    return Buffer.from(value, 'utf8');
  }

  decrypt(value: Uint8Array): string {
    return Buffer.from(value).toString('utf8');
  }
}

/** Encrypts isolated in-memory test stores without using the host Keychain. */
export class EphemeralPayloadCipher implements PayloadCipher {
  readonly #key = randomBytes(32);

  encrypt(value: string): Uint8Array {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, initializationVector);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([initializationVector, cipher.getAuthTag(), encrypted]);
  }

  decrypt(value: Uint8Array): string {
    const payload = Buffer.from(value);
    if (payload.length < 28) throw new Error('The encrypted record is incomplete.');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString(
      'utf8',
    );
  }
}

interface StoredRow {
  payload: Uint8Array;
}

export class SqliteRecordRepository implements RecordRepository {
  readonly #database: DatabaseSync;
  readonly #cipher: PayloadCipher;

  constructor(path: string, cipher: PayloadCipher) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#database = new DatabaseSync(path);
    this.#cipher = cipher;
    this.#database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA secure_delete = ON;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS records (
        scope TEXT NOT NULL,
        id TEXT NOT NULL,
        payload BLOB NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope, id)
      ) STRICT;
    `);
  }

  get<T>(scope: string, id: string): T | undefined {
    const row = this.#database
      .prepare('SELECT payload FROM records WHERE scope = ? AND id = ?')
      .get(scope, id) as StoredRow | undefined;
    return row ? this.#decode<T>(row.payload) : undefined;
  }

  list<T>(scope: string): T[] {
    const rows = this.#database
      .prepare('SELECT payload FROM records WHERE scope = ? ORDER BY updated_at ASC')
      .all(scope) as unknown as StoredRow[];
    return rows.map((row) => this.#decode<T>(row.payload));
  }

  put<T>(scope: string, id: string, value: T): void {
    const payload = this.#cipher.encrypt(JSON.stringify(value));
    this.#database
      .prepare(
        `INSERT INTO records(scope, id, payload, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(scope, id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .run(scope, id, payload, Date.now());
  }

  remove(scope: string, id: string): void {
    this.#database.prepare('DELETE FROM records WHERE scope = ? AND id = ?').run(scope, id);
  }

  clearAll(): void {
    this.#database.exec('DELETE FROM records; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  }

  close(): void {
    this.#database.close();
  }

  /** Eagerly checks every row so an old Keychain failure is handled before app startup. */
  assertReadable(): void {
    const rows = this.#database
      .prepare('SELECT payload FROM records')
      .all() as unknown as StoredRow[];
    for (const row of rows) {
      try {
        this.#decode(row.payload);
      } catch (error) {
        throw new UnreadableEncryptedPayloadError(error);
      }
    }
  }

  #decode<T>(payload: Uint8Array): T {
    const raw = this.#cipher.decrypt(payload);
    return JSON.parse(raw) as T;
  }
}

export function openRecoverableRecordRepository(
  path: string,
  cipher: PayloadCipher,
  timestamp = Date.now(),
): { repository: SqliteRecordRepository; archivedPath?: string } {
  let repository: SqliteRecordRepository | undefined;
  try {
    repository = new SqliteRecordRepository(path, cipher);
    repository.assertReadable();
    return { repository };
  } catch (error) {
    try {
      repository?.close();
    } catch {
      // Continue with preservation; the original startup error remains the cause.
    }
    if (
      !(error instanceof UnreadableEncryptedPayloadError) ||
      path === ':memory:' ||
      !existsSync(path)
    ) {
      throw error;
    }

    const archivedPath = `${path}.unreadable-${timestamp}`;
    archiveSqliteFiles(path, archivedPath);
    return {
      repository: new SqliteRecordRepository(path, cipher),
      archivedPath,
    };
  }
}

function archiveSqliteFiles(path: string, archivedPath: string): void {
  renameSync(path, archivedPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${path}${suffix}`;
    if (existsSync(sidecar)) renameSync(sidecar, `${archivedPath}${suffix}`);
  }
}
