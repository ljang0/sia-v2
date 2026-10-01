import { describe, expect, it, vi } from 'vitest';
import type { VoiceHelperFactory } from '../voice/push-to-talk.js';
import { createHarness } from './test-support.js';

describe('global voice routing', () => {
  it('pins the focused thread and creates a correctly resolved thread for background requests', async () => {
    const requestMicrophonePermission = vi.fn(async () => {});
    const voice = {
      view: () => ({ status: 'connected' as const, voices: [] }),
      configure: vi.fn(),
      refresh: vi.fn(),
      select: vi.fn(),
      disconnect: vi.fn(),
      transcribe: vi.fn(),
      speak: vi.fn(),
      startRealtime: vi.fn(async () => ({ sessionId: 'voice-session' })),
      appendRealtime: vi.fn(),
      stopRealtime: vi.fn(async (_id: string, commit: boolean) => (commit ? 'Voice task' : '')),
    };
    const { controller } = await createHarness({
      voice,
      requestMicrophonePermission,
      defaultWorkspaceRoot: '/tmp/sia-voice-agents',
      createDirectory: vi.fn(async () => undefined),
    });
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    const first = await controller.invoke('agents.save', {
      name: 'Voice agent',
      instructions: 'Help with tasks.',
      model: 'gpt-5.6-sol',
    });
    const firstThread = first.snapshot.activeThreadId!;
    const second = await controller.invoke('agents.save', {
      name: 'Other agent',
      instructions: 'Help with writing.',
      model: 'gpt-5.6-sol',
    });
    let focused = true;
    const nativeSend = vi.fn();
    let emit!: Parameters<VoiceHelperFactory>[0];
    controller.attachPushToTalk({
      available: true,
      isFocused: () => focused,
      createHelper: (callback) => {
        emit = callback;
        return { send: nativeSend, stop: vi.fn() };
      },
    });
    expect(requestMicrophonePermission).not.toHaveBeenCalled();
    await controller.invoke('voice.pushToTalk.configure', {
      enabled: true,
      agentId: first.agentId,
    });
    expect(requestMicrophonePermission).toHaveBeenCalledOnce();
    await controller.invoke('threads.select', { threadId: firstThread });
    emit({ type: 'hold', id: '00000000-0000-4000-8000-000000000001' });
    await Promise.resolve();
    emit({ type: 'recording', id: '00000000-0000-4000-8000-000000000001' });
    await controller.invoke('threads.select', { threadId: second.snapshot.activeThreadId! });
    emit({ type: 'released', id: '00000000-0000-4000-8000-000000000001' });
    emit({ type: 'stopped', id: '00000000-0000-4000-8000-000000000001', hasSpeech: true });
    await vi.waitFor(() =>
      expect(
        controller
          .snapshot()
          .timeline.some(
            (item) =>
              item.threadId === firstThread &&
              item.kind === 'user' &&
              item.text === 'Voice task',
          ),
      ).toBe(true),
    );
    await vi.waitFor(() => expect(controller.snapshot().voice.pushToTalk?.phase).toBe('idle'));
    focused = false;
    const before = controller.snapshot().threads.length;
    emit({ type: 'hold', id: '00000000-0000-4000-8000-000000000002' });
    await Promise.resolve();
    emit({ type: 'recording', id: '00000000-0000-4000-8000-000000000002' });
    emit({ type: 'released', id: '00000000-0000-4000-8000-000000000002' });
    emit({ type: 'stopped', id: '00000000-0000-4000-8000-000000000002', hasSpeech: true });
    await vi.waitFor(() => expect(controller.snapshot().threads).toHaveLength(before + 1));
    const snapshot = controller.snapshot();
    const created = snapshot.threads.find((thread) => thread.id === snapshot.activeThreadId)!;
    expect(created).toMatchObject({
      agentId: first.agentId,
      harnessId: 'codex_app_server',
      resolvedExecutionTarget: { credentialSource: 'provider_subscription' },
    });
    expect(
      snapshot.timeline.some(
        (item) =>
          item.threadId === created.id && item.kind === 'user' && item.text === 'Voice task',
      ),
    ).toBe(true);
    expect(controller.computerTrust()).toBe('ask');
    await vi.waitFor(() =>
      expect(nativeSend).toHaveBeenCalledWith({ type: 'task', phase: 'working' }),
    );
    await vi.waitFor(() =>
      expect(nativeSend).toHaveBeenCalledWith({ type: 'task', phase: 'idle' }),
    );
    await controller.shutdown();
  });
});
