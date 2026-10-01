import type { DeletionScope } from '../contracts.js';
import { CloudError } from '../domain.js';
import type { ServiceDependencies } from '../services.js';

export class ResearchExportWorker {
  constructor(private readonly deps: ServiceDependencies) {}

  async process(userId: string, exportId: string): Promise<void> {
    const now = () => this.deps.clock.now().toISOString();
    const claimed = await this.deps.researchExports.transitionResearchExport(
      userId,
      exportId,
      ['requested', 'processing', 'failed'],
      'processing',
      now(),
    );
    if (!claimed) {
      const current = await this.deps.researchExports.getResearchExport(userId, exportId);
      if (current?.state === 'completed') return;
      throw new CloudError(
        409,
        'research_export_not_claimed',
        'Export is already processing',
        true,
      );
    }
    try {
      const batches = await this.deps.research.listBatches(userId);
      const result = await this.deps.researchObjects.createExport(
        userId,
        exportId,
        batches.map(({ objectKey, sha256, byteLength }) => ({
          objectKey,
          sha256,
          byteLength,
        })),
      );
      await this.deps.researchExports.transitionResearchExport(
        userId,
        exportId,
        ['processing'],
        'completed',
        now(),
        { objectKey: result.objectKey },
      );
    } catch (error) {
      await this.deps.researchExports.transitionResearchExport(
        userId,
        exportId,
        ['processing'],
        'failed',
        now(),
        { failureCode: error instanceof CloudError ? error.code : 'research_export_failed' },
      );
      throw error;
    }
  }
}

export class DeletionWorker {
  constructor(private readonly deps: ServiceDependencies) {}

  async process(userId: string, jobId: string, scope: DeletionScope): Promise<void> {
    const now = (): string => this.deps.clock.now().toISOString();
    const claimed = await this.deps.deletions.transitionDeletion(
      userId,
      jobId,
      ['requested', 'failed'],
      'processing',
      now(),
    );
    if (!claimed) {
      const job = await this.deps.deletions.getDeletion(userId, jobId);
      if (job?.state === 'completed') return;
      throw new CloudError(
        409,
        'deletion_not_claimed',
        'Deletion job is already being processed',
        true,
      );
    }
    try {
      await this.deps.researchObjects.deleteAllForUser(userId);
      await this.deps.research.deleteResearchForUser(userId);
      await this.deps.researchExports.deleteResearchExportsForUser(userId);
      await this.deps.actions.deleteActionsForUser(userId);
      await this.deps.deletions.transitionDeletion(
        userId,
        jobId,
        ['processing'],
        'research_deleted',
        now(),
      );

      if (scope === 'account') {
        await this.deps.connectorUploads.deleteConnectorUploadsForUser(userId);
        for (const connection of await this.deps.connections.listConnections(userId)) {
          await this.deps.connector.disconnect(connection.id);
          await this.deps.connections.deleteConnection(userId, connection.id);
        }
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['research_deleted'],
          'connections_revoked',
          now(),
        );
        await this.deps.invites.deleteInvitesForSubject(userId);
        await this.deps.quota.deleteUserUsage(userId);
        await this.deps.identity.deleteUser(userId);
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['connections_revoked'],
          'identity_deleted',
          now(),
        );
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['identity_deleted'],
          'completed',
          now(),
        );
      } else {
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['research_deleted'],
          'completed',
          now(),
        );
      }
    } catch (error) {
      await this.deps.deletions.transitionDeletion(
        userId,
        jobId,
        ['processing', 'research_deleted', 'connections_revoked', 'identity_deleted'],
        'failed',
        now(),
        error instanceof CloudError ? error.code : 'deletion_failed',
      );
      throw error;
    }
  }
}
