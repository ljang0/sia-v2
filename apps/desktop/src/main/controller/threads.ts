import { createHash, randomUUID } from 'node:crypto';
import { legacyModelRoute, resolveExecutionTarget } from '@sia/runtime';
import type {
  BridgeRequestMap,
  BridgeResultMap,
  DesktopSnapshot,
  ThreadView,
} from '../../shared/bridge.js';
import { UNTITLED_THREAD_TITLE } from '../../shared/plain-text.js';
import type { ControllerContext } from './context.js';
import { modelRouteKey, requireReleaseProvider } from './execution-routes.js';
import { extractHttpUrls, safeUrlHost, searchExcerpt } from './thread-search.js';
import { normalizeWorkspace, worktreeLabel } from './workspace-paths.js';

/** The parts of the controller context Threads uses. */
type ThreadsContext = Pick<
  ControllerContext,
  | 'attachments'
  | 'commit'
  | 'persistSoon'
  | 'providers'
  | 'requireAgent'
  | 'requireSignedInReleaseAccount'
  | 'requireThread'
  | 'resultSnapshot'
  | 'runtime'
  | 'state'
  | 'turns'
  | 'workspace'
  | 'workspaceGrants'
>;

/**
 * Creates, configures, forks, hands off, searches, archives and deletes conversation threads,
 * and manages thread goals and worktrees.
 */
export class Threads {
  constructor(private readonly ctx: ThreadsContext) {}

  /**
   * The user-facing "New conversation" route. Like a single draft tab, it reopens the agent's
   * untouched thread instead of saving another empty "New thread" row.
   */
  openNewThread(input: BridgeRequestMap['threads.create']): BridgeResultMap['threads.create'] {
    this.ctx.requireSignedInReleaseAccount();
    const agent = this.ctx.requireAgent(input.agentId);
    const unused = input.title?.trim()
      ? undefined
      : this.ctx.state.threads.findLast(
          (thread) =>
            thread.agentId === agent.id &&
            !thread.archivedAt &&
            thread.status === 'idle' &&
            thread.provider === agent.provider &&
            thread.model === agent.model &&
            thread.workspace === agent.workspace &&
            thread.instructionsSnapshot === agent.instructions &&
            thread.worktree?.kind !== 'linked' &&
            !this.ctx.turns.running.has(thread.id) &&
            !this.ctx.turns.queued.some((turn) => turn.threadId === thread.id) &&
            !this.ctx.state.schedules.some((schedule) => schedule.threadId === thread.id) &&
            !this.ctx.state.timeline.some((item) => item.threadId === thread.id),
        );
    if (!unused) return this.createThread(input);
    return { threadId: unused.id, snapshot: this.selectThread(unused.id) };
  }

  createThread(
    input: BridgeRequestMap['threads.create'],
    activate = true,
  ): BridgeResultMap['threads.create'] {
    this.ctx.requireSignedInReleaseAccount();
    const agent = this.ctx.requireAgent(input.agentId);
    requireReleaseProvider(agent.provider);
    const id = randomUUID();
    const now = new Date().toISOString();
    const releaseRoute = legacyModelRoute(agent.provider, agent.model);
    const backendDefault = this.ctx.providers.backendModelRoutes.get(
      modelRouteKey(agent.provider, agent.model),
    );
    const allowedRoutes = this.ctx.providers.allowedModelRoutes.get(
      modelRouteKey(agent.provider, agent.model),
    ) ?? [releaseRoute];
    const resolution = resolveExecutionTarget({
      provider: agent.provider,
      model: agent.model,
      ...(agent.harnessPreference ? { preference: agent.harnessPreference } : {}),
      ...(backendDefault ? { backendDefault } : {}),
      allowedRoutes,
    });
    if (!resolution.ok) {
      throw new Error(
        resolution.harnessId === 'opencode_acp' || resolution.harnessId === 'pi_rpc'
          ? 'That beta harness has not passed this release’s conformance and security checks.'
          : resolution.message,
      );
    }
    const resolvedExecutionTarget = resolution.target;
    const revision = createHash('sha256')
      .update(
        JSON.stringify({
          instructions: agent.instructions,
          provider: agent.provider,
          model: agent.model,
          harnessPreference: agent.harnessPreference ?? { mode: 'automatic' },
          resolvedExecutionTarget,
          workspace: agent.workspace,
          updatedAt: agent.updatedAt,
        }),
      )
      .digest('hex');
    const reasoningEffort = this.ctx.providers.defaultReasoningEffort(
      agent.provider,
      agent.model,
    );
    this.ctx.state.threads.push({
      id,
      agentId: agent.id,
      title: input.title?.trim() || UNTITLED_THREAD_TITLE,
      provider: agent.provider,
      model: agent.model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      workspace: agent.workspace,
      harnessId: resolvedExecutionTarget.harnessId,
      resolvedExecutionTarget,
      agentRevision: revision,
      instructionsSnapshot: agent.instructions,
      agentNameSnapshot: agent.name,
      status: 'idle',
      unread: false,
      pinned: false,
      worktree: { kind: 'primary', sourceWorkspace: agent.workspace },
      createdAt: now,
      updatedAt: now,
    });
    agent.threadIds.push(id);
    if (activate) {
      this.ctx.state.activeAgentId = agent.id;
      this.ctx.state.activeThreadId = id;
    }
    this.ctx.commit();
    return { threadId: id, snapshot: this.ctx.resultSnapshot() };
  }

