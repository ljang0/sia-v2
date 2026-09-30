import type {
  ActionRepository,
  AuditSink,
  Clock,
  ConnectionRepository,
  ConnectorProvider,
  ConnectorUploadRepository,
  DeletionQueue,
  DeletionRepository,
  IdGenerator,
  IdentityProvider,
  InviteRepository,
  RegistrationRateLimitRepository,
  QuotaGate,
  ResearchExportQueue,
  ResearchExportRepository,
  ResearchObjectStore,
  ReleaseManifestStore,
  ResearchRepository,
  SecretProvider,
  MetaProvider,
  VoiceProvider,
} from './ports.js';
import { InvitesService, RegistrationService } from './services/accounts.js';
import { ActionsService } from './services/actions.js';
import { ConnectionsService } from './services/connections.js';
import { ConnectorFilesService } from './services/connector-files.js';
import { MetaService } from './services/meta.js';
import { ReleaseService } from './services/release.js';
import { ResearchAdminService } from './services/research-admin.js';
import { ResearchService } from './services/research.js';
import { SessionService } from './services/session.js';
import { VoiceService } from './services/voice.js';
import { DeletionWorker, ResearchExportWorker } from './services/workers.js';

export interface ServiceDependencies {
  clock: Clock;
  ids: IdGenerator;
  connections: ConnectionRepository;
  connector: ConnectorProvider;
  connectorUploads: ConnectorUploadRepository;
  actions: ActionRepository;
  research: ResearchRepository;
  researchExports: ResearchExportRepository;
  researchExportQueue: ResearchExportQueue;
  researchObjects: ResearchObjectStore;
  releaseManifests: ReleaseManifestStore;
  invites: InviteRepository;
  registrationLimits: RegistrationRateLimitRepository;
  identity: IdentityProvider;
  deletions: DeletionRepository;
  deletionQueue: DeletionQueue;
  secrets: SecretProvider;
  metaProvider: MetaProvider;
  voiceProvider: VoiceProvider;
  quota: QuotaGate;
  audit: AuditSink;
  config: {
    actionTtlSeconds: number;
    consentVersion: string;
    inviteLimit: number;
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
  };
}

export function createServices(deps: ServiceDependencies) {
  const meta = new MetaService(deps);
  return {
    session: new SessionService(deps),
    releases: new ReleaseService(deps),
    connections: new ConnectionsService(deps),
    connectorFiles: new ConnectorFilesService(deps),
    actions: new ActionsService(deps),
    research: new ResearchService(deps),
    researchAdmin: new ResearchAdminService(deps),
    researchExportWorker: new ResearchExportWorker(deps),
    invites: new InvitesService(deps),
    registration: new RegistrationService(deps),
    meta,
    hostedModels: meta,
    voice: new VoiceService(deps),
    deletionWorker: new DeletionWorker(deps),
  };
}
