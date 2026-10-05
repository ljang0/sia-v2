import type { AgentSummary, RendererSnapshot } from '../types';
import { firstScheduleRunAt } from '../../shared/schedule-cadence';
import { iso, threads } from './threads';

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
      ({ events, ...thread }) => {
        const message = events.findLast((event) => event.type === 'message');
        return {
          ...thread,
          ...(message?.type === 'message'
            ? {
                preview: {
                  label:
                    message.role === 'assistant'
                      ? ('Latest reply' as const)
                      : ('Request' as const),
                  text: message.content.slice(0, 420),
                },
              }
            : {}),
        };
      },
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
    threads: [threads['thread-trip']!, threads['thread-inbox']!].map(
      ({ events, ...thread }) => {
        const message = events.findLast((event) => event.type === 'message');
        return {
          ...thread,
          ...(message?.type === 'message'
            ? {
                preview: {
                  label:
                    message.role === 'assistant'
                      ? ('Latest reply' as const)
                      : ('Request' as const),
                  text: message.content.slice(0, 420),
                },
              }
            : {}),
        };
      },
    ),
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
      plan: 'ChatGPT plan',
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
      plan: 'Included with Sia',
      model: 'super_nova_ext',
      description: 'Hosted model access through the Sia cloud relay.',
      status: 'ready',
      billedBy: 'Provided by model labs through Sia; shared preview limits apply.',
    },
    {
      id: 'byok',
      name: 'Your API key',
      plan: 'Your API key',
      model: '',
      description: 'Add an API key to use your own model.',
      status: 'needs-login',
      billedBy: 'Billed by your model provider to your own API key.',
    },
    {
      id: 'grok',
      name: 'Grok',
      model: 'grok-code-fast',
      description: 'Adapter retained for protocol testing; runtime startup is blocked.',
      status: 'disabled',
      billedBy: 'Uses an eligible xAI subscription or API account when enabled.',
      restriction:
        'Not available yet because inherited plugins, skills, and MCP cannot yet be excluded safely.',
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
      plan: 'Claude plan',
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
  schedules: [
    {
      id: 'schedule-inbox',
      threadId: 'thread-inbox',
      prompt: 'Summarize my inbox and tell me what needs a reply',
      cadence: 'weekdays',
      nextRunAt: demoNextRunAt(8, [1, 2, 3, 4, 5]),
      enabled: true,
      createdAt: iso(60 * 24 * 6),
      runCount: 4,
      lastRun: {
        id: 'run-inbox-4',
        startedAt: iso(60 * 20),
        finishedAt: iso(60 * 20 - 2),
        outcome: 'completed',
      },
    },
    {
      id: 'schedule-research',
      threadId: 'thread-research',
      prompt: 'Recap what changed in the research sources this week',
      cadence: 'weekly',
      days: [1, 4],
      nextRunAt: demoNextRunAt(16, [1, 4]),
      enabled: false,
      createdAt: iso(60 * 24 * 12),
      runCount: 2,
      maxRuns: 10,
      lastRun: {
        id: 'run-research-2',
        startedAt: iso(60 * 24 * 3),
        finishedAt: iso(60 * 24 * 3 - 4),
        outcome: 'failed',
      },
    },
  ],
};

/** The next local `hour`:00 on one of `days`, so the demo always shows an upcoming run. */
function demoNextRunAt(hour: number, days: readonly number[]): string {
  return firstScheduleRunAt(
    { cadence: 'weekly', days },
    { hour, minute: 0 },
    new Date(),
  ).toISOString();
}

/** `#demo?setup`: first-run Mac access with a realistic mix of granted and missing permissions. */
export function demoSetupSnapshot(variant?: string | null): RendererSnapshot {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.preferences.onboarding = {
    step: 'verify',
    agentId: snapshot.selectedAgentId!,
    permissionSetup: { includeApps: true, active: false },
  };
  snapshot.computer = {
    ...snapshot.computer,
    accessMode: 'mac',
    trust: 'auto',
    accessibility: 'allowed',
    screenRecording: 'not-requested',
    ...(variant === 'relaunch' ? { relaunchFor: ['screenRecording' as const] } : {}),
    messagesAccess: 'needs_full_disk_access',
    automation: {
      system_events: 'ready',
      safari: 'needs_permission',
      chrome: 'unavailable',
      calendar: 'ready',
      reminders: 'needs_permission',
      finder: 'ready',
      messages: 'denied',
    },
  };
  snapshot.voice = {
    ...snapshot.voice,
    engine: 'macos',
    dictationAvailable: true,
    speechRecognition: 'not-requested',
    pushToTalk: {
      available: true,
      enabled: false,
      accessibility: true,
      microphone: false,
      phase: 'idle',
    },
  };
  return snapshot;
}
