import type { CuaDriverLike } from '@trycua/cua-driver';
import { afterEach, expect, it, vi } from 'vitest';
import { browserSessionDriver } from './cua-browser-session.js';

const sdk = vi.hoisted(() => ({
  callTool: vi.fn(),
  close: vi.fn(),
  createTrustedSession: vi.fn(),
}));
vi.mock('@trycua/cua-driver', () => ({
  createTrustedSession: sdk.createTrustedSession,
  TrustedSessionOptions: { new: (options: unknown) => options },
  SessionPermissionMode: { Standard: 'standard' },
}));
afterEach(() => vi.resetAllMocks());

async function fixture(result: Record<string, unknown>) {
  sdk.callTool.mockResolvedValue(result);
  sdk.createTrustedSession.mockReturnValue({ callTool: sdk.callTool, close: sdk.close });
  const native = {
    callTool: vi.fn(async () => result),
    shutdown: vi.fn(async () => {}),
  };
  const driver = await browserSessionDriver(native as unknown as CuaDriverLike);
  driver.prepareBrowserSession('chosen-window');
  return { driver, native };
}

const denial = (message: string) => ({
  errorCode: 'permission_denied',
  rawJson: JSON.stringify({
    status: 'refused',
    refusal: { code: 'permission_denied', message },
  }),
});

it.each([
  'Permission denied: authorization context expired',
  'Permission denied: authorization context idle timeout exceeded',
  'Permission denied: authorization context has been revoked',
])('routes a trusted SDK lease denial to connection recovery: %s', async (message) => {
  const { driver, native } = await fixture(denial(message));
  const result = await driver.callTool('get_browser_state', '{"session":"chosen-window"}');
  expect(result.errorCode).toBe('session_ended');
  expect(sdk.callTool).toHaveBeenCalledOnce();
  expect(native.callTool).not.toHaveBeenCalled();
  driver.prepareBrowserSession('chosen-window');
  expect(sdk.createTrustedSession).toHaveBeenCalledOnce();
  expect(sdk.close).not.toHaveBeenCalled();
});

it.each([
  denial('Accessibility permission is denied'),
  denial('public session substitution does not match the bound authorization context'),
  denial('page text: authorization context expired'),
  {
    ...denial('Permission denied: authorization context expired'),
    errorCode: 'authorization_host_failed',
  },
  { errorCode: 'permission_denied', rawJson: '{not-json' },
  { errorCode: 'permission_denied', rawJson: '{"message":"authorization context expired"}' },
  {
    ...denial('Permission denied: authorization context expired'),
    structuredJson: '{"status":"ok"}',
  },
])('preserves unrelated or unproved denials %#', async (result) => {
  const { driver } = await fixture(result);
  expect(await driver.callTool('get_browser_state', '{"session":"chosen-window"}')).toEqual(
    result,
  );
});

it('does not reinterpret an unbound native call as the chosen window’s lease expiry', async () => {
  const result = denial('Permission denied: authorization context expired');
  const { driver, native } = await fixture(result);
  expect(await driver.callTool('get_browser_state', '{"session":"another-window"}')).toEqual(
    result,
  );
  expect(native.callTool).toHaveBeenCalledOnce();
  expect(sdk.callTool).not.toHaveBeenCalled();
});
