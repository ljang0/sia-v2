import type {
  AgentDraft,
  AgentSummary,
  ApprovalDecision,
  RendererApi,
  RendererSnapshot,
  ThreadDetail,
  ThreadEvent,
} from './types';
import { agentIdentity } from './agentIdentity';
import { RESEARCH_CONSENT_VERSION } from '../shared/bridge';

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const planningEvents: ThreadEvent[] = [
  {
    id: 'message-1',
    type: 'message',
    role: 'user',
    content:
      'Find the latest research notes in Drive, summarize the open questions, and draft a short update for the team.',
    timestamp: iso(18),
  },
  {
    id: 'activity-1',
    type: 'activity',
    kind: 'connector',
    title: 'Searched Google Drive',
    detail: 'Research notes updated in the last 14 days',
    status: 'complete',
    timestamp: iso(17),
  },
  {
    id: 'activity-2',
    type: 'activity',
    kind: 'plan',
    title: 'Reviewed 6 notes',
    detail: 'Grouped unresolved questions by browser reliability, permissions, and onboarding.',
    status: 'complete',
    timestamp: iso(15),
  },
  {
    id: 'message-2',
    type: 'message',
    role: 'assistant',
    provider: 'codex',
    content:
      'The main open questions are whether background browser actions stay exact when tabs move, how clearly users understand foreground takeover, and where provider setup becomes confusing. I drafted a concise project update focused on those three risks.',
    timestamp: iso(12),
  },
  {
    id: 'approval-1',
    type: 'approval',
    status: 'pending',
    timestamp: iso(10),
    request: {
      id: 'approval-1',
      kind: 'connector',
      title: 'Create a Gmail draft',
      app: 'Gmail',
      account: 'lawrence@example.com',
      action: 'Create draft',
      destination: 'product-team@example.com',
      preview:
        'Subject: Sia alpha research update\n\nThis week we narrowed the remaining risks to browser reliability, permission clarity, and provider onboarding. The next test pass will focus on those three areas.',
      expiresAt: iso(-5),
    },
  },
];

const threads: Record<string, ThreadDetail> = {
  'thread-research': {
    id: 'thread-research',
    agentId: 'agent-work',
    title: 'Weekly research update',
    updatedAt: iso(10),
    status: 'waiting',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/Users/lawrencejang/Projects/sia-research',
    events: planningEvents,
  },
  'thread-browser': {
    id: 'thread-browser',
    agentId: 'agent-work',
    title: 'Browser reliability audit',
    updatedAt: iso(120),
    status: 'queued',
    queueReason: 'Waiting for the Chrome tab used by Weekly research update',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/Users/lawrencejang/Projects/sia-research',
    events: [
      {
        id: 'queued-notice',
        type: 'notice',
        tone: 'info',
        title: 'Queued safely',
        detail:
          'This task needs the same Chrome tab as another turn. It will start when that tab is released.',
      },
      {
        id: 'queued-message',
        type: 'message',
        role: 'user',
        content: 'Re-run the browser reliability checklist on the signed-in test account.',
        timestamp: iso(121),
      },
    ],
  },
  'thread-inbox': {
    id: 'thread-inbox',
    agentId: 'agent-personal',
    title: 'Triage today’s inbox',
    updatedAt: iso(1460),
    status: 'idle',
    provider: 'meta',
    model: 'Sia Meta',
    workspace: '/Users/lawrencejang/Documents',
    events: [
      {
        id: 'inbox-message',
        type: 'message',
        role: 'assistant',
        provider: 'meta',
        content:
          'I grouped the unread messages into three that need replies, four updates to review later, and two newsletters.',
        timestamp: iso(1460),
      },
    ],
  },
};

