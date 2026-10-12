import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { decodeAttributedBody } from './attributed-message.js';

const execFileAsync = promisify(execFile);

/** Seconds between the Unix epoch and Apple's 2001-01-01 reference date. */
const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;

export interface MessageRow {
  chatId: string;
  chatName: string;
  sender: string;
  fromMe: boolean;
  text: string;
  timestamp: string;
}

export type MessagesStatus = 'ready' | 'needs_full_disk_access' | 'unavailable';

/** One new one-to-one iMessage row, before trust filtering by the relay. */
export interface InboundMessage {
  rowId: number;
  handle: string;
  chatIdentifier: string;
  fromMe: boolean;
  text: string;
  /** Absolute paths of photos and files sent with the message (Messages' own copies). */
  attachments: string[];
}

export interface MessagesServiceOptions {
  readonly databasePath?: string;
  readonly platform?: NodeJS.Platform;
  readonly runOsascript?: (script: string, argv: readonly string[]) => Promise<void>;
}

/**
 * Local Apple Messages integration. Reads recent conversation rows directly from the local
 * chat.db (requires the person to grant Sia Full Disk Access; nothing is copied or synced) and
 * sends through the Messages app itself via Apple events, so every outgoing message uses the
 * signed-in account and shows up in the person's own transcript.
 */
export class MessagesService {
  readonly #databasePath: string;
  readonly #platform: NodeJS.Platform;
  readonly #runOsascript: (script: string, argv: readonly string[]) => Promise<void>;

  constructor(options: MessagesServiceOptions = {}) {
    this.#databasePath =
      options.databasePath ?? join(homedir(), 'Library', 'Messages', 'chat.db');
    this.#platform = options.platform ?? process.platform;
    this.#runOsascript = options.runOsascript ?? defaultRunOsascript;
  }

