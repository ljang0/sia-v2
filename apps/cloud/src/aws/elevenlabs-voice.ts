import type { VoiceTokenType } from '../contracts.js';
import { CloudError, isRecord } from '../domain.js';
import type { ElevenLabsConfig, VoiceCatalogEntry, VoiceProvider } from '../ports.js';
import { ensureTrailingSlash } from './shared.js';

export class ElevenLabsHttpProvider implements VoiceProvider {
  async catalog(config: ElevenLabsConfig): Promise<VoiceCatalogEntry[]> {
    const url = elevenLabsUrl(
      config,
      'v2/voices?page_size=50&sort=name&sort_direction=asc&include_total_count=false',
    );
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'xi-api-key': config.apiKey },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new CloudError(
        502,
        'voice_upstream_unavailable',
        'Hosted voice is temporarily unavailable',
        true,
      );
    });
    if (!response.ok) {
      throw new CloudError(
        502,
        'voice_upstream_error',
        `Hosted voice returned HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    const voices = isRecord(body) && Array.isArray(body.voices) ? body.voices : [];
    const allowed = config.allowedVoiceIds ? new Set(config.allowedVoiceIds) : undefined;
    return voices
      .flatMap((voice): VoiceCatalogEntry[] => {
        if (
          !isRecord(voice) ||
          typeof voice.voice_id !== 'string' ||
          voice.voice_id.length === 0 ||
          voice.voice_id.length > 256 ||
          typeof voice.name !== 'string' ||
          voice.name.trim().length === 0
        ) {
          return [];
        }
        if (allowed && !allowed.has(voice.voice_id)) return [];
        const category =
          typeof voice.category === 'string' && voice.category.length > 0
            ? voice.category.slice(0, 80)
            : undefined;
        return [
          {
            id: voice.voice_id,
            name: voice.name.trim().slice(0, 120),
            ...(category === undefined ? {} : { category }),
          },
        ];
      })
      .slice(0, 50);
  }

  async mintSingleUseToken(
    config: ElevenLabsConfig,
    type: VoiceTokenType,
  ): Promise<{ token: string }> {
    const response = await fetch(
      elevenLabsUrl(config, `v1/single-use-token/${encodeURIComponent(type)}`),
      {
        method: 'POST',
        headers: { accept: 'application/json', 'xi-api-key': config.apiKey },
        signal: AbortSignal.timeout(10_000),
      },
    ).catch(() => {
      throw new CloudError(
        502,
        'voice_upstream_unavailable',
        'Hosted voice is temporarily unavailable',
        true,
      );
    });
    if (!response.ok) {
      throw new CloudError(
        502,
        'voice_upstream_error',
        `Hosted voice returned HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    const token = isRecord(body) ? body.token : undefined;
    if (typeof token !== 'string' || token.length < 16 || token.length > 4_096) {
      throw new CloudError(
        502,
        'voice_invalid_response',
        'Hosted voice returned an invalid token',
      );
    }
    return { token };
  }
}

function elevenLabsUrl(config: ElevenLabsConfig, path: string): URL {
  const base = new URL(ensureTrailingSlash(config.baseUrl));
  const url = new URL(path.replace(/^\//, ''), base);
  if (
    base.protocol !== 'https:' ||
    url.protocol !== 'https:' ||
    url.origin !== base.origin ||
    url.username ||
    url.password
  ) {
    throw new CloudError(503, 'voice_config_invalid', 'Hosted voice endpoint is invalid');
  }
  return url;
}
