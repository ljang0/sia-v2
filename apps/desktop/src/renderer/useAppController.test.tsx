// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoRendererApi } from './demo/api';
import { demoSnapshot } from './demo/snapshot';
import type { RendererAttachment } from './types';
import { useAppController } from './useAppController';

afterEach(cleanup);

describe('attachment loading', () => {
  it.each(['pickAttachments', 'dropAttachments', 'pasteAttachments'] as const)(
    'discards %s results after navigating away and back',
    async (method) => {
      const snapshot = structuredClone(demoSnapshot);
      const api = createDemoRendererApi(snapshot);
      const pending = Promise.withResolvers<RendererAttachment[]>();
      api[method] = () => pending.promise;
      const { result } = renderHook(() => useAppController(api));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const threadId = result.current.snapshot!.selectedThreadId!;
      const otherThreadId = 'thread-inbox';
      let loading!: Promise<void>;
      act(() => {
        loading = result.current[method](threadId, []);
      });
      await act(() => api.selectThread(otherThreadId));
      await act(() => api.selectThread(threadId));
      await act(async () => {
        pending.resolve([{ id: 'old-file', name: 'old.txt', kind: 'file', bytes: 3 }]);
        await loading;
      });
      expect(result.current.attachments).toEqual([]);
    },
  );

  it('does not restore an in-progress attachment after the composer is cleared', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    const pending = Promise.withResolvers<RendererAttachment[]>();
    api.pickAttachments = () => pending.promise;
    const { result } = renderHook(() => useAppController(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.pickAttachments(result.current.snapshot!.selectedThreadId!);
    });
    act(() => result.current.clearAttachments());
    await act(async () => {
      pending.resolve([{ id: 'old-file', name: 'old.txt', kind: 'file', bytes: 3 }]);
      await loading;
    });
    expect(result.current.attachments).toEqual([]);
  });

  it('keeps completed attachments in the selected conversation and deduplicates them', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    const attachment: RendererAttachment = {
      id: 'file',
      name: 'hello.txt',
      kind: 'file',
      bytes: 5,
    };
    api.pickAttachments = async () => [attachment];
    api.dropAttachments = async () => [attachment];
    const { result } = renderHook(() => useAppController(api));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const threadId = result.current.snapshot!.selectedThreadId!;
    await act(() => result.current.pickAttachments(threadId));
    await act(() => result.current.dropAttachments(threadId, []));
    expect(result.current.attachments).toEqual([attachment]);
  });
});
