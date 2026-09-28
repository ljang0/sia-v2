import { describe, expect, it, vi } from 'vitest';

import { PlaintextTestCipher, SqliteRecordRepository } from './persistence.js';
import {
  ElevenLabsVoiceService,
  type ManagedVoiceGateway,
  type RealtimeSocket,
} from './voice-service.js';

const VOICES = [
  { id: 'voice-1', name: 'Aria', category: 'premade' },
  { id: 'voice-2', name: 'Milo', category: 'professional' },
];

class FakeRealtimeSocket implements RealtimeSocket {
  readyState = 0;
  readonly sent: string[] = [];
  readonly #listeners = new Map<string, Array<(value?: unknown) => void>>();

  on(event: 'open' | 'message' | 'error' | 'close', listener: (data?: unknown) => void) {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  open() {
    this.readyState = 1;
    this.#emit('open');
  }

  send(data: string) {
    this.sent.push(data);
    const message = JSON.parse(data) as { commit?: boolean };
    if (message.commit) {
      this.#emit(
        'message',
        Buffer.from(
          JSON.stringify({ message_type: 'committed_transcript', text: 'live request' }),
        ),
      );
    }
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.#emit('close');
  }

  protected emitMessage(value: unknown) {
    this.#emit('message', Buffer.from(JSON.stringify(value)));
  }

  #emit(event: string, value?: unknown) {
    for (const listener of this.#listeners.get(event) ?? []) listener(value);
  }
}

class FakeSpeechSocket extends FakeRealtimeSocket {
  override send(data: string) {
    super.send(data);
    const message = JSON.parse(data) as { text?: string };
    if (message.text === '') {
      this.emitMessage({ audio: Buffer.from([1, 2, 3]).toString('base64') });
      this.emitMessage({ is_final: true });
    }
  }
}

function repository() {
  return new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
}

function gateway() {
  const voiceCatalog = vi.fn<ManagedVoiceGateway['voiceCatalog']>(async () => ({
    provider: {
      available: true,
      voices: VOICES,
      tokenTypes: ['realtime_scribe', 'batch_scribe', 'tts_websocket'],
    },
  }));
  const mintVoiceToken = vi.fn<ManagedVoiceGateway['mintVoiceToken']>(async (type) => ({
    token: `one-time-${type}`,
    type,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    singleUse: true,
  }));
  return {
    configured: true,
    voiceCatalog,
    mintVoiceToken,
  } satisfies ManagedVoiceGateway;
}

