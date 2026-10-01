import { basename } from 'node:path';
import {
  ElectronPayloadCipher,
  openRecoverableRecordRepository,
  PlaintextTestCipher,
  SqliteRecordRepository,
} from './persistence.js';

export function openApplicationRepository(
  databasePath: string,
  plaintextTestStorage: boolean,
): {
  repository: SqliteRecordRepository;
  startupNotice?: { title: string; detail: string };
} {
  if (plaintextTestStorage) {
    return { repository: new SqliteRecordRepository(databasePath, new PlaintextTestCipher()) };
  }
  // Check Keychain before touching the database. Denial must not produce a
  // disposable workspace or archive data that might still be recoverable.
  const cipher = new ElectronPayloadCipher();
  const opened = openRecoverableRecordRepository(databasePath, cipher);
  return {
    repository: opened.repository,
    ...(opened.archivedPath
      ? {
          startupNotice: {
            title: 'Sia recovered from unreadable local data',
            detail: `The previous encrypted database could not be opened, so Sia preserved it as ${basename(opened.archivedPath)} and started with a fresh local store.`,
          },
        }
      : {}),
  };
}
