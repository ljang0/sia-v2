import { homedir } from 'node:os';
import { isAbsolute } from 'node:path';
import type {
  BackgroundTerminalView,
  BridgeRequestMap,
  BridgeResultMap,
  TerminalResultView,
  WorkspaceDiffView,
} from '../../shared/bridge.js';
import {
  applyTurnChanges,
  readTurnChanges,
  turnFileChanges,
} from '../workspace/turn-changes.js';
import type { ControllerContext } from './context.js';
import type { ControllerOptions } from './types.js';
import { normalizeWorkspace } from './workspace-paths.js';

/** The parts of the controller context WorkspaceTools uses. */
type WorkspaceToolsContext = Pick<
  ControllerContext,
  'deps' | 'providers' | 'requireThread' | 'state' | 'turns' | 'workspaceGrants'
>;

/**
 * Developer workspace operations: change review and staging, workspace snapshots, per-turn
 * changes, terminals and code review, all behind the developer tools setting.
 */
export class WorkspaceTools {
  pendingTerminalOperations = 0;

  constructor(private readonly ctx: WorkspaceToolsContext) {}

  async readChanges(threadId: string): Promise<WorkspaceDiffView> {
    const thread = this.ctx.requireThread(threadId);
    return await this.requireWorkspaceOperations().readDiff(thread.workspace);
  }

