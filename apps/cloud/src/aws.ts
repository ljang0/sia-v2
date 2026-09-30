import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { GoogleWorkspaceConnector, HybridConnector } from './google-workspace.js';
import { SystemClock } from './memory.js';
import type { ServiceDependencies } from './services.js';
import { MetadataAuditSink } from './aws/audit-sink.js';
import { CognitoIdentity } from './aws/cognito-identity.js';
import { ComposioConnector } from './aws/composio-connector.js';
import { DynamoState } from './aws/dynamo-state.js';
import { ElevenLabsHttpProvider } from './aws/elevenlabs-voice.js';
import { OpenAiCompatibleMetaProvider } from './aws/meta-provider.js';
import { DynamoMetaQuota } from './aws/meta-quota.js';
import { AwsDeletionQueue, AwsResearchExportQueue } from './aws/queues.js';
import { S3ReleaseManifests } from './aws/release-manifests.js';
import { S3ResearchObjects } from './aws/research-objects.js';
import { SecretsManagerProvider } from './aws/secrets.js';
import { KmsTokenCipher } from './aws/token-cipher.js';

interface RuntimeConfig {
  tableName: string;
  bucketName: string;
  auditBucketName: string;
  releaseBucketName: string;
  kmsKeyArn: string;
  deletionQueueUrl: string;
  exportQueueUrl: string;
  userPoolId: string;
  metaSecretArn: string;
  elevenLabsSecretArn: string;
  composioSecretArn: string;
  googleSecretArn: string;
  registrationSecretArn: string;
  consentVersion: string;
  actionTtlSeconds: number;
  inviteLimit: number;
  metaConcurrency: number;
  metaDailyRequestLimit: number;
  metaDailyTokenLimit: number;
  voiceDailyTokenMintLimit: number;
  features: {
    researchUploads: boolean;
    researchArchive: boolean;
    connectors: boolean;
    schedules: boolean;
    hostedModels: boolean;
    hostedVoice: boolean;
  };
}

function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    tableName: requiredEnv(environment, 'TABLE_NAME'),
    bucketName: requiredEnv(environment, 'RESEARCH_BUCKET'),
    auditBucketName: requiredEnv(environment, 'AUDIT_BUCKET'),
    releaseBucketName: requiredEnv(environment, 'RELEASE_BUCKET'),
    kmsKeyArn: requiredEnv(environment, 'KMS_KEY_ARN'),
    deletionQueueUrl: requiredEnv(environment, 'DELETION_QUEUE_URL'),
    exportQueueUrl: requiredEnv(environment, 'EXPORT_QUEUE_URL'),
    userPoolId: requiredEnv(environment, 'USER_POOL_ID'),
    metaSecretArn: requiredEnv(environment, 'META_SECRET_ARN'),
    elevenLabsSecretArn: requiredEnv(environment, 'ELEVENLABS_SECRET_ARN'),
    composioSecretArn: requiredEnv(environment, 'COMPOSIO_SECRET_ARN'),
    googleSecretArn: requiredEnv(environment, 'GOOGLE_SECRET_ARN'),
    registrationSecretArn: requiredEnv(environment, 'REGISTRATION_SECRET_ARN'),
    consentVersion: requiredEnv(environment, 'RESEARCH_CONSENT_VERSION'),
    actionTtlSeconds: positiveInteger(
      environment.ACTION_TTL_SECONDS ?? '600',
      'ACTION_TTL_SECONDS',
    ),
    inviteLimit: positiveInteger(environment.INVITE_LIMIT ?? '20', 'INVITE_LIMIT'),
    metaConcurrency: positiveInteger(environment.META_CONCURRENCY ?? '2', 'META_CONCURRENCY'),
    metaDailyRequestLimit: positiveInteger(
      environment.META_DAILY_REQUEST_LIMIT ?? '100',
      'META_DAILY_REQUEST_LIMIT',
    ),
    metaDailyTokenLimit: positiveInteger(
      environment.META_DAILY_TOKEN_LIMIT ?? '250000',
      'META_DAILY_TOKEN_LIMIT',
    ),
    voiceDailyTokenMintLimit: positiveInteger(
      environment.VOICE_DAILY_TOKEN_MINT_LIMIT ?? '20',
      'VOICE_DAILY_TOKEN_MINT_LIMIT',
    ),
    features: {
      researchUploads: booleanEnv(environment.ENABLE_RESEARCH_UPLOADS ?? 'true'),
      researchArchive: booleanEnv(environment.ENABLE_RESEARCH_ARCHIVE ?? 'true'),
      connectors: booleanEnv(environment.ENABLE_CONNECTORS ?? 'true'),
      schedules: booleanEnv(environment.ENABLE_SCHEDULES ?? 'true'),
      hostedModels: booleanEnv(environment.ENABLE_HOSTED_MODELS ?? 'true'),
      hostedVoice: booleanEnv(environment.ENABLE_HOSTED_VOICE ?? 'false'),
    },
  };
}

export function createAwsDependencies(config = loadRuntimeConfig()): ServiceDependencies {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const state = new DynamoState(documentClient, config.tableName);
  const s3 = new S3Client({});
  const sqs = new SQSClient({});
  const secrets = new SecretsManagerProvider(
    new SecretsManagerClient({}),
    config.metaSecretArn,
    config.elevenLabsSecretArn,
    config.composioSecretArn,
    config.googleSecretArn,
    config.registrationSecretArn,
  );
  const google = new GoogleWorkspaceConnector({
    credentials: state,
    secrets,
    cipher: new KmsTokenCipher(new KMSClient({}), config.kmsKeyArn),
    s3,
    stagingBucket: config.bucketName,
  });
  return {
    clock: new SystemClock(),
    ids: { next: () => randomUUID() },
    connections: state,
    connector: new HybridConnector(google, new ComposioConnector(secrets)),
    connectorUploads: state,
    actions: state,
    research: state,
    researchExports: state,
    researchExportQueue: new AwsResearchExportQueue(sqs, config.exportQueueUrl),
    researchObjects: new S3ResearchObjects(s3, config.bucketName, config.kmsKeyArn),
    releaseManifests: new S3ReleaseManifests(s3, config.releaseBucketName),
    invites: state,
    registrationLimits: state,
    identity: new CognitoIdentity(new CognitoIdentityProviderClient({}), config.userPoolId),
    deletions: state,
    deletionQueue: new AwsDeletionQueue(sqs, config.deletionQueueUrl),
    secrets,
    metaProvider: new OpenAiCompatibleMetaProvider(),
    voiceProvider: new ElevenLabsHttpProvider(),
    quota: new DynamoMetaQuota(documentClient, config.tableName, config.metaConcurrency),
    audit: new MetadataAuditSink(s3, config.auditBucketName, config.kmsKeyArn),
    config: {
      actionTtlSeconds: config.actionTtlSeconds,
      consentVersion: config.consentVersion,
      inviteLimit: config.inviteLimit,
      metaDailyRequestLimit: config.metaDailyRequestLimit,
      metaDailyTokenLimit: config.metaDailyTokenLimit,
      voiceDailyTokenMintLimit: config.voiceDailyTokenMintLimit,
      features: { ...config.features },
    },
  };
}

function requiredEnv(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function booleanEnv(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Feature flags must be true or false');
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}
