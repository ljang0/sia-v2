import type { SQSBatchResponse, SQSHandler } from 'aws-lambda';
import { createAwsDependencies } from './aws.js';
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
        throw new Error('invalid research export message');
      }
      await getServices().researchExportWorker.process(parsed.userId, parsed.id);
    } catch {
      // The body identifies a participant and is deliberately excluded from logs.
      console.error(
        JSON.stringify({
          logType: 'research-export',
          messageId: record.messageId,
          outcome: 'failed',
        }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
