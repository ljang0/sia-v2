import type { ApprovalDecision, MessageEvent, RendererApi } from '../types';
import type { DemoApiContext } from './context';
import { demoTurnChanges, demoTurnChangesView } from './threads';

/** Demo turns: attachments, sending, changes, terminals, schedules, approvals, and redo. */
export function demoWorkApi({ mutate }: DemoApiContext) {
  return {
    async pickWorkspace() {
      return '/Users/lawrencejang/Projects/new-workspace';
    },
    async pickAttachments() {
      return [];
    },
    async dropAttachments() {
      return [];
    },
    async pasteAttachments(_threadId, files) {
      return files.map((file, index) => ({
        id: `pasted-${Date.now()}-${index}`,
        name: file.name || 'Pasted image.png',
        kind: file.type.startsWith('image/') ? ('image' as const) : ('file' as const),
        bytes: file.size,
      }));
    },
    async previewAttachment() {
      return { kind: 'unavailable', detail: 'Attach a local file in the desktop build.' };
    },
    async openAttachment() {},
    async revealAttachment() {},
    async sendMessage(threadId, content) {
      mutate((current) => {
        if (!current.activeThread || current.activeThread.id !== threadId) return;
        const event: MessageEvent = {
          id: `message-${Date.now()}`,
          type: 'message',
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        };
        if (['running', 'queued'].includes(current.activeThread.status)) {
          current.activeThread.queuedMessages = [
            ...(current.activeThread.queuedMessages ?? []),
            event,
          ];
          return;
        }
        current.activeThread.events.push(event);
        current.activeThread.status = 'running';
      });
    },
    async readChanges() {
      return {
        workspace: '',
        files: [],
        unifiedDiff: '',
        generatedAt: new Date().toISOString(),
      };
    },
    async stageChanges() {
      return {
        workspace: '',
        files: [],
        unifiedDiff: '',
        generatedAt: new Date().toISOString(),
      };
    },
    async restoreChanges() {
      return {
        workspace: '',
        files: [],
        unifiedDiff: '',
        generatedAt: new Date().toISOString(),
      };
    },
    async listWorkspaceSnapshots() {
      return [];
    },
    async createWorkspaceSnapshot() {
      return [{ id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
    },
    async restoreWorkspaceSnapshot() {
      return {
        snapshots: [],
        diff: {
          workspace: '',
          files: [],
          unifiedDiff: '',
          generatedAt: new Date().toISOString(),
        },
      };
    },
    async deleteWorkspaceSnapshot() {
      return [];
    },
    async readTurnChanges(threadId, eventId) {
      return demoTurnChangesView(demoTurnChanges.get(`${threadId}:${eventId}`) ?? 'ready');
    },
    async applyTurnChanges(threadId, eventId, direction) {
      const state = direction === 'undo' ? 'undone' : 'ready';
      demoTurnChanges.set(`${threadId}:${eventId}`, state);
      return demoTurnChangesView(state);
    },
    async runTerminal(_threadId, command) {
      return {
        command,
        cwd: '',
        output: 'Demo command complete.',
        exitCode: 0,
        timedOut: false,
      };
    },
    async startBackgroundTerminal(_threadId, command) {
      const now = new Date().toISOString();
      return {
        id: 'demo-background-terminal',
        command,
        cwd: '',
        output: 'Demo background process running.',
        status: 'running',
        exitCode: null,
        startedAt: now,
        updatedAt: now,
        truncated: false,
      };
    },
    async listBackgroundTerminals() {
      return [];
    },
    async writeBackgroundTerminal(_threadId, _terminalId, _input) {
      throw new Error('No demo background process is active.');
    },
    async stopBackgroundTerminal(_threadId, _terminalId) {
      throw new Error('No demo background process is active.');
    },
    async startReview() {
      return Promise.resolve();
    },
    async createSchedule(threadId, prompt, cadence, nextRunAt, maxRuns, rule) {
      mutate((current) => {
        current.schedules.push({
          id: `schedule-${crypto.randomUUID()}`,
          threadId,
          prompt,
          cadence,
          ...(rule?.days ? { days: rule.days } : {}),
          ...(rule?.everyHours ? { everyHours: rule.everyHours } : {}),
          nextRunAt,
          enabled: true,
          createdAt: new Date().toISOString(),
          runCount: 0,
          ...(cadence === 'once' ? { maxRuns: 1 } : maxRuns ? { maxRuns } : {}),
        });
      });
    },
    async updateSchedule(scheduleId, changes) {
      mutate((current) => {
        const schedule = current.schedules.find(({ id }) => id === scheduleId);
        if (!schedule) return;
        const { prompt, cadence, days, everyHours, nextRunAt, maxRuns, enabled } = changes;
        if (prompt !== undefined) schedule.prompt = prompt;
        if (cadence !== undefined) {
          schedule.cadence = cadence;
          schedule.days = cadence === 'weekly' ? days : undefined;
          schedule.everyHours = cadence === 'hourly' ? everyHours : undefined;
        }
        if (nextRunAt !== undefined) schedule.nextRunAt = nextRunAt;
        if (maxRuns === null) delete schedule.maxRuns;
        else if (maxRuns !== undefined) schedule.maxRuns = maxRuns;
        if (enabled !== undefined) schedule.enabled = enabled;
      });
    },
    async setScheduleEnabled(scheduleId, enabled) {
      mutate((current) => {
        const schedule = current.schedules.find(({ id }) => id === scheduleId);
        if (schedule) schedule.enabled = enabled;
      });
    },
    async deleteSchedule(scheduleId) {
      mutate((current) => {
        current.schedules = current.schedules.filter(({ id }) => id !== scheduleId);
      });
    },
    async runScheduleNow() {
      return Promise.resolve();
    },
    async cancelTurn(threadId) {
      mutate((current) => {
        if (current.activeThread?.id !== threadId) return;
        current.activeThread.status = 'idle';
        delete current.activeThread.queuedMessages;
      });
    },
    async removeQueuedMessage(threadId, messageId) {
      mutate((current) => {
        if (current.activeThread?.id !== threadId) return;
        const remaining = (current.activeThread.queuedMessages ?? []).filter(
          (message) => message.id !== messageId,
        );
        if (remaining.length) current.activeThread.queuedMessages = remaining;
        else delete current.activeThread.queuedMessages;
      });
    },
    async steerQueuedMessage(threadId, messageId) {
      mutate((current) => {
        if (current.activeThread?.id !== threadId) return;
        const message = current.activeThread.queuedMessages?.find(({ id }) => id === messageId);
        if (!message) return;
        const remaining = (current.activeThread.queuedMessages ?? []).filter(
          ({ id }) => id !== messageId,
        );
        if (remaining.length) current.activeThread.queuedMessages = remaining;
        else delete current.activeThread.queuedMessages;
        current.activeThread.events = [...current.activeThread.events, message];
      });
    },
    async respondToApproval(approvalId, decision: ApprovalDecision) {
      mutate((current) => {
        const approval = current.activeThread?.events.find(
          (event) => event.type === 'approval' && event.id === approvalId,
        );
        if (approval?.type === 'approval') {
          approval.status = decision === 'reject' ? 'rejected' : 'approved';
          if (decision === 'approve_task') approval.scope = 'task';
        }
        if (current.activeThread) current.activeThread.status = 'idle';
      });
    },
    async retryThread(threadId) {
      mutate((current) => {
        if (current.activeThread?.id === threadId) {
          current.activeThread.error = undefined;
          current.activeThread.status = 'running';
        }
      });
    },
    async redoLastMessage(threadId, text) {
      mutate((current) => {
        const thread = current.activeThread;
        if (thread?.id !== threadId) return;
        const index = thread.events.findLastIndex(
          (event) => event.type === 'message' && event.role === 'user',
        );
        const last = thread.events[index];
        if (last?.type !== 'message') return;
        thread.error = undefined;
        thread.events = [
          ...thread.events.slice(0, index),
          { ...last, content: text?.trim() || last.content },
          {
            id: `demo-redo-${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: 'Here is another take on that.',
            timestamp: new Date().toISOString(),
          },
        ];
      });
    },
  } satisfies Partial<RendererApi>;
}
