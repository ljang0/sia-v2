import { LEGACY_GOOGLE_APP_IDS, type AppId, type AuthContext } from '../contracts.js';
import { CloudError } from '../domain.js';
import type { ServiceDependencies } from '../services.js';
import { requireConnectorAccess } from './access.js';

export class ConnectionsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async start(
    user: AuthContext,
    app: AppId,
    callbackUrl?: string,
    access?: 'read_only' | 'read_write',
  ) {
    requireConnectorAccess(this.deps, user);
    if (callbackUrl !== undefined) validateCallback(callbackUrl);
    if (app !== 'google_workspace' && access !== undefined) {
      throw new CloudError(400, 'invalid_request', 'Access level is only supported for Google');
    }
    const link = await this.deps.connector.beginConnection(
      user.subject,
      app,
      callbackUrl,
      access,
    );
    const now = this.deps.clock.now().toISOString();
    await this.deps.connections.putConnection({
      id: link.connectionId,
      userId: user.subject,
      app,
      status: 'link_pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: Math.floor(Date.parse(link.expiresAt) / 1000),
    });
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.start',
      app,
      connectionId: link.connectionId,
      outcome: 'allowed',
      occurredAt: now,
    });
    return {
      app,
      connectionId: link.connectionId,
      redirectUrl: link.redirectUrl,
      expiresAt: link.expiresAt,
    };
  }

  async status(user: AuthContext, app: AppId) {
    const records = (await this.deps.connections.listConnections(user.subject)).filter(
      (record) => record.app === app && record.status !== 'disconnected',
    );
    const output = [];
    for (const record of records) {
      if (record.status === 'failed') {
        output.push({
          id: record.id,
          app: record.app,
          status: record.status,
          accountLabel: record.accountLabel,
        });
        continue;
      }
      const current = await this.deps.connector.connectionStatus(record.id);
      const { expiresAt: _pendingLinkExpiry, ...durableRecord } = record;
      const updated = {
        ...(current.status === 'link_pending' ? record : durableRecord),
        status: current.status,
        updatedAt: this.deps.clock.now().toISOString(),
        ...(current.accountLabel === undefined ? {} : { accountLabel: current.accountLabel }),
      };
      await this.deps.connections.putConnection(updated);
      output.push({
        id: updated.id,
        app: updated.app,
        status: updated.status,
        accountLabel: updated.accountLabel,
        ...(current.access === undefined ? {} : { access: current.access }),
      });
    }
    return { connections: output };
  }

  async disconnect(user: AuthContext, app: AppId, connectionId: string) {
    const record = await this.deps.connections.getConnection(user.subject, connectionId);
    if (!record) {
      // Disconnect is intentionally idempotent. The upstream grant may already have
      // been removed (for example, after an OAuth window is cancelled or a retry
      // races with status reconciliation) while the desktop still holds its opaque
      // connection id. Returning success lets the client discard that stale local
      // reference without attempting to revoke an unowned grant.
      return { disconnected: true };
    }
    if (!connectionAppMatches(record.app, app))
      throw new CloudError(404, 'connection_not_found', 'Connection not found');
    await this.deps.connector.disconnect(connectionId);
    await this.deps.connections.deleteConnection(user.subject, connectionId);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.disconnect',
      app,
      connectionId,
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return { disconnected: true };
  }

  async retireSupersededGoogle(
    user: AuthContext,
    app: AppId,
    connectionId: string,
    replacementConnectionId: string,
  ) {
    requireConnectorAccess(this.deps, user);
    if (app !== 'google_workspace') {
      throw new CloudError(
        400,
        'invalid_request',
        'Only a Google Workspace credential can be superseded',
      );
    }
    if (connectionId === replacementConnectionId) {
      throw new CloudError(
        400,
        'invalid_request',
        'The replacement connection must be different from the superseded connection',
      );
    }

    const replacement = await this.deps.connections.getConnection(
      user.subject,
      replacementConnectionId,
    );
    if (
      !replacement ||
      replacement.app !== 'google_workspace' ||
      replacement.status !== 'connected'
    ) {
      throw new CloudError(
        409,
        'replacement_connection_not_ready',
        'The replacement Google editor connection is not ready',
      );
    }
    const replacementStatus =
      await this.deps.connector.connectionStatus(replacementConnectionId);
    if (replacementStatus.status !== 'connected' || replacementStatus.access !== 'read_write') {
      throw new CloudError(
        409,
        'replacement_connection_not_ready',
        'The replacement Google editor connection is not ready',
      );
    }

    const superseded = await this.deps.connections.getConnection(user.subject, connectionId);
    if (!superseded) return { retired: true };
    if (superseded.app !== 'google_workspace') {
      throw new CloudError(404, 'connection_not_found', 'Connection not found');
    }
    const supersededAccount = superseded.accountLabel?.trim().toLowerCase();
    const replacementAccount = (replacementStatus.accountLabel ?? replacement.accountLabel)
      ?.trim()
      .toLowerCase();
    if (!supersededAccount || !replacementAccount || supersededAccount !== replacementAccount) {
      throw new CloudError(
        409,
        'replacement_account_mismatch',
        'The replacement must use the same Google account',
      );
    }
    if (!this.deps.connector.retireSuperseded) {
      throw new CloudError(
        503,
        'connection_retirement_unavailable',
        'Google connection upgrade is unavailable',
        true,
      );
    }

    await this.deps.connector.retireSuperseded(connectionId);
    await this.deps.connections.deleteConnection(user.subject, connectionId);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.superseded',
      app,
      connectionId,
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return { retired: true };
  }

  async completeGoogleOAuth(request: { state: string; code?: string; error?: string }) {
    if (!this.deps.connector.completeGoogleOAuth) {
      throw new CloudError(503, 'google_oauth_unavailable', 'Google connection is unavailable');
    }
    const result = await this.deps.connector.completeGoogleOAuth(request);
    const record = await this.deps.connections.getConnection(
      result.userId,
      result.connectionId,
    );
    if (!record || record.app !== 'google_workspace') {
      throw new CloudError(400, 'oauth_state_invalid', 'This Google connection link expired');
    }
    const now = this.deps.clock.now().toISOString();
    await this.deps.connections.putConnection({
      ...record,
      status: result.connected ? 'connected' : 'failed',
      updatedAt: now,
      ...(result.accountLabel === undefined ? {} : { accountLabel: result.accountLabel }),
    });
    await this.deps.audit.write({
      userId: result.userId,
      action: result.connected ? 'connection.oauth.completed' : 'connection.oauth.denied',
      app: 'google_workspace',
      connectionId: result.connectionId,
      outcome: result.connected ? 'allowed' : 'denied',
      occurredAt: now,
    });
    return {
      connected: result.connected,
      accountLabel: result.accountLabel,
      failure: result.failure,
    };
  }
}

function validateCallback(callbackUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new CloudError(400, 'invalid_callback', 'The callback URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'sia:') {
    throw new CloudError(
      400,
      'invalid_callback',
      'Only HTTPS or sia: callback URLs are allowed',
    );
  }
  if (parsed.username || parsed.password) {
    throw new CloudError(400, 'invalid_callback', 'Callback credentials are not allowed');
  }
}

function connectionAppMatches(recordApp: AppId, requestedApp: AppId): boolean {
  if (recordApp === requestedApp) return true;
  return (
    requestedApp === 'google_workspace' &&
    (LEGACY_GOOGLE_APP_IDS as readonly AppId[]).includes(recordApp)
  );
}
