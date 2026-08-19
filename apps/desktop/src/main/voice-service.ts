import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import type { RecordRepository } from './persistence.js';
import type { VoiceView } from '../shared/bridge.js';

const API_ORIGIN = 'https://api.elevenlabs.io';
const CREDENTIAL_SCOPE = 'credentials';
const CREDENTIAL_ID = 'elevenlabs';
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

interface StoredVoiceCredential {
  apiKey: string;
  voiceId: string;
  voiceName: string;
  voices: VoiceView['voices'];
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
}

interface VoiceListResponse {
  voices?: ElevenLabsVoice[];
}

export interface VoiceOperations {
  view(): VoiceView;
  configure(apiKey: string): Promise<VoiceView>;
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
  ): Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }>;
  dispose?(): void;
}

/** Keeps the ElevenLabs credential and network boundary in the main process. */
export class ElevenLabsVoiceService implements VoiceOperations {
  readonly #repository: RecordRepository;
  readonly #fetch: typeof fetch;
  readonly #websocketFactory: RealtimeSocketFactory;
  readonly #realtimeSessions = new Map<string, RealtimeSession>();
  #credential: StoredVoiceCredential | undefined;
  #voices: VoiceView['voices'] = [];

  constructor(options: {
    repository: RecordRepository;
    fetch?: typeof fetch;
    websocketFactory?: RealtimeSocketFactory;
  }) {
    this.#repository = options.repository;
    this.#fetch = options.fetch ?? fetch;
    this.#websocketFactory =
      options.websocketFactory ??
      ((url, socketOptions) => new WebSocket(url, socketOptions) as unknown as RealtimeSocket);
    const stored = parseCredential(
      this.#repository.get<unknown>(CREDENTIAL_SCOPE, CREDENTIAL_ID),
    );
    if (stored) {
      this.#credential = stored;
      this.#voices = stored.voices;
    }
  }

  view(): VoiceView {
    if (!this.#credential) return { status: 'disconnected', voices: [] };
    return {
      status: 'connected',
      selectedVoiceId: this.#credential.voiceId,
      selectedVoiceName: this.#credential.voiceName,
      voices: structuredClone(this.#voices),
      detail: 'Speech is processed by ElevenLabs only when you use a voice control.',
    };
  }

  async configure(apiKeyValue: string): Promise<VoiceView> {
    const apiKey = apiKeyValue.trim();
    if (!validApiKey(apiKey)) throw new Error('Enter a valid ElevenLabs API key.');
    const voices = await this.#listVoices(apiKey);
    const selected =
      voices.find((voice) => voice.id === this.#credential?.voiceId) ?? voices[0];
    if (!selected) throw new Error('No ElevenLabs voices are available for this account.');
    this.#credential = {
      apiKey,
      voiceId: selected.id,
      voiceName: selected.name,
      voices,
    };
    this.#voices = voices;
    this.#persist();
    return this.view();
  }

  async refresh(): Promise<VoiceView> {
    const credential = this.#requireCredential();
    const voices = await this.#listVoices(credential.apiKey);
    const selected = voices.find((voice) => voice.id === credential.voiceId) ?? voices[0];
    if (!selected) throw new Error('No ElevenLabs voices are available for this account.');
    this.#voices = voices;
    this.#credential = {
      ...credential,
      voiceId: selected.id,
      voiceName: selected.name,
      voices,
    };
    this.#persist();
    return this.view();
  }

  async select(voiceIdValue: string): Promise<VoiceView> {
    const credential = this.#requireCredential();
    const voiceId = voiceIdValue.trim();
    let selected = this.#voices.find((voice) => voice.id === voiceId);
    if (!selected) {
      this.#voices = await this.#listVoices(credential.apiKey);
      selected = this.#voices.find((voice) => voice.id === voiceId);
    }
    if (!selected) throw new Error('That ElevenLabs voice is no longer available.');
    this.#credential = {
      ...credential,
      voiceId: selected.id,
      voiceName: selected.name,
      voices: this.#voices,
    };
    this.#persist();
    return this.view();
  }

  disconnect(): VoiceView {
    this.#closeRealtimeSessions();
    this.#credential = undefined;
    this.#voices = [];
    this.#repository.remove(CREDENTIAL_SCOPE, CREDENTIAL_ID);
    return this.view();
  }

