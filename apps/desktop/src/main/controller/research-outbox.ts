import type {
  BridgeRequestMap,
  BridgeResultMap,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import type { ControllerContext } from './context.js';
import {
  isResearchBatchRecord,
  LOCAL_RESEARCH_IDENTITY,
  LOCAL_RESEARCH_RETENTION_MS,
  type ResearchBatchRecord,
  researchSyncErrorMessage,
  type ResearchSyncRecord,
  TARGET_LOCAL_RESEARCH_BATCHES,
  TARGET_LOCAL_RESEARCH_BYTES,
} from './research-records.js';

/**
 * Consented research after capture: the consent choice, encrypted local batches, and their
 * upload to Sia cloud with retry. Unsynced research is never discarded to meet a quota.
 */
export class ResearchOutbox {
  inFlightSync: Promise<void> | undefined;
  retryTimer: NodeJS.Timeout | undefined;
  retryDelayMs = 15_000;
  generation = 0;

  constructor(private readonly ctx: ControllerContext) {}

  setCapture(input: BridgeRequestMap['research.setCapture']): DesktopSnapshot {
    if (input.enabled && this.ctx.state.capture.status === 'deleting') {
      throw new Error('Finish or retry research deletion before enabling capture.');
    }
    if (
      input.enabled &&
      this.ctx.deps.cloud.configured &&
      this.ctx.deps.identity.status().state === 'signed_in' &&
      this.ctx.state.cloudFeatures.researchUploads === false
    ) {
      throw new Error('Research capture is not enabled for this Sia account.');
    }
    if (!input.enabled && !input.consentVersion && this.requiredForCurrentAccount()) {
      throw new Error(
        'Research capture is required while signed in. Sign out to stop capture.',
      );
    }
    const consentVersion = input.consentVersion ?? this.ctx.state.capture.consentVersion;
    if (
      input.enabled &&
      (!consentVersion || (!this.ctx.state.capture.consentAcceptedAt && !input.consentVersion))
    ) {
      throw new Error('Review and accept the research consent before enabling capture.');
    }
    if (input.enabled) {
      const identity = this.ctx.currentIdentityKey();
      if (
        identity &&
        this.ctx.state.researchIdentity &&
        this.ctx.state.researchIdentity !== LOCAL_RESEARCH_IDENTITY &&
        this.ctx.state.researchIdentity !== identity &&
        this.batches().some(({ batchId }) => !this.batchSynced(batchId))
      ) {
        throw new Error(
          'This Mac has unsynced research for another Sia account. Sign in with that account or delete its local research before continuing.',
        );
      }
      this.ctx.state.researchIdentity = identity ?? LOCAL_RESEARCH_IDENTITY;
      const acceptedAt =
        input.consentVersion &&
        (input.consentVersion !== this.ctx.state.capture.consentVersion ||
          !this.ctx.state.capture.consentAcceptedAt)
          ? new Date().toISOString()
          : this.ctx.state.capture.consentAcceptedAt;
      this.ctx.state.capture = {
        status: 'recording',
        pendingCount: this.ctx.state.capture.pendingCount,
        consentVersion: consentVersion!,
        promptReviewedVersion: consentVersion!,
        ...(acceptedAt ? { consentAcceptedAt: acceptedAt } : {}),
      };
      this.refreshPendingCount();
    } else if (input.consentVersion) {
      this.ctx.state.capture = {
        status: 'not_consented',
        pendingCount: this.ctx.state.capture.pendingCount,
        promptReviewedVersion: input.consentVersion,
      };
      for (const staged of this.ctx.researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
    } else {
      this.ctx.state.capture.status = 'paused';
      for (const staged of this.ctx.researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
    }
    this.ctx.deps.trajectory?.record({
      type: input.enabled
        ? 'research_consent_accepted'
        : input.consentVersion
          ? 'research_consent_declined'
          : 'research_capture_paused',
      threadId: 'app-lifecycle',
      consentVersion,
      signedIn: this.ctx.deps.identity.status().state === 'signed_in',
    });
    this.ctx.commit();
    if (input.enabled) this.scheduleSync();
    return this.ctx.resultSnapshot();
  }

  async exportResearch(): Promise<BridgeResultMap['research.export']> {
    if (!this.ctx.deps.fakeServices && this.requiredForCurrentAccount()) {
      const { downloadUrl } = await this.ctx.deps.cloud.requestResearchExport();
      await this.ctx.deps.openExternal(downloadUrl);
      return { path: null };
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      consentVersion: this.ctx.state.capture.consentVersion,
      batches: this.batches(),
    };
    return { path: await this.ctx.deps.exportJson(payload) };
  }

  async deleteResearch(confirmation: 'DELETE'): Promise<DesktopSnapshot> {
    if (confirmation !== 'DELETE') throw new Error('Deletion confirmation was not supplied.');
    const previousCapture = structuredClone(this.ctx.state.capture);
    this.ctx.state.capture.status = 'deleting';
    this.ctx.commit();
    try {
      const inFlightResearchSync = this.inFlightSync;
      for (const staged of this.ctx.researchStaging.values()) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
      this.generation += 1;
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
      }
      await inFlightResearchSync?.catch(() => undefined);
      if (!this.ctx.deps.fakeServices && this.requiredForCurrentAccount()) {
        try {
          await this.ctx.deps.cloud.deleteResearchData();
        } catch {
          throw new Error(
            'Sia could not confirm cloud deletion. Local research batches remain available so you can retry safely.',
          );
        }
      } else if (!this.ctx.deps.fakeServices && this.ctx.deps.cloud.configured) {
        throw new Error(
          'Sign in to Sia cloud to delete local research batches and any previously synced copy.',
        );
      }
      this.ctx.researchStaging.clear();
      for (const record of this.ctx.deps.repository.list<Record<string, unknown>>('research')) {
        const id =
          typeof record.batchId === 'string'
            ? record.batchId
            : typeof record.id === 'string'
              ? record.id
              : undefined;
        if (id) this.ctx.deps.repository.remove('research', id);
      }
      for (const record of this.ctx.deps.repository.list<ResearchSyncRecord>('research_sync')) {
        if (record.batchId) this.ctx.deps.repository.remove('research_sync', record.batchId);
      }
      const promptReviewedVersion =
        this.ctx.state.capture.consentVersion ?? this.ctx.state.capture.promptReviewedVersion;
      this.ctx.state.capture = {
        status: 'not_consented',
        pendingCount: 0,
        ...(promptReviewedVersion ? { promptReviewedVersion } : {}),
      };
      this.ctx.commit();
      return this.ctx.resultSnapshot();
    } catch (error) {
      this.ctx.state.capture = previousCapture;
      this.refreshPendingCount();
      this.ctx.commit();
      this.scheduleSync();
      throw error;
    }
  }

  batches(): ResearchBatchRecord[] {
    return this.ctx.deps.repository
      .list<unknown>('research')
      .filter((value): value is ResearchBatchRecord => isResearchBatchRecord(value));
  }

  pruneExpiredBatches(): void {
    const cutoff = Date.now() - LOCAL_RESEARCH_RETENTION_MS;
    for (const batch of this.batches()) {
      const occurredAt = Date.parse(batch.events[0]?.occurredAt ?? '');
      if (
        Number.isFinite(occurredAt) &&
        occurredAt < cutoff &&
        this.batchSynced(batch.batchId)
      ) {
        this.ctx.deps.repository.remove('research', batch.batchId);
        this.ctx.deps.repository.remove('research_sync', batch.batchId);
      }
    }
  }

  prepareLocalStorage(incomingBytes: number): void {
    const batches = this.batches();
    let storedBytes = batches.reduce(
      (total, batch) => total + Buffer.byteLength(JSON.stringify(batch), 'utf8'),
      0,
    );
    let storedBatches = batches.length;
    const removable = batches
      .filter(({ batchId }) => this.batchSynced(batchId))
      .sort(
        (left, right) =>
          Date.parse(left.events[0]?.occurredAt ?? '') -
          Date.parse(right.events[0]?.occurredAt ?? ''),
      );
    while (
      storedBytes + incomingBytes > TARGET_LOCAL_RESEARCH_BYTES ||
      storedBatches >= TARGET_LOCAL_RESEARCH_BATCHES
    ) {
      const oldest = removable.shift();
      if (!oldest) break;
      storedBytes -= Buffer.byteLength(JSON.stringify(oldest), 'utf8');
      storedBatches -= 1;
      this.ctx.deps.repository.remove('research', oldest.batchId);
      this.ctx.deps.repository.remove('research_sync', oldest.batchId);
    }
  }

  storeBatch(batch: ResearchBatchRecord): boolean {
    try {
      this.ctx.deps.repository.put('research', batch.batchId, batch);
      this.ctx.deps.repository.put<ResearchSyncRecord>('research_sync', batch.batchId, {
        batchId: batch.batchId,
        synced: false,
      });
      return true;
    } catch {
      // Do not continue taking research-required turns after the encrypted outbox fails. If the
      // batch write succeeded but its sync marker did not, the absent marker already means
      // "unsynced", so the raw batch remains eligible for a later upload.
      this.blockCapture(
        'Sia could not durably queue the raw research record. Free disk space or sign out, then reopen Sia before continuing.',
      );
      return false;
    }
  }

  blockCapture(reason: string): void {
    this.ctx.state.capture.status = 'blocked';
    this.ctx.state.capture.blockedReason = reason;
    this.ctx.state.capture.lastSyncError = reason;
    this.refreshPendingCount();
    try {
      this.ctx.commit();
    } catch {
      // A storage failure may prevent even the status update from reaching disk. The in-memory
      // status still makes the running process fail closed.
    }
  }

  refreshPendingCount(): void {
    const pending = this.batches().filter(
      (batch) => batch.syncEligible !== false && !this.batchSynced(batch.batchId),
    );
    this.ctx.state.capture.pendingCount = pending.reduce(
      (count, batch) => count + batch.events.length,
      0,
    );
    if (pending.length) {
      this.ctx.state.capture.pendingBytes = pending.reduce(
        (bytes, batch) => bytes + Buffer.byteLength(JSON.stringify(batch), 'utf8'),
        0,
      );
    } else {
      delete this.ctx.state.capture.pendingBytes;
    }
    const oldest = pending
      .map((batch) => batch.events[0]?.occurredAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    if (oldest) this.ctx.state.capture.oldestPendingAt = oldest;
    else delete this.ctx.state.capture.oldestPendingAt;
  }

  scheduleSync(): void {
    if (
      this.ctx.state.capture.status === 'deleting' ||
      this.ctx.state.capture.pendingCount === 0 ||
      this.inFlightSync ||
      this.ctx.state.cloudFeatures.researchUploads === false
    )
      return;
    if (
      this.ctx.deps.fakeServices ||
      !this.ctx.deps.cloud.configured ||
      this.ctx.deps.identity.status().state !== 'signed_in' ||
      this.ctx.state.researchIdentity !== this.ctx.currentIdentityKey()
    ) {
      if (this.ctx.state.capture.status === 'recording') {
        this.ctx.state.capture.status = 'sync_pending';
        this.ctx.commit();
      }
      return;
    }
    const generation = this.generation;
    this.inFlightSync = this.syncBatches(generation).finally(() => {
      this.inFlightSync = undefined;
      if (this.ctx.state.capture.pendingCount > 0 && !this.retryTimer) {
        this.scheduleSync();
      }
    });
  }

  async syncBatches(generation: number): Promise<void> {
    try {
      for (const batch of this.batches().filter(
        ({ batchId, syncEligible }) => syncEligible !== false && !this.batchSynced(batchId),
      )) {
        await this.ctx.deps.cloud.uploadResearchBatch(batch);
        if (generation !== this.generation) return;
        const current = this.ctx.deps.repository.get<ResearchBatchRecord>(
          'research',
          batch.batchId,
        );
        if (!current) continue;
        this.ctx.deps.repository.put<ResearchSyncRecord>('research_sync', batch.batchId, {
          batchId: batch.batchId,
          synced: true,
        });
      }
      if (generation !== this.generation) return;
      this.retryDelayMs = 15_000;
      delete this.ctx.state.capture.lastSyncError;
      this.refreshPendingCount();
      if (
        this.ctx.state.capture.pendingCount === 0 &&
        (this.ctx.state.capture.status === 'sync_pending' ||
          this.ctx.state.capture.status === 'blocked')
      ) {
        this.ctx.state.capture.status = 'recording';
        delete this.ctx.state.capture.blockedReason;
      }
      this.ctx.commit();
    } catch (error) {
      if (generation !== this.generation) return;
      this.refreshPendingCount();
      this.ctx.state.capture.lastSyncError = researchSyncErrorMessage(error);
      if (this.ctx.state.capture.status === 'recording') {
        this.ctx.state.capture.status = 'sync_pending';
      }
      this.ctx.commit();
      this.scheduleRetry();
    }
  }

  scheduleRetry(): void {
    if (
      this.ctx.state.capture.status === 'deleting' ||
      this.retryTimer ||
      this.ctx.state.capture.pendingCount === 0 ||
      this.ctx.state.cloudFeatures.researchUploads === false
    )
      return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 5 * 60_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.scheduleSync();
    }, delay);
    this.retryTimer.unref();
  }

  requiredForCurrentAccount(): boolean {
    return (
      this.ctx.deps.cloud.configured &&
      this.ctx.deps.identity.status().state === 'signed_in' &&
      this.ctx.state.cloudFeatures.researchUploads !== false
    );
  }

  disableForCurrentAccessPolicy(): void {
    this.generation += 1;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    for (const staged of this.ctx.researchStaging.values()) {
      staged.tainted = true;
      staged.events = [];
      staged.rawEvents = [];
      staged.eventByMessageId.clear();
    }
    this.ctx.researchStaging.clear();
    for (const batch of this.batches()) {
      if (batch.syncEligible === false || this.batchSynced(batch.batchId)) continue;
      this.ctx.deps.repository.put('research', batch.batchId, {
        ...batch,
        syncEligible: false,
      });
    }
    this.ctx.state.capture = { status: 'not_consented', pendingCount: 0 };
    this.refreshPendingCount();
  }

  batchSynced(batchId: string): boolean {
    return (
      this.ctx.deps.repository.get<ResearchSyncRecord>('research_sync', batchId)?.synced ??
      false
    );
  }

  async clearForIdentityBoundary(): Promise<void> {
    const inFlight = this.inFlightSync;
    this.generation += 1;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    for (const staged of this.ctx.researchStaging.values()) {
      staged.tainted = true;
      staged.events = [];
      staged.eventByMessageId.clear();
    }
    await inFlight?.catch(() => undefined);
    this.ctx.researchStaging.clear();
    for (const batch of this.ctx.deps.repository.list<ResearchBatchRecord>('research')) {
      if (batch.batchId) this.ctx.deps.repository.remove('research', batch.batchId);
    }
    for (const sync of this.ctx.deps.repository.list<ResearchSyncRecord>('research_sync')) {
      if (sync.batchId) this.ctx.deps.repository.remove('research_sync', sync.batchId);
    }
    delete this.ctx.state.researchIdentity;
    this.ctx.state.capture = { status: 'not_consented', pendingCount: 0 };
  }
}
