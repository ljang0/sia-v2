import { randomUUID } from 'node:crypto';
import type { ValidatedActionInvocation } from '@sia/action-gateway';
import type { BackgroundInputStatus } from './background-input.js';

export interface NativeElementAddress {
  readonly token?: string;
  readonly index?: number;
  readonly label?: string;
  readonly role?: string;
}

export interface ComputerAppBinding {
  readonly id: string;
  readonly pid: number;
  readonly identity: string;
  readonly name: string;
  readonly expiresAt: number;
}

export interface ComputerWindowBinding {
  readonly id: string;
  readonly appId: string;
  readonly pid: number;
  readonly windowId: number;
  readonly title?: string;
  readonly expiresAt: number;
}

export interface WindowSnapshotCapability {
  readonly backgroundInput?: BackgroundInputStatus;
  readonly browserUrl?: string;
  readonly capturedAt: number;
  readonly protectedControls: boolean;
  readonly pixels?: { width: number; height: number };
  readonly id: string;
  readonly appId: string;
  readonly publicWindowId: string;
  readonly pid: number;
  readonly windowId: number;
  readonly nativeSnapshotId?: string;
  readonly elements: ReadonlyMap<string, NativeElementAddress>;
}

/** The most snapshot capabilities kept at once, per surface. */
export const MAX_CAPABILITIES = 128;

/**
 * Host-owned app, window and snapshot grants for one turn's computer session. Models only
 * see the opaque ids minted here; native pids, window numbers and element tokens stay inside.
 */
export class ComputerGrants {
  readonly apps = new Map<string, ComputerAppBinding>();
  readonly windows = new Map<string, ComputerWindowBinding>();
  readonly snapshots = new Map<string, WindowSnapshotCapability>();
  readonly latestSnapshot = new Map<string, string>();
  #turnKey: string | undefined;
  #sessionId: string | undefined;

  session(request: ValidatedActionInvocation): string {
    const key = JSON.stringify([
      request.context.sessionId,
      request.context.threadId,
      request.context.turnId,
    ]);
    if (this.#turnKey !== key) {
      // A provider conversation can outlive CUA's session. New turns get new
      // authority and refs; never revive an ended session or replay its input.
      this.reset();
      this.#turnKey = key;
      this.#sessionId = `sia-computer-${randomUUID()}`;
    }
    return this.#sessionId!;
  }

  reset(): void {
    this.apps.clear();
    this.windows.clear();
    this.snapshots.clear();
    this.latestSnapshot.clear();
  }

  resolveWindow(appId: string, windowId: string): ComputerWindowBinding | undefined {
    const app = this.apps.get(appId);
    const window = this.windows.get(windowId);
    const now = Date.now();
    if (
      !app ||
      !window ||
      app.expiresAt <= now ||
      window.expiresAt <= now ||
      window.appId !== app.id ||
      window.pid !== app.pid
    ) {
      return undefined;
    }
    return window;
  }

  rememberSnapshot(capability: WindowSnapshotCapability): void {
    const key = capability.publicWindowId;
    const previous = this.latestSnapshot.get(key);
    if (previous) this.snapshots.delete(previous);
    this.latestSnapshot.set(key, capability.id);
    this.snapshots.set(capability.id, capability);
    trimMap(this.snapshots, MAX_CAPABILITIES);
  }

  elementAddress(
    snapshot: WindowSnapshotCapability,
    value: unknown,
  ): NativeElementAddress | undefined {
    return typeof value === 'string' ? snapshot.elements.get(value) : undefined;
  }
}

/** Drops the oldest entries until the map holds at most `maximum`. */
export function trimMap<K, V>(map: Map<K, V>, maximum: number): void {
  while (map.size > maximum) {
    const key = map.keys().next().value as K | undefined;
    if (key === undefined) return;
    map.delete(key);
  }
}
