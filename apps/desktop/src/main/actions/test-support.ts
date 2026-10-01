/** Shared request builders and Cua Driver fakes for the action backend tests. */

import {
  getActionToolDescriptor,
  type ActionToolName,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { expect, vi, type Mock } from 'vitest';
import type { DesktopActionBackend } from './desktop-action-backend.js';
import type { CuaToolCaller } from './types.js';

export function request(
  name: ActionToolName,
  args: Record<string, unknown>,
): ValidatedActionInvocation {
  const descriptor = getActionToolDescriptor(name)!;
  return {
    name,
    arguments: args,
    descriptor,
    ...(descriptor.annotations.requiresApproval ? { approvalId: 'approval-1' } : {}),
    context: {
      sessionId: 'provider-session',
      threadId: 'thread-1',
      turnId: 'turn-1',
      provider: 'codex',
      workspace: '/workspace',
    },
  };
}

export type CuaCall = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export function fakeCua(implementation: CuaCall): CuaToolCaller & { call: Mock<CuaCall> } {
  return { call: vi.fn(implementation) };
}

export function dataRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  return value as Record<string, unknown>;
}

export async function grantedComputerTarget(
  backend: DesktopActionBackend,
): Promise<{ appId: string; windowId: string; appName: string }> {
  const listed = await backend.invoke(request('computer_list', {}));
  expect(listed.outcome).toBe('verified');
  const data = dataRecord(listed.data);
  const app = (data.apps as Array<Record<string, unknown>>)[0]!;
  const window = (data.windows as Array<Record<string, unknown>>)[0]!;
  expect(app.app_id).toMatch(/^app:[0-9a-f-]{36}$/);
  expect(window.window_id).toMatch(/^window:[0-9a-f-]{36}$/);
  return {
    appId: String(app.app_id),
    windowId: String(window.window_id),
    appName: String(app.name),
  };
}
