import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import type {
  AgentView,
  BridgeRequestMap,
  BridgeResultMap,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import type { ControllerContext } from './context.js';
import { requireReleaseProvider } from './execution-routes.js';
import { normalizeWorkspace, workspaceSlug } from './workspace-paths.js';

/** Creates, edits, duplicates and deletes agents. */
export class Agents {
  constructor(private readonly ctx: ControllerContext) {}

  async saveAgent(
    input: BridgeRequestMap['agents.save'],
  ): Promise<BridgeResultMap['agents.save']> {
    this.ctx.requireSignedInReleaseAccount();
    const starter = this.ctx.state.agents.find(
      ({ id }) => id === this.ctx.state.preferences.onboarding?.agentId,
    );
    if (input.startOnboarding) {
      if (input.id)
        throw new Error('Setup creates a new agent; existing agents are unchanged.');
      if (starter) return { agentId: starter.id, snapshot: this.ctx.resultSnapshot() };
      if (this.ctx.state.agents.length)
        throw new Error('Continue setup with your existing agent.');
    }
    const now = new Date().toISOString();
    const existing = input.id
      ? this.ctx.state.agents.find((candidate) => candidate.id === input.id)
      : undefined;
    const agentId = existing?.id ?? randomUUID();
    const model = input.model.trim();
    const provider =
      input.provider ?? existing?.provider ?? this.ctx.providers.providerForModel(model);
    // An agent already running on a retained compatibility provider keeps its route; nothing
    // new may choose one.
    if (provider !== existing?.provider) requireReleaseProvider(provider);
    this.ctx.providers.requireReadyProvider(provider, model);
    let workspace: string;
    if (input.workspace?.trim()) {
      if (!isAbsolute(input.workspace))
        throw new Error('Choose an absolute workspace directory.');
      workspace = normalizeWorkspace(input.workspace);
      if (!this.ctx.workspaceGrants.has(workspace)) {
        throw new Error('Choose this workspace with the native folder picker before saving.');
      }
    } else if (existing) {
      workspace = existing.workspace;
    } else {
      if (!this.ctx.deps.defaultWorkspaceRoot) {
        throw new Error('Automatic workspaces are unavailable in this build. Choose a folder.');
      }
      workspace = join(
        this.ctx.deps.defaultWorkspaceRoot,
        `${workspaceSlug(input.name)}-${agentId.slice(0, 8)}`,
      );
      await this.ctx.deps.createDirectory(workspace);
      this.ctx.workspaceGrants.add(workspace);
    }
    // Directory creation yields; another setup request may have finished meanwhile.
    if (input.startOnboarding && this.ctx.state.agents.length) {
      const created = this.ctx.state.agents.find(
        ({ id }) => id === this.ctx.state.preferences.onboarding?.agentId,
      );
      if (created) return { agentId: created.id, snapshot: this.ctx.resultSnapshot() };
      throw new Error('An agent was created while setup was in progress.');
    }
    const hue = input.hue ?? existing?.hue ?? this.leastUsedHue();
    const agent: AgentView = {
      id: agentId,
      name: input.name.trim(),
      instructions: input.instructions.trim(),
      provider,
      model,
      workspace,
      ...(input.harnessPreference
        ? { harnessPreference: structuredClone(input.harnessPreference) }
        : existing?.harnessPreference
          ? { harnessPreference: structuredClone(existing.harnessPreference) }
          : { harnessPreference: { mode: 'automatic' } as const }),
      ...(input.voiceId
        ? { voiceId: input.voiceId.trim() }
        : existing?.voiceId
          ? { voiceId: existing.voiceId }
          : {}),
      hue,
      pinned: input.pinned ?? existing?.pinned ?? false,
      notificationsEnabled:
        input.notificationsEnabled ?? existing?.notificationsEnabled ?? true,
      threadIds: existing?.threadIds ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const index = this.ctx.state.agents.findIndex(({ id }) => id === agentId);
    if (index >= 0) this.ctx.state.agents[index] = agent;
    else this.ctx.state.agents.push(agent);
    this.ctx.state.activeAgentId = agentId;
    if (!existing) {
      if (this.ctx.computerAccess.accessMode() === 'mac') {
        this.ctx.assistant.library.change(
          { operation: 'nativeLearning', agentId, enabled: true },
          (id) => this.ctx.requireAgent(id),
        );
      }
      if (input.startOnboarding)
        this.ctx.state.preferences.onboarding = { step: 'voice', agentId };
      else if (
        this.ctx.state.preferences.onboarding &&
        !this.ctx.state.preferences.onboarding.agentId
      )
        this.ctx.state.preferences.onboarding = { step: 'complete' };
      const created = this.ctx.createThread({ agentId });
      return { agentId, snapshot: created.snapshot };
    }
    this.ctx.commit();
    return { agentId, snapshot: this.ctx.resultSnapshot() };
  }

  setAgentPinned(input: BridgeRequestMap['agents.setPinned']): DesktopSnapshot {
    const agent = this.ctx.requireAgent(input.agentId);
    agent.pinned = input.pinned;
    agent.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setAgentNotifications(input: BridgeRequestMap['agents.setNotifications']): DesktopSnapshot {
    const agent = this.ctx.requireAgent(input.agentId);
    agent.notificationsEnabled = input.enabled;
    agent.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  duplicateAgent(agentId: string): BridgeResultMap['agents.duplicate'] {
    const source = this.ctx.requireAgent(agentId);
    requireReleaseProvider(source.provider);
    const now = new Date().toISOString();
    const copy: AgentView = {
      ...structuredClone(source),
      id: randomUUID(),
      name: `${source.name} copy`.slice(0, 80),
      threadIds: [],
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.ctx.state.agents.push(copy);
    this.ctx.state.activeAgentId = copy.id;
    delete this.ctx.state.activeThreadId;
    this.ctx.commit();
    return { agentId: copy.id, snapshot: this.ctx.resultSnapshot() };
  }

  deleteAgent(agentId: string): DesktopSnapshot {
    const agent = this.ctx.requireAgent(agentId);
    const active = this.ctx.state.threads.some(
      (thread) =>
        thread.agentId === agent.id &&
        (thread.status === 'running' ||
          thread.status === 'queued' ||
          thread.status === 'waiting' ||
          this.ctx.runningTurns.has(thread.id) ||
          this.ctx.queuedTurns.some((turn) => turn.threadId === thread.id) ||
          this.ctx.pendingQuestions.has(thread.id)),
    );
    if (active) throw new Error('Cancel the active or queued task before deleting this agent.');
    this.ctx.assistant.library.forgetAgent(agentId);
    const threadIds = new Set(agent.threadIds);
    this.ctx.state.agents = this.ctx.state.agents.filter(({ id }) => id !== agentId);
    this.ctx.state.threads = this.ctx.state.threads.filter(({ agentId: id }) => id !== agentId);
    this.ctx.state.timeline = this.ctx.state.timeline.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.ctx.state.schedules = this.ctx.state.schedules.filter(
      ({ threadId }) => !threadIds.has(threadId),
    );
    this.ctx.state.usageByTurn = Object.fromEntries(
      Object.entries(this.ctx.state.usageByTurn).filter(
        ([, usage]) => !threadIds.has(usage.threadId),
      ),
    );
    const nextAgentId = this.ctx.state.agents[0]?.id;
    if (nextAgentId) this.ctx.state.activeAgentId = nextAgentId;
    else delete this.ctx.state.activeAgentId;
    delete this.ctx.state.activeThreadId;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  leastUsedHue(): number {
    const counts = [0, 0, 0, 0];
    for (const agent of this.ctx.state.agents) {
      const slot =
        Number.isInteger(agent.hue) && agent.hue! >= 0 && agent.hue! <= 3 ? agent.hue! : 0;
      counts[slot] = (counts[slot] ?? 0) + 1;
    }
    return counts.reduce((best, count, index) => (count < counts[best]! ? index : best), 0);
  }
}
