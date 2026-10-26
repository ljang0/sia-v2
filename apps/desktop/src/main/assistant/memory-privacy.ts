import { observationHasPrivateLinks } from '../actions/observation-text.js';

/** Defense in depth for derived context; never retain obvious credentials or signed URLs. */
const memoryCredentialPattern =
  /(?:-----BEGIN|\b(?:password|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\s*(?:[:=]|is\b)|\bsk[-_][a-z0-9]{12}|\bBearer\s+[a-z0-9._-]{12}|[?&](?:token|access_token|refresh_token|signature|x-amz-signature)=)/i;

export function containsMemoryCredentials(text: string): boolean {
  return memoryCredentialPattern.test(text) || observationHasPrivateLinks(text);
}
