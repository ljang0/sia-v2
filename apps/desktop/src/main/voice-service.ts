import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import type { RecordRepository } from './persistence.js';
import type { ManagedVoiceTokenType } from './cloud-client.js';
import type { VoiceView } from '../shared/bridge.js';

const API_ORIGIN = 'https://api.elevenlabs.io';
const LEGACY_CREDENTIAL_SCOPE = 'credentials';
const LEGACY_CREDENTIAL_ID = 'elevenlabs';
const PREFERENCE_SCOPE = 'voice';
const PREFERENCE_ID = 'managed';
const MAX_RECORDING_BYTES = 12 * 1024 * 1024;
const MAX_SPEECH_BYTES = 12 * 1024 * 1024;
const MAX_SPOKEN_CHARACTERS = 1_800;
const MAX_SPOKEN_SENTENCES = 8;
const SPOKEN_REMAINDER = 'I’ve left the remaining details on screen.';
const REALTIME_AUDIO_FORMAT = 'pcm_16000';
const REALTIME_CHUNK_BYTES = 512 * 1024;
const REALTIME_COMMIT_TIMEOUT_MS = 10_000;

export interface RealtimeSocket {
  readonly readyState: number;
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'error', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSocketFactory = (
  url: string,
  options: { headers: Record<string, string> },
) => RealtimeSocket;

interface RealtimeSession {
  socket: RealtimeSocket;
  receivedBytes: number;
  partialText: string;
  finalText: string;
  failure?: Error;
  commitRequested: boolean;
  resolveCommit?: (text: string) => void;
  rejectCommit?: (error: Error) => void;
}

interface StoredVoicePreference {
  voiceId: string;
  voiceName: string;
  voices: VoiceView['voices'];
}

export interface VoiceOperations {
  view(): VoiceView;
  prepareDictation?(): Promise<void>;
  refreshPermissions?(): Promise<void>;
  configure(): Promise<VoiceView>;
  refresh(): Promise<VoiceView>;
  select(voiceId: string): Promise<VoiceView>;
  disconnect(): VoiceView;
  transcribe(audioBase64: string, mimeType: string): Promise<string>;
  startRealtime(): Promise<{ sessionId: string }>;
  appendRealtime(sessionId: string, audioBase64: string): void;
  stopRealtime(sessionId: string, commit: boolean): Promise<string>;
  speak(
    text: string,
    voiceId?: string,
  ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' | 'audio/wav' }>;
  dispose?(): void;
}

export interface ManagedVoiceGateway {
  readonly configured: boolean;
  readonly personal?: boolean;
  voiceCatalog(signal?: AbortSignal): Promise<{
    provider: {
      available: boolean;
      voices: VoiceView['voices'];
      tokenTypes: ManagedVoiceTokenType[];
    };
  }>;
  mintVoiceToken(
    type: ManagedVoiceTokenType,
    signal?: AbortSignal,
  ): Promise<{
    token: string;
    type: ManagedVoiceTokenType;
    expiresAt: string;
    singleUse: true;
  }>;
}

/** Uses single-use credentials minted by Sia cloud or the device's personal voice gateway. */
export class ElevenLabsVoiceService implements VoiceOperations {
  readonly #repository: RecordRepository;
  readonly #gateway: ManagedVoiceGateway;
  readonly #fetch: typeof fetch;
  readonly #websocketFactory: RealtimeSocketFactory;
  readonly #realtimeSessions = new Map<string, RealtimeSession>();
  readonly #preferenceId: string;
  #preference: StoredVoicePreference | undefined;
  #voices: VoiceView['voices'] = [];

