export type LeaseResource =
  | { readonly kind: 'workspace_writer'; readonly id: string }
  | { readonly kind: 'browser_tab'; readonly id: string }
  | { readonly kind: 'app_window'; readonly id: string }
  | { readonly kind: 'global_focus'; readonly id: 'foreground' };

export interface LeaseQueueEntry {
  readonly turnId: string;
  readonly threadId: string;
  readonly reason: 'capacity' | 'thread_busy' | 'resource_busy';
  readonly resource?: LeaseResource;
}

interface TurnState {
  readonly turnId: string;
  readonly threadId: string;
  readonly resources: Set<string>;
}

interface PendingTurn {
  readonly turnId: string;
  readonly threadId: string;
  readonly resolve: (lease: TurnLease) => void;
  readonly reject: (reason?: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
}

interface PendingResource {
  readonly turnId: string;
  readonly resource: LeaseResource;
  readonly resolve: (lease: ResourceLease) => void;
  readonly reject: (reason?: unknown) => void;
  readonly signal?: AbortSignal;
  readonly abort: () => void;
}

function resourceKey(resource: LeaseResource): string {
  return `${resource.kind}:${resource.id}`;
}

export class ResourceLease {
  readonly resource: LeaseResource;
  readonly turnId: string;
  readonly #releaseFn: () => void;
  #released = false;

  constructor(turnId: string, resource: LeaseResource, release: () => void) {
    this.turnId = turnId;
    this.resource = resource;
    this.#releaseFn = release;
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#releaseFn();
  }
}

export class TurnLease {
  readonly turnId: string;
  readonly threadId: string;
  readonly #coordinator: LocalLeaseCoordinator;
  #released = false;

  constructor(coordinator: LocalLeaseCoordinator, turnId: string, threadId: string) {
    this.#coordinator = coordinator;
    this.turnId = turnId;
    this.threadId = threadId;
  }

  acquire(resource: LeaseResource, signal?: AbortSignal): Promise<ResourceLease> {
    if (this.#released) return Promise.reject(new Error('Turn lease is released'));
    return this.#coordinator.acquireResource(this.turnId, resource, signal);
  }

  holds(resource: LeaseResource): boolean {
    return this.#coordinator.turnHolds(this.turnId, resource);
  }

  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#coordinator.releaseTurn(this.turnId);
  }
}

/** FIFO coordinator for the alpha's four-turn and exclusive-resource limits. */
export class LocalLeaseCoordinator {
  readonly #maximumTurns: number;
  readonly #activeTurns = new Map<string, TurnState>();
  readonly #threadOwners = new Map<string, string>();
  readonly #resourceOwners = new Map<string, string>();
  readonly #pendingTurns: PendingTurn[] = [];
  readonly #pendingResources = new Map<string, PendingResource[]>();

  constructor(maximumTurns = 4) {
    if (!Number.isInteger(maximumTurns) || maximumTurns < 1 || maximumTurns > 4) {
      throw new Error('maximumTurns must be an integer from 1 through 4');
    }
    this.#maximumTurns = maximumTurns;
  }

