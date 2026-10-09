import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordChannel, TelegramChannel, type ChannelMessage } from './bot-channels.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const folder = () => {
  const root = mkdtempSync(join(tmpdir(), 'sia-bots-'));
  roots.push(root);
  return root;
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('TelegramChannel', () => {
  it('verifies the bot, delivers private messages with files, and sends replies', async () => {
    const downloads = folder();
    const calls: { url: string; body?: unknown }[] = [];
    let polled = 0;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body });
      if (url.endsWith('/getMe'))
        return json({ ok: true, result: { is_bot: true, username: 'sia_bot' } });
      if (url.endsWith('/getUpdates')) {
        polled++;
        if (polled > 1) return new Promise<Response>(() => undefined);
        return json({
          ok: true,
          result: [
            {
              update_id: 7,
              message: {
                chat: { type: 'private' },
                from: { id: 42, username: 'lawrence' },
                caption: 'What is this?',
                photo: [{ file_id: 'small' }, { file_id: 'large', file_size: 3 }],
              },
            },
            {
              update_id: 8,
              message: { chat: { type: 'group' }, from: { id: 9 }, text: 'ignored' },
            },
          ],
        });
      }
      if (url.endsWith('/getFile'))
        return json({ ok: true, result: { file_path: 'photos/a.jpg' } });
      if (url.includes('/file/bot')) return new Response('jpg');
      if (url.endsWith('/sendMessage') || url.endsWith('/sendDocument'))
        return json({ ok: true, result: {} });
      throw new Error(url);
    });
    const channel = new TelegramChannel({ token: 'T0KEN', downloads, fetch: fetch as never });
    expect(await channel.verify()).toBe('@sia_bot');
    const messages: ChannelMessage[] = [];
    channel.start((message) => messages.push(message));
    try {
      // Reaching the next poll proves the whole batch (including the ignored group message)
      // finished. A fixed sleep can stop the channel while the attachment is still being saved.
      await vi.waitFor(() => expect(polled).toBe(2));
    } finally {
      channel.stop();
    }
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      handle: 'telegram:42',
      name: '@lawrence',
      text: 'What is this?',
    });
    expect(readFileSync(messages[0]!.attachments[0]!, 'utf8')).toBe('jpg');
    expect(JSON.parse(String(calls.find(({ url }) => url.endsWith('/getFile'))!.body))).toEqual(
      {
        file_id: 'large',
      },
    );
    await channel.send('telegram:42', 'Hello');
    expect(JSON.parse(String(calls.at(-1)!.body))).toEqual({ chat_id: '42', text: 'Hello' });
    const file = join(downloads, 'plan.pdf');
    writeFileSync(file, '%PDF');
    await channel.sendFile('telegram:42', file);
    expect(calls.at(-1)!.url).toContain('/sendDocument');
    expect(calls.at(-1)!.body).toBeInstanceOf(FormData);
  });

  it('stops retrying and explains when the token is rejected', async () => {
    const fetch = vi.fn(async () => json({ ok: false, description: 'Unauthorized' }, 401));
    const channel = new TelegramChannel({
      token: 'bad',
      downloads: folder(),
      fetch: fetch as never,
    });
    channel.start(() => undefined);
    try {
      await vi.waitFor(() => expect(channel.error()).toContain('rejected the bot token'));
    } finally {
      channel.stop();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

class FakeSocket extends EventTarget {
  static last: FakeSocket | undefined;
  sent: unknown[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.dispatchEvent(new Event('close'));
  }
  receive(payload: unknown) {
    const event = new Event('message') as Event & { data: string };
    event.data = JSON.stringify(payload);
    this.dispatchEvent(event);
  }
}

describe('DiscordChannel', () => {
  it('identifies for direct messages, delivers DMs only, and replies in the DM channel', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith('/users/@me')) return json({ username: 'Sia', bot: true });
      if (url.endsWith('/gateway/bot')) return json({ url: 'wss://gateway.example' });
      if (url.includes('/messages')) return json({ id: 'm1' });
      throw new Error(url);
    });
    const channel = new DiscordChannel({
      token: 'D1SCORD',
      downloads: folder(),
      fetch: fetch as never,
      WebSocket: FakeSocket as never,
    });
    expect(await channel.verify()).toBe('Sia');
    const messages: ChannelMessage[] = [];
    FakeSocket.last = undefined;
    channel.start((message) => messages.push(message));
    await vi.waitFor(() => expect(FakeSocket.last).toBeDefined());
    const socket = FakeSocket.last!;
    expect(socket.url).toBe('wss://gateway.example?v=10&encoding=json');
    socket.receive({ op: 10, d: { heartbeat_interval: 45000 } });
    expect(socket.sent[0]).toMatchObject({ op: 2, d: { token: 'D1SCORD', intents: 4096 } });
    socket.receive({
      op: 0,
      s: 1,
      t: 'MESSAGE_CREATE',
      d: { guild_id: 'g', author: { id: '1' }, channel_id: 'c0', content: 'server message' },
    });
    socket.receive({
      op: 0,
      s: 2,
      t: 'MESSAGE_CREATE',
      d: { author: { id: '42', username: 'lawrence' }, channel_id: 'dm-42', content: 'hi Sia' },
    });
    await vi.waitFor(() =>
      expect(messages).toEqual([
        { handle: 'discord:42', name: 'lawrence', text: 'hi Sia', attachments: [] },
      ]),
    );
    await channel.send('discord:42', 'Hello <@everyone>');
    const sent = calls.at(-1)!;
    expect(sent.url).toBe('https://discord.com/api/v10/channels/dm-42/messages');
    expect(JSON.parse(String(sent.init!.body))).toEqual({
      content: 'Hello <@everyone>',
      allowed_mentions: { parse: [] },
    });
    expect((sent.init!.headers as Record<string, string>).Authorization).toBe('Bot D1SCORD');
    channel.stop();
  });
});
