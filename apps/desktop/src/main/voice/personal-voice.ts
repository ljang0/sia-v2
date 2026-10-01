import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { PayloadCipher } from '../storage/persistence.js';
import type { ManagedVoiceTokenType } from '../cloud/cloud-client.js';
import type { ManagedVoiceGateway } from './voice-service.js';

const ORIGIN = 'https://api.elevenlabs.io';
const TOKEN_TYPES = ['batch_scribe', 'realtime_scribe', 'tts_websocket'] as const;
const NOTCH_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah, Notch's default voice.

/** Device-local opt-in. Never stored in a workspace, profile export, or renderer state. */
export function personalVoicePath(appData: string): string {
  return join(appData, 'Sia', 'voice', 'elevenlabs.enc');
}

export class PersonalVoiceCredential {
  constructor(
    readonly path: string,
    private readonly cipher: PayloadCipher,
  ) {}

  get configured(): boolean {
    return existsSync(this.path);
  }

  read(): string {
    try {
      const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = fstatSync(fd);
        if (
          !stat.isFile() ||
          stat.nlink !== 1 ||
          stat.size > 16_384 ||
          (stat.mode & 0o077) !== 0
        )
          throw new Error();
        return validKey(this.cipher.decrypt(readFileSync(fd)));
      } finally {
        closeSync(fd);
      }
    } catch {
      throw new Error(
        'The personal ElevenLabs credential could not be unlocked. Configure it again on this Mac.',
      );
    }
  }

  save(key: string): void {
    const encrypted = this.cipher.encrypt(validKey(key));
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, this.path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}

function validKey(value: string): string {
  const key = value.trim();
  if (!/^sk_[A-Za-z0-9]{20,200}$/.test(key))
    throw new Error('Enter a valid ElevenLabs API key through standard input.');
  return key;
}

/** Reuses Sia's streaming pipeline; only this main-process gateway sees the personal key. */
export class PersonalVoiceGateway implements ManagedVoiceGateway {
  readonly personal = true;
  readonly configured = true;

  constructor(
    private readonly credential: () => string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async voiceCatalog(signal?: AbortSignal): ReturnType<ManagedVoiceGateway['voiceCatalog']> {
    const body = await this.#request(
      '/v2/voices?page_size=100&include_total_count=false',
      'GET',
      signal,
    );
    const records = Array.isArray(body.voices) ? body.voices : [];
    const voices = records.flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return [];
      const voice = value as Record<string, unknown>;
      if (
        typeof voice.voice_id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(voice.voice_id) ||
        typeof voice.name !== 'string' ||
        !voice.name.trim()
      )
        return [];
      return [
        {
          id: voice.voice_id,
          name: voice.name.trim().slice(0, 120),
          ...(typeof voice.category === 'string'
            ? { category: voice.category.slice(0, 80) }
            : {}),
        },
      ];
    });
    // Retain Notch's default where the account offers it; never invent a voice ID.
    voices.sort((a, b) => Number(b.id === NOTCH_VOICE) - Number(a.id === NOTCH_VOICE));
    return {
      provider: {
        available: voices.length > 0,
        voices: voices.slice(0, 50),
        tokenTypes: [...TOKEN_TYPES],
      },
    };
  }

  async mintVoiceToken(
    type: ManagedVoiceTokenType,
    signal?: AbortSignal,
  ): ReturnType<ManagedVoiceGateway['mintVoiceToken']> {
    if (!TOKEN_TYPES.includes(type)) throw new Error('Unsupported voice token type.');
    const body = await this.#request(`/v1/single-use-token/${type}`, 'POST', signal);
    if (typeof body.token !== 'string' || body.token.length < 16 || body.token.length > 4096)
      throw new Error('ElevenLabs returned an invalid voice session.');
    return {
      token: body.token,
      type,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      singleUse: true,
    };
  }

  async #request(
    path: string,
    method: string,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const key = validKey(this.credential());
    let response: Response;
    try {
      response = await this.request(`${ORIGIN}${path}`, {
        method,
        headers: { accept: 'application/json', 'xi-api-key': key },
        redirect: 'error',
        signal: signal ?? AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error('ElevenLabs could not be reached. Try again.');
    }
    // Never relay provider bodies, request URLs, headers, or errors carrying credentials.
    if (response.status === 401 || response.status === 403)
      throw new Error(
        'The personal ElevenLabs key needs access to voices, speech-to-text, and text-to-speech.',
      );
    if (response.status === 429) throw new Error('ElevenLabs usage is temporarily limited.');
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status}).`);
    const value: unknown = await response.json().catch(() => undefined);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('ElevenLabs returned an invalid response.');
    return value as Record<string, unknown>;
  }
}
