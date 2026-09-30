import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { CloudError } from '../domain.js';
import type { TokenCipher } from '../ports.js';

export class KmsTokenCipher implements TokenCipher {
  constructor(
    private readonly client: KMSClient,
    private readonly keyArn: string,
  ) {}

  async encrypt(plaintext: string, context: Record<string, string>): Promise<string> {
    const result = await this.client.send(
      new EncryptCommand({
        KeyId: this.keyArn,
        Plaintext: Buffer.from(plaintext, 'utf8'),
        EncryptionContext: context,
      }),
    );
    if (!result.CiphertextBlob) {
      throw new CloudError(
        503,
        'token_encryption_failed',
        'Google credentials are unavailable',
      );
    }
    return Buffer.from(result.CiphertextBlob).toString('base64');
  }

  async decrypt(ciphertext: string, context: Record<string, string>): Promise<string> {
    const result = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        EncryptionContext: context,
      }),
    );
    if (!result.Plaintext) {
      throw new CloudError(
        503,
        'token_decryption_failed',
        'Google credentials are unavailable',
      );
    }
    return Buffer.from(result.Plaintext).toString('utf8');
  }
}