  startTurn(input: {
    readonly turnId: string;
    readonly threadId: string;
    readonly signal?: AbortSignal;
  }): Promise<TurnLease> {
    if (
      this.#activeTurns.has(input.turnId) ||
      this.#pendingTurns.some((item) => item.turnId === input.turnId)
    ) {
      return Promise.reject(new Error(`Duplicate turn ${input.turnId}`));
    }
    if (this.#canStart(input.threadId))
      return Promise.resolve(this.#grantTurn(input.turnId, input.threadId));
    return new Promise<TurnLease>((resolve, reject) => {
      const pending = {} as PendingTurn;
      const abort = (): void => {
        const index = this.#pendingTurns.indexOf(pending);
        if (index >= 0) this.#pendingTurns.splice(index, 1);
        reject(input.signal?.reason ?? new Error('Turn lease request aborted'));
      };
      Object.assign(pending, {
        turnId: input.turnId,
        threadId: input.threadId,
        resolve,
        reject,
        signal: input.signal,
        abort,
      });
      if (input.signal?.aborted) return abort();
      input.signal?.addEventListener('abort', abort, { once: true });
      this.#pendingTurns.push(pending);
    });
  }

  acquireResource(
    turnId: string,
    resource: LeaseResource,
    signal?: AbortSignal,
  ): Promise<ResourceLease> {
    const turn = this.#activeTurns.get(turnId);
    if (!turn) return Promise.reject(new Error(`Turn ${turnId} is not active`));
    const key = resourceKey(resource);
    if (turn.resources.has(key)) {
      return Promise.resolve(new ResourceLease(turnId, resource, () => undefined));
    }
    if (!this.#resourceOwners.has(key))
      return Promise.resolve(this.#grantResource(turn, resource));
    return new Promise<ResourceLease>((resolve, reject) => {
      const queue = this.#pendingResources.get(key) ?? [];
      const pending = {} as PendingResource;
      const abort = (): void => {
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
        if (queue.length === 0) this.#pendingResources.delete(key);
        reject(signal?.reason ?? new Error('Resource lease request aborted'));
      };
      Object.assign(pending, { turnId, resource, resolve, reject, signal, abort });
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      queue.push(pending);
      this.#pendingResources.set(key, queue);
    });
  }

  turnHolds(turnId: string, resource: LeaseResource): boolean {
    return this.#activeTurns.get(turnId)?.resources.has(resourceKey(resource)) ?? false;
  }

  releaseTurn(turnId: string): void {
    const turn = this.#activeTurns.get(turnId);
    if (!turn) return;
    this.#activeTurns.delete(turnId);
    if (this.#threadOwners.get(turn.threadId) === turnId)
      this.#threadOwners.delete(turn.threadId);
    for (const key of [...turn.resources]) this.#releaseResource(turnId, key);
    for (const [key, queue] of this.#pendingResources) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index]?.turnId === turnId) {
          const [pending] = queue.splice(index, 1);
          pending?.signal?.removeEventListener('abort', pending.abort);
          pending?.reject(new Error('Turn ended before resource was acquired'));
        }
      }
      if (queue.length === 0) this.#pendingResources.delete(key);
    }
    this.#drainTurns();
  }

  snapshotQueue(): readonly LeaseQueueEntry[] {
    const turns = this.#pendingTurns.map((pending) => ({
      turnId: pending.turnId,
      threadId: pending.threadId,
      reason: this.#threadOwners.has(pending.threadId)
        ? ('thread_busy' as const)
        : ('capacity' as const),
    }));
    const resources = [...this.#pendingResources.values()].flatMap((queue) =>
      queue.map((pending) => ({
        turnId: pending.turnId,
        threadId: this.#activeTurns.get(pending.turnId)?.threadId ?? 'unknown',
        reason: 'resource_busy' as const,
        resource: pending.resource,
      })),
    );
    return [...turns, ...resources];
  }

  get activeTurnCount(): number {
    return this.#activeTurns.size;
  }

  #canStart(threadId: string): boolean {
    return this.#activeTurns.size < this.#maximumTurns && !this.#threadOwners.has(threadId);
  }

  #grantTurn(turnId: string, threadId: string): TurnLease {
    this.#activeTurns.set(turnId, { turnId, threadId, resources: new Set() });
    this.#threadOwners.set(threadId, turnId);
    return new TurnLease(this, turnId, threadId);
  }

  #grantResource(turn: TurnState, resource: LeaseResource): ResourceLease {
    const key = resourceKey(resource);
    this.#resourceOwners.set(key, turn.turnId);
    turn.resources.add(key);
    return new ResourceLease(turn.turnId, resource, () =>
      this.#releaseResource(turn.turnId, key),
    );
  }

  #releaseResource(turnId: string, key: string): void {
    if (this.#resourceOwners.get(key) !== turnId) return;
    this.#resourceOwners.delete(key);
    this.#activeTurns.get(turnId)?.resources.delete(key);
    const queue = this.#pendingResources.get(key);
    if (!queue) return;
    while (queue.length > 0) {
      const pending = queue.shift()!;
      pending.signal?.removeEventListener('abort', pending.abort);
      const turn = this.#activeTurns.get(pending.turnId);
      if (!turn) {
        pending.reject(new Error('Turn ended before resource was acquired'));
        continue;
      }
      pending.resolve(this.#grantResource(turn, pending.resource));
      break;
    }
    if (queue.length === 0) this.#pendingResources.delete(key);
  }

  #drainTurns(): void {
    for (
      let index = 0;
      index < this.#pendingTurns.length && this.#activeTurns.size < this.#maximumTurns;
    ) {
      const pending = this.#pendingTurns[index]!;
      if (this.#threadOwners.has(pending.threadId)) {
        index += 1;
        continue;
      }
      this.#pendingTurns.splice(index, 1);
      pending.signal?.removeEventListener('abort', pending.abort);
      pending.resolve(this.#grantTurn(pending.turnId, pending.threadId));
    }
  }
}
