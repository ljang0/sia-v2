/** Keep capture, validation and capability publication in one ordered window operation. */
export class WindowOperations {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(
    key: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    signal?.throwIfAborted();
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const released = Promise.withResolvers<void>();
    const tail = previous.then(() => released.promise);
    this.#tails.set(key, tail);
    let ownsQueue = false;
    try {
      await waitForWindow(previous, signal);
      signal?.throwIfAborted();
      ownsQueue = true;
      return await operation();
    } finally {
      // A cancelled waiter returns promptly but must not let its successor jump
      // ahead of the still-active operation. Failed operations release normally.
      if (ownsQueue) released.resolve();
      else void previous.then(() => released.resolve());
      void tail.then(() => {
        if (this.#tails.get(key) === tail) this.#tails.delete(key);
      });
    }
  }
}

function waitForWindow(
  previous: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) return previous;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void previous.then(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    });
  });
}
