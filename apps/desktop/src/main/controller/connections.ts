import { randomUUID } from 'node:crypto';
import type {
  BridgeRequestMap,
  BridgeResultMap,
  ConnectionView,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import { abortableDelay } from './async-utils.js';
import { GOOGLE_CONNECTION_IDS, isGoogleConnection } from './connection-ids.js';
import type { ControllerContext } from './context.js';

/**
 * Connects, polls, upgrades and disconnects Google Workspace, Slack and app connectors, and maps
 * connector actions to the connection that serves them.
 */
export class ConnectorConnections {
  readonly generations = new Map<ConnectionView['id'], number>();
  readonly linkExpiries = new Map<string, number>();
  setup: { controller: AbortController; task: Promise<void> } | undefined;

  constructor(private readonly ctx: ControllerContext) {}

  /** Keeps opaque cloud connection ids out of model arguments and renderer-controlled routing. */
  connectionIdForAction(
    app: ConnectionView['id'],
    selector: string,
    approvalId?: string,
  ): string | undefined {
    if (this.ctx.releaseAccessLocked()) return undefined;
    const connection = this.ctx.state.connections.find((candidate) => candidate.id === app);
    if (
      !connection?.connectionId ||
      connection.status !== 'connected' ||
      connection.enabled === false ||
      (selector !== app && selector !== connection.account)
    ) {
      return undefined;
    }
    if (approvalId) {
      const approved = this.ctx.approvedConnectorBindings.get(approvalId);
      this.ctx.approvedConnectorBindings.delete(approvalId);
      if (
        !approved ||
        approved.app !== app ||
        approved.selector !== selector ||
        approved.connectionId !== connection.connectionId ||
        approved.generation !== (this.generations.get(app) ?? 0) ||
        approved.account !== connection.account ||
        this.ctx.activeTurnId(approved.threadId) !== approved.turnId
      ) {
        return undefined;
      }
    }
    return connection.connectionId;
  }

  markConnectionReconnectRequired(app: ConnectionView['id'], connectionId: string): void {
    const connection = this.ctx.state.connections.find((candidate) => candidate.id === app);
    if (!connection || connection.connectionId !== connectionId) return;
    const affected = isGoogleConnection(app) ? GOOGLE_CONNECTION_IDS : [app];
    for (const id of affected) {
      const candidate = this.ctx.state.connections.find((connection) => connection.id === id);
      if (candidate?.connectionId !== connectionId) continue;
      this.updateConnection(id, {
        status: 'error',
        detail:
          'This app connection expired. Reconnect Google Workspace, then retry the action.',
      });
    }
    this.ctx.commit();
    this.ctx.researchCapture.recordLifecycleEvent('connector.setup.failed', {
      app,
      connectionId,
      reason: 'connection_reconnect_required',
    });
  }

  async startGoogleConnections(): Promise<BridgeResultMap['connections.startGoogle']> {
    return this.startSelectedConnections(['google']);
  }

  async startSelectedConnections(
    apps: ('google' | 'slack')[],
  ): Promise<BridgeResultMap['connections.startSelected']> {
    if (this.setup) throw new Error('Work-app setup is already waiting for provider approval.');
    if (apps.includes('google')) {
      await this.removeLegacyGoogleConnections();
      for (const id of GOOGLE_CONNECTION_IDS) this.updateConnection(id, { enabled: true });
      this.ctx.commit();
    }
    return this.startConnectionGroup(apps.map((id) => (id === 'google' ? 'gmail' : 'slack')));
  }

  async upgradeGoogleConnections(): Promise<BridgeResultMap['connections.upgradeGoogle']> {
    const google = this.ctx.state.connections.filter(({ id }) => isGoogleConnection(id));
    const grantIds = new Set(google.map(({ connectionId }) => connectionId).filter(Boolean));
    if (
      grantIds.size !== 1 ||
      google.some(({ status, connectionId }) => status !== 'connected' || !connectionId)
    ) {
      throw new Error('Connect Google read-only before enabling editing and sending.');
    }
    if (google.every(({ googleAccess }) => googleAccess === 'read_write')) {
      return { opened: false, snapshot: this.ctx.resultSnapshot() };
    }
    if (google.some(({ upgradeConnectionId }) => Boolean(upgradeConnectionId))) {
      return { opened: false, snapshot: this.ctx.resultSnapshot() };
    }
    const owner = this.ctx.account.currentIdentityKey();
    if (!this.ctx.deps.fakeServices && !owner) {
      throw new Error('Sign in to Sia cloud before enabling Google editing.');
    }
    if (this.ctx.deps.fakeServices) {
      for (const id of GOOGLE_CONNECTION_IDS) {
        this.updateConnection(id, { googleAccess: 'read_write' });
      }
      this.ctx.commit();
      return { opened: false, snapshot: this.ctx.resultSnapshot() };
    }

    const started = await this.ctx.deps.cloud.startConnection('gmail', 'read_write');
    const linkExpiry = Date.parse(started.expiresAt);
    if (Number.isFinite(linkExpiry)) {
      this.linkExpiries.set(started.connectionId, linkExpiry);
    }
    for (const id of GOOGLE_CONNECTION_IDS) {
      this.updateConnection(id, { upgradeConnectionId: started.connectionId });
    }
    this.ctx.commit();
    const url = new URL(started.redirectUrl);
    if (url.protocol !== 'https:') throw new Error('Connector authorization must use HTTPS.');
    await this.ctx.deps.openExternal(url.toString());
    this.ctx.researchCapture.recordLifecycleEvent('connector.google_access.upgrade_started', {
      app: 'gmail',
      connectionId: started.connectionId,
    });
    void this.pollGoogleUpgrade(started.connectionId);
    return { opened: true, snapshot: this.ctx.resultSnapshot() };
  }

  async startGoogleConnection(
    connectionId: ConnectionView['id'],
  ): Promise<BridgeResultMap['connections.start']> {
    await this.removeLegacyGoogleConnections();
    const googleAlreadyConnected = this.ctx.state.connections.some(
      ({ id, status, connectionId: grantId }) =>
        isGoogleConnection(id) && status === 'connected' && Boolean(grantId),
    );
    for (const id of GOOGLE_CONNECTION_IDS) {
      if (id === connectionId || !googleAlreadyConnected) {
        this.updateConnection(id, { enabled: id === connectionId });
      }
    }
    this.ctx.commit();
    return await this.startConnectionGroup([connectionId]);
  }

  setConnectionEnabled(request: BridgeRequestMap['connections.setEnabled']): DesktopSnapshot {
    const { connectionId, enabled } = request;
    if (!isGoogleConnection(connectionId)) {
      throw new Error('Slack access is managed by connecting or disconnecting its workspace.');
    }
    const connection = this.ctx.state.connections.find(({ id }) => id === connectionId);
    if (!connection?.connectionId || connection.status !== 'connected') {
      throw new Error('Connect Google Workspace before changing its service access.');
    }
    const owner = this.ctx.state.connectionOwners[connectionId];
    if (!this.ctx.deps.fakeServices && owner !== this.ctx.account.currentIdentityKey()) {
      throw new Error('Sign in with the account that created this grant before changing it.');
    }
    this.generations.set(connectionId, (this.generations.get(connectionId) ?? 0) + 1);
    this.updateConnection(connectionId, { enabled });
    this.ctx.commit();
    this.ctx.researchCapture.recordLifecycleEvent(
      enabled ? 'connector.service.enabled' : 'connector.service.disabled',
      { app: connectionId, connectionId: connection.connectionId },
    );
    return this.ctx.resultSnapshot();
  }

  async removeLegacyGoogleConnections(): Promise<void> {
    const google = this.ctx.state.connections.filter(({ id }) => isGoogleConnection(id));
    const grants = new Set(google.map(({ connectionId }) => connectionId).filter(Boolean));
    const unified =
      grants.size === 1 &&
      google.every(
        ({ status, connectionId }) => status === 'connected' && Boolean(connectionId),
      );
    if (unified || grants.size === 0) return;
    const revoked = new Set<string>();
    for (const connection of google) {
      if (!connection.connectionId || revoked.has(connection.connectionId)) continue;
      revoked.add(connection.connectionId);
      await this.disconnectConnection({
        connectionId: connection.id,
        expectedConnectionId: connection.connectionId,
      });
    }
  }

  async startConnectionGroup(
    included: readonly ConnectionView['id'][],
  ): Promise<BridgeResultMap['connections.startGoogle']> {
    if (this.setup) {
      throw new Error('Work-app setup is already waiting for provider approval.');
    }
    const interrupted = this.ctx.state.connections.find(
      (connection) =>
        included.includes(connection.id) &&
        connection.status === 'error' &&
        connection.connectionId,
    );
    if (interrupted) {
      throw new Error(`Disconnect ${interrupted.label}'s saved grant before continuing setup.`);
    }
    if (
      this.ctx.state.connections.some(
        (connection) => included.includes(connection.id) && connection.status === 'connecting',
      )
    ) {
      throw new Error('Finish the current app approval before continuing setup.');
    }
    const pending = this.ctx.state.connections
      .filter(
        (connection) => included.includes(connection.id) && connection.status !== 'connected',
      )
      .map((connection) => connection.id);
    if (pending.length === 0) return { opened: false, snapshot: this.ctx.resultSnapshot() };
    this.ctx.researchCapture.recordLifecycleEvent('connector.guided_setup.started', {
      apps: pending,
    });

    if (this.ctx.deps.fakeServices) {
      for (const connectionId of pending) {
        await this.startConnection(connectionId, { partOfBundle: true });
      }
      this.ctx.researchCapture.recordLifecycleEvent('connector.guided_setup.completed', {
        apps: pending,
      });
      return { opened: false, snapshot: this.ctx.resultSnapshot() };
    }

    const firstId = pending[0]!;
    const started = await this.startConnection(firstId, {
      poll: false,
      partOfBundle: true,
    });
    const expectedId = this.ctx.state.connections.find(
      ({ id }) => id === firstId,
    )?.connectionId;
    if (!expectedId) throw new Error('The connected-app provider did not return a grant id.');

    const controller = new AbortController();
    const task = this.continueConnectionSetup(pending, firstId, expectedId, controller.signal);
    this.setup = { controller, task };
    const finish = (): void => {
      if (this.setup?.task === task) this.setup = undefined;
    };
    void task.then(finish, finish);
    return { opened: started.opened, snapshot: this.ctx.resultSnapshot() };
  }

  async continueConnectionSetup(
    ordered: readonly ConnectionView['id'][],
    firstId: ConnectionView['id'],
    firstExpectedId: string,
    signal: AbortSignal,
  ): Promise<void> {
    let index = ordered.indexOf(firstId);
    let expectedId = firstExpectedId;
    while (index >= 0 && index < ordered.length && !signal.aborted) {
      const currentId = ordered[index]!;
      if (!(await this.pollConnection(currentId, expectedId, signal))) return;
      index += 1;
      const nextId = ordered[index];
      if (!nextId || signal.aborted) {
        if (!signal.aborted && index >= ordered.length) {
          this.ctx.researchCapture.recordLifecycleEvent('connector.guided_setup.completed', {
            apps: ordered,
          });
        }
        return;
      }
      try {
        await this.startConnection(nextId, {
          poll: false,
          partOfBundle: true,
        });
      } catch {
        return;
      }
      const nextExpectedId = this.ctx.state.connections.find(
        ({ id }) => id === nextId,
      )?.connectionId;
      if (!nextExpectedId) return;
      expectedId = nextExpectedId;
    }
  }

  async startConnection(
    connectionId: BridgeRequestMap['connections.start']['connectionId'],
    options: { poll?: boolean; partOfBundle?: boolean } = {},
  ): Promise<BridgeResultMap['connections.start']> {
    if (!this.ctx.deps.fakeServices && this.ctx.state.cloudFeatures?.connectors === false) {
      throw new Error('Connected apps are temporarily disabled by the alpha operator.');
    }
    if (this.setup && !options.partOfBundle) {
      throw new Error('Finish or cancel the guided work-app setup first.');
    }
    const googleConnection = isGoogleConnection(connectionId);
    let existing = this.ctx.state.connections.find(({ id }) => id === connectionId);
    if (existing?.connectionId) {
      if (existing.status !== 'error') {
        throw new Error('Disconnect the existing or pending grant before connecting again.');
      }
      await this.disconnectConnection({
        connectionId,
        expectedConnectionId: existing.connectionId,
      });
      existing = this.ctx.state.connections.find(({ id }) => id === connectionId);
    }
    const owner = this.ctx.account.currentIdentityKey();
    if (!this.ctx.deps.fakeServices && !owner) {
      throw new Error('Sign in to Sia cloud before connecting an app.');
    }
    this.ctx.researchCapture.recordLifecycleEvent('connector.setup.started', {
      app: connectionId,
      guided: Boolean(options.partOfBundle),
    });
    const affected = googleConnection ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
      this.updateConnection(id, { status: 'connecting' });
    }
    this.ctx.commit();
    if (this.ctx.deps.fakeServices) {
      const connectedAccount = `demo@${googleConnection ? 'google' : connectionId}.test`;
      const connectedId = `fake-${googleConnection ? 'google' : connectionId}-${randomUUID()}`;
      for (const id of affected) {
        this.updateConnection(id, {
          status: 'connected',
          account: connectedAccount,
          connectionId: connectedId,
          ...(googleConnection ? { googleAccess: 'read_write' as const } : {}),
        });
      }
      this.ctx.commit();
      this.ctx.researchCapture.recordLifecycleEvent('connector.connected', {
        app: connectionId,
        account: connectedAccount,
        connectionId: connectedId,
      });
      return { opened: false, snapshot: this.ctx.resultSnapshot() };
    }
    try {
      const started = await this.ctx.deps.cloud.startConnection(connectionId);
      const linkExpiry = Date.parse(started.expiresAt);
      if (Number.isFinite(linkExpiry)) {
        this.linkExpiries.set(started.connectionId, linkExpiry);
      }
      for (const id of affected) {
        this.ctx.state.connectionOwners[id] = owner!;
        this.updateConnection(id, {
          status: 'connecting',
          connectionId: started.connectionId,
        });
      }
      this.ctx.commit();
      const url = new URL(started.redirectUrl);
      if (url.protocol !== 'https:') throw new Error('Connector authorization must use HTTPS.');
      await this.ctx.deps.openExternal(url.toString());
      this.ctx.researchCapture.recordLifecycleEvent('connector.authorization.opened', {
        app: connectionId,
        connectionId: started.connectionId,
      });
      if (options.poll !== false) void this.pollConnection(connectionId, started.connectionId);
      return { opened: true, snapshot: this.ctx.resultSnapshot() };
    } catch (error) {
      for (const id of affected) {
        this.updateConnection(id, {
          status: 'error',
          detail: error instanceof Error ? error.message : 'Connection setup failed.',
        });
      }
      this.ctx.commit();
      this.ctx.researchCapture.recordLifecycleEvent('connector.setup.failed', {
        app: connectionId,
        reason: 'Connection setup failed.',
      });
      throw error;
    }
  }

  /** A Google app joins the one Workspace grant; Slack connects on its own. */
  async startAppConnection(
    connectionId: BridgeRequestMap['connections.start']['connectionId'],
  ): Promise<BridgeResultMap['connections.start']> {
    return await (isGoogleConnection(connectionId)
      ? this.startGoogleConnection(connectionId)
      : this.startConnection(connectionId));
  }

  async disconnectConnection(
    request: BridgeRequestMap['connections.disconnect'],
  ): Promise<DesktopSnapshot> {
    const { connectionId, expectedConnectionId } = request;
    const current = this.ctx.state.connections.find(({ id }) => id === connectionId);
    if (expectedConnectionId && current?.connectionId !== expectedConnectionId) {
      throw new Error(
        `${current?.label ?? 'This app'} changed since this screen was shown. Review the current connection before disconnecting it.`,
      );
    }
    this.setup?.controller.abort();
    this.generations.set(connectionId, (this.generations.get(connectionId) ?? 0) + 1);
    const owner = this.ctx.state.connectionOwners[connectionId];
    if (
      !this.ctx.deps.fakeServices &&
      owner &&
      owner !== this.ctx.account.currentIdentityKey()
    ) {
      throw new Error('Sign in with the account that created this grant before revoking it.');
    }
    if (!this.ctx.deps.fakeServices && current?.connectionId) {
      if (
        !this.ctx.deps.cloud.configured ||
        this.ctx.deps.identity.status().state !== 'signed_in'
      ) {
        throw new Error('Sign in to Sia cloud before revoking this connected app.');
      }
    }
    if (
      !this.ctx.deps.fakeServices &&
      this.ctx.deps.cloud.configured &&
      current?.connectionId
    ) {
      await this.ctx.deps.cloud.disconnect(connectionId, current.connectionId);
    }
    const unifiedGoogle = Boolean(
      isGoogleConnection(connectionId) &&
      current?.connectionId &&
      (current.connectionId.startsWith('gw_') ||
        this.ctx.state.connections.filter(({ connectionId: id }) => id === current.connectionId)
          .length > 1),
    );
    const affected = unifiedGoogle ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.updateConnection(id, { status: 'disconnected' });
      const disconnected = this.ctx.state.connections.find(
        (connection) => connection.id === id,
      );
      if (disconnected) {
        delete disconnected.account;
        delete disconnected.detail;
        delete disconnected.connectionId;
        delete disconnected.googleAccess;
        delete disconnected.upgradeConnectionId;
      }
      delete this.ctx.state.connectionOwners[id];
    }
    this.ctx.commit();
    this.ctx.researchCapture.recordLifecycleEvent('connector.disconnected', {
      app: connectionId,
      ...(current?.connectionId ? { connectionId: current.connectionId } : {}),
    });
    return this.ctx.resultSnapshot();
  }

  async pollConnection(
    connectionId: ConnectionView['id'],
    expectedId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    // Provider authorization links currently remain valid for roughly ten minutes. Honor the
    // exact server-supplied expiry (plus a small callback grace period) so users are not shown a
    // false timeout while they review Google or Slack's consent screens.
    const deadline = (this.linkExpiries.get(expectedId) ?? Date.now() + 10 * 60_000) + 15_000;
    const finish = (connected: boolean): boolean => {
      this.linkExpiries.delete(expectedId);
      return connected;
    };
    let lastStatusError: unknown;
    while (Date.now() < deadline) {
      await abortableDelay(2_000, signal);
      const current = this.ctx.state.connections.find(({ id }) => id === connectionId);
      if (!current || current.connectionId !== expectedId || current.status !== 'connecting')
        return finish(false);
      try {
        const status = await this.ctx.deps.cloud.connectionStatus(connectionId);
        const pending = this.ctx.state.connections.find(({ id }) => id === connectionId);
        if (
          signal?.aborted ||
          !pending ||
          pending.connectionId !== expectedId ||
          pending.status !== 'connecting'
        ) {
          return finish(false);
        }
        const remote = status.connections.find(({ id }) => id === expectedId);
        if (remote?.status === 'connected') {
          const affected = isGoogleConnection(connectionId)
            ? GOOGLE_CONNECTION_IDS
            : [connectionId];
          for (const id of affected) {
            this.updateConnection(id, {
              status: 'connected',
              connectionId: expectedId,
              ...(remote.accountLabel ? { account: remote.accountLabel } : {}),
              ...(isGoogleConnection(connectionId) && remote.access
                ? { googleAccess: remote.access }
                : {}),
            });
          }
          this.ctx.commit();
          this.ctx.researchCapture.recordLifecycleEvent('connector.connected', {
            app: connectionId,
            connectionId: expectedId,
            ...(remote.accountLabel ? { account: remote.accountLabel } : {}),
          });
          return finish(true);
        }
        if (remote?.status === 'failed') {
          const affected = isGoogleConnection(connectionId)
            ? GOOGLE_CONNECTION_IDS
            : [connectionId];
          for (const id of affected) {
            this.updateConnection(id, {
              status: 'error',
              detail: 'The connected-app provider declined setup.',
            });
          }
          this.ctx.commit();
          this.ctx.researchCapture.recordLifecycleEvent('connector.setup.failed', {
            app: connectionId,
            connectionId: expectedId,
            reason: 'The connected-app provider declined setup.',
          });
          return finish(false);
        }
        lastStatusError = undefined;
      } catch (error) {
        const pending = this.ctx.state.connections.find(({ id }) => id === connectionId);
        if (
          signal?.aborted ||
          !pending ||
          pending.connectionId !== expectedId ||
          pending.status !== 'connecting'
        ) {
          return finish(false);
        }
        // OAuth approval often outlives a brief laptop/network interruption. Keep the
        // pending grant stable and retry rather than forcing the user to disconnect it.
        lastStatusError = error;
      }
    }
    const affected = isGoogleConnection(connectionId) ? GOOGLE_CONNECTION_IDS : [connectionId];
    for (const id of affected) {
      this.updateConnection(id, {
        status: 'error',
        detail: lastStatusError
          ? 'Sia could not verify the connection before setup timed out. Check your network, then try again.'
          : 'Connection setup timed out. You can safely try again.',
      });
    }
    this.ctx.commit();
    this.ctx.researchCapture.recordLifecycleEvent('connector.setup.timed_out', {
      app: connectionId,
      connectionId: expectedId,
    });
    return finish(false);
  }

  async pollGoogleUpgrade(expectedId: string): Promise<void> {
    const deadline = (this.linkExpiries.get(expectedId) ?? Date.now() + 10 * 60_000) + 15_000;
    const previousIds = new Set(
      this.ctx.state.connections
        .filter(({ upgradeConnectionId }) => upgradeConnectionId === expectedId)
        .map(({ connectionId }) => connectionId)
        .filter((connectionId): connectionId is string =>
          Boolean(connectionId && connectionId !== expectedId),
        ),
    );
    const clearPending = (): void => {
      this.linkExpiries.delete(expectedId);
      for (const id of GOOGLE_CONNECTION_IDS) {
        const connection = this.ctx.state.connections.find((candidate) => candidate.id === id);
        if (connection?.upgradeConnectionId === expectedId) {
          delete connection.upgradeConnectionId;
        }
      }
      this.ctx.commit();
    };
    while (Date.now() < deadline) {
      await abortableDelay(2_000);
      if (
        !this.ctx.state.connections.some(
          ({ upgradeConnectionId }) => upgradeConnectionId === expectedId,
        )
      ) {
        return;
      }
      try {
        const status = await this.ctx.deps.cloud.connectionStatus('gmail');
        const remote = status.connections.find(({ id }) => id === expectedId);
        if (remote?.status === 'connected' && remote.access === 'read_write') {
          // Retire only Sia's encrypted copy of the prior credential. Do not disconnect it from
          // Google: both refresh tokens may belong to the same authorization grant, so revoking
          // the old token can invalidate the verified editor replacement as well.
          for (const previousId of previousIds) {
            await this.ctx.deps.cloud.retireSupersededGoogleConnection(previousId, expectedId);
          }
          for (const id of GOOGLE_CONNECTION_IDS) {
            const connection = this.ctx.state.connections.find(
              (candidate) => candidate.id === id,
            );
            if (!connection || connection.upgradeConnectionId !== expectedId) continue;
            connection.connectionId = expectedId;
            connection.googleAccess = 'read_write';
            if (remote.accountLabel) connection.account = remote.accountLabel;
            delete connection.upgradeConnectionId;
            delete connection.detail;
          }
          this.linkExpiries.delete(expectedId);
          this.ctx.commit();
          this.ctx.researchCapture.recordLifecycleEvent('connector.google_access.upgraded', {
            app: 'gmail',
            connectionId: expectedId,
          });
          return;
        }
        if (remote?.status === 'failed') {
          clearPending();
          this.ctx.researchCapture.recordLifecycleEvent(
            'connector.google_access.upgrade_failed',
            {
              app: 'gmail',
              connectionId: expectedId,
            },
          );
          return;
        }
      } catch {
        // The existing read-only grant remains usable while transient status checks retry.
      }
    }
    clearPending();
  }

  updateConnection(
    id: ConnectionView['id'],
    patch: Partial<Omit<ConnectionView, 'id' | 'label'>>,
  ): void {
    const connection = this.ctx.state.connections.find((candidate) => candidate.id === id);
    if (!connection) throw new Error(`Unknown connection ${id}.`);
    Object.assign(connection, patch);
  }

  connectorAccountLabel(accountId: unknown): string | undefined {
    if (typeof accountId !== 'string') return undefined;
    const connection = this.ctx.state.connections.find(
      (candidate) => candidate.connectionId === accountId || candidate.id === accountId,
    );
    return connection?.account;
  }

  lockConnections(detail: string): void {
    for (const connection of this.ctx.state.connections) {
      if (!connection.connectionId) continue;
      connection.status = 'error';
      connection.detail = detail;
      delete connection.account;
    }
  }
}
