import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ElevenLabsHttpProvider } from '../../src/aws/elevenlabs-voice.js';
import type { ElevenLabsConfig } from '../../src/ports.js';

const config: ElevenLabsConfig = {
  apiKey: 'elevenlabs-secret-never-returned',
  baseUrl: 'https://api.elevenlabs.test/',
  enabled: true,
  allowedVoiceIds: ['voice-1'],
  allowedTokenTypes: ['realtime_scribe', 'tts_websocket'],
};

describe('ElevenLabs hosted voice adapter', () => {
  it('authenticates server-side and returns only sanitized allowlisted voices', async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; headers: Record<string, string> } | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      request = { url: String(input), headers: init?.headers as Record<string, string> };
      return Response.json({
        voices: [
          {
            voice_id: 'voice-1',
            name: '  Aria  ',
            category: 'premade',
            preview_url: 'https://private.example.test/audio.mp3',
            samples: [{ sample_id: 'private-sample' }],
          },
          { voice_id: 'voice-2', name: 'Not allowlisted' },
        ],
      });
    }) as typeof fetch;

    try {
      const voices = await new ElevenLabsHttpProvider().catalog(config);
      assert.deepEqual(voices, [{ id: 'voice-1', name: 'Aria', category: 'premade' }]);
      assert.equal(
        request?.url,
        'https://api.elevenlabs.test/v2/voices?page_size=50&sort=name&sort_direction=asc&include_total_count=false',
      );
      assert.equal(request?.headers['xi-api-key'], 'elevenlabs-secret-never-returned');
      assert.doesNotMatch(JSON.stringify(voices), /secret|preview|sample/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('mints a native temporary single-use token without returning the API key', async () => {
    const originalFetch = globalThis.fetch;
    let request:
      { url: string; method: string | undefined; headers: Record<string, string> } | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      request = {
        url: String(input),
        method: init?.method,
        headers: init?.headers as Record<string, string>,
      };
      return Response.json({ token: 'sutkn_temporary_single_use_value' });
    }) as typeof fetch;

    try {
      const minted = await new ElevenLabsHttpProvider().mintSingleUseToken(
        config,
        'realtime_scribe',
      );
      assert.deepEqual(minted, { token: 'sutkn_temporary_single_use_value' });
      assert.equal(
        request?.url,
        'https://api.elevenlabs.test/v1/single-use-token/realtime_scribe',
      );
      assert.equal(request?.method, 'POST');
      assert.equal(request?.headers['xi-api-key'], 'elevenlabs-secret-never-returned');
      assert.doesNotMatch(JSON.stringify(minted), /elevenlabs-secret/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
