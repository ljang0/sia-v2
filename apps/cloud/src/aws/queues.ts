import type { SQSClient } from '@aws-sdk/client-sqs';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import type { DeletionScope } from '../contracts.js';
import type { DeletionQueue, ResearchExportQueue } from '../ports.js';

export class AwsDeletionQueue implements DeletionQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}
  async enqueue(job: { id: string; userId: string; scope: DeletionScope }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(job) }),
    );
  }
}

export class AwsResearchExportQueue implements ResearchExportQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}
  async enqueue(job: { id: string; userId: string }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(job) }),
    );
  }
}
