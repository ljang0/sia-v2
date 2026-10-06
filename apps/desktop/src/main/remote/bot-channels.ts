import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** One direct message to the bot from a person, after any files were saved locally. */
export interface ChannelMessage {
  /** `telegram:<user id>` or `discord:<user id>`. */
  handle: string;
  /** The sender's display name, used only to label a newly paired account. */
  name: string;
  text: string;
  attachments: string[];
}

export interface BotChannel {
  readonly kind: 'telegram' | 'discord';
  /** Checks the token and returns the bot's public name. */
  verify(): Promise<string>;
  start(onMessage: (message: ChannelMessage) => void): void;
  stop(): void;
  send(handle: string, text: string): Promise<void>;
  sendFile(handle: string, path: string): Promise<void>;
  error(): string | undefined;
}

interface ChannelOptions {
  token: string;
  /** Private folder for files people send; old files are removed after an hour. */
  downloads: string;
  fetch?: typeof fetch;
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      done();
    });
  });

async function saveDownload(
  folder: string,
  name: string,
  response: Response,
): Promise<string | undefined> {
  const size = Number(response.headers.get('content-length') ?? 0);
  if (!response.ok || size > MAX_FILE_BYTES) return undefined;
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_FILE_BYTES) return undefined;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  // Keep the folder small: anything older than an hour has already been handed to a turn.
  for (const entry of await readdir(folder).catch(() => [])) {
    const path = join(folder, entry);
    const info = await stat(path).catch(() => undefined);
    if (info && Date.now() - info.mtimeMs > 3600000)
      await rm(path, { force: true }).catch(() => undefined);
  }
  const safe =
    basename(name)
      .replace(/[^\w.() -]/g, '_')
      .slice(-80) || 'file';
  const path = join(folder, `${randomUUID().slice(0, 8)}-${safe}`);
  await writeFile(path, data, { mode: 0o600 });
  return path;
}

async function fileBlob(path: string): Promise<Blob> {
  const data = await readFile(path);
  if (data.length > MAX_FILE_BYTES) throw new Error('This file is too large to send.');
  return new Blob([Uint8Array.from(data)]);
}

function split(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size)
    parts.push(text.slice(index, index + size));
  return parts.length ? parts : [''];
}

/** A Telegram bot the person created with @BotFather, reached by long polling from this Mac. */
export class TelegramChannel implements BotChannel {
  readonly kind = 'telegram' as const;
  #options: ChannelOptions;
  #fetch: typeof fetch;
  #abort: AbortController | undefined;
  #error: string | undefined;

  constructor(options: ChannelOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? fetch;
  }

