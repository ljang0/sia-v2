import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

export interface WindowSize {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

/** Visible pixels a restored window must keep on screen so it can still be dragged back. */
const MINIMUM_VISIBLE = 120;

export function parseWindowState(value: unknown): WindowState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const bounds = record.bounds as Record<string, unknown> | undefined;
  if (!bounds || typeof bounds !== 'object') return undefined;
  const numbers = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!numbers.every((part) => typeof part === 'number' && Number.isFinite(part))) {
    return undefined;
  }
  const [x, y, width, height] = numbers as number[];
  if (width! <= 0 || height! <= 0) return undefined;
  return {
    bounds: {
      x: Math.round(x!),
      y: Math.round(y!),
      width: Math.round(width!),
      height: Math.round(height!),
    },
    maximized: record.maximized === true,
  };
}

/**
 * Fits saved bounds into the work area of the display they best match. A window saved on a
 * display that is no longer connected, or mostly off screen, returns undefined so the
 * caller centers a default-size window instead.
 */
export function restoredBounds(
  saved: Rectangle,
  workArea: Rectangle,
  size: Pick<WindowSize, 'minWidth' | 'minHeight'>,
): Rectangle | undefined {
  const visibleWidth =
    Math.min(saved.x + saved.width, workArea.x + workArea.width) -
    Math.max(saved.x, workArea.x);
  const visibleHeight =
    Math.min(saved.y + saved.height, workArea.y + workArea.height) -
    Math.max(saved.y, workArea.y);
  if (
    visibleWidth < Math.min(MINIMUM_VISIBLE, saved.width) ||
    visibleHeight < Math.min(MINIMUM_VISIBLE, saved.height)
  ) {
    return undefined;
  }
  const width = clamp(saved.width, Math.min(size.minWidth, workArea.width), workArea.width);
  const height = clamp(
    saved.height,
    Math.min(size.minHeight, workArea.height),
    workArea.height,
  );
  return {
    width,
    height,
    x: clamp(saved.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(saved.y, workArea.y, workArea.y + workArea.height - height),
  };
}

export function readWindowState(path: string): WindowState | undefined {
  try {
    return parseWindowState(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return undefined;
  }
}

/** Saves window placement after moves and resizes settle, and once more when asked to flush. */
export class WindowStateSaver {
  readonly #path: string;
  readonly #delayMs: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending: WindowState | undefined;
  #writing: Promise<void> = Promise.resolve();

  constructor(path: string, delayMs = 500) {
    this.#path = path;
    this.#delayMs = delayMs;
  }

  schedule(state: WindowState): void {
    this.#pending = state;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.#delayMs);
  }

  flush(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    const state = this.#pending;
    this.#pending = undefined;
    if (!state) return this.#writing;
    this.#writing = this.#writing.then(() => this.#write(state)).catch(() => undefined);
    return this.#writing;
  }

  /** Writes any pending placement before the process exits. */
  flushNow(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    const state = this.#pending;
    this.#pending = undefined;
    if (!state) return;
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      const temporary = `${this.#path}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, this.#path);
    } catch {
      // Window placement is a convenience; never block quitting on it.
    }
  }

  async #write(state: WindowState): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporary = `${this.#path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.#path);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, Math.max(minimum, maximum)));
}
