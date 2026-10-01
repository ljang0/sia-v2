import { describe, expect, it, vi } from 'vitest';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { createVoiceService } from './voice-factory.js';
import type { ManagedVoiceGateway } from './voice-service.js';

function gateway(configured = true): ManagedVoiceGateway {
  return {
    configured,
    voiceCatalog: vi.fn<ManagedVoiceGateway['voiceCatalog']>(async () => ({
      provider: {
        available: true,
        voices: [{ id: 'included', name: 'Included voice' }],
        tokenTypes: ['realtime_scribe', 'batch_scribe', 'tts_websocket'],
      },
    })),
    mintVoiceToken: vi.fn(),
  };
}

describe('voice service selection', () => {
  it.each([false, true])(
    'uses included ElevenLabs on a Mac with personal credential present=%s',
    async (hasPersonal) => {
      const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
      const cloud = gateway();
      const personal = { ...gateway(), personal: true };
      const macTransport = vi.fn();
      const service = createVoiceService({
        repository,
        cloud,
        macTransport,
        ...(hasPersonal ? { personal } : {}),
      });
      await service.configure();
      expect(service.view()).toMatchObject({
        engine: 'elevenlabs',
        status: 'connected',
        selectedVoiceId: 'included',
      });
      expect(cloud.voiceCatalog).toHaveBeenCalledOnce();
      expect(personal.voiceCatalog).not.toHaveBeenCalled();
      expect(macTransport).not.toHaveBeenCalled();
      expect(repository.get('voice', 'managed')).toBeDefined();
      service.dispose?.();
      repository.close();
    },
  );

  it('keeps native voice for an unconfigured local Mac build', () => {
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    const service = createVoiceService({
      repository,
      cloud: gateway(false),
      macTransport: vi.fn(),
    });
    expect(service.view().engine).toBe('macos');
    service.dispose?.();
    repository.close();
  });
});
