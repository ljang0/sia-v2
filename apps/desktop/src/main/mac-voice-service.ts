import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { VoiceView } from '../shared/bridge.js';
import type { RecordRepository } from './persistence.js';
import { spokenSummary, type VoiceOperations } from './voice-service.js';

const catalogSchema = z.object({
  voices: z
    .array(
      z.object({
        id: z.string().max(256),
        name: z.string().max(256),
        category: z.string().max(64),
      }),
    )
    .max(400),
  defaultVoiceId: z.string().max(256),
  dictationAvailable: z.boolean(),
});
const responseSchema = z
  .object({
    id: z.string().uuid(),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.string().max(80).optional(),
  })
  .strict();
const messages: Record<string, string> = {
  on_device_unavailable:
    'On-device dictation is not available for this Mac’s current language. Read aloud still works. Check your language and Dictation settings in System Settings → Keyboard.',
  speech_permission:
    'Allow Sia Voice in System Settings → Privacy & Security → Speech Recognition, then try again.',
  recognition_failed: 'Mac dictation could not finish. Try a shorter recording.',
  session_expired: 'This recording expired. Please try again.',
  voice_unavailable:
    'This Mac voice is unavailable. Refresh voices and choose another installed voice.',
  speech_failed:
    'macOS could not generate speech with this voice. Choose another installed voice.',
  busy: 'Another voice operation is still finishing. Please try again.',
};
export interface MacSpeechTransport {
  readonly closed: boolean;
  request(
    command: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  send(command: Record<string, unknown>): void;
  dispose(): void;
}

/** Dedicated bundled helper, inherited pipes only; no credentials, shell, or audio files. */
export function createMacSpeechTransport(executable: string): MacSpeechTransport {
  const child = spawn(executable, ['--speech'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' },
  });
  let buffer = '';
  let closed = false;
  const pending = new Map<
    string,
    {
      resolve(value: Record<string, unknown>): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const stop = (message = 'Mac voice stopped unexpectedly. Please try again.') => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    pending.clear();
    child.stdin.end();
    child.kill();
    const force = setTimeout(() => child.kill('SIGKILL'), 1000);
    force.unref();
    child.once('exit', () => clearTimeout(force));
  };
  const send = (command: Record<string, unknown>) => {
    if (closed || !child.stdin.writable)
      throw new Error('Mac voice stopped unexpectedly. Please try again.');
    if (child.stdin.writableLength > 1024 * 1024) {
      stop('Mac voice could not keep up with audio. Try again.');
      return;
    }
    child.stdin.write(`${JSON.stringify(command)}\n`);
  };
  const heartbeat = setInterval(() => {
    if (!closed) {
      try {
        send({ type: 'ping' });
      } catch {
        stop();
      }
    }
  }, 5000);
  heartbeat.unref();
  child.on('error', () => stop());
  child.on('exit', () => stop());
  child.stdin.on('error', () => stop());
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 18 * 1024 * 1024) {
      stop('Mac voice returned too much audio.');
      return;
    }
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const response = responseSchema.parse(JSON.parse(line));
        const item = pending.get(response.id);
        if (!item) continue;
        pending.delete(response.id);
        clearTimeout(item.timer);
        if (response.error)
          item.reject(
            new Error(messages[response.error] ?? 'Mac voice could not complete the request.'),
          );
        else if (response.result) item.resolve(response.result);
        else item.reject(new Error('Mac voice returned an incomplete response.'));
      } catch {
        stop('Mac voice returned an invalid response.');
      }
    }
  });
  return {
    get closed() {
      return closed;
    },
    send,
    request(command, timeoutMs = 30_000) {
      if (closed)
        return Promise.reject(new Error('Mac voice stopped unexpectedly. Please try again.'));
      if (pending.size >= 4)
        return Promise.reject(new Error('Mac voice is busy. Please try again.'));
      const id = typeof command.id === 'string' ? command.id : randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => stop('Mac voice timed out. Please try again.'),
          timeoutMs,
        );
        timer.unref();
        pending.set(id, { resolve, reject, timer });
        try {
          send({ ...command, id });
        } catch {
          stop();
        }
      });
    },
    dispose: () => stop(),
  };
}

