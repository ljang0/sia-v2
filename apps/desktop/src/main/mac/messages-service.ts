import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

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
           ${filter ? 'WHERE message.text LIKE ? OR handle.id LIKE ? OR chat.display_name LIKE ?' : ''}
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
        const text =
          typeof row.text === 'string' && row.text.length
            ? row.text
            : decodeAttributedBody(row.attributed_body);
        if (!text?.trim()) continue;
        messages.push({
          rowId: Number(row.row_id),
          handle: String(row.handle ?? ''),
          chatIdentifier: String(row.chat_identifier ?? ''),
          fromMe: Boolean(row.from_me),
          text,
        });
      }
      return { cursor, messages };
    } finally {
      database.close();
    }
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

/**
 * Newer macOS releases store message text only inside an NSAttributedString typedstream blob.
 * The exact format is undocumented; the longest printable run after the NSString marker is the
 * message body in practice, and failure just falls back to a placeholder label.
 */
function decodeAttributedBody(value: unknown): string | undefined {
  if (!(value instanceof Uint8Array) || value.length === 0) return undefined;
  const buffer = Buffer.from(value);
  const marker = buffer.indexOf(Buffer.from('NSString'));
  const slice = marker >= 0 ? buffer.subarray(marker + 8) : buffer;
  const text = slice.toString('utf8');
  let best = '';
  for (const match of text.matchAll(/[\p{L}\p{N}\p{P}\p{Zs}\p{Emoji_Presentation}]{2,}/gu)) {
    if (match[0].length > best.length) best = match[0];
  }
  return best.trim() || undefined;
}

async function defaultRunOsascript(script: string, argv: readonly string[]): Promise<void> {
  await execFileAsync('osascript', ['-e', script, ...argv]);
}
