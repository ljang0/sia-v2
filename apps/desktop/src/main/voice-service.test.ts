import { describe, expect, it, vi } from 'vitest';

import { PlaintextTestCipher, SqliteRecordRepository } from './persistence.js';
import { ElevenLabsVoiceService, type RealtimeSocket } from './voice-service.js';

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

  #emit(event: string, value?: unknown) {
    for (const listener of this.#listeners.get(event) ?? []) listener(value);
  }
}

function repository() {
  return new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
}

describe('ElevenLabsVoiceService', () => {
  it('validates, persists, selects, and removes a credential without exposing it', async () => {
    const records = repository();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        voices: [
          { voice_id: 'voice-1', name: 'Aria', category: 'premade' },
          { voice_id: 'voice-2', name: 'Milo', category: 'professional' },
        ],
      }),
    );
    const service = new ElevenLabsVoiceService({ repository: records, fetch: fetchMock });

    expect(service.view()).toEqual({ status: 'disconnected', voices: [] });
    await service.configure('sk_123456789012345678901234');
    expect(service.view()).toMatchObject({
      status: 'connected',
      selectedVoiceId: 'voice-1',
      selectedVoiceName: 'Aria',
    });
    expect(JSON.stringify(service.view())).not.toContain('sk_');

    await service.select('voice-2');
    const restored = new ElevenLabsVoiceService({ repository: records, fetch: fetchMock });
    expect(restored.view()).toMatchObject({
      selectedVoiceId: 'voice-2',
      selectedVoiceName: 'Milo',
    });

    restored.disconnect();
    expect(records.get('credentials', 'elevenlabs')).toBeUndefined();
    records.close();
  });

  it('transcribes recorded audio and creates bounded speech through fixed endpoints', async () => {
    const records = repository();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/v2/voices')) {
        return Response.json({ voices: [{ voice_id: 'voice-1', name: 'Aria' }] });
      }
      if (url.endsWith('/v1/speech-to-text')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ text: '  dictated request  ' });
      }
      expect(url).toContain('/v1/text-to-speech/voice-1');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'xi-api-key': 'sk_123456789012345678901234',
      });
      return new Response(Uint8Array.from([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' },
      });
    });
    const service = new ElevenLabsVoiceService({ repository: records, fetch: fetchMock });
    await service.configure('sk_123456789012345678901234');

    await expect(
      service.transcribe(Buffer.from('audio').toString('base64'), 'audio/webm;codecs=opus'),
    ).resolves.toBe('dictated request');
    await expect(service.speak('**Hello** [there](https://example.com).')).resolves.toEqual({
      audioBase64: Buffer.from([1, 2, 3]).toString('base64'),
      mimeType: 'audio/mpeg',
    });
    records.close();
  });

  it('uses stable errors for rejected keys and invalid renderer payloads', async () => {
    const records = repository();
    const service = new ElevenLabsVoiceService({
      repository: records,
      fetch: vi.fn<typeof fetch>(async () => new Response('secret detail', { status: 401 })),
    });
    await expect(service.configure('short')).rejects.toThrow('valid ElevenLabs API key');
    await expect(service.configure('sk_123456789012345678901234')).rejects.toThrow(
      'rejected or lacks voice access',
    );
    await expect(service.transcribe('@@@', 'audio/webm')).rejects.toThrow('Connect ElevenLabs');
    records.close();
  });

  it('uses an agent voice and ends long narration cleanly instead of truncating it', async () => {
    const records = repository();
    let spokenText = '';
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/v2/voices')) {
        return Response.json({
          voices: [
            { voice_id: 'voice-1', name: 'Aria' },
            { voice_id: 'voice-2', name: 'Milo' },
          ],
        });
      }
      expect(url).toContain('/v1/text-to-speech/voice-2');
      spokenText = (JSON.parse(String(init?.body)) as { text: string }).text;
      return new Response(Uint8Array.from([1, 2, 3]));
    });
    const service = new ElevenLabsVoiceService({ repository: records, fetch: fetchMock });
    await service.configure('sk_123456789012345678901234');

    const longReply = Array.from(
      { length: 12 },
      (_, index) => `Sentence ${index + 1} explains one useful detail.`,
    ).join(' ');
    await service.speak(`${longReply}\n\n\`\`\`ts\nconst hidden = true;\n\`\`\``, 'voice-2');

    expect(spokenText).toContain('Sentence 1 explains one useful detail.');
    expect(spokenText).not.toContain('const hidden');
    expect(spokenText).toMatch(/I’ve left the remaining details on screen\.$/);
    expect(spokenText.length).toBeLessThanOrEqual(1_900);
    await expect(service.speak('Hello.', 'missing-voice')).rejects.toThrow(
      'voice is no longer available',
    );
    records.close();
  });

  it('streams PCM through a credentialed main-process socket and commits once', async () => {
    const records = repository();
    const sockets: FakeRealtimeSocket[] = [];
    let websocketUrl = '';
    let websocketHeaders: Record<string, string> = {};
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ voices: [{ voice_id: 'voice-1', name: 'Aria' }] }),
    );
    const service = new ElevenLabsVoiceService({
      repository: records,
      fetch: fetchMock,
      websocketFactory: (url, options) => {
        websocketUrl = url;
        websocketHeaders = options.headers;
        const socket = new FakeRealtimeSocket();
        sockets.push(socket);
        queueMicrotask(() => socket.open());
        return socket;
      },
    });
    await service.configure('sk_123456789012345678901234');

    const { sessionId } = await service.startRealtime();
    const audio = Buffer.from([1, 0, 2, 0]).toString('base64');
    service.appendRealtime(sessionId, audio);
    await expect(service.stopRealtime(sessionId, true)).resolves.toBe('live request');

    expect(websocketUrl).toContain('/v1/speech-to-text/realtime');
    expect(websocketUrl).toContain('model_id=scribe_v2_realtime');
    expect(websocketUrl).toContain('audio_format=pcm_16000');
    expect(websocketHeaders).toEqual({ 'xi-api-key': 'sk_123456789012345678901234' });
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
