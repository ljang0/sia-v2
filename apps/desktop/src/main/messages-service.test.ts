import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessagesService } from './messages-service.js';

const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;

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
  insert.run(
    3,
    null,
    Buffer.from('streamtypedNSString\x01\x95Rich body here'),
    1,
    base(1_755_800_200),
    0,
  );
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
    expect(rows[0]!.text).toContain('Rich body here');
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
    expect(thread.at(-1)!.text).toContain('Rich body here');
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
});
