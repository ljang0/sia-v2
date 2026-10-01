import type { AgentSummary, RendererApi, ThreadDetail } from '../types';
import { agentIdentity, agentInitials } from '../agentIdentity';
import { clone, type DemoApiContext } from './context';
import { threads } from './threads';

/** Demo threads and agents: selecting, creating, organizing, and searching them. */
export function demoConversationApi({ snapshot, listeners, mutate }: DemoApiContext) {
  return {
    async getSnapshot() {
      return clone(snapshot);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async selectAgent(agentId) {
      mutate((current) => {
        current.selectedAgentId = agentId;
        const selectedThreadBelongsToAgent = current.agents
          .find((agent) => agent.id === agentId)
          ?.threads.some((thread) => thread.id === current.selectedThreadId);
        if (!selectedThreadBelongsToAgent) {
          current.selectedThreadId = undefined;
          current.activeThread = undefined;
        }
      });
    },
    async selectThread(threadId) {
      mutate((current) => {
        const agent = current.agents.find((candidate) =>
          candidate.threads.some((thread) => thread.id === threadId),
        );
        current.selectedAgentId = agent?.id;
        current.selectedThreadId = threadId;
        current.activeThread = clone(threads[threadId]);
      });
    },
    async createThread(agentId) {
      const id = `thread-${Date.now()}`;
      mutate((current) => {
        const agent = current.agents.find((candidate) => candidate.id === agentId);
        if (!agent) return;
        const next: ThreadDetail = {
          id,
          agentId,
          title: 'New thread',
          updatedAt: new Date().toISOString(),
          status: 'idle',
          provider: agent.provider,
          model: agent.model,
          workspace: agent.workspace,
          events: [],
        };
        threads[id] = next;
        agent.threads.unshift(next);
        current.selectedAgentId = agentId;
        current.selectedThreadId = id;
        current.activeThread = next;
      });
      return id;
    },
    async renameThread(threadId, title) {
      mutate((current) => {
        for (const agent of current.agents) {
          const thread = agent.threads.find(({ id }) => id === threadId);
          if (thread) thread.title = title;
        }
        if (current.activeThread?.id === threadId) current.activeThread.title = title;
      });
    },
    async saveDraft(threadId, content) {
      mutate((current) => {
        for (const agent of current.agents) {
          const thread = agent.threads.find(({ id }) => id === threadId);
          if (thread) thread.draft = content || undefined;
        }
        if (current.activeThread?.id === threadId) {
          current.activeThread.draft = content || undefined;
        }
      });
    },
    async deleteThread(threadId) {
      mutate((current) => {
        for (const agent of current.agents) {
          agent.threads = agent.threads.filter(({ id }) => id !== threadId);
        }
        if (current.selectedThreadId === threadId) {
          current.selectedThreadId = undefined;
          current.activeThread = undefined;
        }
      });
    },
    async configureThread(threadId, model, reasoningEffort) {
      mutate((current) => {
        if (current.activeThread?.id === threadId) {
          current.activeThread.model = model;
          current.activeThread.reasoningEffort = reasoningEffort;
        }
      });
    },
    async archiveThread(threadId) {
      mutate((current) => {
        for (const agent of current.agents) {
          const target = agent.threads.find((thread) => thread.id === threadId);
          if (target) {
            agent.threads = agent.threads.filter((thread) => thread.id !== threadId);
            current.archivedThreads.push({
              ...target,
              archivedAt: new Date().toISOString(),
            });
          }
        }
        if (current.selectedThreadId === threadId) {
          current.selectedThreadId = undefined;
          current.activeThread = undefined;
        }
      });
    },
    async unarchiveThread(threadId) {
      mutate((current) => {
        const target = current.archivedThreads.find((thread) => thread.id === threadId);
        const agent = target
          ? current.agents.find((candidate) => candidate.id === target.agentId)
          : undefined;
        if (target && agent) {
          agent.threads.push({ ...target, archivedAt: undefined });
          current.archivedThreads = current.archivedThreads.filter(
            (thread) => thread.id !== threadId,
          );
        }
      });
    },
    async setThreadUnread(threadId, unread) {
      mutate((current) => {
        for (const agent of current.agents) {
          const thread = agent.threads.find(({ id }) => id === threadId);
          if (thread) thread.unread = unread;
        }
      });
    },
    async setThreadPinned(threadId, pinned) {
      mutate((current) => {
        for (const agent of current.agents) {
          const thread = agent.threads.find(({ id }) => id === threadId);
          if (thread) thread.pinned = pinned;
        }
      });
    },
    async forkThread(threadId) {
      const source = snapshot.activeThread?.id === threadId ? snapshot.activeThread : undefined;
      if (!source) return '';
      const id = `${threadId}-fork-${Date.now()}`;
      mutate((current) => {
        const fork = {
          ...clone(source),
          id,
          title: `${source.title} fork`,
          sourceThreadId: threadId,
        };
        current.agents.find((agent) => agent.id === source.agentId)?.threads.unshift(fork);
        current.activeThread = fork;
        current.selectedThreadId = id;
      });
      return id;
    },
    async handoffThread(threadId) {
      return threadId;
    },
    async cleanupWorktree() {
      return Promise.resolve();
    },
    async searchThreads(query) {
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return [];
      return Object.values(threads)
        .map((thread) => ({
          threadId: thread.id,
          threadTitle: thread.title,
          archived: snapshot.archivedThreads.some(({ id }) => id === thread.id),
          matches: thread.events
            .filter(
              (event) =>
                event.type === 'message' && event.content.toLocaleLowerCase().includes(needle),
            )
            .map((event) => ({
              itemId: event.id,
              excerpt: event.type === 'message' ? event.content : '',
              timestamp: 'timestamp' in event ? event.timestamp : thread.updatedAt,
              kind: 'message' as const,
            })),
        }))
        .filter(({ matches }) => matches.length > 0);
    },
    async setGoal(threadId, text) {
      mutate((current) => {
        if (current.activeThread?.id === threadId) {
          const now = new Date().toISOString();
          current.activeThread.goal = {
            text,
            status: 'running',
            createdAt: now,
            updatedAt: now,
          };
        }
      });
    },
    async pauseGoal(threadId) {
      mutate((current) => {
        if (current.activeThread?.id === threadId && current.activeThread.goal) {
          current.activeThread.goal.status = 'paused';
        }
      });
    },
    async resumeGoal(threadId) {
      mutate((current) => {
        if (current.activeThread?.id === threadId && current.activeThread.goal) {
          current.activeThread.goal.status = 'running';
        }
      });
    },
    async clearGoal(threadId) {
      mutate((current) => {
        if (current.activeThread?.id === threadId) current.activeThread.goal = undefined;
      });
    },
    async createAgent(draft) {
      const id = `agent-${Date.now()}`;
      const agent: AgentSummary = {
        ...draft,
        id,
        initials: agentInitials(draft.name),
        hue: draft.hue ?? agentIdentity(id),
        pinned: false,
        notificationsEnabled: true,
        threads: [],
      };
      mutate((current) => {
        current.agents.push(agent);
        current.selectedAgentId = id;
        current.selectedThreadId = undefined;
        current.activeThread = undefined;
        if (draft.startOnboarding)
          current.preferences.onboarding = { step: 'voice', agentId: id };
        else if (current.preferences.onboarding && !current.preferences.onboarding.agentId)
          current.preferences.onboarding = { step: 'complete' };
      });
      return id;
    },
    async updateAgent(agentId, draft) {
      mutate((current) => {
        const index = current.agents.findIndex((agent) => agent.id === agentId);
        const existing = current.agents[index];
        if (index < 0 || !existing) return;
        current.agents[index] = {
          ...existing,
          ...draft,
          initials: agentInitials(draft.name),
          hue: draft.hue ?? existing.hue,
        };
      });
    },
    async deleteAgent(agentId) {
      mutate((current) => {
        current.agents = current.agents.filter((agent) => agent.id !== agentId);
        if (current.selectedAgentId === agentId) {
          current.selectedAgentId = undefined;
          current.selectedThreadId = undefined;
          current.activeThread = undefined;
        }
      });
    },
    async setAgentPinned(agentId, pinned) {
      mutate((current) => {
        const agent = current.agents.find(({ id }) => id === agentId);
        if (agent) agent.pinned = pinned;
      });
    },
    async setAgentNotifications(agentId, enabled) {
      mutate((current) => {
        const agent = current.agents.find(({ id }) => id === agentId);
        if (agent) agent.notificationsEnabled = enabled;
      });
    },
    async duplicateAgent(agentId) {
      const source = snapshot.agents.find(({ id }) => id === agentId);
      if (!source) return '';
      const id = `${agentId}-copy-${Date.now()}`;
      mutate((current) => {
        current.agents.push({
          ...clone(source),
          id,
          name: `${source.name} copy`,
          pinned: false,
          threads: [],
        });
        current.selectedAgentId = id;
      });
      return id;
    },
  } satisfies Partial<RendererApi>;
}