  status(): MessagesStatus {
    if (this.#platform !== 'darwin') return 'unavailable';
    if (!existsSync(this.#databasePath)) return 'unavailable';
    try {
      const database = this.#openReadOnly();
      database.close();
      return 'ready';
    } catch {
      return 'needs_full_disk_access';
    }
  }

  /** Most recent messages, optionally filtered by text or sender substring. */
  search(query: string | undefined, limit: number): MessageRow[] {
    const database = this.#requireDatabase();
    try {
      const filter = query?.trim();
      if (filter) {
        // Filter the same visible body that readThread returns, before applying LIMIT.
        // Recent Messages versions often leave message.text empty and archive the body.
        database.function('sia_message_body', { deterministic: true }, (body) => {
          return decodeAttributedBody(body) ?? null;
        });
      }
      const rows = database
        .prepare(
          `SELECT chat.guid AS chat_guid,
                  COALESCE(NULLIF(chat.display_name, ''), chat.chat_identifier) AS chat_name,
                  COALESCE(handle.id, '') AS sender,
                  message.is_from_me AS from_me,
                  message.text AS text,
                  message.attributedBody AS attributed_body,
                  CAST(message.date AS REAL) AS apple_date
           FROM message
           JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
           JOIN chat ON chat.ROWID = chat_message_join.chat_id
           LEFT JOIN handle ON handle.ROWID = message.handle_id
           ${filter ? "WHERE COALESCE(NULLIF(message.text, ''), sia_message_body(message.attributedBody)) LIKE ? OR handle.id LIKE ? OR chat.display_name LIKE ?" : ''}
           ORDER BY message.date DESC
           LIMIT ?`,
        )
        .all(...(filter ? [`%${filter}%`, `%${filter}%`, `%${filter}%`] : []), limit);
      return rows.map((row) => mapRow(row as Record<string, unknown>));
    } finally {
      database.close();
    }
  }

  /** Recent messages for one conversation, oldest first. */
  readThread(chatId: string, limit: number): MessageRow[] {
    const database = this.#requireDatabase();
    try {
      const rows = database
        .prepare(
          `SELECT chat.guid AS chat_guid,
                  COALESCE(NULLIF(chat.display_name, ''), chat.chat_identifier) AS chat_name,
                  COALESCE(handle.id, '') AS sender,
                  message.is_from_me AS from_me,
                  message.text AS text,
                  message.attributedBody AS attributed_body,
                  CAST(message.date AS REAL) AS apple_date
           FROM message
           JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
           JOIN chat ON chat.ROWID = chat_message_join.chat_id
           LEFT JOIN handle ON handle.ROWID = message.handle_id
           WHERE chat.guid = ?
           ORDER BY message.date DESC
           LIMIT ?`,
        )
        .all(chatId, limit);
      return rows.map((row) => mapRow(row as Record<string, unknown>)).reverse();
    } finally {
      database.close();
    }
  }

  /** Newest message row id, so a relay starts after existing history. */
  latestRowId(): number {
    const database = this.#requireDatabase();
    try {
      const row = database.prepare('SELECT COALESCE(MAX(ROWID), 0) AS id FROM message').get();
      return Number((row as { id?: number } | undefined)?.id ?? 0);
    } finally {
      database.close();
    }
  }

  /**
   * One-to-one iMessage rows after a cursor, oldest first. SMS is excluded because carriers do
   * not authenticate sender IDs; reactions and system rows are excluded by their item types.
   */
  inbound(afterRowId: number, limit: number): { cursor: number; messages: InboundMessage[] } {
    const database = this.#requireDatabase();
    try {
      const rows = database
        .prepare(
          `SELECT message.ROWID AS row_id,
                  COALESCE(handle.id, '') AS handle,
                  COALESCE(chat.chat_identifier, '') AS chat_identifier,
                  message.is_from_me AS from_me,
                  message.text AS text,
                  message.attributedBody AS attributed_body,
                  message.service AS service,
                  chat.style AS style,
                  message.item_type AS item_type,
                  message.associated_message_type AS associated_type
           FROM message
           LEFT JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
           LEFT JOIN chat ON chat.ROWID = chat_message_join.chat_id
           LEFT JOIN handle ON handle.ROWID = message.handle_id
           WHERE message.ROWID > ?
           ORDER BY message.ROWID ASC
           LIMIT ?`,
        )
        .all(afterRowId, limit) as Record<string, unknown>[];
      const messages: InboundMessage[] = [];
      let cursor = afterRowId;
      for (const row of rows) {
        cursor = Math.max(cursor, Number(row.row_id));
        if (
          row.service !== 'iMessage' ||
          Number(row.style) !== 45 ||
          Number(row.item_type ?? 0) !== 0 ||
          Number(row.associated_type ?? 0) !== 0
        )
          continue;
        const attachments = this.#attachments(database, Number(row.row_id));
        // U+FFFC marks where an attachment sits inline; it is not part of the text.
        const text = (
          (typeof row.text === 'string' && row.text.length
            ? row.text
            : decodeAttributedBody(row.attributed_body)) ?? ''
        )
          .replaceAll('\uFFFC', '')
          .trim();
        if (!text && !attachments.length) continue;
        messages.push({
          rowId: Number(row.row_id),
          handle: String(row.handle ?? ''),
          chatIdentifier: String(row.chat_identifier ?? ''),
          fromMe: Boolean(row.from_me),
          text,
          attachments,
        });
      }
      return { cursor, messages };
    } finally {
      database.close();
    }
  }

  #attachments(database: DatabaseSync, rowId: number): string[] {
    try {
      const rows = database
        .prepare(
          `SELECT attachment.filename AS filename
           FROM message_attachment_join
           JOIN attachment ON attachment.ROWID = message_attachment_join.attachment_id
           WHERE message_attachment_join.message_id = ?
           LIMIT 10`,
        )
        .all(rowId) as { filename?: unknown }[];
      return rows
        .map(({ filename }) => (typeof filename === 'string' ? filename : ''))
        .filter(Boolean)
        .map((filename) =>
          filename.startsWith('~/') ? join(homedir(), filename.slice(2)) : filename,
        )
        .filter((path) => isAbsolute(path) && existsSync(path));
    } catch {
      // Older or partial databases without attachment tables still deliver text.
      return [];
    }
  }

  /** Sends a file through the Messages app to an already-approved recipient. */
  async sendFile(recipient: string, path: string): Promise<void> {
    if (this.#platform !== 'darwin') throw new Error('Messages is available on macOS only.');
    // Messages accepts Apple events for arbitrary paths but its sandbox cannot read our
    // temporary directory. Stage only this approved file inside its existing allowed area.
    const stagingRoot = join(dirname(this.#databasePath), '.sia-outgoing');
    await mkdir(stagingRoot, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(stagingRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('Messages attachment staging must be a private directory.');
    }
    await chmod(stagingRoot, 0o700);
    // Recover copies left behind when Sia quit before their cleanup timer ran.
    for (const entry of await readdir(stagingRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^send-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
      const oldFolder = join(stagingRoot, entry.name);
      const info = await lstat(oldFolder);
      if (Date.now() - info.mtimeMs > 3_600_000) {
        await rm(oldFolder, { recursive: true, force: true });
      }
    }
    const folder = await mkdtemp(join(stagingRoot, 'send-'));
    const staged = join(folder, basename(path));
    const script = [
      'on run argv',
      '  tell application "Messages"',
      '    set targetService to 1st account whose service type = iMessage',
      '    set targetBuddy to participant (item 1 of argv) of targetService',
      '    send (POSIX file (item 2 of argv)) to targetBuddy',
      '  end tell',
      'end run',
    ].join('\n');
    try {
      await copyFile(path, staged);
      await chmod(staged, 0o600);
      await this.#runOsascript(script, [recipient, staged]);
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
    // The Apple event acknowledges dispatch before Messages finishes importing the file.
    setTimeout(() => {
      void rm(folder, { recursive: true, force: true }).catch(() => undefined);
    }, 60_000).unref();
  }

  /** Sends through the Messages app; the exact text and recipient were already approved. */
  async send(recipient: string, text: string): Promise<void> {
    if (this.#platform !== 'darwin') throw new Error('Messages is available on macOS only.');
    const script = [
      'on run argv',
      '  tell application "Messages"',
      '    set targetService to 1st account whose service type = iMessage',
      '    set targetBuddy to participant (item 1 of argv) of targetService',
      '    send (item 2 of argv) to targetBuddy',
      '  end tell',
      'end run',
    ].join('\n');
    await this.#runOsascript(script, [recipient, text]);
  }

  #requireDatabase(): DatabaseSync {
    const status = this.status();
    if (status === 'unavailable') {
      throw new Error('Apple Messages is unavailable on this Mac.');
    }
    if (status === 'needs_full_disk_access') {
      throw new Error(
        'Reading Messages needs Full Disk Access for Sia: System Settings → Privacy & Security → Full Disk Access, add Sia, then retry.',
      );
    }
    return this.#openReadOnly();
  }

  #openReadOnly(): DatabaseSync {
    const database = new DatabaseSync(this.#databasePath, { readOnly: true });
    database.prepare('SELECT COUNT(*) FROM sqlite_master').get();
    return database;
  }
}

function mapRow(row: Record<string, unknown>): MessageRow {
  const appleDate = Number(row.apple_date ?? 0);
  const seconds =
    appleDate > 1e12
      ? appleDate / 1e9 + APPLE_EPOCH_OFFSET_SECONDS
      : appleDate + APPLE_EPOCH_OFFSET_SECONDS;
  const text =
    typeof row.text === 'string' && row.text.length
      ? row.text
      : decodeAttributedBody(row.attributed_body) || '[non-text message]';
  return {
    chatId: String(row.chat_guid ?? ''),
    chatName: String(row.chat_name ?? ''),
    sender: row.from_me ? 'me' : String(row.sender ?? ''),
    fromMe: Boolean(row.from_me),
    text,
    timestamp: new Date(seconds * 1000).toISOString(),
  };
}

async function defaultRunOsascript(script: string, argv: readonly string[]): Promise<void> {
  await execFileAsync('osascript', ['-e', script, ...argv]);
}
