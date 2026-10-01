import type { ActionExecutionResult } from '@sia/action-gateway';
import { refused, stale } from './action-results.js';
import { requiredString } from './arguments.js';
import { BrowserUploadVaults } from './browser-uploads.js';
import { browserUrlLooksSensitive, originFromRecord } from './browser-urls.js';
import { MAX_CAPABILITIES, trimMap } from './computer-grants.js';
import { collectTabRecords, firstBoolean, firstString } from './driver-records.js';

export interface BrowserBinding {
  readonly targetId: string;
  readonly tabId: string;
  readonly session: string;
  origin?: string;
}

export interface BrowserSnapshotCapability {
  readonly id: string;
  readonly targetId: string;
  readonly tabId: string;
  readonly session: string;
  readonly origin: string;
  readonly url: string;
  readonly elements: ReadonlyMap<
    string,
    { readonly nativeRef: string; readonly label?: string; readonly role?: string }
  >;
}

/**
 * Host-owned tab bindings and snapshot grants for the attached Chrome session. Cua target
 * ids and native element refs stay here; models only see Sia-minted tab and element refs.
 */
export class BrowserGrants {
  sessionId: string;
  attached = false;
  readonly bindings = new Map<string, BrowserBinding>();
  readonly snapshots = new Map<string, BrowserSnapshotCapability>();
  readonly latestSnapshot = new Map<string, string>();
  readonly uploads = new BrowserUploadVaults();

  constructor(
    sessionId: string,
    private readonly isOriginAllowed: ((origin: string) => boolean) | undefined,
  ) {
    this.sessionId = sessionId;
  }

  /** Whether the host layers its own origin policy on top of the CUA attachment grant. */
  get hasOriginPolicy(): boolean {
    return this.isOriginAllowed !== undefined;
  }

  accept(value: unknown, sessionId?: string): void {
    if (sessionId && sessionId !== this.sessionId) {
      this.reset();
      this.sessionId = sessionId;
    }
    this.indexBindings(value);
    this.attached = true;
  }

  reset(): void {
    this.attached = false;
    this.bindings.clear();
    this.snapshots.clear();
    this.latestSnapshot.clear();
    this.uploads.removeAll();
  }

  indexBindings(value: unknown): void {
    for (const record of collectTabRecords(value)) {
      if (firstBoolean(record, ['private', 'incognito', 'is_private'])) continue;
      const targetId = firstString(record, ['target_id', 'targetId']);
      const tabId = firstString(record, ['tab_id', 'tabId']);
      if (!targetId || !tabId) continue;
      const previous = this.bindings.get(tabId);
      const origin =
        originFromRecord(record) ??
        (previous?.targetId === targetId ? previous.origin : undefined);
      const binding: BrowserBinding = {
        targetId,
        tabId,
        session: this.sessionId,
        ...(origin ? { origin } : {}),
      };
      this.bindings.set(tabId, binding);
    }
  }

  rememberSnapshot(capability: BrowserSnapshotCapability): void {
    const previous = this.latestSnapshot.get(capability.tabId);
    if (previous) this.snapshots.delete(previous);
    this.latestSnapshot.set(capability.tabId, capability.id);
    this.snapshots.set(capability.id, capability);
    trimMap(this.snapshots, MAX_CAPABILITIES);
  }

  originAllowed(origin: string): boolean {
    return this.isOriginAllowed?.(origin) ?? true;
  }

  bindingOriginAllowed(binding: BrowserBinding): boolean {
    return this.isOriginAllowed
      ? Boolean(binding.origin && this.isOriginAllowed(binding.origin))
      : true;
  }

  checkDeclaredOrigin(
    binding: BrowserBinding,
    value: unknown,
  ): ActionExecutionResult | undefined {
    if (typeof value !== 'string') return undefined;
    let declared: string;
    try {
      declared = new URL(value).origin;
    } catch {
      return refused('The declared browser origin is invalid.');
    }
    if (!this.originAllowed(declared)) {
      return refused(`The origin ${declared} is outside the current browser grant.`);
    }
    if (binding.origin && binding.origin !== declared) {
      return stale('The tab navigated away from the origin associated with this action.');
    }
    return undefined;
  }

  nativeRef(snapshot: BrowserSnapshotCapability, value: unknown): string | undefined {
    return typeof value === 'string' ? snapshot.elements.get(value)?.nativeRef : undefined;
  }

  /** Resolves the latest snapshot grant for a tab, failing closed on any attachment change. */
  async capability(
    tabValue: unknown,
    snapshotValue: unknown,
  ): Promise<BrowserSnapshotCapability | ActionExecutionResult> {
    const tabId = requiredString(tabValue, 'tab_id');
    const snapshotId = requiredString(snapshotValue, 'snapshot_id');
    const capability = this.snapshots.get(snapshotId);
    if (
      !capability ||
      capability.tabId !== tabId ||
      this.latestSnapshot.get(tabId) !== snapshotId
    ) {
      return stale('The browser snapshot is missing, superseded, or belongs to another tab.');
    }
    const binding = this.bindings.get(tabId);
    if (
      !binding ||
      binding.targetId !== capability.targetId ||
      binding.session !== capability.session ||
      binding.origin !== capability.origin ||
      browserUrlLooksSensitive(capability.url) ||
      !this.originAllowed(capability.origin)
    ) {
      return stale('The browser attachment changed after this snapshot was captured.');
    }
    // A semantic_v2 read here would invalidate the exact native ref that the
    // user just approved. Cua Driver re-proves the tab binding, navigation,
    // frame identity, and node liveness atomically when the mutation uses it.
    return capability;
  }
}