  constructor(options: {
    repository: RecordRepository;
    gateway: ManagedVoiceGateway;
    fetch?: typeof fetch;
    websocketFactory?: RealtimeSocketFactory;
  }) {
    this.#repository = options.repository;
    this.#gateway = options.gateway;
    this.#preferenceId = options.gateway.personal ? 'personal-elevenlabs' : PREFERENCE_ID;
    this.#fetch = options.fetch ?? fetch;
    this.#websocketFactory =
      options.websocketFactory ??
      ((url, socketOptions) => new WebSocket(url, socketOptions) as unknown as RealtimeSocket);
    const stored = parsePreference(
      this.#repository.get<unknown>(PREFERENCE_SCOPE, this.#preferenceId),
    );
    const legacy = parseLegacyCredential(
      this.#repository.get<unknown>(LEGACY_CREDENTIAL_SCOPE, LEGACY_CREDENTIAL_ID),
    );
    this.#preference = stored ?? (options.gateway.personal ? undefined : legacy);
    this.#voices = this.#preference?.voices ?? [];
    // Upgrade away from user-entered credentials immediately. Voice is refreshed from Sia.
    this.#repository.remove(LEGACY_CREDENTIAL_SCOPE, LEGACY_CREDENTIAL_ID);
    if (this.#preference) this.#persist();
  }

  view(): VoiceView {
    if (!this.#preference) {
      return {
        engine: 'elevenlabs',
        status: 'disconnected',
        voices: [],
        detail: this.#gateway.personal
          ? 'Your personal ElevenLabs voice is configured on this Mac. Enable voice to use it.'
          : this.#gateway.configured
            ? 'Sign in to Sia to use included voice.'
            : 'Voice is unavailable in this build.',
      };
    }
    return {
      engine: 'elevenlabs',
      status: 'connected',
      selectedVoiceId: this.#preference.voiceId,
      selectedVoiceName: this.#preference.voiceName,
      voices: structuredClone(this.#voices),
      detail: this.#gateway.personal
        ? 'Uses your personal ElevenLabs account. Speech is sent to ElevenLabs only when you use voice.'
        : 'Voice is included with Sia. Speech is sent to ElevenLabs only when you use it.',
    };
  }

  async configure(): Promise<VoiceView> {
    return await this.refresh();
  }

  async refresh(): Promise<VoiceView> {
    if (!this.#gateway.configured) throw new Error('Sia voice is unavailable in this build.');
    const catalog = await this.#gateway.voiceCatalog(AbortSignal.timeout(20_000));
    if (!catalog.provider.available) throw new Error('Sia voice is temporarily unavailable.');
    const voices = parseVoices(
      catalog.provider.voices,
      this.#preference
        ? { id: this.#preference.voiceId, name: this.#preference.voiceName }
        : undefined,
    );
    const selected =
      voices.find((voice) => voice.id === this.#preference?.voiceId) ?? voices[0];
    if (!selected) throw new Error('No Sia voices are currently available.');
    this.#voices = voices;
    this.#preference = {
      voiceId: selected.id,
      voiceName: selected.name,
      voices,
    };
    this.#persist();
    return this.view();
  }

  async select(voiceIdValue: string): Promise<VoiceView> {
    this.#requirePreference();
    const voiceId = voiceIdValue.trim();
    let selected = this.#voices.find((voice) => voice.id === voiceId);
    if (!selected) {
      await this.refresh();
      selected = this.#voices.find((voice) => voice.id === voiceId);
    }
    if (!selected) throw new Error('That ElevenLabs voice is no longer available.');
    this.#preference = {
      voiceId: selected.id,
      voiceName: selected.name,
      voices: this.#voices,
    };
    this.#persist();
    return this.view();
  }

  disconnect(): VoiceView {
    this.#closeRealtimeSessions();
    this.#preference = undefined;
    this.#voices = [];
    this.#repository.remove(PREFERENCE_SCOPE, this.#preferenceId);
    return this.view();
  }

  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    this.#requirePreference();
    if (!/^audio\/(?:webm|mp4|ogg|wav|mpeg)(?:;[A-Za-z0-9=._-]+)?$/i.test(mimeType)) {
      throw new Error('That audio format is not supported.');
    }
    const audio = decodeBase64(audioBase64);
    if (!audio.length) throw new Error('Record something before transcribing.');
    if (audio.length > MAX_RECORDING_BYTES) throw new Error('The recording is too large.');

    const form = new FormData();
    const audioBytes = Uint8Array.from(audio);
    form.append(
      'file',
      new Blob([audioBytes.buffer], { type: mimeType }),
      recordingName(mimeType),
    );
    form.append('model_id', 'scribe_v2');
    form.append('no_verbatim', 'true');
    const { token } = await this.#gateway.mintVoiceToken(
      'batch_scribe',
      AbortSignal.timeout(20_000),
    );
    const response = await this.#request(
      `/v1/speech-to-text?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(45_000),
      },
    );
    const value = (await response.json()) as { text?: unknown };
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (!text) throw new Error('No speech was detected.');
    return text.slice(0, 200_000);
  }

  async startRealtime(): Promise<{ sessionId: string }> {
    this.#requirePreference();
    const { token } = await this.#gateway.mintVoiceToken(
      'realtime_scribe',
      AbortSignal.timeout(20_000),
    );
    const url = new URL('/v1/speech-to-text/realtime', API_ORIGIN);
    url.protocol = 'wss:';
    url.searchParams.set('model_id', 'scribe_v2_realtime');
    url.searchParams.set('audio_format', REALTIME_AUDIO_FORMAT);
    url.searchParams.set('commit_strategy', 'manual');
    url.searchParams.set('no_verbatim', 'true');
    url.searchParams.set('token', token);
    const socket = this.#websocketFactory(url.toString(), {
      headers: {},
    });
    const sessionId = randomUUID();
    const session: RealtimeSession = {
      socket,
      receivedBytes: 0,
      partialText: '',
      finalText: '',
      commitRequested: false,
    };
    this.#realtimeSessions.set(sessionId, session);
    this.#observeRealtimeSession(sessionId, session);

    try {
      await waitForSocketOpen(socket);
    } catch {
      this.#realtimeSessions.delete(sessionId);
      socket.close();
      throw new Error('ElevenLabs realtime transcription could not connect.');
    }
    return { sessionId };
  }

  appendRealtime(sessionId: string, audioBase64: string): void {
    const session = this.#requireRealtimeSession(sessionId);
    if (session.failure) {
      this.#realtimeSessions.delete(sessionId);
      session.socket.close();
      throw session.failure;
    }
    if (session.commitRequested) throw new Error('This voice recording is already finishing.');
    const bytes = decodeRealtimeChunk(audioBase64);
    if (session.receivedBytes + bytes.length > MAX_RECORDING_BYTES) {
      throw new Error('The recording is too large.');
    }
    if (session.socket.readyState !== WebSocket.OPEN) {
      throw new Error('ElevenLabs realtime transcription disconnected.');
    }
    session.receivedBytes += bytes.length;
    session.socket.send(
      JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: audioBase64,
        sample_rate: 16_000,
      }),
    );
  }

  async stopRealtime(sessionId: string, commit: boolean): Promise<string> {
    const session = this.#requireRealtimeSession(sessionId);
    if (!commit) {
      this.#realtimeSessions.delete(sessionId);
      session.socket.close(1_000, 'discarded');
      return '';
    }
    if (!session.receivedBytes) {
      this.#realtimeSessions.delete(sessionId);
      session.socket.close(1_000, 'empty');
      throw new Error('No speech was detected.');
    }
    if (session.failure) {
      this.#realtimeSessions.delete(sessionId);
      session.socket.close();
      throw session.failure;
    }
    if (session.commitRequested) throw new Error('This voice recording is already finishing.');
    session.commitRequested = true;
    let commitTimeout: ReturnType<typeof setTimeout> | undefined;
    const transcriptPromise = new Promise<string>((resolve, reject) => {
      commitTimeout = setTimeout(() => {
        reject(new Error('ElevenLabs realtime transcription timed out.'));
      }, REALTIME_COMMIT_TIMEOUT_MS);
      session.resolveCommit = (text) => {
        if (commitTimeout) clearTimeout(commitTimeout);
        resolve(text);
      };
      session.rejectCommit = (error) => {
        if (commitTimeout) clearTimeout(commitTimeout);
        reject(error);
      };
    });
    try {
      session.socket.send(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: '',
          sample_rate: 16_000,
          commit: true,
        }),
      );
      const transcript = await transcriptPromise;
      const text = transcript.trim();
      if (!text) throw new Error('No speech was detected.');
      return text.slice(0, 200_000);
    } finally {
      if (commitTimeout) clearTimeout(commitTimeout);
      this.#realtimeSessions.delete(sessionId);
      session.socket.close(1_000, 'complete');
    }
  }

  dispose(): void {
    this.#closeRealtimeSessions();
  }

  async speak(
    textValue: string,
    voiceIdValue?: string,
  ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }> {
    const preference = this.#requirePreference();
    const voiceId = voiceIdValue?.trim() || preference.voiceId;
    if (!this.#voices.some((voice) => voice.id === voiceId)) {
      throw new Error(
        'This agent’s ElevenLabs voice is no longer available. Choose another voice.',
      );
    }
    const text = spokenSummary(textValue);
    if (!text) throw new Error('There is no text to read aloud.');
    const { token } = await this.#gateway.mintVoiceToken(
      'tts_websocket',
      AbortSignal.timeout(20_000),
    );
    const url = new URL(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream-input`,
      API_ORIGIN,
    );
    url.protocol = 'wss:';
    url.searchParams.set('model_id', 'eleven_multilingual_v2');
    url.searchParams.set('output_format', 'mp3_44100_128');
    url.searchParams.set('single_use_token', token);
    const socket = this.#websocketFactory(url.toString(), { headers: {} });
    const audio = await streamSpeech(socket, text);
    return { audioBase64: audio.toString('base64'), mimeType: 'audio/mpeg' };
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(`${API_ORIGIN}${path}`, {
        ...init,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error('ElevenLabs timed out. Try again.');
      }
      throw new Error('ElevenLabs could not be reached.');
    }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) {
      throw new Error('The voice session expired or lacks access. Try again.');
    }
    if (response.status === 429) throw new Error('ElevenLabs usage is temporarily limited.');
    throw new Error(`ElevenLabs request failed (${response.status}).`);
  }