const agents: AgentSummary[] = [
  {
    id: 'agent-work',
    name: 'Research partner',
    initials: 'RP',
    hue: 0,
    pinned: true,
    notificationsEnabled: true,
    instructions:
      'Help me turn research into clear decisions. Prefer primary sources and concise updates.',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/Users/lawrencejang/Projects/sia-research',
    threads: [threads['thread-research']!, threads['thread-browser']!].map(
      ({ events: _events, ...thread }) => thread,
    ),
  },
  {
    id: 'agent-personal',
    name: 'Personal admin',
    initials: 'PA',
    hue: 2,
    pinned: false,
    notificationsEnabled: true,
    instructions:
      'Handle routine personal admin carefully. Draft before sending and keep private information private.',
    provider: 'meta',
    model: 'Sia Meta',
    workspace: '/Users/lawrencejang/Documents',
    threads: [threads['thread-inbox']!].map(({ events: _events, ...thread }) => thread),
  },
];

export const demoSnapshot: RendererSnapshot = {
  connection: 'online',
  cloudAuth: { state: 'signed-in', email: 'lawrence@example.com' },
  agents,
  selectedAgentId: 'agent-work',
  selectedThreadId: 'thread-research',
  activeThread: threads['thread-research']!,
  providers: [
    {
      id: 'codex',
      name: 'Codex',
      model: 'gpt-5.6-sol',
      description: 'Local coding and computer work through the official app server.',
      status: 'ready',
      version: '0.147.0',
      usage: {
        requests: 18,
        inputTokens: 42_800,
        outputTokens: 9_400,
        cachedInputTokens: 21_100,
        lastUsedAt: iso(1480),
        providerReported: true,
      },
      billedBy: 'Uses your existing ChatGPT Codex subscription.',
    },
    {
      id: 'meta',
      name: 'Included models',
      model: 'super_nova_ext',
      description: 'Hosted model access through the Sia cloud relay.',
      status: 'ready',
      billedBy: 'Provided by model labs through Sia; shared preview limits apply.',
    },
    {
      id: 'grok',
      name: 'Grok',
      model: 'grok-code-fast',
      description: 'Adapter retained for protocol testing; runtime startup is blocked.',
      status: 'disabled',
      billedBy: 'Uses an eligible xAI subscription or API account when enabled.',
      restriction:
        'Not in the external alpha because inherited plugins, skills, and MCP cannot yet be excluded safely.',
    },
    {
      id: 'gemini',
      name: 'Gemini',
      model: 'gemini-2.5-pro',
      description: 'Gemini CLI through a paid API or organization account.',
      status: 'needs-login',
      billedBy: 'Requires paid Gemini API, Vertex AI, or organizational Code Assist.',
      restriction:
        'Requires standard ACP model configuration and a billing-enabled API, Vertex AI, or Code Assist account.',
    },
    {
      id: 'claude',
      name: 'Claude',
      model: 'sonnet',
      description: 'Claude Code CLI with isolated Sia tools and non-persistent sessions.',
      status: 'ready',
      account: 'Authenticated with Claude',
      version: '2.1.238',
      billedBy: 'Uses your existing Claude Code subscription, API, or supported cloud account.',
    },
  ],
  apps: [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Search mail, read threads, and create or send drafts.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      googleAccess: 'read_write',
      permissions: ['Search and read mail', 'Create and send drafts'],
    },
    {
      id: 'drive',
      name: 'Google Drive',
      description: 'Find and read files, then upload or share.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      googleAccess: 'read_write',
      permissions: ['Find and read selected files', 'Upload and share files'],
    },
    {
      id: 'docs',
      name: 'Google Docs',
      description: 'Read, create, and append to documents.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      googleAccess: 'read_write',
      permissions: ['Read document text', 'Create and append to documents'],
    },
    {
      id: 'sheets',
      name: 'Google Sheets',
      description: 'Read and write bounded spreadsheet ranges.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      googleAccess: 'read_write',
      permissions: ['Read bounded ranges', 'Create, update, and append values'],
    },
    {
      id: 'slides',
      name: 'Google Slides',
      description: 'Read, create, and append Markdown-authored slides.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      googleAccess: 'read_write',
      permissions: ['Read presentation text', 'Create and append slides'],
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Search messages, read threads, and post.',
      status: 'connected',
      enabled: true,
      account: 'lawrence@example.com',
      permissions: ['Search and read messages', 'Post messages'],
    },
  ],
  browser: {
    status: 'attached',
    profileName: 'Personal',
    attached: true,
    availableWindows: [],
    snapshotLabel: 'Chrome window 2, tab 3',
    snapshotAt: iso(2),
    tabs: [
      {
        id: 'tab-drive',
        title: 'Sia research - Google Drive',
        origin: 'drive.google.com',
        active: true,
        granted: true,
      },
      {
        id: 'tab-docs',
        title: 'Research synthesis',
        origin: 'docs.google.com',
        active: false,
        granted: true,
      },
      {
        id: 'tab-mail',
        title: 'Inbox',
        origin: 'mail.google.com',
        active: false,
        granted: false,
      },
    ],
  },
  computer: {
    accessibility: 'allowed',
    screenRecording: 'allowed',
    trust: 'ask',
    messagesAccess: 'ready',
    chromeConnection: 'enabled',
    trajectoryLog: true,
    windows: [
      {
        id: 'window-notes',
        appName: 'Notes',
        title: 'Interview notes',
        granted: true,
        state: 'visible',
      },
      {
        id: 'window-preview',
        appName: 'Preview',
        title: 'alpha-flow.pdf',
        granted: false,
        state: 'occluded',
      },
    ],
  },
  voice: {
    status: 'connected',
    selectedVoiceId: 'voice-aria',
    selectedVoiceName: 'Aria',
    voices: [
      { id: 'voice-aria', name: 'Aria', category: 'premade' },
      { id: 'voice-milo', name: 'Milo', category: 'professional' },
    ],
    detail: 'Speech is processed by ElevenLabs only when you use a voice control.',
  },
  preferences: { completionSound: false },
  updates: {
    status: 'unconfigured',
    currentVersion: '0.1.0-alpha.17',
    detail: 'This preview build does not have a persistent signed update feed configured.',
  },
  research: {
    consented: true,
    capture: 'recording',
    allowedOrigins: ['github.com', 'developer.apple.com'],
    excludedPaths: ['~/Library', '~/Documents/Personal'],
    lastSyncedAt: iso(4),
    pendingItems: 0,
    pendingBytes: 0,
  },
  archivedThreads: [],
  schedules: [],
};

