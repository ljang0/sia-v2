import {
  LEGACY_GOOGLE_APP_IDS,
  TOOL_POLICIES,
  type AppId,
  type AuthContext,
  type CommitActionRequest,
  type PrepareActionRequest,
} from '../contracts.js';
import {
  CloudError,
  actionDigest,
  canonicalJson,
  constantTimeEqual,
  makeActionPreview,
} from '../domain.js';
import { ConnectorReconnectRequiredError } from '../ports.js';
import type { ConnectorExecution } from '../ports.js';
import type { ServiceDependencies } from '../services.js';
import { requireConnectorAccess } from './access.js';
import { resolveConnectorInput } from './connector-files.js';

const MAX_CONNECTOR_INPUT_BYTES = 256 * 1024;

export class ActionsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async prepare(user: AuthContext, request: PrepareActionRequest) {
    requireConnectorAccess(this.deps, user);
    const policy = TOOL_POLICIES[request.tool];
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (!connection || connection.status !== 'connected') {
      throw new CloudError(404, 'connection_not_ready', 'The selected connection is not ready');
    }
    if (!connectionSupportsTool(connection.app, policy.app)) {
      throw new CloudError(
        400,
        'tool_connection_mismatch',
        'The tool does not belong to this connection',
      );
    }
    await this.deps.connector.validateAccess?.(
      user.subject,
      request.connectionId,
      request.tool,
    );
    const executionInput = await resolveConnectorInput(
      this.deps,
      user.subject,
      request.connectionId,
      request.tool,
      request.input,
    );
    const encoded = canonicalJson(request.input);
    if (Buffer.byteLength(encoded) > MAX_CONNECTOR_INPUT_BYTES) {
      throw new CloudError(413, 'connector_input_too_large', 'Connector input exceeds 256 KiB');
    }

