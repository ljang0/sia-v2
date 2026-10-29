import { randomUUID } from 'node:crypto';
import type { ActionContext } from '@sia/action-gateway';

const attempts = new WeakMap<object, string>();

/** A Continue task reuses its public turn id, but receives a new host-owned lease. */
export function actionExecutionId(context: ActionContext): string | undefined {
  if (!context.lease) return undefined;
  let id = attempts.get(context.lease);
  if (!id) {
    id = randomUUID();
    attempts.set(context.lease, id);
  }
  return id;
}
