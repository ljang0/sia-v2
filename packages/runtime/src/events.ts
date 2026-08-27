import { randomUUID } from 'node:crypto';
import type {
  ExecutionAttribution,
  HarnessId,
  ProviderId,
  ThreadEventEnvelope,
} from '@sia/protocol';

type EventByType<T extends ThreadEventEnvelope['type']> = Extract<
  ThreadEventEnvelope,
  { type: T }
>;

export type EventFactoryAttribution = Omit<ExecutionAttribution, 'provider'>;

export class EventFactory {
  readonly #provider: ProviderId;
  readonly #threadId: string;
  readonly #turnId: string;
  readonly #now: () => Date;
  readonly #harnessId: HarnessId | undefined;
  readonly #model: string | undefined;
  #sequence = 0;

  constructor(
    provider: ProviderId,
    threadId: string,
    turnId: string,
    now: () => Date = () => new Date(),
    attribution: EventFactoryAttribution = {},
  ) {
    this.#provider = provider;
    this.#threadId = threadId;
    this.#turnId = turnId;
    this.#now = now;
    this.#harnessId = attribution.harnessId;
    this.#model = attribution.model;
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
      ...(this.#harnessId ? { harnessId: this.#harnessId } : {}),
      ...(this.#model ? { model: this.#model } : {}),
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
