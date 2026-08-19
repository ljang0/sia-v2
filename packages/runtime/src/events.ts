import { randomUUID } from 'node:crypto';
import type { ProviderId, ThreadEventEnvelope } from '@sia/protocol';

type EventByType<T extends ThreadEventEnvelope['type']> = Extract<
  ThreadEventEnvelope,
  { type: T }
>;

export class EventFactory {
  readonly #provider: ProviderId;
  readonly #threadId: string;
  readonly #turnId: string;
  readonly #now: () => Date;
  #sequence = 0;

  constructor(
    provider: ProviderId,
    threadId: string,
    turnId: string,
    now: () => Date = () => new Date(),
  ) {
    this.#provider = provider;
    this.#threadId = threadId;
    this.#turnId = turnId;
    this.#now = now;
  }

  create<T extends ThreadEventEnvelope['type']>(
    type: T,
    payload: EventByType<T>['payload'],
  ): EventByType<T> {
    return {
      id: randomUUID(),
      threadId: this.#threadId,
      turnId: this.#turnId,
      sequence: this.#sequence++,
      timestamp: this.#now().toISOString(),
      provider: this.#provider,
      type,
      payload,
    } as EventByType<T>;
  }
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringAt(value: unknown, ...paths: readonly string[][]): string | undefined {
  for (const path of paths) {
    let current: unknown = value;
    for (const part of path) current = record(current)[part];
    if (typeof current === 'string' && current.length > 0) return current;
  }
  return undefined;
}

export function numberAt(value: unknown, ...paths: readonly string[][]): number | undefined {
  for (const path of paths) {
    let current: unknown = value;
    for (const part of path) current = record(current)[part];
    if (typeof current === 'number' && Number.isFinite(current)) return current;
  }
  return undefined;
}