  #requirePreference(): StoredVoicePreference {
    if (!this.#preference)
      throw new Error(
        this.#gateway.personal
          ? 'Enable ElevenLabs voice in Settings → Voice.'
          : 'Sign in to Sia to use included voice.',
      );
    return this.#preference;
  }

  #requireRealtimeSession(sessionId: string): RealtimeSession {
    const session = this.#realtimeSessions.get(sessionId);
    if (!session) throw new Error('That voice recording is no longer active.');
    return session;
  }

  #observeRealtimeSession(sessionId: string, session: RealtimeSession): void {
    session.socket.on('message', (data) => {
      const message = parseRealtimeMessage(data);
      if (!message) return;
      const type = stringValue(message.message_type) ?? stringValue(message.type);
      const text = stringValue(message.text)?.trim() ?? '';
      if (type === 'partial_transcript') {
        session.partialText = text;
      } else if (type === 'final_transcript') {
        session.finalText = text || session.finalText;
      } else if (type === 'committed_transcript') {
        session.resolveCommit?.(text || session.finalText || session.partialText);
      } else if (type && isRealtimeError(type)) {
        const error = new Error(
          type === 'rate_limited' || type === 'quota_exceeded'
            ? 'ElevenLabs usage is temporarily limited.'
            : type === 'auth_error'
              ? 'The voice session expired or lacks speech-to-text access.'
              : 'ElevenLabs realtime transcription failed.',
        );
        session.failure = error;
        session.rejectCommit?.(error);
      }
    });
    session.socket.on('error', () => {
      const error = new Error('ElevenLabs realtime transcription disconnected.');
      session.failure = error;
      session.rejectCommit?.(error);
    });
    session.socket.on('close', () => {
      if (session.commitRequested && !session.failure) {
        session.resolveCommit?.(session.finalText || session.partialText);
      }
      if (this.#realtimeSessions.get(sessionId) === session && !session.commitRequested) {
        this.#realtimeSessions.delete(sessionId);
      }
    });
  }

  #closeRealtimeSessions(): void {
    for (const session of this.#realtimeSessions.values()) {
      const error = new Error('Voice transcription was stopped.');
      session.failure = error;
      session.rejectCommit?.(error);
      session.socket.close(1_000, 'stopped');
    }
    this.#realtimeSessions.clear();
  }

  #persist(): void {
    if (this.#preference) {
      this.#repository.put(PREFERENCE_SCOPE, this.#preferenceId, this.#preference);
    }
  }
}

