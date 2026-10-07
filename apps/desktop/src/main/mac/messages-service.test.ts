import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesService } from './messages-service.js';

const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;
const archivedMessages = JSON.parse(
  readFileSync(
    new URL('../../../tests/fixtures/messages/attributed-bodies.json', import.meta.url),
    'utf8',
  ),
) as { name: string; archiveGzipBase64: string }[];
const replyArchive = gunzipSync(
  Buffer.from(
    archivedMessages.find(({ name }) => name === 'reply')!.archiveGzipBase64,
    'base64',
  ),
);

function fixtureDatabase(root: string): string {
  const path = join(root, 'chat.db');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB,
      handle_id INTEGER, date INTEGER, is_from_me INTEGER);
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
    CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT, display_name TEXT,
      chat_identifier TEXT);
    CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
  `);
  db.exec(`
    INSERT INTO handle VALUES (1, '+15551234567');
    INSERT INTO chat VALUES (1, 'iMessage;-;+15551234567', 'Alex', '+15551234567');
    INSERT INTO chat_message_join VALUES (1, 1), (1, 2), (1, 3);
  `);
  const base = (unixSeconds: number) => (unixSeconds - APPLE_EPOCH_OFFSET_SECONDS) * 1e9;
  const insert = db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?, ?)');
  insert.run(1, 'See you at the demo tomorrow!', null, 1, base(1_755_800_000), 0);
  insert.run(2, 'Bringing the projector', null, 1, base(1_755_800_100), 1);
  insert.run(3, null, replyArchive, 1, base(1_755_800_200), 0);
  db.close();
  return path;
}

describe('MessagesService', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const makeService = () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-messages-'));
    roots.push(root);
    return new MessagesService({ databasePath: fixtureDatabase(root), platform: 'darwin' });
  };

  it('reports ready against a readable database', () => {
    expect(makeService().status()).toBe('ready');
  });

  it('searches newest-first and maps senders, timestamps, and rich bodies', () => {
    const rows = makeService().search(undefined, 10);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ chatName: 'Alex', sender: '+15551234567', fromMe: false });
    expect(rows[0]!.text).toBe('Sia › SIA-IMESSAGE-1007-OK');
    expect(rows[1]).toMatchObject({
      sender: 'me',
      fromMe: true,
      text: 'Bringing the projector',
    });
    expect(new Date(rows[2]!.timestamp).getTime()).toBe(1_755_800_000_000);
  });

  it('filters by text and reads one thread oldest-first', () => {
    const service = makeService();
    expect(service.search('projector', 10)).toHaveLength(1);
    const thread = service.readThread('iMessage;-;+15551234567', 10);
    expect(thread[0]!.text).toBe('See you at the demo tomorrow!');
    expect(thread.at(-1)!.text).toBe('Sia › SIA-IMESSAGE-1007-OK');
  });

  it('explains the Full Disk Access requirement when the database is unreadable', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-messages-denied-'));
    roots.push(root);
    const service = new MessagesService({ databasePath: root, platform: 'darwin' });
    expect(service.status()).toBe('needs_full_disk_access');
    expect(() => service.search(undefined, 5)).toThrow(/Full Disk Access/);
  });

  it('sends through Messages with exact recipient and text arguments', async () => {
    const runOsascript = vi.fn(async (_script: string, _argv: readonly string[]) => undefined);
    const root = mkdtempSync(join(tmpdir(), 'sia-messages-send-'));
    roots.push(root);
    const service = new MessagesService({
      databasePath: fixtureDatabase(root),
      platform: 'darwin',
      runOsascript,
    });
    await service.send('+15551234567', 'On my way');
    expect(runOsascript).toHaveBeenCalledOnce();
    const [script, argv] = runOsascript.mock.calls[0]!;
    expect(script).toContain('service type = iMessage');
    expect(argv).toEqual(['+15551234567', 'On my way']);
  });

  it('reads new one-to-one iMessages after a cursor and skips SMS, groups and reactions', () => {
    const root = mkdtempSync(join(tmpdir(), 'sia-messages-inbound-'));
    roots.push(root);
    const path = join(root, 'chat.db');
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB,
        handle_id INTEGER, date INTEGER, is_from_me INTEGER, service TEXT, item_type INTEGER,
        associated_message_type INTEGER);
      CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
      CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT, display_name TEXT,
        chat_identifier TEXT, style INTEGER);
      CREATE TABLE chat_message_join (chat_id INTEGER, message_id INTEGER);
      CREATE TABLE attachment (ROWID INTEGER PRIMARY KEY, filename TEXT);
      CREATE TABLE message_attachment_join (message_id INTEGER, attachment_id INTEGER);
      INSERT INTO handle VALUES (1, '+15551234567');
      INSERT INTO chat VALUES (1, 'iMessage;-;+15551234567', '', '+15551234567', 45);
      INSERT INTO chat VALUES (2, 'iMessage;+;chat1', 'Family', 'chat1', 43);
      INSERT INTO message VALUES (1, 'before cursor', NULL, 1, 0, 0, 'iMessage', 0, 0);
      INSERT INTO message VALUES (2, 'hello Sia', NULL, 1, 0, 0, 'iMessage', 0, 0);
      INSERT INTO message VALUES (3, 'via SMS', NULL, 1, 0, 0, 'SMS', 0, 0);
      INSERT INTO message VALUES (4, 'in a group', NULL, 1, 0, 0, 'iMessage', 0, 0);
      INSERT INTO message VALUES (5, 'Loved “hello Sia”', NULL, 1, 0, 0, 'iMessage', 0, 2000);
      INSERT INTO message VALUES (6, 'note to self', NULL, 0, 0, 1, 'iMessage', 0, 0);
      INSERT INTO message VALUES (7, '￼', NULL, 1, 0, 0, 'iMessage', 0, 0);
      INSERT INTO chat_message_join VALUES (1, 1), (1, 2), (1, 3), (2, 4), (1, 5), (1, 6), (1, 7), (1, 8);
    `);
    db.prepare("INSERT INTO message VALUES (8, NULL, ?, 1, 0, 0, 'iMessage', 0, 0)").run(
      replyArchive,
    );
    const photo = join(root, 'IMG_1.heic');
    writeFileSync(photo, 'photo');
    db.prepare('INSERT INTO attachment VALUES (1, ?), (2, ?)').run(
      photo,
      join(root, 'gone.png'),
    );
    db.exec('INSERT INTO message_attachment_join VALUES (7, 1), (7, 2)');
    db.close();
    const service = new MessagesService({ databasePath: path, platform: 'darwin' });
    expect(service.latestRowId()).toBe(8);
    const { cursor, messages } = service.inbound(1, 50);
    expect(cursor).toBe(8);
    expect(messages).toEqual([
      {
        rowId: 2,
        handle: '+15551234567',
        chatIdentifier: '+15551234567',
        fromMe: false,
        text: 'hello Sia',
        attachments: [],
      },
      {
        rowId: 6,
        handle: '',
        chatIdentifier: '+15551234567',
        fromMe: true,
        text: 'note to self',
        attachments: [],
      },
      {
        rowId: 7,
        handle: '+15551234567',
        chatIdentifier: '+15551234567',
        fromMe: false,
        text: '',
        attachments: [photo],
      },
      {
        rowId: 8,
        handle: '+15551234567',
        chatIdentifier: '+15551234567',
        fromMe: false,
        text: 'Sia › SIA-IMESSAGE-1007-OK',
        attachments: [],
      },
    ]);
  });

  it('sends a file through Messages as a POSIX file argument', async () => {
    const runOsascript = vi.fn(async (_script: string, _argv: readonly string[]) => undefined);
    const service = new MessagesService({
      databasePath: '/missing',
      platform: 'darwin',
      runOsascript,
    });
    await service.sendFile('+15551234567', '/tmp/sia-text-1/plan.pdf');
    const [script, argv] = runOsascript.mock.calls[0]!;
    expect(script).toContain('send (POSIX file (item 2 of argv)) to targetBuddy');
    expect(argv).toEqual(['+15551234567', '/tmp/sia-text-1/plan.pdf']);
  });
});
