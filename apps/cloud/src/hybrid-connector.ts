import type { AppId, GoogleAccessLevel, ToolName } from './contracts.js';
import { CloudError } from './domain.js';
import type {
  ConnectorExecution,
  ConnectorFileUploadGrant,
  ConnectorLink,
  ConnectorProvider,
  ConnectorStatus,
} from './ports.js';
import type { GoogleWorkspaceConnector } from './google-workspace.js';

export class HybridConnector implements ConnectorProvider {
  constructor(
    private readonly google: GoogleWorkspaceConnector,
    private readonly composio: ConnectorProvider,
  ) {}

  async beginConnection(
    userId: string,
    app: AppId,
    callbackUrl?: string,
    access?: GoogleAccessLevel,
  ): Promise<ConnectorLink> {
    return app === 'google_workspace'
      ? this.google.beginConnection(userId, access)
      : this.composio.beginConnection(userId, app, callbackUrl);
  }

  async validateAccess(userId: string, connectionId: string, tool: ToolName): Promise<void> {
    if (this.google.owns(connectionId)) {
      await this.google.validateAccess(userId, connectionId, tool);
      return;
    }
    await this.composio.validateAccess?.(userId, connectionId, tool);
  }

  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    return this.google.owns(connectionId)
      ? this.google.connectionStatus(connectionId)
      : this.composio.connectionStatus(connectionId);
  }

  async disconnect(connectionId: string): Promise<void> {
    return this.google.owns(connectionId)
      ? this.google.disconnect(connectionId)
      : this.composio.disconnect(connectionId);
  }

  async retireSuperseded(connectionId: string): Promise<void> {
    if (!this.google.owns(connectionId)) {
      throw new CloudError(
        400,
        'unsupported_connection_retirement',
        'Only a superseded Google Workspace credential can be retired',
      );
    }
    await this.google.retireSuperseded(connectionId);
  }

  async requestFileUpload(
    connectionId: string,
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant> {
    return this.google.owns(connectionId)
      ? this.google.requestFileUpload(connectionId, fileName, mimeType)
      : this.composio.requestFileUpload(connectionId, tool, fileName, mimeType, md5);
  }

  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    return this.google.owns(connectionId)
      ? this.google.execute(userId, connectionId, tool, input, idempotencyKey)
      : this.composio.execute(userId, connectionId, tool, input, idempotencyKey);
  }

  async completeGoogleOAuth(request: {
    state: string;
    code?: string;
    error?: string;
  }): Promise<{
    connectionId: string;
    userId: string;
    connected: boolean;
    accountLabel?: string;
  }> {
    return this.google.completeOAuth(request);
  }
}