  async #call<T>(method: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.#fetch(
      `https://api.telegram.org/bot${this.#options.token}/${method}`,
      {
        method: body instanceof FormData || body ? 'POST' : 'GET',
        ...(body instanceof FormData
          ? { body }
          : body
            ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
            : {}),
        ...(signal ? { signal } : {}),
      },
    );
    const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!data.ok) {
      const error = new Error(data.description ?? 'Telegram refused the request.');
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return data.result as T;
  }

  async verify(): Promise<string> {
    const me = await this.#call<{ username?: string; is_bot?: boolean }>('getMe');
    if (!me.is_bot) throw new Error('That token is not a Telegram bot token.');
    return `@${me.username ?? 'bot'}`;
  }

  start(onMessage: (message: ChannelMessage) => void): void {
    this.stop();
    const abort = new AbortController();
    this.#abort = abort;
    void (async () => {
      let offset = 0;
      while (!abort.signal.aborted) {
        try {
          const updates = await this.#call<
            {
              update_id: number;
              message?: {
                chat: { type: string };
                from?: { id: number; is_bot?: boolean; first_name?: string; username?: string };
                text?: string;
                caption?: string;
                photo?: { file_id: string; file_size?: number }[];
                document?: { file_id: string; file_name?: string; file_size?: number };
                voice?: { file_id: string; file_size?: number };
                audio?: { file_id: string; file_name?: string; file_size?: number };
              };
            }[]
          >('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] }, abort.signal);
          this.#error = undefined;
          for (const update of updates) {
            offset = Math.max(offset, update.update_id + 1);
            const message = update.message;
            if (!message?.from || message.from.is_bot || message.chat.type !== 'private')
              continue;
            const files: { id: string; name: string; size?: number | undefined }[] = [];
            const photo = message.photo?.at(-1);
            if (photo)
              files.push({ id: photo.file_id, name: 'photo.jpg', size: photo.file_size });
            if (message.document)
              files.push({
                id: message.document.file_id,
                name: message.document.file_name ?? 'file',
                size: message.document.file_size,
              });
            if (message.voice)
              files.push({
                id: message.voice.file_id,
                name: 'voice-note.ogg',
                size: message.voice.file_size,
              });
            if (message.audio)
              files.push({
                id: message.audio.file_id,
                name: message.audio.file_name ?? 'audio.mp3',
                size: message.audio.file_size,
              });
            const attachments: string[] = [];
            for (const file of files.slice(0, 5)) {
              if ((file.size ?? 0) > MAX_FILE_BYTES) continue;
              const info = await this.#call<{ file_path?: string }>('getFile', {
                file_id: file.id,
              });
              if (!info.file_path) continue;
              const response = await this.#fetch(
                `https://api.telegram.org/file/bot${this.#options.token}/${info.file_path}`,
                { signal: abort.signal },
              );
              const name = extname(file.name)
                ? file.name
                : `${file.name}${extname(info.file_path)}`;
              const path = await saveDownload(this.#options.downloads, name, response);
              if (path) attachments.push(path);
            }
            onMessage({
              handle: `telegram:${message.from.id}`,
              name: message.from.username
                ? `@${message.from.username}`
                : (message.from.first_name ?? 'Telegram'),
              text: (message.text ?? message.caption ?? '').trim(),
              attachments,
            });
          }
        } catch (error) {
          if (abort.signal.aborted) return;
          const status = (error as Error & { status?: number }).status;
          this.#error =
            status === 401
              ? 'Telegram rejected the bot token. Connect the bot again with a new token.'
              : 'Telegram is unreachable. Sia will keep retrying.';
          if (status === 401) return;
          await delay(5000, abort.signal);
        }
      }
    })();
  }

  stop(): void {
    this.#abort?.abort();
    this.#abort = undefined;
  }

  async send(handle: string, text: string): Promise<void> {
    const chatId = handle.replace(/^telegram:/, '');
    for (const part of split(text, 4000))
      await this.#call('sendMessage', { chat_id: chatId, text: part });
  }

  async sendFile(handle: string, path: string): Promise<void> {
    const form = new FormData();
    form.append('chat_id', handle.replace(/^telegram:/, ''));
    form.append('document', await fileBlob(path), basename(path));
    await this.#call('sendDocument', form);
  }

  error(): string | undefined {
    return this.#error;
  }
}

interface DiscordMessage {
  author: { id: string; username?: string; global_name?: string };
  channel_id: string;
  content?: string;
  attachments?: { url: string; filename: string; size: number }[];
}

interface DiscordOptions extends ChannelOptions {
  WebSocket?: typeof WebSocket;
}

/** A Discord bot the person created, reached by direct message through the Discord gateway. */
export class DiscordChannel implements BotChannel {
  readonly kind = 'discord' as const;
  #options: DiscordOptions;
  #fetch: typeof fetch;
  #socket: WebSocket | undefined;
  #heartbeat: NodeJS.Timeout | undefined;
  #sequence: number | null = null;
  #stopped = true;
  #error: string | undefined;
  #channels = new Map<string, string>();

  constructor(options: DiscordOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? fetch;
  }

