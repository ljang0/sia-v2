import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EphemeralPayloadCipher,
  PlaintextTestCipher,
  SqliteRecordRepository,
} from '../storage/persistence.js';
import { PersonalVoiceCredential, PersonalVoiceGateway } from './personal-voice.js';
import { ElevenLabsVoiceService } from './voice-service.js';

const KEY = `sk_${'test'.repeat(12)}`;
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('personal ElevenLabs voice', () => {
  it('encrypts outside preferences, survives reload, and refuses exposed files or symlinks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sia-voice-'));
    directories.push(directory);
    const path = join(directory, 'elevenlabs.enc');
    const cipher = new EphemeralPayloadCipher();
    const credential = new PersonalVoiceCredential(path, cipher);
    expect(credential.configured).toBe(false);
    credential.save(KEY);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path).includes(Buffer.from(KEY))).toBe(false);
    expect(new PersonalVoiceCredential(path, cipher).read()).toBe(KEY);
    const link = join(directory, 'linked.enc');
    symlinkSync(path, link);
    expect(() => new PersonalVoiceCredential(link, cipher).read()).toThrow(
      'could not be unlocked',
    );
    chmodSync(path, 0o644);
    expect(() => credential.read()).toThrow('could not be unlocked');
  });

  it('uses only the vendor origin, rejects redirects, and mints all three single-use token types', async () => {
    const request = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url).startsWith('https://api.elevenlabs.io/')).toBe(true);
      expect(String(url)).not.toContain(KEY);
      expect(init?.headers).toMatchObject({ 'xi-api-key': KEY });
      expect(init?.redirect).toBe('error');
      if (String(url).includes('/voices?'))
        return Response.json({
          voices: [
            { voice_id: 'other', name: 'Other' },
            { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'premade' },
            { voice_id: '../bad', name: 'Invalid' },
          ],
        });
      return Response.json({ token: 'single-use-test-session' });
    });
    const gateway = new PersonalVoiceGateway(() => KEY, request);
    expect((await gateway.voiceCatalog()).provider.voices.map((v) => v.name)).toEqual([
      'Sarah',
      'Other',
    ]);
    for (const type of ['batch_scribe', 'realtime_scribe', 'tts_websocket'] as const) {
      expect(await gateway.mintVoiceToken(type)).toMatchObject({
        type,
        token: 'single-use-test-session',
        singleUse: true,
      });
    }
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('sanitizes upstream errors and separates personal preferences from cloud voice', async () => {
    const records = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    records.put('voice', 'managed', {
      voiceId: 'old-cloud',
      voiceName: 'Old cloud',
      voices: [{ id: 'old-cloud', name: 'Old cloud' }],
    });
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ voices: [{ voice_id: 'sarah', name: 'Sarah' }] }),
    );
    const gateway = new PersonalVoiceGateway(() => KEY, request);
    const voice = new ElevenLabsVoiceService({ repository: records, gateway });
    expect(voice.view()).toMatchObject({ status: 'disconnected', engine: 'elevenlabs' });
    await voice.configure();
    expect(voice.view()).toMatchObject({ selectedVoiceName: 'Sarah' });
    expect(JSON.stringify(voice.view())).not.toContain(KEY);
    expect(JSON.stringify(records.list('voice'))).not.toContain(KEY);
    expect(
      new ElevenLabsVoiceService({ repository: records, gateway }).view().selectedVoiceName,
    ).toBe('Sarah');
    voice.disconnect();
    expect(records.get('voice', 'managed')).toBeDefined();
    expect(records.get('voice', 'personal-elevenlabs')).toBeUndefined();
    request.mockRejectedValueOnce(new Error(KEY));
    await expect(gateway.voiceCatalog()).rejects.toThrow(
      'ElevenLabs could not be reached. Try again.',
    );
    request.mockResolvedValueOnce(new Response(KEY, { status: 403 }));
    await expect(gateway.voiceCatalog()).rejects.toThrow('needs access to voices');
    records.close();
  });
});
