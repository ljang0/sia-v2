import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Always-on local trajectory log. One directory per thread under
 * `<userData>/trajectories/<threadId>/` holding `events.jsonl` (requests, replies, notices,
 * approvals, tool actions with their arguments and outcomes, browser/computer state changes)
 * and any images the actions returned (screenshots, snapshots) as files referenced from the
 * JSONL rows. Everything stays on this Mac; nothing here is synced or sent anywhere.
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
}

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
  #sequence = 0;

  constructor(options: TrajectoryRecorderOptions) {
    this.#root = options.rootDirectory;
    this.#enabled = options.enabled;
    this.#now = options.now ?? (() => new Date());
  }

  get rootDirectory(): string {
    return this.#root;
  }

  /** Appends one event; images are written beside the log and referenced by relative path. */
  record(event: TrajectoryEvent, images: readonly TrajectoryImage[] = []): void {
    if (!this.#enabled()) return;
    try {
      const directory = this.#threadDirectory(event.threadId);
      const at = this.#now();
      const stamp = at.toISOString();
      const imageFiles = images
        .map((image, index) => {
          const extension = EXTENSIONS[image.mimeType];
          if (!extension) return undefined;
          const name = `${stamp.replace(/[:.]/g, '-')}-${String(++this.#sequence).padStart(4, '0')}${index ? `-${index}` : ''}.${extension}`;
          writeFileSync(join(directory, name), Buffer.from(image.dataBase64, 'base64'));
          return { file: name, mimeType: image.mimeType };
        })
        .filter((entry): entry is { file: string; mimeType: string } => Boolean(entry));
      const row = { at: stamp, ...event, ...(imageFiles.length ? { images: imageFiles } : {}) };
      appendFileSync(join(directory, 'events.jsonl'), `${JSON.stringify(row)}\n`);
    } catch {
      // The log is best-effort evidence; a disk hiccup must never break the turn.
    }
  }

  #threadDirectory(threadId: string): string {
    const safe = threadId.replace(/[^A-Za-z0-9_-]/g, '_');
    const directory = join(this.#root, safe);
    mkdirSync(directory, { recursive: true });
    return directory;
  }
}