    if (!policy.mutation) {
      const executionId = this.deps.ids.next();
      let result: ConnectorExecution;
      try {
        result = await this.deps.connector.execute(
          user.subject,
          request.connectionId,
          request.tool,
          executionInput,
          executionId,
        );
      } catch (error) {
        await this.deps.audit.write({
          userId: user.subject,
          action: 'connector.read',
          app: policy.app,
          tool: request.tool,
          connectionId: request.connectionId,
          outcome: 'failed',
          occurredAt: this.deps.clock.now().toISOString(),
          errorCode:
            error instanceof ConnectorReconnectRequiredError
              ? 'connection_reconnect_required'
              : 'connector_execution_failed',
        });
        if (error instanceof ConnectorReconnectRequiredError) {
          await markConnectionFailed(this.deps, user.subject, request.connectionId);
          throw new CloudError(
            409,
            'connection_reconnect_required',
            'This app connection expired. Reconnect it in Settings, then try again.',
          );
        }
        throw error;
      }
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.read',
        app: policy.app,
        tool: request.tool,
        connectionId: request.connectionId,
        outcome: 'allowed',
        occurredAt: this.deps.clock.now().toISOString(),
        ...(result.opaqueResourceIds === undefined
          ? {}
          : { opaqueResourceIds: result.opaqueResourceIds.slice(0, 20) }),
      });
      return { status: 'executed' as const, executionId, result: result.data };
    }

    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    const digest = actionDigest(
      id,
      user.subject,
      request.connectionId,
      request.tool,
      request.input,
    );
    const expiresAt = Math.floor(now.getTime() / 1000) + this.deps.config.actionTtlSeconds;
    await this.deps.actions.putAction({
      id,
      userId: user.subject,
      connectionId: request.connectionId,
      tool: request.tool,
      digest,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
      inputBytes: Buffer.byteLength(encoded),
      inputKeys: Object.keys(request.input).sort(),
    });
    return {
      status: 'approval_required' as const,
      actionId: id,
      digest,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      tool: request.tool,
      app: policy.app,
      preview: makeActionPreview(request.tool, request.input),
    };
  }

  async commit(user: AuthContext, request: CommitActionRequest) {
    requireConnectorAccess(this.deps, user);
    const record = await this.deps.actions.getAction(user.subject, request.actionId);
    if (!record) throw new CloudError(404, 'action_not_found', 'Prepared action not found');
    const supplied = actionDigest(
      record.id,
      user.subject,
      record.connectionId,
      record.tool,
      request.input,
    );
    if (
      !constantTimeEqual(record.digest, request.digest) ||
      !constantTimeEqual(record.digest, supplied)
    ) {
      throw new CloudError(
        409,
        'action_digest_mismatch',
        'The approved action no longer matches its preview',
      );
    }
    const executionInput = await resolveConnectorInput(
      this.deps,
      user.subject,
      record.connectionId,
      record.tool,
      request.input,
    );
    const now = this.deps.clock.now();
    const claim = await this.deps.actions.claimAction(
      user.subject,
      record.id,
      Math.floor(now.getTime() / 1000),
    );
    if (claim === 'expired')
      throw new CloudError(410, 'action_expired', 'The approval expired; preview it again');
    if (claim === 'executing') {
      throw new CloudError(409, 'action_in_progress', 'This action is already executing', true);
    }
    if (claim === 'failed') {
      throw new CloudError(
        409,
        'action_outcome_unknown',
        'This action failed or its remote outcome is unknown; it will not be retried automatically',
      );
    }
    if (claim === 'completed')
      return { status: 'already_completed' as const, actionId: record.id };
    if (claim === 'missing')
      throw new CloudError(404, 'action_not_found', 'Prepared action not found');

    try {
      const result = await this.deps.connector.execute(
        user.subject,
        record.connectionId,
        record.tool,
        executionInput,
        record.id,
      );
      const opaqueIds = (result.opaqueResourceIds ?? []).slice(0, 20);
      await this.deps.actions.completeAction(
        user.subject,
        record.id,
        this.deps.clock.now().toISOString(),
        opaqueIds,
      );
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.write',
        app: TOOL_POLICIES[record.tool].app,
        tool: record.tool,
        connectionId: record.connectionId,
        outcome: 'allowed',
        occurredAt: this.deps.clock.now().toISOString(),
        ...(opaqueIds.length === 0 ? {} : { opaqueResourceIds: opaqueIds }),
      });
      return { status: 'completed' as const, actionId: record.id, result: result.data };
    } catch (error) {
      const reconnectRequired = error instanceof ConnectorReconnectRequiredError;
      if (reconnectRequired) {
        await markConnectionFailed(this.deps, user.subject, record.connectionId);
      }
      const errorCode = reconnectRequired
        ? 'connection_reconnect_required'
        : 'connector_execution_failed';
      await this.deps.actions.failAction(user.subject, record.id, errorCode);
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.write',
        app: TOOL_POLICIES[record.tool].app,
        tool: record.tool,
        connectionId: record.connectionId,
        outcome: 'failed',
        occurredAt: this.deps.clock.now().toISOString(),
        errorCode,
      });
      if (reconnectRequired) {
        throw new CloudError(
          409,
          'connection_reconnect_required',
          'This app connection expired. Reconnect it in Settings, then try again.',
        );
      }
      throw error;
    }
  }
}

async function markConnectionFailed(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
): Promise<void> {
  const connection = await deps.connections.getConnection(userId, connectionId);
  if (!connection) return;
  await deps.connections.putConnection({
    ...connection,
    status: 'failed',
    updatedAt: deps.clock.now().toISOString(),
  });
}

function connectionSupportsTool(connectionApp: AppId, toolApp: AppId): boolean {
  if (connectionApp === toolApp) return true;
  return (
    connectionApp === 'google_workspace' &&
    (LEGACY_GOOGLE_APP_IDS as readonly AppId[]).includes(toolApp)
  );
}
