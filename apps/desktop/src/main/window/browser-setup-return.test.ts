import { afterEach, describe, expect, it, vi } from 'vitest';
import { returnAfterBrowserSetup } from './browser-setup-return.js';

function setup() {
  return {
    window: {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    },
    available: vi.fn(() => true),
    activate: vi.fn(),
    isForeground: vi.fn(async () => false),
  };
}

afterEach(() => vi.useRealTimers());

describe('explicit browser setup return', () => {
  it('does not resolve on show/focus alone; waits for the observed app handoff', async () => {
    vi.useFakeTimers();
    const input = setup();
    input.window.isMinimized.mockReturnValue(true);
    const completed = vi.fn();
    const pending = returnAfterBrowserSetup(input).then(completed);
    await vi.advanceTimersByTimeAsync(100);
    expect(completed).not.toHaveBeenCalled();
    expect(input.window.restore).toHaveBeenCalledOnce();
    input.isForeground.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(completed).toHaveBeenCalledOnce();
    expect(input.activate).toHaveBeenCalledOnce();
  });

  it('bounds an unresponsive observer without repeating activation or resuming later', async () => {
    vi.useFakeTimers();
    const input = setup();
    let finish!: (value: boolean) => void;
    input.isForeground.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const pending = returnAfterBrowserSetup(input);
    const rejected = expect(pending).rejects.toThrow('could not return to the front');
    await vi.advanceTimersByTimeAsync(1500);
    await rejected;
    finish(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(input.activate).toHaveBeenCalledOnce();
    expect(input.isForeground).toHaveBeenCalledOnce();
  });

  it('does not reopen a closed window and rejects closure during the handoff', async () => {
    vi.useFakeTimers();
    const input = setup();
    input.available.mockReturnValue(false);
    await expect(returnAfterBrowserSetup(input)).rejects.toThrow('could not return');
    expect(input.activate).not.toHaveBeenCalled();
    expect(input.window.show).not.toHaveBeenCalled();
    input.available.mockReturnValue(true);
    const pending = returnAfterBrowserSetup(input);
    const rejected = expect(pending).rejects.toThrow('could not return');
    input.window.isDestroyed.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
  });
});