function parsePreference(value: unknown): StoredVoicePreference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.voiceId !== 'string' ||
    !candidate.voiceId ||
    typeof candidate.voiceName !== 'string' ||
    !candidate.voiceName
  ) {
    return undefined;
  }
  return {
    voiceId: candidate.voiceId,
    voiceName: candidate.voiceName,
    voices: parseVoices(candidate.voices, {
      id: candidate.voiceId,
      name: candidate.voiceName,
    }),
  };
}

function parseLegacyCredential(value: unknown): StoredVoicePreference | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.apiKey !== 'string') return undefined;
  return parsePreference(candidate);
}

function parseVoices(
  value: unknown,
  selected?: VoiceView['voices'][number],
): VoiceView['voices'] {
  const voices = (Array.isArray(value) ? value : [])
    .filter((voice): voice is Record<string, unknown> =>
      Boolean(voice && typeof voice === 'object' && !Array.isArray(voice)),
    )
    .flatMap((voice) => {
      if (
        typeof voice.id !== 'string' ||
        !voice.id ||
        voice.id.length > 200 ||
        typeof voice.name !== 'string' ||
        !voice.name.trim()
      ) {
        return [];
      }
      return [
        {
          id: voice.id,
          name: voice.name.trim().slice(0, 120),
          ...(typeof voice.category === 'string' && voice.category
            ? { category: voice.category.slice(0, 80) }
            : {}),
        },
      ];
    })
    .slice(0, 50);
  if (!selected || voices.some((voice) => voice.id === selected.id)) return voices;
  return [selected, ...voices];
}

