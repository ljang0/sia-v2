import type { DesktopSnapshot } from '../shared/bridge.js';

/** A schedule due within this window makes quitting worth a second thought. */
export const SCHEDULE_DUE_SOON_MS = 30 * 60_000;

export interface QuitConfirmation {
  message: string;
  detail: string;
}

/**
 * Explains, in plain words, what quitting would interrupt. Returns undefined when nothing
 * would be lost, so Quit stays immediate in the common case.
 */
export function quitConfirmation(
  snapshot: Pick<DesktopSnapshot, 'threads' | 'schedules'>,
  now = Date.now(),
): QuitConfirmation | undefined {
  const working = snapshot.threads.filter(
    (thread) =>
      !thread.archivedAt &&
      (thread.status === 'running' ||
        thread.status === 'waiting' ||
        thread.status === 'queued'),
  ).length;
  if (working) {
    return {
      message:
        working === 1
          ? 'Sia is still working on a task.'
          : `Sia is still working on ${working} tasks.`,
      detail:
        'If you quit now, unfinished work stops. You can pick it up again when you reopen Sia.',
    };
  }
  const dueSoon = (snapshot.schedules ?? [])
    .filter((schedule) => {
      if (!schedule.enabled && !schedule.activeRun) return false;
      if (schedule.activeRun) return true;
      const due = Date.parse(schedule.nextRunAt);
      return Number.isFinite(due) && due - now <= SCHEDULE_DUE_SOON_MS;
    })
    .sort((left, right) => Date.parse(left.nextRunAt) - Date.parse(right.nextRunAt));
  const next = dueSoon[0];
  if (!next) return undefined;
  return {
    message: 'A scheduled task is due soon.',
    detail: `“${shorten(next.prompt)}” runs only while Sia is open and your Mac is awake. If you quit, it waits until you reopen Sia.`,
  };
}

/**
 * Reloads a crashed renderer a few times, then stops so a renderer that crashes on load
 * cannot spin forever.
 */
export class RendererRecovery {
  readonly #limit: number;
  readonly #windowMs: number;
  #crashes: number[] = [];

  constructor(limit = 3, windowMs = 60_000) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Records a renderer exit and says whether to reload the window. */
  shouldReload(reason: string, now = Date.now()): boolean {
    // A clean exit is shutdown, not a crash.
    if (reason === 'clean-exit') return false;
    this.#crashes = this.#crashes.filter((time) => now - time < this.#windowMs);
    this.#crashes.push(now);
    return this.#crashes.length <= this.#limit;
  }
}

function shorten(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}
