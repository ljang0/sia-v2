import { phoneRemoteCommand } from '../shared/phone-remote.js';
import { automationAppSchema } from '../shared/mac-permissions.js';
import type { BrowserWindow, IpcMain } from 'electron';
import { z } from 'zod';
import { assistantLibraryCommand } from '../shared/assistant-library.js';

import type { DesktopController } from './controller.js';
import type {
  BridgeInvokeEnvelope,
  BridgeMethod,
  BridgeRequestMap,
  DesktopPushEvent,
} from '../shared/bridge.js';

const providerId = z.enum(['codex', 'meta', 'grok', 'gemini', 'claude']);
const connectionId = z.enum(['gmail', 'drive', 'docs', 'sheets', 'slides', 'slack']);
const identifier = z.string().uuid();
const relativePath = z.string().trim().min(1).max(4_096);
const harnessId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

const inputSchemas = {
  'phone.remote': phoneRemoteCommand,
  'assistant.library': assistantLibraryCommand,
  bootstrap: z.undefined(),
  'agents.save': z
    .object({
      startOnboarding: z.boolean().optional(),
      id: identifier.optional(),
      name: z.string().trim().min(1).max(80),
      instructions: z.string().trim().max(20_000),
      provider: providerId.optional(),
      model: z.string().trim().min(1).max(160),
      workspace: z.string().trim().max(4_096).optional(),
      harnessPreference: z
        .discriminatedUnion('mode', [
          z.object({ mode: z.literal('automatic') }).strict(),
          z
            .object({
              mode: z.literal('explicit'),
              harnessId,
            })
            .strict(),
        ])
        .optional(),
      voiceId: z.string().trim().min(1).max(200).optional(),
      hue: z.number().int().min(0).max(3).optional(),
      pinned: z.boolean().optional(),
      notificationsEnabled: z.boolean().optional(),
    })
    .strict(),
  'agents.delete': z.object({ agentId: identifier }).strict(),
  'agents.setPinned': z.object({ agentId: identifier, pinned: z.boolean() }).strict(),
  'agents.setNotifications': z.object({ agentId: identifier, enabled: z.boolean() }).strict(),
  'agents.duplicate': z.object({ agentId: identifier }).strict(),
  'threads.create': z
    .object({ agentId: identifier, title: z.string().trim().max(120).optional() })
    .strict(),
  'threads.select': z.object({ threadId: identifier }).strict(),
  'threads.rename': z
    .object({ threadId: identifier, title: z.string().trim().min(1).max(120) })
    .strict(),
  'threads.draft': z.object({ threadId: identifier, text: z.string().max(200_000) }).strict(),
  'threads.config': z
    .object({
      threadId: identifier,
      model: z.string().trim().min(1).max(160),
      reasoningEffort: z.string().trim().min(1).max(32).optional(),
    })
    .strict(),
  'threads.archive': z.object({ threadId: identifier }).strict(),
  'threads.unarchive': z.object({ threadId: identifier }).strict(),
  'threads.setUnread': z.object({ threadId: identifier, unread: z.boolean() }).strict(),
  'threads.fork': z
    .object({
      threadId: identifier,
      title: z.string().trim().min(1).max(120).optional(),
      isolated: z.boolean(),
    })
    .strict(),
  'threads.handoff': z
    .object({
      threadId: identifier,
      destination: z.enum(['primary', 'new_worktree']),
      title: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
  'worktrees.cleanup': z
    .object({ threadId: identifier, confirmation: z.literal('REMOVE WORKTREE') })
    .strict(),
  'threads.search': z.object({ query: z.string().trim().min(1).max(500) }).strict(),
  'threads.goal.set': z
    .object({ threadId: identifier, text: z.string().trim().min(1).max(20_000) })
    .strict(),
  'threads.goal.pause': z.object({ threadId: identifier }).strict(),
  'threads.goal.resume': z.object({ threadId: identifier }).strict(),
  'threads.goal.clear': z.object({ threadId: identifier }).strict(),
  'threads.delete': z.object({ threadId: identifier }).strict(),
  'threads.send': z
    .object({
      threadId: identifier,
      text: z.string().trim().max(200_000),
      attachmentIds: z.array(identifier).max(20).optional(),
    })
    .strict()
    .refine((value) => value.text.length > 0 || Boolean(value.attachmentIds?.length), {
      message: 'Enter a message or attach a file.',
    }),
  'threads.retry': z.object({ threadId: identifier }).strict(),
  'threads.cancel': z.object({ threadId: identifier }).strict(),
  'attachments.pick': z.object({ threadId: identifier }).strict(),
  'attachments.drop': z
    .object({
      threadId: identifier,
      paths: z.array(z.string().trim().min(1).max(4_096)).min(1).max(20),
    })
    .strict(),
  'attachments.preview': z.object({ threadId: identifier, attachmentId: identifier }).strict(),
  'attachments.open': z.object({ threadId: identifier, attachmentId: identifier }).strict(),
  'attachments.reveal': z.object({ threadId: identifier, attachmentId: identifier }).strict(),
  'changes.read': z.object({ threadId: identifier }).strict(),
  'changes.stage': z
    .object({ threadId: identifier, paths: z.array(relativePath).min(1).max(200) })
    .strict(),
  'changes.restore': z
    .object({
      threadId: identifier,
      paths: z.array(relativePath).min(1).max(200),
      confirmation: z.literal('RESTORE'),
    })
    .strict(),
  'changes.snapshots.list': z.object({ threadId: identifier }).strict(),
  'changes.snapshots.create': z.object({ threadId: identifier }).strict(),
  'changes.snapshots.restore': z
    .object({ threadId: identifier, snapshotId: identifier })
    .strict(),
  'changes.snapshots.delete': z
    .object({
      threadId: identifier,
      snapshotId: identifier,
      confirmation: z.literal('DELETE SNAPSHOT'),
    })
    .strict(),
  'terminal.run': z
    .object({ threadId: identifier, command: z.string().trim().min(1).max(20_000) })
    .strict(),
  'terminal.start': z
    .object({ threadId: identifier, command: z.string().trim().min(1).max(20_000) })
    .strict(),
  'terminal.list': z.object({ threadId: identifier }).strict(),
  'terminal.write': z
    .object({
      threadId: identifier,
      terminalId: identifier,
      input: z.string().min(1).max(64_000),
    })
    .strict(),
  'terminal.stop': z.object({ threadId: identifier, terminalId: identifier }).strict(),
  'reviews.start': z
    .object({
      threadId: identifier,
      target: z.discriminatedUnion('type', [
        z.object({ type: z.literal('uncommitted_changes') }).strict(),
        z
          .object({ type: z.literal('base_branch'), branch: z.string().trim().min(1).max(256) })
          .strict(),
        z
          .object({
            type: z.literal('custom'),
            instructions: z.string().trim().min(1).max(20_000),
          })
          .strict(),
      ]),
    })
    .strict(),
  'schedules.create': z
    .object({
      threadId: identifier,
      prompt: z.string().trim().min(1).max(200_000),
      cadence: z.enum(['once', 'hourly', 'daily', 'weekly']),
      nextRunAt: z.string().datetime({ offset: true }),
      maxRuns: z.number().int().min(1).max(10_000).optional(),
    })
    .strict(),
  'schedules.setEnabled': z.object({ scheduleId: identifier, enabled: z.boolean() }).strict(),
  'schedules.delete': z.object({ scheduleId: identifier }).strict(),
  'schedules.runNow': z.object({ scheduleId: identifier }).strict(),
  'approvals.resolve': z
    .object({ approvalId: identifier, decision: z.enum(['approve', 'deny']) })
    .strict(),
  'providers.probe': z.object({ providerId: providerId.optional() }).strict(),
  'providers.login': z.object({ providerId }).strict(),
  'settings.openDirectory': z.undefined(),
  'settings.setOnboarding': z
    .object({
      step: z.enum([
        'welcome',
        'agent',
        'voice',
        'access',
        'apps',
        'restart',
        'verify',
        'practice',
        'complete',
      ]),
    })
    .strict(),
  'settings.setCompletionSound': z.object({ enabled: z.boolean() }).strict(),
  'feedback.compose': z
    .object({
      message: z.string().trim().min(1).max(10_000),
      threadId: identifier.optional(),
      includeDiagnostics: z.boolean(),
    })
    .strict(),
  'updates.check': z.undefined(),
  'updates.openDownload': z.undefined(),
  'computer.permissions': z.undefined(),
  'computer.requestPermissions': z.undefined(),
  'computer.requestAutomation': z.object({ app: automationAppSchema }).strict(),
  'computer.openMessages': z.undefined(),
  'computer.setupMessages': z.undefined(),
  'settings.restartForOnboarding': z.undefined(),
  'computer.setAccessMode': z
    .object({
      mode: z.enum(['mac', 'connected']),
      background: z.boolean().optional(),
      backgroundFallback: z.enum(['pause', 'foreground']).optional(),
    })
    .strict(),
  'computer.setTrust': z.object({ trust: z.enum(['auto', 'ask']) }).strict(),
  'computer.setTrajectoryLog': z.object({ enabled: z.boolean() }).strict(),
  'computer.revealTrajectories': z.undefined(),
  'browser.connectAndContinue': z
    .object({
      threadId: identifier,
      userMessageId: identifier,
      windowId: z.number().int().positive().optional(),
    })
    .strict(),
  'browser.attach': z
    .object({ windowId: z.number().int().positive().safe().optional() })
    .strict(),
  'browser.open': z.object({ url: z.string().trim().min(1).max(2_048) }).strict(),
  'browser.detach': z.undefined(),
  'voice.pushToTalk.configure': z
    .object({ enabled: z.boolean(), agentId: identifier.optional() })
    .strict(),
  'voice.pushToTalk.cancel': z.undefined(),
  'voice.capture.acquire': z.undefined(),
  'voice.capture.release': z.object({ leaseId: identifier }).strict(),
  'voice.configure': z.undefined(),
  'voice.refresh': z.undefined(),
  'voice.select': z.object({ voiceId: z.string().trim().min(1).max(200) }).strict(),
  'voice.disconnect': z.undefined(),
  'voice.transcribe': z
    .object({
      audioBase64: z.string().min(1).max(16_800_000),
      mimeType: z.string().trim().min(1).max(120),
    })
    .strict(),
  'voice.realtime.start': z.undefined(),
  'voice.realtime.append': z
    .object({
      sessionId: identifier,
      audioBase64: z.string().min(1).max(700_000),
    })
    .strict(),
  'voice.realtime.stop': z.object({ sessionId: identifier, commit: z.boolean() }).strict(),
  'voice.speak': z
    .object({
      text: z.string().trim().min(1).max(20_000),
      voiceId: z.string().trim().min(1).max(200).optional(),
    })
    .strict(),
  'connections.startGoogle': z.undefined(),
  'connections.upgradeGoogle': z.undefined(),
  'connections.start': z.object({ connectionId }).strict(),
  'connections.setEnabled': z.object({ connectionId, enabled: z.boolean() }).strict(),
  'connections.disconnect': z
    .object({
      connectionId,
      expectedConnectionId: z.string().trim().min(1).max(512).optional(),
    })
    .strict(),
  'auth.start': z.object({ email: z.string().trim().email().max(254) }).strict(),
  'auth.complete': z.object({ code: z.string().trim().min(6).max(10) }).strict(),
  'auth.mfaBegin': z.undefined(),
  'auth.mfaComplete': z.object({ code: z.string().trim().length(6) }).strict(),
  'auth.signOut': z.undefined(),
  'auth.deleteAccount': z.object({ confirmation: z.literal('DELETE ACCOUNT') }).strict(),
  'research.setCapture': z
    .object({ enabled: z.boolean(), consentVersion: z.string().max(120).optional() })
    .strict(),
  'research.export': z.undefined(),
  'research.delete': z.object({ confirmation: z.literal('DELETE') }).strict(),
  'research.admin.invites': z.undefined(),
  'research.admin.invite': z.object({ email: z.string().trim().email().max(254) }).strict(),
  'research.admin.participants': z.undefined(),
  'research.admin.batches': z.object({ subject: identifier }).strict(),
  'research.admin.readBatch': z.object({ subject: identifier, batchId: identifier }).strict(),
} satisfies Record<BridgeMethod, z.ZodType>;

export function registerDesktopIpc(
  ipcMain: IpcMain,
  window: BrowserWindow,
  controller: DesktopController,
): () => void {
  const unsubscribe = controller.subscribe((event: DesktopPushEvent) => {
    if (!window.isDestroyed()) window.webContents.send('sia:event', event);
  });

  ipcMain.handle('sia:invoke', async (event, rawEnvelope: unknown) => {
    if (event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Blocked IPC call from an untrusted frame.');
    }
    const envelope = parseEnvelope(rawEnvelope);
    try {
      return await controller.invoke(envelope.method, envelope.input as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request failed.';
      throw new Error(sanitizeErrorMessage(message));
    }
  });

  return () => {
    unsubscribe();
    ipcMain.removeHandler('sia:invoke');
  };
}

function parseEnvelope(raw: unknown): BridgeInvokeEnvelope {
  const envelope = z
    .object({ method: z.string(), input: z.unknown().optional() })
    .strict()
    .parse(raw);
  if (!(envelope.method in inputSchemas)) throw new Error('Unknown Sia IPC method.');
  const method = envelope.method as BridgeMethod;
  const input = inputSchemas[method].parse(envelope.input) as BridgeRequestMap[typeof method];
  return { method, input };
}

function sanitizeErrorMessage(value: string): string {
  return value
    .replace(/(?:sk|key|token|secret|bearer)[-_][A-Za-z0-9._-]{8,}/gi, '[redacted]')
    .replace(/\/Users\/[^/\s]+/g, '/Users/[user]')
    .slice(0, 800);
}