function decodeBase64(value: string): Buffer {
  if (!value || value.length > Math.ceil((MAX_RECORDING_BYTES * 4) / 3) + 8) {
    throw new Error('The recording is too large.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('The recording is invalid.');
  return Buffer.from(value, 'base64');
}

function decodeRealtimeChunk(value: string): Buffer {
  if (!value || value.length > Math.ceil((REALTIME_CHUNK_BYTES * 4) / 3) + 8) {
    throw new Error('The voice audio chunk is too large.');
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('The voice audio is invalid.');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > REALTIME_CHUNK_BYTES) {
    throw new Error('The voice audio chunk is invalid.');
  }
  return bytes;
}

function waitForSocketOpen(socket: RealtimeSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out.')), 10_000);
    socket.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Connection failed.'));
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      reject(new Error('Connection closed.'));
    });
  });
}

function streamSpeech(socket: RealtimeSocket, text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error('ElevenLabs speech generation timed out.'));
    }, 45_000);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close(error ? 1_011 : 1_000, error ? 'failed' : 'complete');
      if (error) {
        reject(error);
        return;
      }
      const audio = Buffer.concat(chunks);
      if (!audio.length) {
        reject(new Error('ElevenLabs returned empty audio.'));
        return;
      }
      resolve(audio);
    };

    const start = () => {
      socket.send(
        JSON.stringify({
          text: ' ',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      );
      socket.send(JSON.stringify({ text: `${text} ` }));
      socket.send(JSON.stringify({ text: '' }));
    };
    socket.on('open', start);
    socket.on('message', (data) => {
      const message = parseRealtimeMessage(data);
      if (!message) return;
      const audioBase64 = stringValue(message.audio);
      if (audioBase64) {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) {
          finish(new Error('ElevenLabs returned invalid audio.'));
          return;
        }
        const chunk = Buffer.from(audioBase64, 'base64');
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_SPEECH_BYTES) {
          finish(new Error('The generated speech is too large.'));
          return;
        }
        chunks.push(chunk);
      }
      if (message.is_final === true || message.isFinal === true) finish();
      const error = stringValue(message.error);
      if (error) finish(new Error('ElevenLabs speech generation failed.'));
    });
    socket.on('error', () => finish(new Error('ElevenLabs could not be reached.')));
    socket.on('close', () => {
      if (!settled) finish(new Error('ElevenLabs speech generation disconnected.'));
    });
    if (socket.readyState === WebSocket.OPEN) queueMicrotask(start);
  });
}

function parseRealtimeMessage(value: unknown): Record<string, unknown> | undefined {
  try {
    const text =
      typeof value === 'string'
        ? value
        : Buffer.isBuffer(value)
          ? value.toString('utf8')
          : value instanceof ArrayBuffer
            ? Buffer.from(value).toString('utf8')
            : String(value);
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRealtimeError(type: string): boolean {
  return (
    type === 'error' ||
    type.endsWith('_error') ||
    /^(?:quota_exceeded|commit_throttled|unaccepted_terms|rate_limited|queue_overflow|resource_exhausted|session_time_limit_exceeded|chunk_size_exceeded|insufficient_audio_activity)$/.test(
      type,
    )
  );
}

function recordingName(mimeType: string): string {
  if (/mp4/i.test(mimeType)) return 'recording.m4a';
  if (/ogg/i.test(mimeType)) return 'recording.ogg';
  if (/wav/i.test(mimeType)) return 'recording.wav';
  if (/mpeg/i.test(mimeType)) return 'recording.mp3';
  return 'recording.webm';
}

function speechText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' A code example is available on screen. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s*|>\s*)/gm, '')
    .replace(/^\s{0,3}(?:[-*+] |\d+[.)] )/gm, '. ')
    .replace(/[*_~]/g, '')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/(?:\.\s*){2,}/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Makes playback concise and always ends at a sentence boundary. */
export function spokenSummary(value: string): string {
  const text = speechText(value);
  if (!text) return '';
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((part) => part.trim()) ?? [
    text,
  ];
  const selected: string[] = [];
  let characters = 0;
  for (const sentence of sentences) {
    if (!sentence) continue;
    const nextLength = characters + sentence.length + (selected.length ? 1 : 0);
    if (selected.length >= MAX_SPOKEN_SENTENCES || nextLength > MAX_SPOKEN_CHARACTERS) break;
    selected.push(sentence);
    characters = nextLength;
  }
  if (selected.length === sentences.length) return selected.join(' ');
  if (!selected.length) {
    return `This reply is too long to read naturally. ${SPOKEN_REMAINDER}`;
  }
  return `${selected.join(' ')} ${SPOKEN_REMAINDER}`;
}
