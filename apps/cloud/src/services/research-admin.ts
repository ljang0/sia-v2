import type { AuthContext } from '../contracts.js';
import { CloudError, requireString } from '../domain.js';
import type { ServiceDependencies } from '../services.js';
import { requireFeature } from './access.js';

export class ResearchAdminService {
  constructor(private readonly deps: ServiceDependencies) {}

  async participants(user: AuthContext) {
    await this.#requireAdmin(user, 'research.admin.participants', []);
    return await this.#audited(user, 'research.admin.participants', [], async () => {
      const [batches, invites] = await Promise.all([
        this.deps.research.listAllBatches(),
        this.deps.invites.listInvites(),
      ]);
      const emailBySubject = new Map(
        invites
          .filter((invite): invite is typeof invite & { subject: string } =>
            Boolean(invite.subject),
          )
          .map((invite) => [invite.subject, invite.email]),
      );
      const grouped = new Map<
        string,
        {
          subject: string;
          email?: string;
          batchCount: number;
          byteLength: number;
          lastCreatedAt: string;
        }
      >();
      for (const batch of batches) {
        const existing = grouped.get(batch.userId);
        if (existing) {
          existing.batchCount += 1;
          existing.byteLength += batch.byteLength;
          if (batch.createdAt > existing.lastCreatedAt)
            existing.lastCreatedAt = batch.createdAt;
        } else {
          const email = emailBySubject.get(batch.userId);
          grouped.set(batch.userId, {
            subject: batch.userId,
            ...(email ? { email } : {}),
            batchCount: 1,
            byteLength: batch.byteLength,
            lastCreatedAt: batch.createdAt,
          });
        }
      }
      return {
        participants: [...grouped.values()].sort((left, right) =>
          right.lastCreatedAt.localeCompare(left.lastCreatedAt),
        ),
      };
    });
  }

  async batches(user: AuthContext, subject: string) {
    requireString(subject, 'subject', { max: 256 });
    await this.#requireAdmin(user, 'research.admin.batches', [subject]);
    return await this.#audited(user, 'research.admin.batches', [subject], async () => {
      const batches = await this.deps.research.listBatches(subject);
      return {
        batches: batches
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(({ objectKey: _objectKey, userId: _userId, ...batch }) => batch),
      };
    });
  }

  async batch(user: AuthContext, subject: string, batchId: string) {
    requireString(subject, 'subject', { max: 256 });
    requireString(batchId, 'batchId', { max: 128 });
    await this.#requireAdmin(user, 'research.admin.batch.read', [subject, batchId]);
    return await this.#audited(
      user,
      'research.admin.batch.read',
      [subject, batchId],
      async () => {
        const metadata = await this.deps.research.getBatch(subject, batchId);
        if (!metadata)
          throw new CloudError(404, 'research_batch_not_found', 'Research batch not found');
        const object = await this.deps.researchObjects.readBatchObject(metadata.objectKey);
        if (object.sha256 !== metadata.sha256 || object.byteLength !== metadata.byteLength) {
          throw new CloudError(
            500,
            'research_batch_integrity_failed',
            'The archived research batch failed its integrity check',
          );
        }
        return { batch: object.document };
      },
    );
  }

  async #audited<T>(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await operation();
      await this.#audit(user, action, opaqueResourceIds);
      return result;
    } catch (error) {
      await this.#audit(
        user,
        action,
        opaqueResourceIds,
        'failed',
        error instanceof CloudError ? error.code : 'internal_error',
      );
      throw error;
    }
  }

  async #requireAdmin(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
  ): Promise<void> {
    requireFeature(this.deps.config.features.researchArchive, 'research_archive_disabled');
    if (user.groups.includes('Admins')) {
      if (user.email && (await this.deps.identity.hasMfa(user.email))) return;
      await this.#audit(user, action, opaqueResourceIds, 'denied', 'admin_mfa_required');
      throw new CloudError(
        403,
        'admin_mfa_required',
        'Set up an authenticator before opening the research archive',
      );
    }
    await this.#audit(user, action, opaqueResourceIds, 'denied', 'admin_required');
    throw new CloudError(403, 'admin_required', 'Admin access is required');
  }

  async #audit(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
    outcome: 'allowed' | 'denied' | 'failed' = 'allowed',
    errorCode?: string,
  ): Promise<void> {
    await this.deps.audit.write({
      userId: user.subject,
      action,
      outcome,
      occurredAt: this.deps.clock.now().toISOString(),
      ...(opaqueResourceIds.length ? { opaqueResourceIds } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  }
}
