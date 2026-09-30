import type { BridgeResultMap, DesktopSnapshot } from '../../shared/bridge.js';
import { isGoogleConnection } from './connection-ids.js';
import type { ControllerContext } from './context.js';
import { INITIAL_STATE } from './persisted-state.js';
import { LOCAL_RESEARCH_IDENTITY } from './research-records.js';

/**
 * Email sign-in, MFA, session refresh, sign-out and account deletion, and the identity boundary
 * that clears account-bound state when the signed-in person changes.
 */
export class CloudAccount {
  cloudParticipant = false;
  signOutInProgress = false;
  accountDeletionInProgress = false;

  constructor(private readonly ctx: ControllerContext) {}

  async startSignIn(email: string): Promise<DesktopSnapshot> {
    if (this.ctx.deps.cloud.configured) await this.ctx.deps.cloud.registerAccount(email);
    await this.ctx.deps.identity.startEmailSignIn(email);
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async completeSignIn(code: string): Promise<DesktopSnapshot> {
    const state = this.ctx.deps.identity.status().state;
    if (state === 'password_required') {
      if (!this.ctx.deps.identity.completePasswordSignIn) {
        throw new Error('Administrator password sign-in is unavailable in this build.');
      }
      await this.ctx.deps.identity.completePasswordSignIn(code);
    } else if (state === 'mfa_required') {
      if (!this.ctx.deps.identity.completeMfaSignIn) {
        throw new Error('Authenticator sign-in is unavailable in this build.');
      }
      await this.ctx.deps.identity.completeMfaSignIn(code);
    } else {
      await this.ctx.deps.identity.completeEmailSignIn(code);
    }
    await this.reconcileIdentityBoundState();
    await this.refreshCloudSession();
    await this.ctx.providers.refreshMetaProviderState();
    await this.ctx.deps.voice?.refresh().catch(() => undefined);
    this.ctx.researchOutbox.scheduleSync();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async beginMfaEnrollment(): Promise<BridgeResultMap['auth.mfaBegin']> {
    if (!this.ctx.deps.identity.beginMfaEnrollment) {
      throw new Error('Authenticator setup is unavailable in this build.');
    }
    return await this.ctx.deps.identity.beginMfaEnrollment();
  }

  async completeMfaEnrollment(code: string): Promise<DesktopSnapshot> {
    if (!this.ctx.deps.identity.completeMfaEnrollment) {
      throw new Error('Authenticator setup is unavailable in this build.');
    }
    await this.ctx.deps.identity.completeMfaEnrollment(code);
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async refreshCloudSession(): Promise<void> {
    if (
      this.ctx.deps.fakeServices ||
      !this.ctx.deps.cloud.configured ||
      this.ctx.deps.identity.status().state !== 'signed_in'
    )
      return;
    try {
      const previousToolAvailability = this.toolAvailabilitySignature();
      const session = await this.ctx.deps.cloud.sessionStatus();
      this.cloudParticipant = session.participant;
      this.ctx.state.cloudFeatures = structuredClone(session.features);
      if (!session.features.researchUploads)
        this.ctx.researchOutbox.disableForCurrentAccessPolicy();
      if (previousToolAvailability !== this.toolAvailabilitySignature()) {
        await this.ctx.runtime?.resetSessions();
      }
    } catch {
      // Keep the last signed operator policy while offline. Cloud endpoints enforce the current
      // policy independently, so a stale cache cannot re-enable a server-side capability.
    }
  }

  async signOut(): Promise<DesktopSnapshot> {
    this.signOutInProgress = true;
    this.ctx.emit();
    try {
      this.ctx.connections.setup?.controller.abort();
      await this.stopAllWorkForAuthenticationBoundary();
      if (this.ctx.deps.cloud.configured) {
        await this.ctx.researchOutbox.inFlightSync?.catch(() => undefined);
        this.ctx.researchOutbox.refreshPendingCount();
        if (this.ctx.state.capture.pendingCount > 0) {
          await this.ctx.researchOutbox.syncBatches(this.ctx.researchOutbox.generation);
          this.ctx.researchOutbox.refreshPendingCount();
        }
        if (this.ctx.state.capture.pendingCount > 0) {
          throw new Error(
            'Sia still has raw research waiting for AWS. Reconnect and retry, or delete the research data before signing out.',
          );
        }
      }
      await this.ctx.researchOutbox.clearForIdentityBoundary();
      await this.ctx.deps.identity.signOut();
      this.cloudParticipant = false;
      this.ctx.state.cloudFeatures = structuredClone(INITIAL_STATE.cloudFeatures);
      await this.ctx.runtime?.resetSessions();
      await this.ctx.providers.refreshMetaProviderState();
      this.ctx.connections.lockConnections(
        'Sign in with the account that created this grant to manage it.',
      );
      this.ctx.commit();
      return this.ctx.resultSnapshot();
    } finally {
      this.signOutInProgress = false;
      this.ctx.emit();
    }
  }

  async stopAllWorkForAuthenticationBoundary(): Promise<void> {
    this.ctx.deps.voice?.disconnect();
    const queuedTurnIds = this.ctx.turns.queued.map(({ id }) => id);
    const affectedThreadIds = new Set(this.ctx.turns.queued.map(({ threadId }) => threadId));
    this.ctx.turns.queued = [];
    for (const turnId of queuedTurnIds) this.ctx.researchCapture.discardResearchTurn(turnId);

    for (const [threadId, running] of this.ctx.turns.running) {
      affectedThreadIds.add(threadId);
      const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
      const turnId = thread ? this.ctx.turns.workspaceLeases.get(thread.workspace) : undefined;
      running.abort(new Error('Sia signed out.'));
      if (turnId) {
        this.ctx.approvals.revokeApprovalsForTurn(threadId, turnId);
        void this.ctx.runtime?.cancel(threadId, turnId).catch(() => undefined);
      }
    }
    for (const [threadId, question] of this.ctx.turns.pendingQuestions) {
      affectedThreadIds.add(threadId);
      void this.ctx.runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    }
    this.ctx.turns.pendingQuestions.clear();
    for (const [approvalId, pending] of [...this.ctx.approvals.pending]) {
      this.ctx.approvals.revokeApproval(approvalId, pending);
    }
    for (const threadId of affectedThreadIds) {
      const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
      if (thread) {
        thread.status = 'idle';
        delete thread.queueReason;
      }
    }
    await Promise.allSettled([...this.ctx.turns.tasks.values()]);
  }

  async deleteCloudAccount(confirmation: 'DELETE ACCOUNT'): Promise<DesktopSnapshot> {
    if (confirmation !== 'DELETE ACCOUNT') {
      throw new Error('Enter DELETE ACCOUNT exactly to confirm account deletion.');
    }
    if (!this.ctx.deps.cloud.configured) {
      throw new Error('Sia cloud account deletion is not configured in this build.');
    }
    if (this.ctx.deps.identity.status().state !== 'signed_in') {
      throw new Error('Sign in to the Sia cloud account you want to delete.');
    }

    const previousCapture = structuredClone(this.ctx.state.capture);
    this.ctx.connections.setup?.controller.abort();
    const inFlightResearchSync = this.ctx.researchOutbox.inFlightSync;
    let cloudCompleted = false;
    this.accountDeletionInProgress = true;
    this.ctx.deps.voice?.disconnect();
    this.ctx.state.capture.status = 'deleting';
    this.ctx.commit();

    try {
      this.ctx.researchOutbox.generation += 1;
      if (this.ctx.researchOutbox.retryTimer) {
        clearTimeout(this.ctx.researchOutbox.retryTimer);
        this.ctx.researchOutbox.retryTimer = undefined;
      }

      const queuedTurnIds = this.ctx.turns.queued.map(({ id }) => id);
      const affectedThreadIds = new Set(this.ctx.turns.queued.map(({ threadId }) => threadId));
      this.ctx.turns.queued = [];
      for (const turnId of queuedTurnIds) this.ctx.researchCapture.discardResearchTurn(turnId);

      for (const [threadId, running] of this.ctx.turns.running) {
        affectedThreadIds.add(threadId);
        const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
        const turnId = thread
          ? this.ctx.turns.workspaceLeases.get(thread.workspace)
          : undefined;
        running.abort(new Error('Sia account deletion was requested.'));
        if (turnId) {
          this.ctx.approvals.revokeApprovalsForTurn(threadId, turnId);
          void this.ctx.runtime?.cancel(threadId, turnId).catch(() => undefined);
        }
      }
      for (const [threadId, question] of this.ctx.turns.pendingQuestions) {
        affectedThreadIds.add(threadId);
        void this.ctx.runtime
          ?.respondToRequest(threadId, { requestId: question.requestId })
          .catch(() => undefined);
      }
      this.ctx.turns.pendingQuestions.clear();
      for (const [approvalId, pending] of [...this.ctx.approvals.pending]) {
        this.ctx.approvals.revokeApproval(approvalId, pending);
      }
      for (const threadId of affectedThreadIds) {
        const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
        if (thread) {
          thread.status = 'idle';
          delete thread.queueReason;
        }
      }

      await Promise.allSettled([...this.ctx.turns.tasks.values()]);
      await inFlightResearchSync?.catch(() => undefined);

      const deletion = await this.ctx.deps.cloud.deleteAccountData();
      if (
        deletion.scope !== 'account' ||
        deletion.state !== 'completed' ||
        deletion.id.length === 0
      ) {
        throw new Error('Sia cloud did not confirm the accepted account deletion job.');
      }
      cloudCompleted = true;

      // The concrete identity manager clears encrypted local tokens before its
      // best-effort Cognito revocation call. The cloud identity is already gone.
      await this.ctx.deps.identity.signOut().catch(() => undefined);
      if (this.ctx.browser.sessionId) {
        await this.ctx.deps.computer
          .call(
            'end_session',
            { session: this.ctx.browser.sessionId },
            { kind: 'direct_user', operation: 'browser_detach' },
          )
          .catch(() => undefined);
      }
      this.ctx.browserCapabilitySink?.resetBrowserCapabilities();
      this.ctx.browser.target = undefined;
      this.ctx.browser.sessionId = undefined;
      await this.ctx.runtime?.resetSessions();

      this.ctx.researchCapture.staging.clear();
      this.ctx.workspaceGrants.clear();
      this.ctx.approvals.approvedConnectorBindings.clear();
      this.ctx.turns.running.clear();
      for (const threadId of this.ctx.mac.awakeTurns)
        this.ctx.deps.keepAwake?.release(threadId);
      this.ctx.mac.awakeTurns.clear();
      this.ctx.mac.turns.clear();
      this.ctx.mac.foregroundTurns.clear();
      this.ctx.turns.tasks.clear();
      this.ctx.turns.workspaceLeases.clear();
      this.ctx.approvals.pending.clear();
      this.ctx.deps.repository.clearAll();
      this.ctx.state = structuredClone(INITIAL_STATE);
      this.ctx.researchOutbox.inFlightSync = undefined;
      this.ctx.researchOutbox.retryDelayMs = 15_000;
      await this.ctx.providers.refreshMetaProviderState();
      this.ctx.revision += 1;
      this.ctx.emit();
      return this.ctx.resultSnapshot();
    } catch (error) {
      if (cloudCompleted) {
        throw new Error(
          'Your Sia cloud account was deleted, but this Mac could not finish clearing local Sia data. Quit Sia and contact the maintainer before using it again.',
        );
      }
      this.ctx.state.capture = previousCapture;
      this.ctx.commit();
      this.ctx.researchOutbox.scheduleSync();
      throw error;
    } finally {
      this.accountDeletionInProgress = false;
    }
  }

  async reconcileIdentityBoundState(): Promise<void> {
    if (this.ctx.deps.fakeServices) return;
    const storedBatches = this.ctx.researchOutbox.batches();
    if (!this.ctx.state.researchIdentity && storedBatches.length > 0) {
      // Old local-only builds predate the ownership marker. Fail private: retain those
      // batches locally and mark them ineligible for any future cloud sync.
      this.ctx.state.researchIdentity = LOCAL_RESEARCH_IDENTITY;
      for (const batch of storedBatches) {
        if (batch.syncEligible === false) continue;
        this.ctx.deps.repository.put('research', batch.batchId, {
          ...batch,
          syncEligible: false,
        });
      }
    }
    const identity = this.currentIdentityKey();
    if (!identity) {
      if (
        this.ctx.deps.cloud.configured &&
        this.ctx.state.researchIdentity !== LOCAL_RESEARCH_IDENTITY &&
        (this.ctx.state.researchIdentity || storedBatches.length)
      ) {
        this.ctx.state.capture = {
          status: 'not_consented',
          pendingCount: this.ctx.state.capture.pendingCount,
          ...(this.ctx.state.capture.promptReviewedVersion
            ? { promptReviewedVersion: this.ctx.state.capture.promptReviewedVersion }
            : {}),
        };
      }
      this.ctx.connections.lockConnections(
        'Sign in with the account that created this grant to manage it.',
      );
      return;
    }
    if (this.ctx.state.researchIdentity === LOCAL_RESEARCH_IDENTITY) {
      // Existing local captures stay local-only. New captures can sync under the
      // explicitly signed-in identity covered by the same reviewed consent.
      this.ctx.state.researchIdentity = identity;
    } else if (
      this.ctx.state.researchIdentity &&
      this.ctx.state.researchIdentity !== identity
    ) {
      if (storedBatches.some(({ batchId }) => !this.ctx.researchOutbox.batchSynced(batchId))) {
        this.ctx.researchOutbox.blockCapture(
          'This Mac has unsynced research for another Sia account. Sign in with that account or delete its local research before continuing.',
        );
        this.ctx.connections.lockConnections(
          'This grant belongs to another Sia cloud account.',
        );
        return;
      }
      await this.ctx.researchOutbox.clearForIdentityBoundary();
    }
    const pendingGoogleUpgrades = new Set<string>();
    for (const connection of this.ctx.state.connections) {
      if (!connection.connectionId) continue;
      const owner = this.ctx.state.connectionOwners[connection.id];
      if (owner !== identity) {
        connection.status = 'error';
        delete connection.account;
        connection.detail = owner
          ? 'This grant belongs to another Sia cloud account.'
          : 'This legacy grant has no verifiable account owner; reconnect is blocked.';
        continue;
      }
      try {
        const result = await this.ctx.deps.cloud.connectionStatus(connection.id);
        const remote = result.connections.find(({ id }) => id === connection.connectionId);
        if (remote?.status === 'connected') {
          connection.status = 'connected';
          if (remote.accountLabel) connection.account = remote.accountLabel;
          if (isGoogleConnection(connection.id) && remote.access) {
            connection.googleAccess = remote.access;
          }
          if (connection.upgradeConnectionId) {
            pendingGoogleUpgrades.add(connection.upgradeConnectionId);
          }
          delete connection.detail;
        } else {
          connection.status = 'error';
          connection.detail =
            'This saved grant is not connected. Disconnect it before starting a new grant.';
        }
      } catch {
        connection.status = 'error';
        connection.detail = 'Sia could not verify this saved grant. Try again when online.';
      }
    }
    for (const upgradeId of pendingGoogleUpgrades)
      void this.ctx.connections.pollGoogleUpgrade(upgradeId);
  }

  currentIdentityKey(): string | undefined {
    const status = this.ctx.deps.identity.status();
    return status.state === 'signed_in' && status.email
      ? status.email.trim().toLowerCase()
      : undefined;
  }

  toolAvailabilitySignature(): string {
    return `${this.ctx.actionToolAvailable('mail_search')}:${this.ctx.actionToolAvailable('schedule_list')}`;
  }
}