  async transcribe(audioBase64: string, mimeType: string): Promise<string> {
    const credential = this.#requireCredential();
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
    const response = await this.#request('/v1/speech-to-text', credential.apiKey, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    const value = (await response.json()) as { text?: unknown };
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (!text) throw new Error('No speech was detected.');
    return text.slice(0, 200_000);
  }

  async startRealtime(): Promise<{ sessionId: string }> {
    const credential = this.#requireCredential();
    const url = new URL('/v1/speech-to-text/realtime', API_ORIGIN);
    url.protocol = 'wss:';
    url.searchParams.set('model_id', 'scribe_v2_realtime');
    url.searchParams.set('audio_format', REALTIME_AUDIO_FORMAT);
    url.searchParams.set('commit_strategy', 'manual');
    url.searchParams.set('no_verbatim', 'true');
    const socket = this.#websocketFactory(url.toString(), {
      headers: { 'xi-api-key': credential.apiKey },
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
    const credential = this.#requireCredential();
    const voiceId = voiceIdValue?.trim() || credential.voiceId;
    if (!this.#voices.some((voice) => voice.id === voiceId)) {
      throw new Error(
        'This agent’s ElevenLabs voice is no longer available. Choose another voice.',
      );
    }
    const text = spokenSummary(textValue);
    if (!text) throw new Error('There is no text to read aloud.');
    const response = await this.#request(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      credential.apiKey,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_SPEECH_BYTES)
      throw new Error('The generated speech is too large.');
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error('ElevenLabs returned empty audio.');
    if (audio.length > MAX_SPEECH_BYTES) throw new Error('The generated speech is too large.');
    return { audioBase64: audio.toString('base64'), mimeType: 'audio/mpeg' };
  }

  async #listVoices(apiKey: string): Promise<VoiceView['voices']> {
    const response = await this.#request(
      '/v2/voices?page_size=50&sort=name&sort_direction=asc&include_total_count=false',
      apiKey,
      { method: 'GET', signal: AbortSignal.timeout(20_000) },
    );
    const payload = (await response.json()) as VoiceListResponse;
    return (Array.isArray(payload.voices) ? payload.voices : [])
      .filter(
        (voice) =>
          typeof voice.voice_id === 'string' &&
          voice.voice_id.length > 0 &&
          typeof voice.name === 'string' &&
          voice.name.trim().length > 0,
      )
      .map((voice) => ({
        id: voice.voice_id,
        name: voice.name.trim().slice(0, 120),
        ...(voice.category ? { category: voice.category.slice(0, 80) } : {}),
      }));
  }

  async #request(path: string, apiKey: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(`${API_ORIGIN}${path}`, {
        ...init,
        headers: { ...init.headers, 'xi-api-key': apiKey },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error('ElevenLabs timed out. Try again.');
      }
      throw new Error('ElevenLabs could not be reached.');
    }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403) {
      throw new Error('The ElevenLabs API key was rejected or lacks voice access.');
    }
    if (response.status === 429) throw new Error('ElevenLabs usage is temporarily limited.');
    throw new Error(`ElevenLabs request failed (${response.status}).`);
  }

  #requireCredential(): StoredVoiceCredential {
    if (!this.#credential) throw new Error('Connect ElevenLabs in Settings first.');
    return this.#credential;
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
              ? 'The ElevenLabs API key was rejected or lacks speech-to-text access.'
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
    if (this.#credential) {
      this.#repository.put(CREDENTIAL_SCOPE, CREDENTIAL_ID, this.#credential);
    }
  }
}

function parseCredential(value: unknown): StoredVoiceCredential | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.apiKey !== 'string' ||
    !validApiKey(candidate.apiKey) ||
    typeof candidate.voiceId !== 'string' ||
    !candidate.voiceId ||
    typeof candidate.voiceName !== 'string' ||
    !candidate.voiceName
  ) {
    return undefined;
  }
  return {
    apiKey: candidate.apiKey,
    voiceId: candidate.voiceId,
    voiceName: candidate.voiceName,
    voices: parseVoices(candidate.voices, {
      id: candidate.voiceId,
      name: candidate.voiceName,
    }),
  };
}

function parseVoices(
  value: unknown,
  selected: VoiceView['voices'][number],
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
  return voices.some((voice) => voice.id === selected.id) ? voices : [selected, ...voices];
}

function validApiKey(value: string): boolean {
  return value.length >= 20 && value.length <= 256 && !/\s/.test(value);
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
function spokenSummary(value: string): string {
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
