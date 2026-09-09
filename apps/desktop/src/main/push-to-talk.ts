import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { PushToTalkView } from '../shared/bridge.js';
import type { RecordRepository } from './persistence.js';
import type { VoiceOperations } from './voice-service.js';

const id = z.string().uuid();
export const nativeVoiceEvent = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ready'),
      accessibility: z.boolean(),
      microphone: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('hold'),
      id,
      context: z
        .object({
          app: z.string().max(160),
          bundleID: z.string().max(200),
          window: z.string().max(300).optional(),
          selectedText: z.string().max(1200).optional(),
          outline: z.string().max(2800).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  ...(['released', 'recording', 'cancelled'] as const).map((type) =>
    z.object({ type: z.literal(type), id }).strict(),
  ),
  z
    .object({
      type: z.literal('audio'),
      id,
      audioBase64: z
        .string()
        .max(48_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
  z.object({ type: z.literal('stopped'), id, hasSpeech: z.boolean() }).strict(),
  z.object({ type: z.literal('error'), id, code: z.enum(['microphone', 'capture']) }).strict(),
]);
type NativeEvent = z.infer<typeof nativeVoiceEvent>;
type Command = {
  type:
    | 'ping'
    | 'shutdown'
    | 'permissions'
    | 'start'
    | 'cancel'
    | 'status'
    | 'context'
    | 'session'
    | 'task';
  phase?: 'idle' | 'working' | 'waiting';
  enabled?: boolean;
  id?: string;
  label?: string;
  text?: string;
  hint?: string;
  dismiss?: boolean;
};
export interface VoiceHelperTransport {
  send(command: Command): void;
  stop(): void;
}
export type VoiceHelperFactory = (
  onEvent: (event: NativeEvent) => void,
  onExit: () => void,
) => VoiceHelperTransport;

/** Only a fixed, bundled executable is launched. No inherited credentials or network surface. */
export function nativeVoiceHelperFactory(executable: string): VoiceHelperFactory {
  return (onEvent, onExit) => {
    const child = spawn(executable, [], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8' },
    });
    let buffer = '';
    let closed = false;
    const exit = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      onExit();
    };
    const send = (command: Command) => {
      if (!closed && child.stdin.writable) child.stdin.write(`${JSON.stringify(command)}\n`);
    };
    const heartbeat = setInterval(() => send({ type: 'ping' }), 5_000);
    heartbeat.unref();
    child.stdin.on('error', () => {
      child.kill();
      exit();
    });
    child.on('error', exit);
    child.on('exit', exit);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.length > 65_536) {
          child.kill();
          exit();
          return;
        }
        try {
          const parsed = nativeVoiceEvent.safeParse(JSON.parse(line));
          if (!parsed.success) {
            child.kill();
            exit();
            return;
          }
          onEvent(parsed.data);
        } catch {
          child.kill();
          exit();
          return;
        }
      }
      if (buffer.length > 65_536) {
        child.kill();
        exit();
      }
    });
    return {
      send,
      stop() {
        send({ type: 'shutdown' });
        child.stdin.end();
        clearInterval(heartbeat);
        const timeout = setTimeout(() => child.kill('SIGKILL'), 1_000);
        timeout.unref();
        child.once('exit', () => clearTimeout(timeout));
      },
    };
  };
}

export interface VoiceTarget {
  agentId: string;
  threadId?: string;
  label: string;
}
interface Recording {
  context?: string;
  id: string;
  target: VoiceTarget;
  sessionId?: string;
  timer: ReturnType<typeof setTimeout>;
  stopped: boolean;
  released: boolean;
}
interface Options {
  repository: RecordRepository;
  voice: VoiceOperations;
  available: boolean;
  createHelper: VoiceHelperFactory;
  allowed(): boolean;
  target(agentId: string): VoiceTarget;
  send(target: VoiceTarget, text: string, context?: string): Promise<string | void>;
  taskStatus(threadId: string): 'running' | 'queued' | 'waiting' | 'finished';
  changed(): void;
}

/** Owns global capture independently of any BrowserWindow. All sends return to DesktopController. */
export class PushToTalkService {
  readonly #options: Options;
  #contextEnabled = false;
  readonly #taskThreads = new Set<string>();
  #taskPhase: Command['phase'];
  #helper: VoiceHelperTransport | undefined;
  #recording: Recording | undefined;
  #rendererLease: { id: string } | undefined;
  #view: PushToTalkView;
  #suspended = false;
  #helperFailed = false;
  #disposed = false;

