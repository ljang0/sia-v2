import type { RendererSnapshot } from '../types';

/** What every group of demo bridge methods shares: the live snapshot and how to change it. */
export interface DemoApiContext {
  snapshot: RendererSnapshot;
  listeners: Set<(next: RendererSnapshot) => void>;
  /** Applies `update` to the snapshot and notifies subscribers with a fresh copy. */
  mutate(update: (current: RendererSnapshot) => void): void;
}

export const clone = <T>(value: T): T => structuredClone(value);
