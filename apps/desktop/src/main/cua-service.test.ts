import { afterEach, describe, expect, it, vi } from 'vitest';

import { CuaService } from './cua-service.js';

const directContext = {
  kind: 'direct_user' as const,
  operation: 'browser_attach' as const,
};

function authorization() {
  return {
    authorize: async () => 'allow' as const,
  };
}

function successfulDriver(value: unknown) {
  return {
    callTool: vi.fn(async () => ({ rawJson: JSON.stringify(value) })),
    shutdown: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CuaService call boundaries', () => {
  it('forwards the exact-value primitive used by background form replacement', async () => {
    const driver = successfulDriver({ effect: 'confirmed' });
    const service = new CuaService(authorization(), {
      driverFactory: () => driver,
    });

    await expect(
      service.call(
        'set_value',
        { element_token: 'field-1', value: 'Exact replacement' },
        directContext,
      ),
    ).resolves.toEqual({ effect: 'confirmed' });
    expect(driver.callTool).toHaveBeenCalledWith(
      'set_value',
      JSON.stringify({ element_token: 'field-1', value: 'Exact replacement' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('aborts and retires a hung driver so the serialized queue can continue', async () => {
    vi.useFakeTimers();
    let hungSignal: AbortSignal | undefined;
    const hungDriver = {
      callTool: vi.fn(
        async (_name: string, _argumentsJson: string, options?: { signal: AbortSignal }) => {
          hungSignal = options?.signal;
          return await new Promise<never>(() => undefined);
        },
      ),
      shutdown: vi.fn(async () => undefined),
    };
    const replacementDriver = successfulDriver({ recovered: true });
    const driverFactory = vi
      .fn()
      .mockReturnValueOnce(hungDriver)
      .mockReturnValueOnce(replacementDriver);
    const service = new CuaService(authorization(), {
      callTimeoutMs: 25,
      driverFactory,
    });

    const hungCall = service.call(
      'browser_navigate',
      { url: 'https://example.com' },
      directContext,
    );
    const timeoutExpectation = expect(hungCall).rejects.toThrow(
      'CUA tool browser_navigate timed out after 25 ms.',
    );
    await vi.advanceTimersByTimeAsync(25);

    await timeoutExpectation;
    expect(hungSignal?.aborted).toBe(true);
    await expect(service.call('get_browser_state', {}, directContext)).resolves.toEqual({
      recovered: true,
    });
    expect(driverFactory).toHaveBeenCalledTimes(2);
  });

  it('always propagates a caller abort signal to the native driver', async () => {
    let nativeSignal: AbortSignal | undefined;
    const driver = {
      callTool: vi.fn(
        async (_name: string, _argumentsJson: string, options?: { signal: AbortSignal }) => {
          nativeSignal = options?.signal;
          return await new Promise<never>(() => undefined);
        },
      ),
      shutdown: vi.fn(async () => undefined),
    };
    const service = new CuaService(authorization(), {
      driverFactory: () => driver,
    });
    const abort = new AbortController();
    const call = service.call(
      'browser_click',
      { selector: '#save' },
      directContext,
      abort.signal,
    );
    await vi.waitFor(() => expect(nativeSignal).toBeDefined());
    const abortExpectation = expect(call).rejects.toThrow('Turn cancelled.');

    abort.abort(new Error('Turn cancelled.'));

    await abortExpectation;
    expect(nativeSignal?.aborted).toBe(true);
  });
});
