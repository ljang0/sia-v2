import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { LocalConnectionId } from '../../shared/bridge.js';
import type { PayloadCipher } from '../storage/persistence.js';

/** OAuth material for one app signed in from this Mac. Never leaves the main process. */
export interface LocalCredential {
  app: LocalConnectionId;
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. Absent when the provider issues non-expiring tokens. */
  expiresAt?: number;
  /** The public OAuth client that obtained the grant; needed to refresh it. */
  clientId: string;
  account: string;
}

const CONNECTION_ID = /^lc_(outlook|notion|github)_[0-9a-f-]{36}$/;
const MAX_CREDENTIAL_BYTES = 64 * 1024;

export function localConnectorDirectory(appData: string): string {
  return join(appData, 'Sia', 'connectors');
}

export function newLocalConnectionId(app: LocalConnectionId): string {
  return `lc_${app}_${randomUUID()}`;
}

export function localConnectionApp(connectionId: string): LocalConnectionId | undefined {
  return CONNECTION_ID.exec(connectionId)?.[1] as LocalConnectionId | undefined;
}

/**
 * One file per connection, encrypted with Sia's Keychain-held key (Electron safeStorage).
 * Kept outside the synced app state so tokens never reach a snapshot, export, or the renderer.
 */
export class LocalCredentialStore {
  constructor(
    readonly directory: string,
    private readonly cipher: PayloadCipher,
  ) {}

  read(connectionId: string): LocalCredential | undefined {
    const path = this.#path(connectionId);
    if (!existsSync(path)) return undefined;
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > MAX_CREDENTIAL_BYTES ||
        (stat.mode & 0o077) !== 0
      ) {
        throw new Error('The saved connection is not stored safely. Connect the app again.');
      }
      const value = JSON.parse(this.cipher.decrypt(readFileSync(fd))) as LocalCredential;
      if (value.app !== localConnectionApp(connectionId) || !value.accessToken) {
        throw new Error('The saved connection does not match this app. Connect it again.');
      }
      return value;
    } finally {
      closeSync(fd);
    }
  }

  save(connectionId: string, credential: LocalCredential): void {
    const path = this.#path(connectionId);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, this.cipher.encrypt(JSON.stringify(credential)), {
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  remove(connectionId: string): void {
    rmSync(this.#path(connectionId), { force: true });
  }

  #path(connectionId: string): string {
    if (!CONNECTION_ID.test(connectionId)) throw new Error('Unknown local connection.');
    return join(this.directory, `${connectionId}.enc`);
  }
}
