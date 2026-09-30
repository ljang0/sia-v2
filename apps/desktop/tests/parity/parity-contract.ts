export const parityContract = {
  attachments: {
    bridge: ['attachments.pick', 'threads.send'],
    testIds: ['composer-attachment-add', 'composer-attachment-chip', 'composer-send'],
  },
  threadConfiguration: {
    bridge: ['threads.config'],
    testIds: ['thread-model-select', 'thread-reasoning-select'],
  },
  threadLibrary: {
    bridge: ['threads.archive', 'threads.fork', 'threads.search'],
    testIds: [
      'thread-actions',
      'thread-archive',
      'activity-center-toggle',
      'thread-search-input',
      'transcript-search-results',
      'transcript-search-result',
      'thread-fork',
      'fork-source-label',
    ],
  },
  backgroundActivity: {
    bridge: ['bootstrap', 'threads.send'],
    testIds: ['activity-center-toggle', 'background-task-row', 'background-task-status'],
  },
  interruptedTurnRecovery: {
    bridge: ['bootstrap', 'threads.retry'],
    testIds: ['turn-running', 'interrupted-turn-banner', 'interrupted-turn-retry'],
  },
  goalsAndSchedules: {
    bridge: ['threads.setGoal', 'schedules.create', 'schedules.update', 'schedules.runNow'],
    testIds: [
      'goal-title-input',
      'goal-save',
      'schedule-create',
      'schedule-prompt-input',
      'schedule-cadence-select',
      'schedule-first-run-input',
      'schedule-save',
      'schedule-next-run',
      'schedule-time-input',
      'schedule-cadence',
      'scheduled-open',
    ],
  },
  gitChanges: {
    bridge: ['changes.read', 'changes.stage', 'changes.restore'],
    testIds: [
      'changes-panel-toggle',
      'git-change-row',
      'git-stage',
      'git-staged-group',
      'git-restore',
    ],
  },
  scopedTerminal: {
    bridge: ['terminal.run'],
    testIds: [
      'terminal-open',
      'terminal-command-input',
      'terminal-run',
      'terminal-output',
      'terminal-status',
    ],
  },
  backgroundTerminal: {
    bridge: ['terminal.start', 'terminal.list', 'terminal.write', 'terminal.stop'],
    testIds: [
      'terminal-open',
      'terminal-command-input',
      'terminal-start-background',
      'background-terminal-row',
      'background-terminal-status',
      'background-terminal-output',
      'background-terminal-input',
      'background-terminal-stop',
    ],
  },
  workspaceSnapshots: {
    bridge: [
      'changes.listSnapshots',
      'changes.createSnapshot',
      'changes.restoreSnapshot',
      'changes.deleteSnapshot',
    ],
    testIds: [
      'changes-panel-toggle',
      'workspace-snapshot-create',
      'workspace-snapshot-list',
      'workspace-snapshot-restore',
      'workspace-snapshot-delete',
    ],
  },
  worktreeParallelism: {
    bridge: ['threads.fork', 'threads.send'],
    testIds: [
      'thread-fork',
      'fork-isolation-checkbox',
      'activity-center-toggle',
      'background-task-row',
      'background-task-status',
    ],
  },
  worktreeLifecycle: {
    bridge: ['threads.fork', 'threads.handoff', 'worktrees.cleanup'],
    testIds: [],
  },
} as const;

export type ParityFeature = keyof typeof parityContract;

export function allParityBridgePaths(): string[] {
  return [...new Set(Object.values(parityContract).flatMap(({ bridge }) => bridge))].sort();
}

export function allParityTestIds(): string[] {
  return [...new Set(Object.values(parityContract).flatMap(({ testIds }) => testIds))].sort();
}