describe('ElevenLabsVoiceService', () => {
  it('replaces a removed selected voice with a current catalog choice', async () => {
    const records = repository();
    const managedGateway = gateway();
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
    });
    await service.configure();
    await service.select('voice-2');
    managedGateway.voiceCatalog.mockResolvedValueOnce({
      provider: { available: true, voices: [VOICES[0]!], tokenTypes: ['realtime_scribe'] },
    });
    await service.refresh();
    expect(service.view()).toMatchObject({ selectedVoiceId: 'voice-1', voices: [VOICES[0]] });
    await expect(service.speak('Synthetic test.', 'voice-2')).rejects.toThrow(
      /no longer available/,
    );
    records.close();
  });

  it('cannot re-enable voice when a catalog arrives after disconnect', async () => {
    const records = repository();
    const managedGateway = gateway();
    let finish!: (value: Awaited<ReturnType<ManagedVoiceGateway['voiceCatalog']>>) => void;
    managedGateway.voiceCatalog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
    });
    const refresh = service.configure();
    service.disconnect();
    finish({ provider: { available: true, voices: VOICES, tokenTypes: ['realtime_scribe'] } });
    await expect(refresh).rejects.toThrow(/stopped/);
    expect(service.view().status).toBe('disconnected');
    expect(records.get('voice', 'managed')).toBeUndefined();
    records.close();
  });

  it.each(['startRealtime', 'speak', 'transcribe'] as const)(
    'does not send audio or text from a late %s token after disconnect',
    async (operation) => {
      const records = repository();
      const managedGateway = gateway();
      const sockets: FakeSpeechSocket[] = [];
      const fetchMock = vi.fn<typeof fetch>(async () =>
        Response.json({ text: 'late transcript' }),
      );
      let finish!: (value: Awaited<ReturnType<ManagedVoiceGateway['mintVoiceToken']>>) => void;
      managedGateway.mintVoiceToken.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const service = new ElevenLabsVoiceService({
        repository: records,
        gateway: managedGateway,
        fetch: fetchMock,
        websocketFactory: () => {
          const socket = new FakeSpeechSocket();
          sockets.push(socket);
          queueMicrotask(() => socket.open());
          return socket;
        },
      });
      await service.configure();
      const pending =
        operation === 'speak'
          ? service.speak('Synthetic test.')
          : operation === 'transcribe'
            ? service.transcribe('AQID', 'audio/wav')
            : service.startRealtime();
      service.disconnect();
      finish({
        token: 'late-single-use-fixture',
        type: 'realtime_scribe',
        singleUse: true,
        expiresAt: new Date().toISOString(),
      });
      await expect(pending).rejects.toThrow(/stopped/);
      expect(sockets).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(managedGateway.mintVoiceToken.mock.calls[0]?.[1]?.aborted).toBe(true);
      records.close();
    },
  );

  it('closes speech generation on dispose and rejects further use', async () => {
    const records = repository();
    const socket = new FakeRealtimeSocket();
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: gateway(),
      websocketFactory: () => socket,
    });
    await service.configure();
    const pending = service.speak('Synthetic test.');
    await Promise.resolve();
    service.dispose();
    await expect(pending).rejects.toThrow();
    expect(socket.readyState).toBe(3);
    await expect(service.configure()).rejects.toThrow(/stopped/);
    records.close();
  });

  it('persists only a managed voice preference and removes a legacy API key', async () => {
    const records = repository();
    records.put('credentials', 'elevenlabs', {
      apiKey: 'sk_legacy-secret-that-must-be-deleted',
      voiceId: 'voice-2',
      voiceName: 'Milo',
      voices: VOICES,
    });
    const managedGateway = gateway();
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
    });

    expect(records.get('credentials', 'elevenlabs')).toBeUndefined();
    await service.configure();
    expect(service.view()).toMatchObject({
      status: 'connected',
      selectedVoiceId: 'voice-2',
      selectedVoiceName: 'Milo',
    });
    expect(JSON.stringify(records.get('voice', 'managed'))).not.toContain('sk_');

    await service.select('voice-1');
    const restored = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
    });
    expect(restored.view()).toMatchObject({ selectedVoiceId: 'voice-1' });
    restored.disconnect();
    expect(records.get('voice', 'managed')).toBeUndefined();
    records.close();
  });

  it('uses a batch token for transcription and a separate WebSocket token for speech', async () => {
    const records = repository();
    const managedGateway = gateway();
    const websocketUrls: string[] = [];
    const sockets: FakeSpeechSocket[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toContain('/v1/speech-to-text?token=one-time-batch_scribe');
      expect(init?.body).toBeInstanceOf(FormData);
      expect(JSON.stringify(init?.headers ?? {})).not.toContain('xi-api-key');
      return Response.json({ text: '  dictated request  ' });
    });
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
      fetch: fetchMock,
      websocketFactory: (url, options) => {
        expect(options.headers).toEqual({});
        websocketUrls.push(url);
        const socket = new FakeSpeechSocket();
        sockets.push(socket);
        queueMicrotask(() => socket.open());
        return socket;
      },
    });
    await service.configure();

    await expect(
      service.transcribe(Buffer.from('audio').toString('base64'), 'audio/webm;codecs=opus'),
    ).resolves.toBe('dictated request');
    await expect(service.speak('**Hello** [there](https://example.com).')).resolves.toEqual({
      audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
      mimeType: 'audio/mpeg',
    });
    expect(websocketUrls[0]).toContain('/v1/text-to-speech/voice-1/stream-input');
    expect(websocketUrls[0]).toContain('single_use_token=one-time-tts_websocket');
    expect(sockets[0]?.sent.map((value) => JSON.parse(value))).toMatchObject([
      { text: ' ' },
      { text: 'Hello there. ' },
      { text: '' },
    ]);
    expect(managedGateway.mintVoiceToken.mock.calls.map(([type]) => type)).toEqual([
      'batch_scribe',
      'tts_websocket',
    ]);
    records.close();
  });

  it('fails safely when managed voice is unavailable or a token is rejected', async () => {
    const records = repository();
    const unavailable = gateway();
    unavailable.voiceCatalog.mockResolvedValue({
      provider: { available: false, voices: [], tokenTypes: [] },
    });
    const unavailableService = new ElevenLabsVoiceService({
      repository: records,
      gateway: unavailable,
    });
    await expect(unavailableService.configure()).rejects.toThrow('temporarily unavailable');

    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: gateway(),
      fetch: vi.fn<typeof fetch>(async () => new Response('private detail', { status: 401 })),
    });
    await service.configure();
    await expect(service.transcribe('@@@', 'audio/webm')).rejects.toThrow(
      'recording is invalid',
    );
    await expect(
      service.transcribe(Buffer.from('audio').toString('base64'), 'audio/webm'),
    ).rejects.toThrow('voice session expired');
    records.close();
  });

  it('uses an agent voice and ends long narration cleanly instead of truncating it', async () => {
    const records = repository();
    const sockets: FakeSpeechSocket[] = [];
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: gateway(),
      websocketFactory: () => {
        const socket = new FakeSpeechSocket();
        sockets.push(socket);
        queueMicrotask(() => socket.open());
        return socket;
      },
    });
    await service.configure();

    const longReply = Array.from(
      { length: 12 },
      (_, index) => `Sentence ${index + 1} explains one useful detail.`,
    ).join(' ');
    await service.speak(`${longReply}\n\n\`\`\`ts\nconst hidden = true;\n\`\`\``, 'voice-2');
    const spokenText =
      (JSON.parse(sockets[0]?.sent[1] ?? '{}') as { text?: string }).text ?? '';

    expect(spokenText).toContain('Sentence 1 explains one useful detail.');
    expect(spokenText).not.toContain('const hidden');
    expect(spokenText.trim()).toMatch(/I’ve left the remaining details on screen\.$/);
    expect(spokenText.length).toBeLessThanOrEqual(1_901);
    await expect(service.speak('Hello.', 'missing-voice')).rejects.toThrow(
      'voice is no longer available',
    );
    records.close();
  });

  it('streams PCM with a realtime single-use token and commits once', async () => {
    const records = repository();
    const managedGateway = gateway();
    const sockets: FakeRealtimeSocket[] = [];
    let websocketUrl = '';
    let websocketHeaders: Record<string, string> = {};
    const service = new ElevenLabsVoiceService({
      repository: records,
      gateway: managedGateway,
      websocketFactory: (url, options) => {
        websocketUrl = url;
        websocketHeaders = options.headers;
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        queueMicrotask(() => socket.open());
        return socket;
      },
    });
    await service.configure();

    const { sessionId } = await service.startRealtime();
    const audio = Buffer.from([1, 0, 2, 0]).toString('base64');
    service.appendRealtime(sessionId, audio);
    await expect(service.stopRealtime(sessionId, true)).resolves.toBe('live request');

    expect(websocketUrl).toContain('/v1/speech-to-text/realtime');
    expect(websocketUrl).toContain('model_id=scribe_v2_realtime');
    expect(websocketUrl).toContain('audio_format=pcm_16000');
    expect(websocketUrl).toContain('token=one-time-realtime_scribe');
    expect(websocketHeaders).toEqual({});
    expect(managedGateway.mintVoiceToken).toHaveBeenCalledWith(
      'realtime_scribe',
      expect.any(AbortSignal),
    );
    expect(sockets[0]?.sent.map((message) => JSON.parse(message))).toEqual([
      {
        message_type: 'input_audio_chunk',
        audio_base_64: audio,
        sample_rate: 16_000,
      },
      {
        message_type: 'input_audio_chunk',
        audio_base_64: '',
        sample_rate: 16_000,
        commit: true,
      },
    ]);
    records.close();
  });
});