const clone = <T>(value: T): T => structuredClone(value);

export function createDemoRendererApi(seed = demoSnapshot): RendererApi {
  let snapshot = clone(seed);
  const listeners = new Set<(next: RendererSnapshot) => void>();

  const emit = () => {
    const next = clone(snapshot);
    listeners.forEach((listener) => listener(next));
  };

  const mutate = (update: (current: RendererSnapshot) => void) => {
    update(snapshot);
    emit();
  };

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
        initials: initialsFor(draft.name),
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
          initials: initialsFor(draft.name),
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
    async pickWorkspace() {
      return '/Users/lawrencejang/Projects/new-workspace';
    },
    async pickAttachments() {
      return [];
    },
    async dropAttachments() {
      return [];
    },
    async previewAttachment() {
      return { kind: 'unavailable', detail: 'Attach a local file in the desktop build.' };
    },
    async openAttachment() {},
    async revealAttachment() {},
    async sendMessage(threadId, content) {
      mutate((current) => {
        if (!current.activeThread || current.activeThread.id !== threadId) return;
        const event: ThreadEvent = {
          id: `message-${Date.now()}`,
          type: 'message',
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        };
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
    async createSchedule() {
      return Promise.resolve();
    },
    async setScheduleEnabled() {
      return Promise.resolve();
    },
    async deleteSchedule() {
      return Promise.resolve();
    },
    async runScheduleNow() {
      return Promise.resolve();
    },
    async cancelTurn(threadId) {
      mutate((current) => {
        if (current.activeThread?.id === threadId) current.activeThread.status = 'idle';
      });
    },
    async respondToApproval(approvalId, decision: ApprovalDecision) {
      mutate((current) => {
        const approval = current.activeThread?.events.find(
          (event) => event.type === 'approval' && event.id === approvalId,
        );
        if (approval?.type === 'approval') {
          approval.status = decision === 'approve' ? 'approved' : 'rejected';
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
    async setCapturePaused(paused) {
      mutate((current) => {
        if (!paused) {
          current.research.consented = true;
          current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
        }
        current.research.capture = paused ? 'paused' : 'recording';
      });
    },
    async declineResearchConsent() {
      mutate((current) => {
        current.research.consented = false;
        current.research.capture = 'paused';
        current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
      });
    },
    async openProviderSetup(provider) {
      mutate((current) => {
        const target = current.providers.find((item) => item.id === provider);
        if (target && target.status !== 'disabled') target.status = 'ready';
      });
    },
    async refreshProvider() {
      return Promise.resolve();
    },
    async connectGoogleApps() {
      mutate((current) => {
        for (const app of current.apps) {
          if (app.id === 'slack') continue;
          app.status = 'connected';
          app.account = app.account ?? 'lawrence@example.com';
          app.googleAccess = 'read_only';
        }
      });
    },
    async upgradeGoogleApps() {
      mutate((current) => {
        for (const app of current.apps) {
          if (app.id === 'slack') continue;
          app.googleAccess = 'read_write';
          app.upgrading = false;
        }
      });
    },
    async connectApp(app) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) {
          target.status = 'connected';
          target.account = target.account ?? 'lawrence@example.com';
          if (target.id !== 'slack') target.googleAccess = 'read_only';
        }
      });
    },
    async setAppEnabled(app, enabled) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) target.enabled = enabled;
      });
    },
    async disconnectApp(app) {
      mutate((current) => {
        const target = current.apps.find((item) => item.id === app);
        if (target) {
          target.status = 'disconnected';
          target.account = undefined;
          target.googleAccess = undefined;
          target.upgrading = false;
        }
      });
    },
    async startCloudSignIn(email) {
      mutate((current) => {
        current.cloudAuth = { state: 'code-sent', email };
      });
    },
    async completeCloudSignIn() {
      mutate((current) => {
        current.cloudAuth.state = 'signed-in';
        current.connection = 'online';
      });
    },
    async beginAdminMfa() {
      return { secretCode: 'DEMOADMINMFA' };
    },
    async completeAdminMfa() {
      mutate((current) => {
        current.cloudAuth.state = 'signed-in';
        current.cloudAuth.adminMfa = true;
      });
    },
    async signOutCloud() {
      mutate((current) => {
        current.cloudAuth = { state: 'signed-out' };
        current.connection = 'offline';
      });
    },
    async deleteCloudAccount() {
      mutate((current) => {
        current.agents = [];
        current.selectedAgentId = undefined;
        current.selectedThreadId = undefined;
        current.activeThread = undefined;
        current.apps = current.apps.map((app) => ({
          ...app,
          status: 'disconnected',
          account: undefined,
        }));
        current.browser = {
          status: 'detached',
          profileName: 'Chrome',
          attached: false,
          availableWindows: [],
          tabs: [],
        };
        current.research = {
          consented: false,
          capture: 'paused',
          allowedOrigins: [],
          excludedPaths: [],
          pendingItems: 0,
          pendingBytes: 0,
        };
        current.cloudAuth = { state: 'signed-out' };
        current.connection = 'offline';
      });
    },
    async connectBrowserAndContinue() {},
    async attachBrowser(windowId) {
      mutate((current) => {
        void windowId;
        current.browser.status = 'attached';
        current.browser.attached = true;
        current.browser.availableWindows = [];
      });
    },
    async openBrowserSite(url) {
      mutate((current) => {
        const origin = new URL(url.includes('://') ? url : `https://${url}`).origin;
        current.browser.tabs = [
          { id: 'demo-site', title: origin, origin, active: true, granted: true },
        ];
      });
    },
    async detachBrowser() {
      mutate((current) => {
        current.browser.status = 'detached';
        current.browser.attached = false;
        current.browser.tabs = current.browser.tabs.map((tab) => ({ ...tab, granted: false }));
      });
    },
    async setComputerAccessMode(mode) {
      mutate((current) => {
        current.computer.accessMode = mode;
      });
    },
    async setComputerTrust(trust) {
      mutate((current) => {
        current.computer.trust = trust;
      });
    },
    async setTrajectoryLog(enabled) {
      mutate((current) => {
        current.computer.trajectoryLog = enabled;
      });
    },
    async revealTrajectories() {},
    async refreshComputerPermissions() {},
    async requestComputerPermissions() {
      mutate((current) => {
        current.computer.accessibility = 'allowed';
        current.computer.screenRecording = 'allowed';
      });
    },
    async openMessages() {
      return Promise.resolve();
    },
    async configurePushToTalk() {
      throw new Error('Fn push-to-talk requires the macOS app.');
    },
    async acquireVoiceCapture() {
      return 'demo-voice';
    },
    async releaseVoiceCapture() {},
    async configureVoice() {
      mutate((current) => {
        current.voice = structuredClone(demoSnapshot.voice);
      });
    },
    async refreshVoices() {
      return Promise.resolve();
    },
    async selectVoice(voiceId) {
      mutate((current) => {
        const selected = current.voice.voices.find((voice) => voice.id === voiceId);
        if (!selected) return;
        current.voice.selectedVoiceId = selected.id;
        current.voice.selectedVoiceName = selected.name;
      });
    },
    async disconnectVoice() {
      mutate((current) => {
        current.voice = { status: 'disconnected', voices: [] };
      });
    },
    async assistantLibrary() {
      return { memories: [], workflows: [], context: false };
    },
    async restartForOnboarding() {
      mutate((current) => {
        current.preferences.onboarding = {
          ...current.preferences.onboarding,
          step: 'verify',
          restarted: true,
        };
        current.browser.attached = false;
        current.browser.status = 'detached';
      });
    },
    async setupMessages() {},
    async requestAutomationPermission() {},
    async setOnboarding(step) {
      mutate((current) => {
        current.preferences.onboarding = {
          step,
          ...(current.selectedAgentId ? { agentId: current.selectedAgentId } : {}),
        };
      });
    },
    async setCompletionSound(enabled) {
      mutate((current) => {
        current.preferences.completionSound = enabled;
      });
    },
    async composeFeedback() {},
    async checkForUpdates() {
      mutate((current) => {
        current.updates = {
          ...current.updates,
          status: 'current',
          detail: 'This demo is current.',
        };
      });
    },
    async openUpdateDownload() {},
    async transcribeVoice() {
      return 'Dictated request';
    },
    async startRealtimeVoice() {
      return crypto.randomUUID();
    },
    async appendRealtimeVoice() {
      return Promise.resolve();
    },
    async stopRealtimeVoice(_sessionId, commit) {
      return commit ? 'Realtime voice request' : '';
    },
    async speakText() {
      return { audioBase64: 'AQID', mimeType: 'audio/mpeg' };
    },
    async exportResearchData() {
      return Promise.resolve();
    },
    async deleteResearchData() {
      mutate((current) => {
        current.research.promptReviewedVersion = RESEARCH_CONSENT_VERSION;
        current.research.consented = false;
        current.research.capture = 'paused';
        current.research.allowedOrigins = [];
        current.research.pendingItems = 0;
        current.research.pendingBytes = 0;
      });
    },
    async listResearchInvites() {
      return { invites: [], limit: 20 };
    },
    async createResearchInvite(email) {
      return {
        email,
        invitedAt: new Date().toISOString(),
        status: 'invited',
      };
    },
    async listResearchParticipants() {
      return [];
    },
    async listResearchBatches() {
      return [];
    },
    async readResearchBatch() {
      return undefined;
    },
  };
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function agentToDraft(agent: AgentSummary): AgentDraft {
  return {
    name: agent.name,
    instructions: agent.instructions,
    provider: agent.provider,
    model: agent.model,
    workspace: agent.workspace,
    ...(agent.voiceId ? { voiceId: agent.voiceId } : {}),
  };
}
