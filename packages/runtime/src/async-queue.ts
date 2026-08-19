export class AsyncQueue<T> implements AsyncIterable<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  #closed = false;
  #failure: unknown;

  push(value: T): void {
    if (this.#closed) {
      throw new Error('Cannot push to a closed queue');
    }
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
    } else {
      this.#values.push(value);
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(reason: unknown): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#failure = reason;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.reject(reason);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const value = this.#values.shift();
        if (value !== undefined) return { value, done: false };
        if (this.#failure !== undefined) throw this.#failure;
        if (this.#closed) return { value: undefined, done: true };
        return await new Promise<IteratorResult<T>>((resolve, reject) => {
          this.#waiters.push({ resolve, reject });
        });
      },
      return: async (): Promise<IteratorResult<T>> => {
        this.close();
        return { value: undefined, done: true };
      },
    };
  }
}
