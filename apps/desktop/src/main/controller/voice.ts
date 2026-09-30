import { randomUUID } from 'node:crypto';
import type {
  BridgeRequestMap,
  BridgeResultMap,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import { PushToTalkService, type VoiceHelperFactory } from '../push-to-talk.js';
import type { VoiceOperations } from '../voice-service.js';
import type { ControllerContext } from './context.js';

/**
 * Fn push-to-talk, renderer microphone capture, transcription, realtime voice and speech, and
 * the voice account settings.
 */
export class VoiceControls {
  pushToTalk: PushToTalkService | undefined;
  assistantSuspended = false;

  constructor(private readonly ctx: ControllerContext) {}

  attachPushToTalk(options: {
    available: boolean;
    createHelper: VoiceHelperFactory;
    isFocused(): boolean;
  }): void {
    if (!this.ctx.deps.voice || this.pushToTalk) return;
    this.pushToTalk = new PushToTalkService({
      ...options,
      repository: this.ctx.deps.repository,
      voice: this.ctx.deps.voice,
      allowed: () =>
        !this.ctx.providers.codexSetupPending &&
        !this.ctx.releaseAccessLocked() &&
        this.ctx.deps.voice?.view().status === 'connected' &&
        this.ctx.deps.voice.view().dictationAvailable !== false,
      target: (agentId) => {
        this.ctx.requireSignedInReleaseAccount();
        const fallback = this.ctx.requireAgent(agentId);
        const thread = options.isFocused()
          ? this.ctx.state.threads.find(
              (candidate) =>
                candidate.id === this.ctx.state.activeThreadId && !candidate.archivedAt,
            )
          : undefined;
        const agent = thread ? this.ctx.requireAgent(thread.agentId) : fallback;
        return {
          agentId: agent.id,
          ...(thread ? { threadId: thread.id } : {}),
          label: thread
            ? `${agent.name} · ${thread.title}`
            : `${agent.name} · New conversation`,
        };
      },
      send: async (target, text, context) => {
        this.ctx.requireSignedInReleaseAccount();
        this.ctx.requireAgent(target.agentId);
        const threadId =
          target.threadId ??
          this.ctx.threads.createThread({ agentId: target.agentId }).threadId;
        const { turnId } = this.ctx.turns.sendTurn(
          { threadId, text },
          'manual',
          undefined,
          undefined,
          context,
        );
        return { threadId, turnId };
      },
      taskReply: ({ threadId, turnId }) => {
        const thread = this.ctx.state.threads.find(
          (item) => item.id === threadId && !item.archivedAt,
        );
        if (!thread || !['idle', 'failed'].includes(thread.status)) return undefined;
        return this.ctx.state.timeline.findLast(
          (item) =>
            item.threadId === threadId &&
            item.turnId === turnId &&
            ((item.kind === 'assistant' && item.status === 'complete') ||
              item.kind === 'error'),
        )?.text;
      },
      taskStatus: (threadId) => {
        const thread = this.ctx.state.threads.find(
          (item) => item.id === threadId && !item.archivedAt,
        );
        return thread && ['running', 'queued', 'waiting'].includes(thread.status)
          ? (thread.status as 'running' | 'queued' | 'waiting')
          : 'finished';
      },
      changed: () => this.ctx.emit(),
    });
    this.pushToTalk.setContextEnabled(
      this.ctx.assistant.library.view().context ||
        this.ctx.computerAccess.accessMode() === 'mac',
      this.ctx.computerAccess.accessMode() === 'mac',
    );
    this.pushToTalk.syncAccess();
  }

  suspendVoice(suspended: boolean): void {
    this.assistantSuspended = suspended;
    this.pushToTalk?.suspend(suspended);
  }

  releaseRendererVoiceCapture(): void {
    this.pushToTalk?.releaseRendererCapture();
  }

  async configurePushToTalk(
    value: BridgeRequestMap['voice.pushToTalk.configure'],
  ): Promise<DesktopSnapshot> {
    if (!this.pushToTalk) throw new Error('Fn push-to-talk is unavailable in this build.');
    if (value.enabled) {
      await this.ctx.deps.voice?.prepareDictation?.();
      await this.ctx.deps.requestMicrophonePermission?.();
    }
    this.pushToTalk.configure(
      value.enabled,
      value.agentId,
      value.requestAccessibility,
      value.speakReplies,
    );
    return this.ctx.resultSnapshot();
  }

  cancelPushToTalk(): undefined {
    this.pushToTalk?.cancel();
    return undefined;
  }

  acquireRendererCapture(): BridgeResultMap['voice.capture.acquire'] {
    this.ctx.providers.requireCodexSetupIdle();
    return { leaseId: this.pushToTalk?.acquireRendererCapture() ?? randomUUID() };
  }

  releaseRendererCapture(
    leaseId: BridgeRequestMap['voice.capture.release']['leaseId'],
  ): undefined {
    this.pushToTalk?.releaseRendererCapture(leaseId);
    return undefined;
  }

  async transcribe(
    value: BridgeRequestMap['voice.transcribe'],
  ): Promise<BridgeResultMap['voice.transcribe']> {
    this.requireVoiceAvailable();
    return { text: await this.requireVoice().transcribe(value.audioBase64, value.mimeType) };
  }

  async startRealtime(): Promise<BridgeResultMap['voice.realtime.start']> {
    this.requireVoiceAvailable();
    return await this.requireVoice().startRealtime();
  }

  appendRealtime(value: BridgeRequestMap['voice.realtime.append']): undefined {
    this.requireVoice().appendRealtime(value.sessionId, value.audioBase64);
    return undefined;
  }

  async stopRealtime(
    value: BridgeRequestMap['voice.realtime.stop'],
  ): Promise<BridgeResultMap['voice.realtime.stop']> {
    return { text: await this.requireVoice().stopRealtime(value.sessionId, value.commit) };
  }

  async speak(value: BridgeRequestMap['voice.speak']): Promise<BridgeResultMap['voice.speak']> {
    this.requireVoiceAvailable();
    return await this.requireVoice().speak(value.text, value.voiceId);
  }

  async configureVoice(): Promise<DesktopSnapshot> {
    await this.requireVoice().configure();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async refreshVoice(): Promise<DesktopSnapshot> {
    await this.requireVoice().refresh();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  async selectVoice(voiceId: string): Promise<DesktopSnapshot> {
    await this.requireVoice().select(voiceId);
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  disconnectVoice(): DesktopSnapshot {
    this.requireVoice().disconnect();
    this.ctx.emit();
    return this.ctx.resultSnapshot();
  }

  requireVoiceAvailable(): void {
    if (this.pushToTalk?.busy)
      throw new Error('Fn recording is active. Release Fn or press Escape first.');
  }

  requireVoice(): VoiceOperations {
    if (!this.ctx.deps.voice) throw new Error('Voice is unavailable in this build.');
    return this.ctx.deps.voice;
  }
}