export class MacVoiceService implements VoiceOperations {
  #transport: MacSpeechTransport | undefined;
  #view: VoiceView;
  #generation = 0;
  #sessions = new Map<string, number>();
  constructor(
    private readonly repository: RecordRepository,
    private readonly factory: () => MacSpeechTransport,
  ) {
    // Preserve the existing migration away from legacy user-entered speech keys.
    repository.remove('credentials', 'elevenlabs');
    const stored = z
      .object({
        selectedVoiceId: z.string().max(256),
        selectedVoiceName: z.string().max(256),
        voices: catalogSchema.shape.voices,
        dictationAvailable: z.boolean(),
      })
      .safeParse(repository.get('voice', 'macos'));
    this.#view = {
      engine: 'macos',
      status: stored.success ? 'connected' : 'disconnected',
      voices: stored.success ? stored.data.voices : [],
      ...(stored.success ? stored.data : {}),
      ...(stored.success && !stored.data.dictationAvailable
        ? { dictationDetail: messages.on_device_unavailable }
        : {}),
      detail:
        'Uses installed Mac voices for read aloud. No cloud account or API key is needed. Dictation stays on this Mac when supported.',
    };
  }
  view(): VoiceView {
    return structuredClone(this.#view);
  }
  #pipe() {
    if (this.#transport?.closed) {
      this.#sessions.clear();
      this.#transport = undefined;
    }
    return (this.#transport ??= this.factory());
  }
  #recordingPipe() {
    if (!this.#transport || this.#transport.closed) {
      this.#sessions.clear();
      throw new Error('Mac voice stopped during this recording. Please record again.');
    }
    return this.#transport;
  }
  #guard(generation: number) {
    if (generation !== this.#generation) throw new Error('Voice setup was cancelled.');
  }
  #connected() {
    if (this.#view.status !== 'connected') throw new Error('Enable Mac voice first.');
  }
  #save() {
    this.repository.put('voice', 'macos', {
      selectedVoiceId: this.#view.selectedVoiceId,
      selectedVoiceName: this.#view.selectedVoiceName,
      voices: this.#view.voices,
      dictationAvailable: this.#view.dictationAvailable,
    });
  }
  async configure(): Promise<VoiceView> {
    this.dispose();
    return this.refresh();
  }
  async refresh(): Promise<VoiceView> {
    const generation = this.#generation;
    const catalog = catalogSchema.parse(await this.#pipe().request({ type: 'catalog' }));
    this.#guard(generation);
    const selected =
      catalog.voices.find(({ id }) => id === this.#view.selectedVoiceId) ??
      catalog.voices.find(({ id }) => id === catalog.defaultVoiceId) ??
      catalog.voices[0];
    if (!selected)
      throw new Error(
        'No installed Mac voices were found. Add a voice in System Settings → Accessibility → Spoken Content.',
      );
    this.#view = {
      ...this.#view,
      status: 'connected',
      voices: catalog.voices,
      selectedVoiceId: selected.id,
      selectedVoiceName: selected.name,
      dictationAvailable: catalog.dictationAvailable,
      ...(catalog.dictationAvailable
        ? { dictationDetail: undefined }
        : { dictationDetail: messages.on_device_unavailable }),
    };
    this.#save();
    return this.view();
  }
  async select(voiceId: string): Promise<VoiceView> {
    this.#connected();
    const selected = this.#view.voices.find(({ id }) => id === voiceId);
    if (!selected) throw new Error('Choose an installed Mac voice.');
    this.#view.selectedVoiceId = selected.id;
    this.#view.selectedVoiceName = selected.name;
    this.#save();
    return this.view();
  }
  disconnect(): VoiceView {
    this.dispose();
    this.repository.remove('voice', 'macos');
    this.#view = {
      engine: 'macos',
      status: 'disconnected',
      voices: [],
      detail: 'Use the voices installed on your Mac. No cloud account is required.',
    };
    return this.view();
  }
  async prepareDictation(): Promise<void> {
    this.#connected();
    const generation = this.#generation;
    await this.#pipe().request({ type: 'authorize' }, 60_000);
    this.#guard(generation);
  }
  async startRealtime(): Promise<{ sessionId: string }> {
    this.#connected();
    const generation = this.#generation;
    await this.prepareDictation();
    this.#guard(generation);
    const sessionId = randomUUID();
    await this.#recordingPipe().request({ type: 'start', id: sessionId });
    this.#guard(generation);
    this.#sessions.set(sessionId, 0);
    return { sessionId };
  }
  appendRealtime(sessionId: string, audioBase64: string): void {
    const pipe = this.#recordingPipe();
    const previous = this.#sessions.get(sessionId);
    if (previous === undefined) throw new Error('This Mac recording is no longer active.');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64) || audioBase64.length > 700_000)
      throw new Error('Invalid voice audio.');
    const audio = Buffer.from(audioBase64, 'base64');
    if (audio.length % 2 || previous + audio.length > 12 * 1024 * 1024)
      throw new Error('This recording is too large or has an invalid format.');
    this.#sessions.set(sessionId, previous + audio.length);
    for (let start = 0; start < audio.length; start += 24_000)
      pipe.send({
        type: 'audio',
        id: randomUUID(),
        sessionId,
        audioBase64: audio.subarray(start, start + 24_000).toString('base64'),
      });
  }
  async stopRealtime(sessionId: string, commit: boolean): Promise<string> {
    if (!this.#sessions.has(sessionId)) return '';
    this.#sessions.delete(sessionId);
    const generation = this.#generation;
    const result = await this.#recordingPipe().request(
      { type: 'finish', sessionId, commit },
      12_000,
    );
    this.#guard(generation);
    return commit ? z.string().max(20_000).parse(result.text) : '';
  }
  async transcribe(): Promise<string> {
    throw new Error('Mac dictation uses live recording. Use the microphone button or hold Fn.');
  }
  async speak(
    text: string,
    voiceId?: string,
  ): Promise<{ audioBase64: string; mimeType: 'audio/wav' }> {
    this.#connected();
    const generation = this.#generation;
    const selected = voiceId ?? this.#view.selectedVoiceId;
    if (!this.#view.voices.some(({ id }) => id === selected))
      throw new Error('Choose an installed Mac voice for this agent.');
    const summary = spokenSummary(text);
    if (!summary) throw new Error('There is no text to read aloud.');
    const result = await this.#pipe().request(
      { type: 'speak', text: summary, voiceId: selected },
      45_000,
    );
    this.#guard(generation);
    const audioBase64 = z
      .string()
      .max(17 * 1024 * 1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .parse(result.audioBase64);
    const audio = Buffer.from(audioBase64, 'base64');
    if (
      audio.length < 44 ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 12) !== 'WAVE'
    )
      throw new Error('Mac voice returned invalid audio.');
    return { audioBase64, mimeType: 'audio/wav' };
  }
  dispose(): void {
    this.#generation++;
    this.#sessions.clear();
    this.#transport?.dispose();
    this.#transport = undefined;
  }
}