  async stageChanges(input: BridgeRequestMap['changes.stage']): Promise<WorkspaceDiffView> {
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'stage changes');
    return await this.requireWorkspaceOperations().stage(thread.workspace, input.paths);
  }

  async restoreChanges(input: BridgeRequestMap['changes.restore']): Promise<WorkspaceDiffView> {
    if (input.confirmation !== 'RESTORE') throw new Error('Restore confirmation is required.');
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'restore changes');
    return await this.requireWorkspaceOperations().restore(thread.workspace, input.paths);
  }

  async listWorkspaceSnapshots(
    threadId: string,
  ): Promise<BridgeResultMap['changes.snapshots.list']> {
    const thread = this.ctx.requireThread(threadId);
    const operations = this.requireWorkspaceOperations();
    if (!operations.listSnapshots) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.listSnapshots(thread.workspace) };
  }

  async createWorkspaceSnapshot(
    threadId: string,
  ): Promise<BridgeResultMap['changes.snapshots.create']> {
    const thread = this.ctx.turns.requireIdleThread(threadId, 'create a workspace snapshot');
    const operations = this.requireWorkspaceOperations();
    if (!operations.createSnapshot) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.createSnapshot(thread.workspace) };
  }

  async restoreWorkspaceSnapshot(
    input: BridgeRequestMap['changes.snapshots.restore'],
  ): Promise<BridgeResultMap['changes.snapshots.restore']> {
    const thread = this.ctx.turns.requireIdleThread(
      input.threadId,
      'restore a workspace snapshot',
    );
    const operations = this.requireWorkspaceOperations();
    if (!operations.restoreSnapshot || !operations.listSnapshots) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    const diff = await operations.restoreSnapshot(thread.workspace, input.snapshotId);
    return { snapshots: await operations.listSnapshots(thread.workspace), diff };
  }

  async deleteWorkspaceSnapshot(
    input: BridgeRequestMap['changes.snapshots.delete'],
  ): Promise<BridgeResultMap['changes.snapshots.delete']> {
    if (input.confirmation !== 'DELETE SNAPSHOT') {
      throw new Error('Snapshot deletion confirmation is required.');
    }
    const thread = this.ctx.turns.requireIdleThread(
      input.threadId,
      'delete a workspace snapshot',
    );
    const operations = this.requireWorkspaceOperations();
    if (!operations.deleteSnapshot) {
      throw new Error('Workspace snapshots are unavailable in this build.');
    }
    return { snapshots: await operations.deleteSnapshot(thread.workspace, input.snapshotId) };
  }

  /** Where one reply's file changes stand now; see turn-changes.ts. */
  async readTurnChanges(
    input: BridgeRequestMap['changes.turn.read'],
  ): Promise<BridgeResultMap['changes.turn.read']> {
    const thread = this.ctx.requireThread(input.threadId);
    return await readTurnChanges(this.turnChanges(thread.id, input.eventId), {
      workspace: thread.workspace,
      home: homedir(),
    });
  }

  /** Undo or redo one reply's file changes; refused while a task runs in this thread. */
  async applyTurnChanges(
    input: BridgeRequestMap['changes.turn.apply'],
  ): Promise<BridgeResultMap['changes.turn.apply']> {
    const thread = this.ctx.turns.requireIdleThread(
      input.threadId,
      `${input.direction} changes`,
    );
    return await applyTurnChanges(
      this.turnChanges(thread.id, input.eventId),
      { workspace: thread.workspace, home: homedir() },
      input.direction,
    );
  }

  private turnChanges(threadId: string, eventId: string) {
    const changes = turnFileChanges(this.ctx.state.timeline, threadId, eventId);
    if (!changes) throw new Error('This reply is no longer in the conversation.');
    return changes;
  }

  /** The renderer's Command tool runs unreviewed shell commands, so it is opt-in. */
  private requireDeveloperTools(): void {
    if (this.ctx.state.preferences.developerTools === true) return;
    throw new Error('Turn on Developer tools in Settings to run commands.');
  }

  async runTerminal(input: BridgeRequestMap['terminal.run']): Promise<TerminalResultView> {
    this.requireDeveloperTools();
    this.ctx.providers.requireCodexSetupIdle();
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'run a terminal command');
    this.pendingTerminalOperations += 1;
    try {
      return await this.requireWorkspaceOperations().runTerminal(
        thread.workspace,
        input.command.trim(),
      );
    } finally {
      this.pendingTerminalOperations -= 1;
    }
  }

  async startBackgroundTerminal(
    input: BridgeRequestMap['terminal.start'],
  ): Promise<BackgroundTerminalView> {
    this.requireDeveloperTools();
    this.ctx.providers.requireCodexSetupIdle();
    const thread = this.ctx.turns.requireIdleThread(
      input.threadId,
      'start a background process',
    );
    const service = this.requireWorkspaceOperations();
    if (!service.startBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    this.pendingTerminalOperations += 1;
    try {
      return await service.startBackgroundTerminal(thread.workspace, input.command.trim());
    } finally {
      this.pendingTerminalOperations -= 1;
    }
  }

  async listBackgroundTerminals(threadId: string): Promise<BridgeResultMap['terminal.list']> {
    const thread = this.ctx.requireThread(threadId);
    const service = this.requireWorkspaceOperations();
    if (!service.listBackgroundTerminals) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return { sessions: await service.listBackgroundTerminals(thread.workspace) };
  }

  async writeBackgroundTerminal(
    input: BridgeRequestMap['terminal.write'],
  ): Promise<BackgroundTerminalView> {
    this.requireDeveloperTools();
    const thread = this.ctx.requireThread(input.threadId);
    const service = this.requireWorkspaceOperations();
    if (!service.writeBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return await service.writeBackgroundTerminal(
      thread.workspace,
      input.terminalId,
      input.input,
    );
  }

  async stopBackgroundTerminal(
    input: BridgeRequestMap['terminal.stop'],
  ): Promise<BackgroundTerminalView> {
    const thread = this.ctx.requireThread(input.threadId);
    const service = this.requireWorkspaceOperations();
    if (!service.stopBackgroundTerminal) {
      throw new Error('Background processes are unavailable in this build.');
    }
    return await service.stopBackgroundTerminal(thread.workspace, input.terminalId);
  }

  startReview(input: BridgeRequestMap['reviews.start']): BridgeResultMap['reviews.start'] {
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'start a code review');
    if (thread.provider !== 'codex') {
      throw new Error('Dedicated code review currently requires the Codex provider.');
    }
    const text =
      input.target.type === 'uncommitted_changes'
        ? 'Review uncommitted changes'
        : input.target.type === 'base_branch'
          ? `Review changes against ${input.target.branch}`
          : `Review: ${input.target.instructions}`;
    return this.ctx.turns.sendTurn({ threadId: thread.id, text }, 'review', input.target);
  }

  requireWorkspaceOperations(): NonNullable<ControllerOptions['workspaceOperations']> {
    if (!this.ctx.deps.workspaceOperations) {
      throw new Error('Local workspace operations are unavailable in this build.');
    }
    return this.ctx.deps.workspaceOperations;
  }

  async grantChosenDirectory(): Promise<string | null> {
    const chosen = await this.ctx.deps.chooseDirectory();
    if (!chosen) return null;
    if (!isAbsolute(chosen))
      throw new Error('The native picker returned an invalid workspace.');
    const workspace = normalizeWorkspace(chosen);
    this.ctx.workspaceGrants.add(workspace);
    return workspace;
  }
}
