import { expect, it, vi } from 'vitest';
import { CuaService } from './cua-service.js';

vi.mock('electron', () => ({
  desktopCapturer: { getSources: vi.fn(async () => []) },
  systemPreferences: { isTrustedAccessibilityClient: vi.fn(() => true) },
  shell: { openExternal: vi.fn(async () => {}) },
}));

const unboundContext = {
  kind: 'turn' as const,
  threadId: 'thread',
  turnId: 'turn',
  backgroundOnly: true,
  backgroundTargetPid: 42,
};
const context = { ...unboundContext, backgroundTargetWindowId: 91 };
const args = {
  target_id: 'host-target',
  tab_id: 'host-tab',
  delivery_mode: 'background',
  visual_document: 'a'.repeat(64),
};
const otherWindow = { pid: 42, windowId: 92 };

function harness() {
  const driver = {
    callTool: vi.fn(async () => ({ rawJson: JSON.stringify({ status: 'ok' }) })),
    shutdown: vi.fn(async () => {}),
  };
  const readForegroundWindow = vi
    .fn<() => Promise<typeof otherWindow | undefined>>()
    .mockResolvedValue(otherWindow);
  const service = new CuaService(
    { authorize: async () => 'allow' },
    {
      driverFactory: () => driver,
      readForegroundPid: async () => 42,
      readForegroundWindow,
    },
  );
  return { service, driver, readForegroundWindow };
}

it.each(['browser_click', 'browser_type', 'browser_pointer', 'browser_navigate'])(
  'permits %s in a host-bound window while another exact Chrome window retains focus',
  async (tool) => {
    const { service, driver, readForegroundWindow } = harness();
    try {
      await expect(
        service.call(
          tool,
          tool === 'browser_navigate'
            ? {
                target_id: args.target_id,
                tab_id: args.tab_id,
                url: 'https://example.com',
              }
            : args,
          context,
        ),
      ).resolves.toEqual({ status: 'ok' });
      expect(driver.callTool).toHaveBeenCalledTimes(1);
      expect(readForegroundWindow).toHaveBeenCalledTimes(2);
    } finally {
      await service.shutdown();
    }
  },
);

it.each(['same', 'unknown', 'other-process', 'invalid', 'error'])(
  'does not send input when the foreground-window proof is %s',
  async (scenario) => {
    const { service, driver, readForegroundWindow } = harness();
    if (scenario === 'error') readForegroundWindow.mockRejectedValue(new Error('private'));
    else
      readForegroundWindow.mockResolvedValue(
        scenario === 'same'
          ? { pid: 42, windowId: 91 }
          : scenario === 'other-process'
            ? { pid: 7, windowId: 92 }
            : scenario === 'invalid'
              ? { pid: 42, windowId: 0 }
              : undefined,
      );
    try {
      await expect(service.call('browser_type', args, context)).rejects.toThrow(
        'foreground_app_in_use',
      );
      expect(driver.callTool).not.toHaveBeenCalled();
    } finally {
      await service.shutdown();
    }
  },
);

it.each(['browser_prepare', 'type_text', 'semantic', 'model-window'])(
  'does not extend the exception to %s',
  async (scenario) => {
    const { service, driver } = harness();
    const tool =
      scenario === 'browser_prepare' || scenario === 'type_text' ? scenario : 'browser_type';
    try {
      await expect(
        service.call(
          tool,
          {
            ...args,
            pid: 42,
            window_id: 91,
            ...(scenario === 'semantic' ? { visual_document: undefined } : {}),
          },
          scenario === 'model-window' ? unboundContext : context,
        ),
      ).rejects.toThrow('foreground_app_in_use');
      expect(driver.callTool).not.toHaveBeenCalled();
    } finally {
      await service.shutdown();
    }
  },
);

it.each(['target', 'third-window', 'unknown', 'other-process'])(
  'pauses the execution without replay if foreground changes to %s during delivery',
  async (scenario) => {
    const { service, driver, readForegroundWindow } = harness();
    readForegroundWindow
      .mockResolvedValueOnce(otherWindow)
      .mockResolvedValueOnce(
        scenario === 'target'
          ? { pid: 42, windowId: 91 }
          : scenario === 'third-window'
            ? { pid: 42, windowId: 93 }
            : scenario === 'other-process'
              ? { pid: 7, windowId: 99 }
              : undefined,
      );
    try {
      await expect(service.call('browser_type', args, context)).resolves.toMatchObject(
        scenario === 'unknown'
          ? { background_focus_unverified: true }
          : { background_focus_changed: true },
      );
      await expect(service.call('browser_type', args, context)).rejects.toThrow(
        'background_input_paused',
      );
      expect(driver.callTool).toHaveBeenCalledTimes(1);
    } finally {
      await service.shutdown();
    }
  },
);
