import type { AuthContext, VoiceTokenRequest } from '../contracts.js';
import { CloudError } from '../domain.js';
import type { ServiceDependencies } from '../services.js';
import { requireBaseUser, requireFeature } from './access.js';
import { dailyQuotaWindow } from './quota-window.js';

export class VoiceService {
  constructor(private readonly deps: ServiceDependencies) {}

  async catalog(user: AuthContext) {
    requireBaseUser(user);
    if (!this.deps.config.features.hostedVoice) {
      return unavailableVoiceCatalog();
    }
    const config = await this.deps.secrets.elevenLabs();
    if (!config.enabled) return unavailableVoiceCatalog(config.displayName);
    try {
      const voices = await this.deps.voiceProvider.catalog(config);
      return {
        schemaVersion: 1 as const,
        provider: {
          id: 'elevenlabs',
          name: config.displayName ?? 'Included voice',
          credentialMode: 'managed' as const,
          available: true,
          voices,
          tokenTypes: config.allowedTokenTypes ?? [
            'realtime_scribe',
            'batch_scribe',
            'tts_websocket',
          ],
        },
      };
    } catch {
      return unavailableVoiceCatalog(config.displayName);
    }
  }

  async mintToken(user: AuthContext, request: VoiceTokenRequest) {
    requireBaseUser(user);
    requireFeature(this.deps.config.features.hostedVoice, 'hosted_voice_disabled');
    const config = await this.deps.secrets.elevenLabs();
    if (!config.enabled) {
      throw new CloudError(503, 'hosted_voice_disabled', 'Hosted voice is unavailable', true);
    }
    const allowedTokenTypes = config.allowedTokenTypes ?? [
      'realtime_scribe',
      'batch_scribe',
      'tts_websocket',
    ];
    if (!allowedTokenTypes.includes(request.type)) {
      throw new CloudError(
        400,
        'voice_token_type_not_allowed',
        'That voice capability is not enabled',
      );
    }
    const window = dailyQuotaWindow(this.deps.clock.now());
    const tokenMintLimit =
      config.dailyTokenMintLimit ?? this.deps.config.voiceDailyTokenMintLimit;
    await this.deps.quota.consumeVoiceToken(user.subject, {
      ...window,
      tokenMintLimit,
    });
    const minted = await this.deps.voiceProvider.mintSingleUseToken(config, request.type);
    const expiresAt = new Date(this.deps.clock.now().getTime() + 15 * 60_000).toISOString();
    await this.deps.audit.write({
      userId: user.subject,
      action: 'voice.token_mint',
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return {
      token: minted.token,
      type: request.type,
      expiresAt,
      singleUse: true as const,
    };
  }
}

function unavailableVoiceCatalog(displayName?: string) {
  return {
    schemaVersion: 1 as const,
    provider: {
      id: 'elevenlabs',
      name: displayName ?? 'Included voice',
      credentialMode: 'managed' as const,
      available: false,
      voices: [] as Array<{ id: string; name: string; category?: string }>,
      tokenTypes: [] as string[],
    },
  };
}
