import type { ThreadDetail, ThreadEvent } from '../types';

/** A timestamp `minutesAgo` minutes before now, so the demo always looks recent. */
export const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

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

/** A finished reply that edited files, so the demo can show Undo changes. */
const tripEvents: ThreadEvent[] = [
  {
    id: 'trip-request',
    type: 'message',
    role: 'user',
    content: 'Clean up my Lisbon trip notes and start a packing list.',
    timestamp: iso(300),
  },
  {
    id: 'trip-read',
    type: 'activity',
    kind: 'command',
    title: 'Read Lisbon trip.md',
    status: 'complete',
    timestamp: iso(299),
  },
  {
    id: 'trip-edit',
    type: 'activity',
    kind: 'other',
    toolName: 'fileChange',
    title: 'Changed 2 files',
    status: 'complete',
    timestamp: iso(298),
    presentation: {
      kind: 'file_change',
      files: [
        {
          path: '/Users/lawrencejang/Documents/Lisbon trip.md',
          change: 'update',
          diff: '@@ -1,3 +1,4 @@\n # Lisbon\n-flight fri 9am??\n+## Flights\n+- Friday, 9:00 AM\n hotel: Alfama\n',
        },
        {
          path: '/Users/lawrencejang/Documents/Packing list.md',
          change: 'add',
          diff: '# Packing list\n- Passport\n- Walking shoes\n',
        },
      ],
    },
  },
  {
    id: 'trip-reply',
    type: 'message',
    role: 'assistant',
    provider: 'codex',
    content:
      'I tidied **Lisbon trip.md** into sections and started **Packing list.md** with the basics.',
    timestamp: iso(297),
  },
];
export const demoTurnChanges = new Map<string, 'ready' | 'undone'>();

export const threads: Record<string, ThreadDetail> = {
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
  'thread-trip': {
    id: 'thread-trip',
    agentId: 'agent-personal',
    title: 'Lisbon trip notes',
    updatedAt: iso(297),
    status: 'idle',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/Users/lawrencejang/Documents',
    events: tripEvents,
  },
};

export function demoTurnChangesView(state: 'ready' | 'undone') {
  return {
    state,
    files: [
      { path: 'Lisbon trip.md', change: 'edited' as const },
      { path: 'Packing list.md', change: 'added' as const },
    ],
    blocked: [],
  };
}