  selectThread(threadId: string): DesktopSnapshot {
    const thread = this.ctx.requireThread(threadId);
    thread.unread = false;
    this.ctx.state.activeThreadId = thread.id;
    this.ctx.state.activeAgentId = thread.agentId;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  renameThread(input: BridgeRequestMap['threads.rename']): DesktopSnapshot {
    const thread = this.ctx.requireThread(input.threadId);
    const title = input.title.trim();
    if (!title) throw new Error('Enter a thread name.');
    thread.title = title;
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setThreadDraft(input: BridgeRequestMap['threads.draft']): { saved: true } {
    const thread = this.ctx.requireThread(input.threadId);
    if (input.text) thread.draft = input.text;
    else delete thread.draft;
    // Drafts are saved on each pause in typing. The composer already shows the text, so skip
    // the push and write the encrypted state with the next save, shortly after, or at shutdown.
    this.ctx.persistSoon();
    return { saved: true };
  }

  configureThread(input: BridgeRequestMap['threads.config']): DesktopSnapshot {
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'change model settings');
    const provider = this.ctx.providers.requireReadyProvider(
      thread.provider,
      input.model.trim(),
    );
    const model = provider.models?.find((candidate) => candidate.id === input.model.trim());
    if (provider.models?.length && !model) {
      throw new Error(`${provider.label} does not currently offer that model.`);
    }
    const reasoningEffort = input.reasoningEffort?.trim();
    if (
      reasoningEffort &&
      model?.reasoningEfforts.length &&
      !model.reasoningEfforts.includes(reasoningEffort)
    ) {
      throw new Error(`${model.label} does not support that reasoning level.`);
    }
    thread.model = input.model.trim();
    if (reasoningEffort) thread.reasoningEffort = reasoningEffort;
    else delete thread.reasoningEffort;
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  archiveThread(threadId: string): DesktopSnapshot {
    const thread = this.ctx.turns.requireIdleThread(threadId, 'archive this thread');
    thread.archivedAt = new Date().toISOString();
    thread.unread = false;
    if (this.ctx.state.activeThreadId === thread.id) delete this.ctx.state.activeThreadId;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  unarchiveThread(threadId: string): DesktopSnapshot {
    const thread = this.ctx.requireThread(threadId);
    delete thread.archivedAt;
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setThreadUnread(input: BridgeRequestMap['threads.setUnread']): DesktopSnapshot {
    const thread = this.ctx.requireThread(input.threadId);
    thread.unread = input.unread;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  setThreadPinned(input: BridgeRequestMap['threads.setPinned']): DesktopSnapshot {
    const thread = this.ctx.requireThread(input.threadId);
    // Pinning only reorders the sidebar; it is not activity, so updatedAt stays.
    thread.pinned = input.pinned;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async forkThread(
    input: BridgeRequestMap['threads.fork'],
    primary = false,
  ): Promise<BridgeResultMap['threads.fork']> {
    // A busy thread's live approval, question and queued follow-ups belong to that run.
    const source = this.ctx.turns.requireIdleThread(input.threadId, 'fork this thread');
    const id = randomUUID();
    let workspace = primary
      ? normalizeWorkspace(source.worktree?.sourceWorkspace ?? source.workspace)
      : source.workspace;
    let worktree = primary
      ? { kind: 'primary' as const, sourceWorkspace: workspace }
      : structuredClone(
          source.worktree ?? { kind: 'primary' as const, sourceWorkspace: source.workspace },
        );
    if (input.isolated) {
      const service = this.ctx.workspace.requireWorkspaceOperations();
      const created = await service.createWorktree(
        source.workspace,
        worktreeLabel(input.title?.trim() || `${source.title}-fork`, id),
      );
      workspace = normalizeWorkspace(created.path);
      this.ctx.workspaceGrants.add(workspace);
      worktree = {
        kind: 'linked',
        sourceWorkspace: source.worktree?.sourceWorkspace ?? source.workspace,
        ...(created.branch ? { branch: created.branch } : {}),
      };
    }
    const now = new Date().toISOString();
    const forked: ThreadView = {
      ...structuredClone(source),
      id,
      title: input.title?.trim() || `${source.title} (fork)`,
      workspace,
      worktree,
      status: 'idle',
      sourceThreadId: source.id,
      unread: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    delete forked.archivedAt;
    delete forked.draft;
    delete forked.queueReason;
    delete forked.interruptedTurnId;
    this.ctx.state.threads.push(forked);
    this.ctx.state.timeline.push(
      ...this.ctx.state.timeline
        .filter(
          (item) =>
            item.threadId === source.id &&
            !(
              item.status === 'pending' &&
              (item.kind === 'user' || item.kind === 'approval' || item.kind === 'question')
            ),
        )
        .map((item) => ({ ...structuredClone(item), id: randomUUID(), threadId: id })),
    );
    const agent = this.ctx.requireAgent(source.agentId);
    agent.threadIds.push(id);
    agent.updatedAt = now;
    this.ctx.state.activeAgentId = source.agentId;
    this.ctx.state.activeThreadId = id;
    this.ctx.commit();
    return { threadId: id, snapshot: this.ctx.resultSnapshot() };
  }

  async handoffThread(
    input: BridgeRequestMap['threads.handoff'],
  ): Promise<BridgeResultMap['threads.handoff']> {
    const source = this.ctx.turns.requireIdleThread(input.threadId, 'handoff this thread');
    if (input.destination === 'primary' && source.worktree?.kind !== 'linked') {
      throw new Error('This thread is already using the primary workspace.');
    }
    return await this.forkThread(
      {
        threadId: source.id,
        isolated: input.destination === 'new_worktree',
        title:
          input.title?.trim() ||
          `${source.title}${input.destination === 'primary' ? ' (main)' : ' (worktree)'}`,
      },
      input.destination === 'primary',
    );
  }

  async cleanupWorktree(
    input: BridgeRequestMap['worktrees.cleanup'],
  ): Promise<DesktopSnapshot> {
    if (input.confirmation !== 'REMOVE WORKTREE') {
      throw new Error('Worktree removal confirmation is required.');
    }
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'remove this worktree');
    if (thread.worktree?.kind !== 'linked') {
      throw new Error('This thread does not own a linked worktree.');
    }
    if (
      this.ctx.state.threads.some(
        (candidate) => candidate.id !== thread.id && candidate.workspace === thread.workspace,
      )
    ) {
      throw new Error('Another thread still uses this worktree.');
    }
    const service = this.ctx.workspace.requireWorkspaceOperations();
    if (!service.removeWorktree)
      throw new Error('Worktree cleanup is unavailable in this build.');
    await service.removeWorktree(thread.workspace);
    this.ctx.workspaceGrants.delete(thread.workspace);
    return this.deleteThread(thread.id);
  }

  searchThreads(query: string): BridgeResultMap['threads.search'] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return { results: [] };
    // One pass over the timeline instead of one full scan per thread.
    const timelineByThread = Map.groupBy(this.ctx.state.timeline, ({ threadId }) => threadId);
    const results = this.ctx.state.threads
      .map((thread) => {
        const matches: BridgeResultMap['threads.search']['results'][number]['matches'] = [];
        for (const item of timelineByThread.get(thread.id) ?? []) {
          const copy = [item.title, item.text, item.detail].filter(Boolean).join(' ');
          if (copy.toLocaleLowerCase().includes(needle)) {
            matches.push({
              itemId: item.id,
              excerpt: searchExcerpt(copy, needle),
              timestamp: item.timestamp,
              kind: 'message',
            });
          }
          for (const attachment of item.attachments ?? []) {
            if (!attachment.name.toLocaleLowerCase().includes(needle)) continue;
            matches.push({
              itemId: `${item.id}:file:${attachment.id}`,
              excerpt: attachment.name,
              label: attachment.name,
              timestamp: item.timestamp,
              kind: 'file',
            });
          }
          for (const [index, url] of extractHttpUrls(copy).entries()) {
            if (!url.toLocaleLowerCase().includes(needle)) continue;
            matches.push({
              itemId: `${item.id}:link:${index}`,
              excerpt: url,
              label: safeUrlHost(url),
              url,
              timestamp: item.timestamp,
              kind: 'link',
            });
          }
        }
        if (thread.title.toLocaleLowerCase().includes(needle) && matches.length === 0) {
          matches.push({
            itemId: thread.id,
            excerpt: thread.title,
            timestamp: thread.updatedAt,
            kind: 'thread',
          });
        }
        return {
          threadId: thread.id,
          threadTitle: thread.title,
          archived: Boolean(thread.archivedAt),
          matches: matches
            .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
            .slice(0, 12),
        };
      })
      .filter((result) => result.matches.length > 0)
      .sort((left, right) =>
        right.matches[0]!.timestamp.localeCompare(left.matches[0]!.timestamp),
      );
    return { results };
  }

  setGoal(input: BridgeRequestMap['threads.goal.set']): DesktopSnapshot {
    const thread = this.ctx.turns.requireIdleThread(input.threadId, 'set a goal');
    const now = new Date().toISOString();
    thread.goal = {
      text: input.text.trim(),
      status: 'paused',
      createdAt: thread.goal?.createdAt ?? now,
      updatedAt: now,
    };
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  pauseGoal(threadId: string): DesktopSnapshot {
    const thread = this.ctx.requireThread(threadId);
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'paused';
    thread.goal.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  resumeGoal(threadId: string): DesktopSnapshot {
    const thread = this.ctx.turns.requireIdleThread(threadId, 'resume this goal');
    if (!thread.goal) throw new Error('This thread does not have a goal.');
    thread.goal.status = 'running';
    thread.goal.updatedAt = new Date().toISOString();
    const result = this.ctx.turns.sendTurn(
      {
        threadId,
        text: `Continue working toward this long-running goal:\n\n${thread.goal.text}`,
      },
      'goal',
    );
    return result.snapshot;
  }

  clearGoal(threadId: string): DesktopSnapshot {
    const thread = this.ctx.turns.requireIdleThread(threadId, 'clear this goal');
    delete thread.goal;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  deleteThread(threadId: string): DesktopSnapshot {
    const thread = this.ctx.requireThread(threadId);
    if (
      this.ctx.turns.running.has(thread.id) ||
      this.ctx.turns.queued.some((turn) => turn.threadId === thread.id) ||
      this.ctx.turns.pendingQuestions.has(thread.id) ||
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting'
    ) {
      throw new Error('Stop the active turn before deleting this thread.');
    }
    const agent = this.ctx.requireAgent(thread.agentId);
    agent.threadIds = agent.threadIds.filter((id) => id !== thread.id);
    agent.updatedAt = new Date().toISOString();
    // Release what the deleted thread still holds: its provider session and file grants.
    for (const item of this.ctx.state.timeline)
      if (item.threadId === thread.id && item.turnId)
        this.ctx.turns.failedTurnAttachments.delete(item.turnId);
    for (const [id, grant] of this.ctx.attachments.grants)
      if (grant.threadId === thread.id) this.ctx.attachments.grants.delete(id);
    this.ctx.turns.heldThreads.delete(thread.id);
    const runtime = this.ctx.runtime;
    void Promise.resolve()
      .then(() => runtime?.releaseSession(thread.id))
      .catch(() => undefined);
    this.ctx.state.threads = this.ctx.state.threads.filter(
      (candidate) => candidate.id !== thread.id,
    );
    this.ctx.state.timeline = this.ctx.state.timeline.filter(
      (item) => item.threadId !== thread.id,
    );
    this.ctx.state.approvals = this.ctx.state.approvals.filter(
      (approval) => approval.threadId !== thread.id,
    );
    this.ctx.state.schedules = this.ctx.state.schedules.filter(
      (schedule) => schedule.threadId !== thread.id,
    );
    this.ctx.state.usageByTurn = Object.fromEntries(
      Object.entries(this.ctx.state.usageByTurn).filter(
        ([, usage]) => usage.threadId !== thread.id,
      ),
    );
    if (this.ctx.state.activeThreadId === thread.id) delete this.ctx.state.activeThreadId;
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }
}
