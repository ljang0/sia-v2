import type { SQSBatchResponse, SQSHandler } from 'aws-lambda';
import { createAwsDependencies } from './aws.js';
import type { DeletionScope } from './contracts.js';
import { isRecord } from './domain.js';
import { createServices } from './services.js';

let services: ReturnType<typeof createServices> | undefined;
const getServices = () => (services ??= createServices(createAwsDependencies()));

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    try {
      const parsed: unknown = JSON.parse(record.body);
      if (
        !isRecord(parsed) ||
        typeof parsed.id !== 'string' ||
        typeof parsed.userId !== 'string'
      ) {
        throw new Error('invalid deletion message');
      }
      const scope: DeletionScope = parsed.scope === 'account' ? 'account' : 'research';
      await getServices().deletionWorker.process(parsed.userId, parsed.id, scope);
    } catch {
      // Only the SQS message id is safe to log; the body is deliberately omitted.
      console.error(
        JSON.stringify({ logType: 'deletion', messageId: record.messageId, outcome: 'failed' }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
