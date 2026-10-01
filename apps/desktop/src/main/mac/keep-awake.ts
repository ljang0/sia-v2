import { powerSaveBlocker } from 'electron';

/**
 * Keeps the Mac awake while any Use my Mac task runs.
 *
 * Mac tasks read and control live windows. macOS locks the screen when the display sleeps
 * (with the default password setting), and a locked session blocks both routes, so this
 * prevents display sleep rather than only app suspension. One blocker is shared by all tasks.
 */
export class KeepAwake {
  readonly #holders = new Set<string>();
  #blocker: number | undefined;

  hold(id: string): void {
    this.#holders.add(id);
    if (this.#blocker === undefined)
      this.#blocker = powerSaveBlocker.start('prevent-display-sleep');
  }

  release(id: string): void {
    this.#holders.delete(id);
    if (this.#holders.size || this.#blocker === undefined) return;
    const blocker = this.#blocker;
    this.#blocker = undefined;
    if (powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
  }
}
