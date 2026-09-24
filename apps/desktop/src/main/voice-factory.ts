import type { RecordRepository } from './persistence.js';
import { MacVoiceService, type MacSpeechTransport } from './mac-voice-service.js';
import {
  ElevenLabsVoiceService,
  type ManagedVoiceGateway,
  type VoiceOperations,
} from './voice-service.js';

/** Release builds use the account service; device credentials are a local development fallback. */
export function createVoiceService(options: {
  repository: RecordRepository;
  cloud: ManagedVoiceGateway;
  personal?: ManagedVoiceGateway;
  macTransport?: () => MacSpeechTransport;
}): VoiceOperations {
  const gateway = options.cloud.configured ? options.cloud : options.personal;
  if (gateway?.configured)
    return new ElevenLabsVoiceService({ repository: options.repository, gateway });
  if (options.macTransport)
    return new MacVoiceService(options.repository, options.macTransport);
  return new ElevenLabsVoiceService({ repository: options.repository, gateway: options.cloud });
}