  async #rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.#fetch(`https://discord.com/api/v10${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${this.#options.token}`,
        ...(init.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'Discord rejected the bot token.'
          : `Discord refused the request (${response.status}).`,
      );
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return (await response.json()) as T;
  }

  async verify(): Promise<string> {
    const me = await this.#rest<{ username: string; bot?: boolean }>('/users/@me');
    if (!me.bot) throw new Error('That token is not a Discord bot token.');
    return me.username;
  }

  start(onMessage: (message: ChannelMessage) => void): void {
    this.stop();
    this.#stopped = false;
    void this.#connect(onMessage);
  }

  async #connect(onMessage: (message: ChannelMessage) => void): Promise<void> {
    if (this.#stopped) return;
    let url: string;
    try {
      url = (await this.#rest<{ url: string }>('/gateway/bot')).url;
    } catch (error) {
      this.#error =
        (error as Error & { status?: number }).status === 401
          ? 'Discord rejected the bot token. Connect the bot again with a new token.'
          : 'Discord is unreachable. Sia will keep retrying.';
      if ((error as Error & { status?: number }).status !== 401)
        setTimeout(() => void this.#connect(onMessage), 10000).unref();
      return;
    }
    const Socket = this.#options.WebSocket ?? WebSocket;
    const socket = new Socket(`${url}?v=10&encoding=json`);
    this.#socket = socket;
    socket.addEventListener('message', (event) => {
      let payload: { op: number; s?: number | null; t?: string | null; d?: unknown };
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (payload.s !== undefined && payload.s !== null) this.#sequence = payload.s;
      if (payload.op === 10) {
        clearInterval(this.#heartbeat);
        this.#heartbeat = setInterval(
          () => socket.send(JSON.stringify({ op: 1, d: this.#sequence })),
          (payload.d as { heartbeat_interval: number }).heartbeat_interval,
        );
        this.#heartbeat.unref();
        // DIRECT_MESSAGES only; DM content does not need the privileged message-content intent.
        socket.send(
          JSON.stringify({
            op: 2,
            d: {
              token: this.#options.token,
              intents: 1 << 12,
              properties: { os: 'macos', browser: 'sia', device: 'sia' },
            },
          }),
        );
      } else if (payload.op === 0 && payload.t === 'READY') {
        this.#error = undefined;
      } else if (payload.op === 0 && payload.t === 'MESSAGE_CREATE') {
        const message = payload.d as DiscordMessage & {
          guild_id?: string;
          author?: { bot?: boolean };
        };
        if (message.guild_id || message.author?.bot) return;
        void this.#deliver(message, onMessage);
      } else if (payload.op === 7 || payload.op === 9) {
        socket.close();
      }
    });
    socket.addEventListener('close', (event) => {
      clearInterval(this.#heartbeat);
      if (this.#stopped || this.#socket !== socket) return;
      if ((event as CloseEvent).code === 4004) {
        this.#error = 'Discord rejected the bot token. Connect the bot again with a new token.';
        return;
      }
      setTimeout(() => void this.#connect(onMessage), 5000).unref();
    });
  }

  async #deliver(
    message: DiscordMessage,
    onMessage: (message: ChannelMessage) => void,
  ): Promise<void> {
    this.#channels.set(message.author.id, message.channel_id);
    const attachments: string[] = [];
    for (const file of (message.attachments ?? []).slice(0, 5)) {
      if (file.size > MAX_FILE_BYTES || !file.url.startsWith('https://cdn.discordapp.com/'))
        continue;
      const path = await saveDownload(
        this.#options.downloads,
        file.filename,
        await this.#fetch(file.url),
      ).catch(() => undefined);
      if (path) attachments.push(path);
    }
    onMessage({
      handle: `discord:${message.author.id}`,
      name: message.author.global_name ?? message.author.username ?? 'Discord',
      text: (message.content ?? '').trim(),
      attachments,
    });
  }

  stop(): void {
    this.#stopped = true;
    clearInterval(this.#heartbeat);
    this.#socket?.close();
    this.#socket = undefined;
  }

  async #channel(handle: string): Promise<string> {
    const user = handle.replace(/^discord:/, '');
    const known = this.#channels.get(user);
    if (known) return known;
    const { id } = await this.#rest<{ id: string }>('/users/@me/channels', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: user }),
    });
    this.#channels.set(user, id);
    return id;
  }

  async send(handle: string, text: string): Promise<void> {
    const channel = await this.#channel(handle);
    for (const part of split(text, 1900))
      await this.#rest(`/channels/${channel}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: part, allowed_mentions: { parse: [] } }),
      });
  }

  async sendFile(handle: string, path: string): Promise<void> {
    const channel = await this.#channel(handle);
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ allowed_mentions: { parse: [] } }));
    form.append('files[0]', await fileBlob(path), basename(path));
    await this.#rest(`/channels/${channel}/messages`, { method: 'POST', body: form });
  }

  error(): string | undefined {
    return this.#error;
  }
}