  constructor(options: Options) {
    this.#options = options;
    const stored = z
      .object({ enabled: z.boolean(), agentId: id.optional() })
      .safeParse(options.repository.get('voice', 'push-to-talk'));
    this.#view = {
      available: options.available,
      enabled: stored.success && stored.data.enabled,
      ...(stored.success && stored.data.agentId ? { agentId: stored.data.agentId } : {}),
      phase: 'idle',
      accessibility: false,
    };
  }

  setContextEnabled(enabled: boolean): void {
    this.#contextEnabled = enabled;
    if (!enabled && this.#recording) delete this.#recording.context;
    this.#helper?.send({ type: 'context', enabled });
  }
  view(): PushToTalkView {
    return { ...this.#view };
  }
  get busy(): boolean {
    return Boolean(this.#recording);
  }

  configure(enabled: boolean, agentId?: string): void {
    if (enabled && !this.#options.available)
      throw new Error('Fn push-to-talk is unavailable in this build.');
    if (enabled && !this.#options.allowed())
      throw new Error('Enable voice and sign in before enabling Fn push-to-talk.');
    if (enabled) {
      if (!agentId) throw new Error('Choose an agent for voice requests.');
      this.#options.target(agentId);
    }
    this.cancel();
    this.#helperFailed = false;
    this.#view = {
      ...this.#view,
      enabled,
      ...(agentId ? { agentId } : {}),
      phase: 'idle',
      detail: undefined,
    };
    this.#options.repository.put('voice', 'push-to-talk', {
      enabled,
      ...(this.#view.agentId ? { agentId: this.#view.agentId } : {}),
    });
    this.syncAccess();
    if (enabled) this.#helper?.send({ type: 'permissions' });
    this.#changed();
  }

  /** Only threads dispatched by Fn can drive the decorative working indicator. */
  syncTasks(): void {
    let phase: NonNullable<Command['phase']> = 'idle';
    for (const threadId of this.#taskThreads) {
      const status = this.#options.taskStatus(threadId);
      if (status === 'finished') this.#taskThreads.delete(threadId);
      else if (status === 'running' || status === 'queued') phase = 'working';
      else if (phase === 'idle') phase = 'waiting';
    }
    if (this.#helper && phase !== this.#taskPhase) {
      this.#taskPhase = phase;
      this.#helper.send({ type: 'task', phase });
    }
  }

  syncAccess(): void {
    if (this.#disposed || !this.#options.allowed()) this.releaseRendererCapture();
    if (this.#disposed || this.#suspended || !this.#view.enabled || !this.#options.allowed()) {
      this.cancel();
      if (this.#disposed || !this.#view.enabled || !this.#options.allowed())
        this.#taskThreads.clear();
      const helper = this.#helper;
      this.#helper = undefined;
      this.#taskPhase = undefined;
      helper?.stop();
      return;
    }
    if (!this.#helper && this.#options.available && !this.#helperFailed) {
      const helper = this.#options.createHelper(
        (event) => {
          if (this.#helper === helper) this.#event(event);
        },
        () => {
          if (this.#helper !== helper) return;
          this.#helper = undefined;
          this.#taskPhase = undefined;
          this.#taskThreads.clear();
          this.#helperFailed = true;
          this.cancel();
          this.#set('error', 'Voice helper stopped. Turn Fn push-to-talk off and on to retry.');
        },
      );
      this.#helper = helper;
      helper.send({ type: 'context', enabled: this.#contextEnabled });
      this.syncTasks();
    }
  }

  suspend(suspended: boolean): void {
    this.#suspended = suspended;
    this.syncAccess();
  }

  acquireRendererCapture(): string {
    if (this.#recording || this.#rendererLease)
      throw new Error('Another voice recording is active. Finish or cancel it first.');
    const leaseId = randomUUID();
    this.#rendererLease = { id: leaseId };
    // Fail closed if the renderer stalls. Window teardown explicitly releases this lease.
    return leaseId;
  }

  releaseRendererCapture(leaseId?: string): void {
    if (!this.#rendererLease || (leaseId && leaseId !== this.#rendererLease.id)) return;
    this.#rendererLease = undefined;
  }

  cancel(): void {
    const recording = this.#recording;
    if (!recording) return;
    this.#recording = undefined;
    clearTimeout(recording.timer);
    this.#helper?.send({ type: 'cancel', id: recording.id });
    if (recording.sessionId)
      void this.#options.voice.stopRealtime(recording.sessionId, false).catch(() => undefined);
    this.#set('idle');
  }

  dispose(): void {
    this.#disposed = true;
    this.syncAccess();
    this.releaseRendererCapture();
  }

  #event(event: NativeEvent): void {
    if (event.type === 'ready') {
      this.#view.accessibility = event.accessibility;
      this.#view.microphone = event.microphone ?? false;
      this.#view.detail = event.accessibility
        ? this.#view.microphone
          ? undefined
          : 'Allow Sia Voice in System Settings → Privacy & Security → Microphone.'
        : 'Allow Sia Voice in System Settings → Privacy & Security → Accessibility.';
      this.#changed();
      return;
    }
    if (event.type === 'hold') {
      void this.#begin(
        event.id,
        this.#contextEnabled && event.context ? JSON.stringify(event.context) : undefined,
      );
      return;
    }
    const recording = this.#recording;
    if (!recording || recording.id !== event.id) return;
    if (!this.#options.allowed()) {
      this.cancel();
      return;
    }
    switch (event.type) {
      case 'recording':
        this.#set('listening');
        break;
      case 'released':
        if (this.#view.phase === 'starting') this.cancel();
        else if (this.#view.phase === 'listening') {
          recording.released = true;
          this.#set('transcribing');
          this.#helper?.send({ type: 'session', id: recording.id });
        }
        break;
      case 'audio':
        if (!recording.sessionId || recording.stopped) return;
        try {
          this.#options.voice.appendRealtime(recording.sessionId, event.audioBase64);
        } catch {
          this.#fail('The voice connection was interrupted. Hold Fn to try again.');
        }
        break;
      case 'stopped':
        if (recording.stopped) return;
        recording.stopped = true;
        if (!recording.released) {
          this.cancel();
          return;
        }
        if (!event.hasSpeech)
          this.#fail('No speech detected. Hold Fn and speak after the glow appears.');
        else void this.#finish(recording);
        break;
      case 'cancelled':
        this.cancel();
        break;
      case 'error':
        this.#fail(
          event.code === 'microphone'
            ? 'Allow microphone access for Sia Voice in System Settings, then try again.'
            : 'The microphone could not start. Check the input device and try again.',
        );
        break;
    }
  }

  async #begin(recordingId: string, context?: string): Promise<void> {
    if (!this.#helper || !this.#view.enabled || this.#suspended || !this.#options.allowed())
      return;
    if (this.#recording) return;
    if (this.#rendererLease) {
      this.#helper.send({
        type: 'status',
        text: 'Finish the current voice recording first.',
        dismiss: true,
      });
      return;
    }
    try {
      if (!this.#view.agentId) throw new Error('Choose a voice agent in Settings → Voice.');
      const target = this.#options.target(this.#view.agentId);
      const recording: Recording = {
        id: recordingId,
        ...(context ? { context } : {}),
        target,
        stopped: false,
        released: false,
        timer: setTimeout(
          () => this.#fail('Recording timed out. Hold Fn to try again.'),
          65_000,
        ),
      };
      this.#recording = recording;
      this.#set('starting');
      this.#helper.send({ type: 'session', id: recordingId });
      const { sessionId } = await this.#options.voice.startRealtime();
      if (this.#recording !== recording || !this.#options.allowed()) {
        await this.#options.voice.stopRealtime(sessionId, false).catch(() => undefined);
        return;
      }
      recording.sessionId = sessionId;
      this.#helper?.send({ type: 'start', id: recordingId, label: target.label });
    } catch (cause) {
      if (this.#recording?.id === recordingId || !this.#recording) {
        this.#fail(cause instanceof Error ? cause.message : 'Voice could not start.');
      }
    }
  }

  async #finish(recording: Recording): Promise<void> {
    if (!recording.sessionId) {
      this.cancel();
      return;
    }
    try {
      const text = (await this.#options.voice.stopRealtime(recording.sessionId, true)).trim();
      if (this.#recording !== recording || !this.#options.allowed()) return;
      if (!text) {
        this.#fail('No speech detected. Hold Fn to try again.');
        return;
      }
      const threadId = await (recording.context
        ? this.#options.send(recording.target, text, recording.context)
        : this.#options.send(recording.target, text));

      if (this.#recording !== recording) return;
      clearTimeout(recording.timer);
      this.#recording = undefined;
      if (threadId) this.#taskThreads.add(threadId);
      this.syncTasks();
      this.#helper?.send({ type: 'session' });
      this.#set('idle');
    } catch {
      if (this.#recording === recording)
        this.#fail(
          'The voice request could not be sent. Open Sia to check the conversation, then try again.',
        );
    }
  }

  #fail(message: string): void {
    this.cancel();
    this.#helper?.send({ type: 'status', text: message.slice(0, 140), dismiss: true });
    this.#set('idle', message);
  }
  #set(phase: PushToTalkView['phase'], detail?: string): void {
    this.#view = { ...this.#view, phase, detail };
    this.#changed();
  }
  #changed(): void {
    this.#options.changed();
  }
}
