import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Always-on local trajectory log. One directory per thread under
 * `<userData>/trajectories/<threadId>/` holding `events.jsonl` (requests, replies, notices,
 * approvals, tool actions with their arguments and outcomes, browser/computer state changes)
 * and any images the actions returned (screenshots, snapshots) as files referenced from the
 * JSONL rows. Google Workspace connector turns are removed and suppressed. The remaining exact
 * plain files stay on this Mac. When versioned raw research consent is
 * active, equivalent observed turn events are separately queued in encrypted research bundles.
 * Complete local thread directories roll off after 90 days or when this store exceeds 128 MiB;
 * the separately encrypted research outbox follows its own acknowledged-upload retention rules.
 */
export interface TrajectoryEvent {
  readonly type: string;
  readonly threadId: string;
  readonly turnId?: string | undefined;
  readonly [key: string]: unknown;
}

export interface TrajectoryImage {
  readonly mimeType: string;
  readonly dataBase64: string;
}

export interface TrajectoryRecorderOptions {
  readonly rootDirectory: string;
  readonly enabled: () => boolean;
  readonly now?: () => Date;
  readonly maxAgeMs?: number;
  readonly maxBytes?: number;
  readonly maintenanceIntervalMs?: number;
}

const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1_000;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class TrajectoryRecorder {
  readonly #root: string;
  readonly #enabled: () => boolean;
  readonly #now: () => Date;
  readonly #maxAgeMs: number;
  readonly #maxBytes: number;
  readonly #maintenanceIntervalMs: number;
  #sequence = 0;
  readonly #excludedTurns = new Set<string>();
  #estimatedBytes: number | undefined;
  #lastMaintenanceMs = Number.NEGATIVE_INFINITY;

  constructor(options: TrajectoryRecorderOptions) {
    this.#root = options.rootDirectory;
    this.#enabled = options.enabled;
    this.#now = options.now ?? (() => new Date());
    this.#maxAgeMs = positiveLimit(options.maxAgeMs, DEFAULT_MAX_AGE_MS);
    this.#maxBytes = positiveLimit(options.maxBytes, DEFAULT_MAX_BYTES);
    this.#maintenanceIntervalMs = nonNegativeLimit(
      options.maintenanceIntervalMs,
      DEFAULT_MAINTENANCE_INTERVAL_MS,
    );
  }

  get rootDirectory(): string {
    return this.#root;
  }

  /** Appends one event; images are written beside the log and referenced by relative path. */
  record(event: TrajectoryEvent, images: readonly TrajectoryImage[] = []): void {
    if (!this.#enabled()) return;
    if (event.turnId && this.#excludedTurns.has(this.#turnKey(event.threadId, event.turnId))) {
      return;
    }
    try {
      const at = this.#now();
      const stamp = at.toISOString();
      const preparedImages: Array<{
        reference: { file: string; mimeType: string };
        bytes: Uint8Array;
      }> = [];
      images.forEach((image, index) => {
        const extension = EXTENSIONS[image.mimeType];
        if (!extension) return;
        const name = `${stamp.replace(/[:.]/g, '-')}-${String(++this.#sequence).padStart(4, '0')}${index ? `-${index}` : ''}.${extension}`;
        preparedImages.push({
          reference: { file: name, mimeType: image.mimeType },
          bytes: Buffer.from(image.dataBase64, 'base64'),
        });
      });
      const row = {
        at: stamp,
        ...event,
        ...(preparedImages.length
          ? { images: preparedImages.map(({ reference }) => reference) }
          : {}),
      };
      const line = `${JSON.stringify(row)}\n`;
      const incomingBytes =
        Buffer.byteLength(line) +
        preparedImages.reduce((total, image) => total + image.bytes.byteLength, 0);
      const directory = this.#threadDirectoryPath(event.threadId);
      this.#maintainStorage(at.getTime(), incomingBytes, directory);
      mkdirSync(directory, { recursive: true });
      for (const image of preparedImages) {
        writeFileSync(join(directory, image.reference.file), image.bytes);
      }
      appendFileSync(join(directory, 'events.jsonl'), line);
      this.#estimatedBytes = (this.#estimatedBytes ?? 0) + incomingBytes;
    } catch {
      // The log is best-effort evidence; a disk hiccup must never break the turn.
    }
  }

  /**
   * Removes an already-started turn and refuses subsequent rows for it. Google Workspace actions
   * use this to keep API data and derivations out of the diagnostic trajectory as well as research.
   */
  excludeTurn(threadId: string, turnId: string): void {
    if (!turnId) return;
    this.#excludedTurns.add(this.#turnKey(threadId, turnId));
    try {
      const directory = this.#threadDirectoryPath(threadId);
      const logPath = join(directory, 'events.jsonl');
      if (!existsSync(logPath)) return;
      const retained: string[] = [];
      const removedImages = new Set<string>();
      for (const line of readFileSync(logPath, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const row = JSON.parse(line) as Record<string, unknown>;
          if (row.turnId !== turnId) {
            retained.push(line);
            continue;
          }
          if (Array.isArray(row.images)) {
            for (const image of row.images) {
              if (
                image &&
                typeof image === 'object' &&
                'file' in image &&
                typeof image.file === 'string' &&
                image.file !== '.' &&
                image.file !== '..' &&
                /^[A-Za-z0-9._-]+$/u.test(image.file)
              ) {
                removedImages.add(image.file);
              }
            }
          }
        } catch {
          // Preserve malformed lines rather than risk deleting unrelated diagnostic data.
          retained.push(line);
        }
      }
      const temporaryPath = `${logPath}.policy-update`;
      writeFileSync(temporaryPath, retained.length ? `${retained.join('\n')}\n` : '');
      renameSync(temporaryPath, logPath);
      for (const image of removedImages) rmSync(join(directory, image), { force: true });
      this.#estimatedBytes = undefined;
    } catch {
      // The recorder is best effort; the in-memory exclusion still blocks all later rows.
    }
  }

  #maintainStorage(nowMs: number, incomingBytes: number, protectedDirectory: string): void {
    const due = nowMs - this.#lastMaintenanceMs >= this.#maintenanceIntervalMs;
    const overBudget =
      this.#estimatedBytes !== undefined &&
      this.#estimatedBytes + incomingBytes > this.#maxBytes;
    if (this.#estimatedBytes !== undefined && !due && !overBudget) return;

    mkdirSync(this.#root, { recursive: true });
    const cutoff = nowMs - this.#maxAgeMs;
    const groups = this.#storageGroups();
    for (const group of groups) {
      if (group.path === protectedDirectory) continue;
      if (group.latestModifiedMs < cutoff) rmSync(group.path, { recursive: true, force: true });
    }

    const retained = this.#storageGroups()
      .filter((group) => group.path !== protectedDirectory)
      .sort((first, second) => first.latestModifiedMs - second.latestModifiedMs);
    const protectedBytes = this.#storageGroups().find(
      (group) => group.path === protectedDirectory,
    )?.bytes;
    const availableBytes = Math.max(0, this.#maxBytes - incomingBytes);
    let totalBytes =
      (protectedBytes ?? 0) + retained.reduce((total, group) => total + group.bytes, 0);
    for (const group of retained) {
      if (totalBytes <= availableBytes) break;
      rmSync(group.path, { recursive: true, force: true });
      totalBytes -= group.bytes;
    }
    this.#estimatedBytes = totalBytes;
    this.#lastMaintenanceMs = nowMs;
  }

  #storageGroups(): Array<{ path: string; bytes: number; latestModifiedMs: number }> {
    const groups: Array<{ path: string; bytes: number; latestModifiedMs: number }> = [];
    for (const entry of readdirSync(this.#root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(this.#root, entry.name);
      let bytes = 0;
      let latestModifiedMs = 0;
      for (const file of readdirSync(path, { withFileTypes: true })) {
        if (!file.isFile()) continue;
        const details = statSync(join(path, file.name));
        bytes += details.size;
        latestModifiedMs = Math.max(latestModifiedMs, details.mtimeMs);
      }
      groups.push({ path, bytes, latestModifiedMs });
    }
    return groups;
  }

  #threadDirectoryPath(threadId: string): string {
    const safe = threadId.replace(/[^A-Za-z0-9_-]/g, '_');
    return join(this.#root, safe);
  }

  #turnKey(threadId: string, turnId: string): string {
    return `${threadId}\u0000${turnId}`;
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}
