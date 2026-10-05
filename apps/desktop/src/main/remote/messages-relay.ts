import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { DesktopController } from '../controller/desktop-controller.js';
import type { MessagesService } from '../mac/messages-service.js';
import type { RecordRepository } from '../storage/persistence.js';
import type { DesktopSnapshot } from '../../shared/bridge.js';
import {
  normalizeHandle,
  type MessagesRelayCommand,
  type MessagesRelaySettings,
  type TrustedContact,
} from '../../shared/messages-relay.js';

const VOICE_NOTE = /\.(caf|m4a|amr|aac|mp3|wav)$/i;

/**
 * Converts an iMessage voice note (usually Opus in CAF) to 16 kHz WAV with macOS afconvert and
 * transcribes it through the configured voice service.
 */
export function voiceNoteTranscriber(
  controller: Pick<DesktopController, 'invoke'>,
): (path: string) => Promise<string> {
  const run = promisify(execFile);
  return async (path) => {
    const folder = await mkdtemp(join(tmpdir(), 'sia-voice-note-'));
    try {
      const wav = join(folder, 'note.wav');
      await run(
        '/usr/bin/afconvert',
        ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', path, wav],
        {
          timeout: 20000,
        },
      );
      const audio = await readFile(wav);
      if (audio.length > 10 * 1024 * 1024) throw new Error('This voice note is too long.');
      const { text } = await controller.invoke('voice.transcribe', {
        audioBase64: audio.toString('base64'),
        mimeType: 'audio/wav',
      });
      return text.trim();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  };
}

/** Every outgoing text starts with this, so Sia never reads its own replies in a self chat. */
export const REPLY_PREFIX = 'Sia › ';
const MAX_REPLY = 1800;
const HELP =
  'Text me what you need and I will work on it on your Mac. Text STOP to cancel, NEW to start a fresh conversation. Anything that changes your Mac or accounts waits for your OK in Sia on your Mac.';

interface Config {
  enabled: boolean;
  agentId?: string;
  trusted: TrustedContact[];
  cursor?: number;
  /** Text the first number when scheduled tasks finish or need the person. */
  proactive?: boolean;
  /** Trusted handle → the thread that continues its conversation. */
  threads: Record<string, string>;
}
interface Tracked {
  handle: string;
  turnId: string;
  started: number;
  acknowledged: boolean;
  notified: Set<string>;
  /** Started by a schedule rather than a text; results are labelled with the task title. */
  schedule?: string;
}
interface Dependencies {
  controller: Pick<
    DesktopController,
    'snapshot' | 'invoke' | 'remoteAccessAllowed' | 'subscribe' | 'readGeneratedResult'
  >;
  repository: RecordRepository;
  messages: Pick<MessagesService, 'status' | 'latestRowId' | 'inbound' | 'send' | 'sendFile'>;
  /** Turns a voice note into text; absent when this build has no transcription. */
  transcribe?: (path: string) => Promise<string>;
  intervalMs?: number;
  ackAfterMs?: number;
  now?: () => number;
}

/**
 * Text Sia from your phone. Polls the local Messages database for one-to-one iMessages from
 * trusted handles, runs each as a phone turn (actions always ask on the Mac, never full bypass),
 * and texts the result back to the same handle. Off until the person turns it on.
 */
export class MessagesRelay {
  #deps: Dependencies;
  #config: Config;
  #timer: NodeJS.Timeout | undefined;
  #unsubscribe: (() => void) | undefined;
  #tracked = new Map<string, Tracked>();
  #sent: string[] = [];
  #recent: { handle: string; text: string; at: number }[] = [];
  #outgoing: Promise<unknown> = Promise.resolve();
  #polling = false;
  #detail = '';
  #disposed = false;
  #since = new Date().toISOString();
  #seenScheduled = new Set<string>();

  constructor(deps: Dependencies) {
    this.#deps = deps;
    const saved = deps.repository.get<Config>('messages-relay', 'settings');
    this.#config = saved
      ? { ...saved, trusted: saved.trusted ?? [], threads: saved.threads ?? {} }
      : { enabled: false, trusted: [], threads: {} };
  }

  initialize(): void {
    this.#unsubscribe = this.#deps.controller.subscribe((event) => {
      if (event.type === 'snapshot') this.#observe(event.snapshot);
    });
    this.#timer = setInterval(() => void this.poll(), this.#deps.intervalMs ?? 2000);
    this.#timer.unref();
  }

  dispose(): void {
    this.#disposed = true;
    clearInterval(this.#timer);
    this.#unsubscribe?.();
  }

  async configure(command: MessagesRelayCommand): Promise<MessagesRelaySettings> {
    if (this.#disposed) throw new Error('Sia is closing.');
    if (command.operation !== 'status' && !this.#deps.controller.remoteAccessAllowed())
      throw new Error('Sign in to Sia on your Mac first.');
    if (command.operation === 'enable') {
      if (!this.#deps.controller.snapshot().agents.some(({ id }) => id === command.agentId))
        throw new Error('Choose an existing agent.');
      if (this.#access() !== 'ready')
        throw new Error(
          'Sia needs Full Disk Access to read Messages: System Settings → Privacy & Security → Full Disk Access.',
        );
      if (!this.#config.trusted.length) throw new Error('Add a trusted phone number first.');
      if (this.#config.agentId !== command.agentId) this.#config.threads = {};
      this.#config.agentId = command.agentId;
      this.#config.enabled = true;
      // Only texts that arrive after turning this on are read.
      this.#config.cursor = this.#deps.messages.latestRowId();
    } else if (command.operation === 'disable') {
      this.#config.enabled = false;
      this.#tracked.clear();
    } else if (command.operation === 'trust') {
      const handle = normalizeHandle(command.handle);
      if (!handle)
        throw new Error('Enter a phone number with area code, or an Apple ID email.');
      if (this.#config.trusted.length >= 20 && !this.#trusted(handle))
        throw new Error('You can trust up to 20 numbers.');
      this.#config.trusted = [
        ...this.#config.trusted.filter((entry) => entry.handle !== handle),
        { handle, label: command.label || handle },
      ];
    } else if (command.operation === 'preferences') {
      this.#config.proactive = command.proactive;
    } else if (command.operation === 'untrust') {
      const handle = normalizeHandle(command.handle) ?? command.handle;
      this.#config.trusted = this.#config.trusted.filter((entry) => entry.handle !== handle);
      delete this.#config.threads[handle];
      for (const [threadId, tracked] of this.#tracked)
        if (tracked.handle === handle) this.#tracked.delete(threadId);
      if (!this.#config.trusted.length) this.#config.enabled = false;
    }
    if (command.operation !== 'status') this.#save();
    return this.#settings();
  }

  /** One polling pass; exported for tests. */
  async poll(): Promise<void> {
    if (this.#polling || !this.#available()) return;
    this.#polling = true;
    try {
      const { cursor, messages } = this.#deps.messages.inbound(this.#config.cursor ?? 0, 50);
      if (cursor !== this.#config.cursor) {
        this.#config.cursor = cursor;
        this.#save();
      }
      for (const message of messages) {
        const contact = this.#sender(message);
        if (contact) await this.#receive(contact, message.text.trim(), message.attachments);
      }
      this.#detail = '';
    } catch (error) {
      this.#detail = error instanceof Error ? error.message : 'Messages could not be read.';
    } finally {
      this.#polling = false;
    }
    this.#observe(this.#deps.controller.snapshot());
  }

  #settings(): MessagesRelaySettings {
    const access = this.#access();
    const running = this.#available();
    return {
      enabled: this.#config.enabled,
      running,
      ...(this.#config.agentId ? { agentId: this.#config.agentId } : {}),
      trusted: this.#config.trusted.map((entry) => ({ ...entry })),
      proactive: this.#config.proactive ?? true,
      access,
      detail:
        this.#detail ||
        (access === 'unavailable'
          ? 'Messages is not set up on this Mac.'
          : access === 'needs_full_disk_access'
            ? 'Give Sia Full Disk Access so it can read texts from your trusted numbers.'
            : !this.#config.trusted.length
              ? 'Add your phone number to text Sia from anywhere.'
              : running
                ? 'Text Sia from a trusted number. Sia replies in the same conversation.'
                : !this.#deps.controller.remoteAccessAllowed()
                  ? 'Sign in to Sia on your Mac to resume.'
                  : 'Turn on texting to reach Sia from your phone.'),
    };
  }

  #access(): MessagesRelaySettings['access'] {
    try {
      return this.#deps.messages.status();
    } catch {
      return 'unavailable';
    }
  }

  #available(): boolean {
    return (
      !this.#disposed &&
      this.#config.enabled &&
      this.#config.trusted.length > 0 &&
      this.#deps.controller.remoteAccessAllowed() &&
      this.#deps.controller.snapshot().agents.some(({ id }) => id === this.#config.agentId) &&
      this.#access() === 'ready'
    );
  }

  #save(): void {
    this.#deps.repository.put('messages-relay', 'settings', this.#config);
  }

  #trusted(handle: string): TrustedContact | undefined {
    return this.#config.trusted.find((entry) => entry.handle === handle);
  }

  /**
   * Texts must come from, or (texting yourself) be sent to, one of the person's own numbers.
   * In that self chat Messages can record both a sent and a received copy of the same text, and
   * Sia's own replies land there too, so those are skipped.
   */
  #sender(message: {
    handle: string;
    chatIdentifier: string;
    fromMe: boolean;
    text: string;
    attachments: string[];
  }) {
    const handle = normalizeHandle(message.fromMe ? message.chatIdentifier : message.handle);
    const contact = handle ? this.#trusted(handle) : undefined;
    if (!contact) return undefined;
    const text = [
      message.text.trim(),
      ...message.attachments.map((path) => basename(path)),
    ].join('\n');
    if (text.startsWith(REPLY_PREFIX.trim()) || this.#sent.includes(text)) return undefined;
    const now = this.#now();
    this.#recent = this.#recent.filter((entry) => now - entry.at < 60000);
    if (this.#recent.some((entry) => entry.handle === contact.handle && entry.text === text))
      return undefined;
    this.#recent.push({ handle: contact.handle, text, at: now });
    return contact;
  }

  async #receive(
    contact: TrustedContact,
    text: string,
    attachments: readonly string[] = [],
  ): Promise<void> {
    if (!text && !attachments.length) return;
    const handle = contact.handle;
    const notes = attachments.filter((path) => VOICE_NOTE.test(path)).slice(0, 2);
    if (notes.length) {
      const spoken: string[] = [];
      for (const note of notes) {
        try {
          if (!this.#deps.transcribe) throw new Error('unavailable');
          spoken.push(await this.#deps.transcribe(note));
        } catch {
          this.#reply(
            handle,
            "I couldn't understand that voice note. Turn on Sia's voice service on your Mac, or type it instead.",
          );
          return;
        }
      }
      text = [text, ...spoken].filter(Boolean).join('\n\n');
      attachments = attachments.filter((path) => !VOICE_NOTE.test(path));
      if (!text && !attachments.length) return;
    }
    const snapshot = this.#deps.controller.snapshot();
    const threadId = this.#config.threads[handle];
    const thread = snapshot.threads.find((entry) => entry.id === threadId && !entry.archivedAt);
    const command = text.toLowerCase().replace(/[.!]+$/, '');
    if (command === 'stop' || command === 'cancel') {
      if (thread && ['running', 'queued', 'waiting'].includes(thread.status)) {
        await this.#deps.controller.invoke('threads.cancel', { threadId: thread.id });
        this.#tracked.delete(thread.id);
        this.#reply(handle, 'Stopped.');
      } else this.#reply(handle, 'Nothing is running right now.');
      return;
    }
    if (command === 'new' || command === 'reset') {
      if (thread && ['running', 'queued', 'waiting'].includes(thread.status)) {
        this.#reply(handle, 'Text STOP first to cancel the current task.');
        return;
      }
      delete this.#config.threads[handle];
      this.#save();
      this.#reply(handle, 'Starting fresh. What should I do?');
      return;
    }
    if (command === 'help' || command === '?') {
      this.#reply(handle, HELP);
      return;
    }
    const question = thread ? this.#pendingQuestion(snapshot, thread.id) : undefined;
    if (thread && ['running', 'queued'].includes(thread.status) && !question) {
      this.#reply(handle, 'Still working on your last request. Text STOP to cancel it.');
      return;
    }
    if (thread?.status === 'waiting' && !question) {
      this.#reply(handle, 'Still waiting for your OK in Sia on your Mac. Text STOP to cancel.');
      return;
    }
    try {
      const target =
        thread?.id ??
        (
          await this.#deps.controller.invoke('threads.create', {
            agentId: this.#config.agentId!,
            title: `Text: ${(text || 'Photo').slice(0, 70)}`,
          })
        ).threadId;
      if (target !== threadId) {
        this.#config.threads[handle] = target;
        this.#save();
      }
      const attachmentIds = attachments.length
        ? (
            await this.#deps.controller.invoke('attachments.drop', {
              threadId: target,
              paths: [...attachments],
            })
          ).attachments.map(({ id }) => id)
        : [];
      const { turnId } = await this.#deps.controller.invoke('threads.send', {
        threadId: target,
        text,
        fromPhone: true,
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
      this.#tracked.set(target, {
        handle,
        turnId,
        started: this.#now(),
        acknowledged: Boolean(question),
        notified: new Set(),
      });
    } catch (error) {
      this.#reply(
        handle,
        `I couldn't start that: ${error instanceof Error ? error.message : 'Sia is unavailable.'}`,
      );
    }
  }

  #pendingQuestion(snapshot: DesktopSnapshot, threadId: string) {
    return snapshot.timeline.findLast(
      (item) =>
        item.threadId === threadId && item.kind === 'question' && item.status === 'pending',
    );
  }

  /** Scheduled turns for the texting assistant, started after Sia opened, are texted too. */
  #watchSchedules(snapshot: DesktopSnapshot): void {
    const handle = this.#config.trusted[0]?.handle;
    if (!handle || !(this.#config.proactive ?? true) || !this.#available()) return;
    for (const item of snapshot.timeline) {
      if (
        item.kind !== 'user' ||
        !item.scheduleRunId ||
        !item.turnId ||
        item.timestamp < this.#since ||
        this.#seenScheduled.has(item.turnId)
      )
        continue;
      this.#seenScheduled.add(item.turnId);
      const thread = snapshot.threads.find(({ id }) => id === item.threadId);
      if (!thread || thread.agentId !== this.#config.agentId || this.#tracked.has(thread.id))
        continue;
      this.#tracked.set(thread.id, {
        handle,
        turnId: item.turnId,
        started: this.#now(),
        // Scheduled work is quiet until it finishes or needs the person.
        acknowledged: true,
        notified: new Set(),
        schedule: thread.title,
      });
    }
  }

  #observe(snapshot: DesktopSnapshot): void {
    this.#watchSchedules(snapshot);
    for (const [threadId, tracked] of this.#tracked) {
      const thread = snapshot.threads.find(({ id }) => id === threadId);
      if (!thread) {
        this.#tracked.delete(threadId);
        continue;
      }
      for (const approval of snapshot.approvals) {
        if (
          approval.threadId !== threadId ||
          approval.status !== 'pending' ||
          tracked.notified.has(approval.id)
        )
          continue;
        tracked.notified.add(approval.id);
        tracked.acknowledged = true;
        this.#reply(
          tracked.handle,
          `I need your OK in Sia on your Mac to continue: ${approval.title}${approval.summary ? `. ${approval.summary}` : ''}`,
        );
      }
      const question = this.#pendingQuestion(snapshot, threadId);
      if (
        question &&
        question.turnId === tracked.turnId &&
        !tracked.notified.has(question.id)
      ) {
        tracked.notified.add(question.id);
        tracked.acknowledged = true;
        this.#reply(
          tracked.handle,
          question.text ?? 'I have a question. Reply here to answer.',
        );
        continue;
      }
      if (['running', 'queued', 'waiting'].includes(thread.status)) {
        if (
          !tracked.acknowledged &&
          this.#now() - tracked.started >= (this.#deps.ackAfterMs ?? 8000)
        ) {
          tracked.acknowledged = true;
          this.#reply(tracked.handle, "Working on it. I'll text you when it's done.");
        }
        continue;
      }
      this.#tracked.delete(threadId);
      const result = this.#result(snapshot, threadId, tracked.turnId);
      this.#reply(
        tracked.handle,
        tracked.schedule ? `Scheduled task “${tracked.schedule}”: ${result}` : result,
      );
      this.#sendResultFiles(snapshot, threadId, tracked);
    }
  }

  /** Saved results from the finished turn follow the reply as iMessage attachments. */
  #sendResultFiles(snapshot: DesktopSnapshot, threadId: string, tracked: Tracked): void {
    const files = snapshot.timeline
      .filter(
        (item) =>
          item.threadId === threadId &&
          item.turnId === tracked.turnId &&
          item.kind === 'assistant',
      )
      .flatMap((item) => item.attachments ?? [])
      .filter((file) => file.generated)
      .slice(0, 3);
    for (const file of files) {
      this.#outgoing = this.#outgoing
        .then(async () => {
          const { name, data } = await this.#deps.controller.readGeneratedResult(
            threadId,
            file.id,
          );
          const folder = await mkdtemp(join(tmpdir(), 'sia-text-'));
          try {
            const path = join(folder, basename(name));
            await writeFile(path, data, { mode: 0o600 });
            await this.#deps.messages.sendFile(tracked.handle, path);
          } finally {
            // Give Messages time to copy the file into its own attachment store.
            setTimeout(() => void rm(folder, { recursive: true, force: true }), 60000).unref();
          }
        })
        .catch(() => {
          this.#detail = `${file.name} could not be sent by text. It is saved in Sia on your Mac.`;
        });
    }
  }

  #result(snapshot: DesktopSnapshot, threadId: string, turnId: string): string {
    const items = snapshot.timeline.filter(
      (item) => item.threadId === threadId && item.turnId === turnId,
    );
    const answer = [
      ...new Set(
        items
          .filter((item) => item.kind === 'assistant')
          .map((item) => (item.text ?? '').trim())
          .filter(Boolean),
      ),
    ].join('\n\n');
    if (
      items.some(
        (item) => item.kind === 'notice' && /cancelled/i.test(`${item.title} ${item.text}`),
      )
    )
      return 'Stopped.';
    const error = items.findLast((item) => item.kind === 'error');
    if (!answer && error)
      return `That didn't work: ${error.text ?? error.title ?? 'open Sia on your Mac for details.'}`;
    return answer || 'Done.';
  }

  #reply(handle: string, text: string): void {
    let body = text
      .replace(/\[Open result\]\(<[^>]+>\)/g, '(saved on your Mac)')
      .replace(/\[([^\]]+)\]\((?:<([^>]+)>|([^)]+))\)/g, '$1 ($2$3)')
      .trim();
    if (body.length > MAX_REPLY)
      body = `${body.slice(0, MAX_REPLY).trimEnd()}… (the full answer is in Sia on your Mac)`;
    const message = `${REPLY_PREFIX}${body}`;
    this.#sent = [...this.#sent.slice(-49), message];
    this.#outgoing = this.#outgoing
      .then(() => this.#deps.messages.send(handle, message))
      .catch(() => {
        this.#detail =
          'A reply could not be sent. Check that Messages is signed in to iMessage.';
      });
  }

  /** Resolves once queued replies have been handed to Messages; for tests. */
  flush(): Promise<unknown> {
    return this.#outgoing;
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }
}
