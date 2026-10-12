import { UNTITLED_THREAD_TITLE } from '../shared/plain-text';
import type { AgentSummary, AppConnection, ThreadSummary } from './types';

export function timeGreeting(now = new Date()): string {
  return { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' }[
    partOfDay(now)
  ];
}

/** A short, human "how long ago" for lists: "Just now", "5 min ago", "Yesterday", "Sep 12". */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (then.getTime() >= startOfToday) return `${Math.floor(minutes / 60)} hr ago`;
  if (then.getTime() >= startOfToday - 86_400_000) return 'Yesterday';
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function recentThreads(
  threads: readonly ThreadSummary[],
  currentId?: string,
): ThreadSummary[] {
  return threads
    .filter(
      (thread) =>
        thread.id !== currentId &&
        !thread.archivedAt &&
        (thread.preview || thread.title !== UNTITLED_THREAD_TITLE || thread.draft?.trim()),
    )
    .toSorted((a, b) => {
      const attention = (thread: ThreadSummary) =>
        thread.status === 'waiting' || thread.status === 'error' ? 1 : 0;
      return attention(b) - attention(a) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    })
    .slice(0, 2);
}

/** Instructions for the agent onboarding creates. They describe Sia, not the person's purpose. */
export const STARTER_INSTRUCTIONS = `You are Sia, a helpful personal assistant on the user's Mac. Help with everyday questions, writing, planning, research, and tasks in apps. Be concise, warm, and clear. Use the tools available to you to complete requested work. Explain the next step when access is missing. Use the provided action tools and follow the user's selected approval mode; when bypass is enabled, execute permitted actions without asking for each step. Never access passwords, secure fields, or authentication surfaces. Do not claim to have completed an action unless its result confirms it.`;

/** A suggested first task: a short title to scan and the full request Sia receives. */
export type StarterPrompt = {
  icon:
    | 'calendar'
    | 'todo'
    | 'moon'
    | 'mail'
    | 'chats'
    | 'document'
    | 'page'
    | 'search'
    | 'write'
    | 'compare'
    | 'notes'
    | 'question'
    | 'review'
    | 'summary'
    | 'bug';
  title: string;
  prompt: string;
};

type PartOfDay = 'morning' | 'afternoon' | 'evening';

function partOfDay(now: Date): PartOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const TIME_OF_DAY: Record<PartOfDay, StarterPrompt> = {
  morning: {
    title: 'Plan my day',
    prompt: 'Help me plan today. Ask what is on my plate, then put it in a sensible order.',
    icon: 'calendar',
  },
  afternoon: {
    title: 'Clear my to-do list',
    prompt: 'Help me get through my to-do list. Ask what is on it, then start with quick wins.',
    icon: 'todo',
  },
  evening: {
    title: 'Wrap up today',
    prompt:
      'Help me wrap up today: what got done, what is left, and what to start with tomorrow.',
    icon: 'moon',
  },
};

/** Suggestions that need a connected app, in the order they are offered. */
const APP_PROMPTS: { apps: AppConnection['id'][]; prompt: StarterPrompt }[] = [
  {
    apps: ['gmail'],
    prompt: {
      title: 'Triage my inbox',
      prompt: 'Find the emails in Gmail that need a reply from me and draft short answers.',
      icon: 'mail',
    },
  },
  {
    apps: ['slack'],
    prompt: {
      title: 'Catch up on Slack',
      prompt: 'Summarize what I missed in Slack and flag anything that needs my reply.',
      icon: 'chats',
    },
  },
  {
    apps: ['drive', 'docs'],
    prompt: {
      title: 'Summarize a document',
      prompt:
        'Find a recent document in my Google Drive and summarize it. Ask me which one first.',
      icon: 'document',
    },
  },
];

/** Suggestions that use Mac access, with nothing connected. */
const MAC_PROMPTS: StarterPrompt[] = [
  {
    title: 'Summarize a page',
    prompt: 'Summarize the page I have open and suggest the next steps.',
    icon: 'page',
  },
  {
    title: 'Find a file',
    prompt: 'Help me find a file. Ask me what I remember about it first.',
    icon: 'search',
  },
  {
    title: 'Write a message',
    prompt: 'Help me write a short message. Ask who it is for and what I want to say.',
    icon: 'write',
  },
];

const CHAT_PROMPTS: StarterPrompt[] = [
  {
    title: 'Write a message',
    prompt: 'Help me draft a thoughtful message. Ask who it is for and what I want to say.',
    icon: 'write',
  },
  {
    title: 'Plan a birthday gift',
    prompt:
      'Help me choose a birthday gift. Ask about the person, my budget, and the date first.',
    icon: 'question',
  },
];

const RESEARCH_PROMPTS: StarterPrompt[] = [
  {
    title: 'Compare sources',
    prompt: 'Compare the strongest sources on a topic and show where they disagree.',
    icon: 'compare',
  },
  {
    title: 'Brief my notes',
    prompt: 'Turn my research notes into a concise briefing with sources.',
    icon: 'notes',
  },
  {
    title: 'Investigate a question',
    prompt: 'Help me investigate a question. Ask what I want to learn first.',
    icon: 'question',
  },
];

const SOFTWARE_PROMPTS: StarterPrompt[] = [
  {
    title: 'Review changes',
    prompt: 'Review the current changes and flag the risky parts.',
    icon: 'review',
  },
  {
    title: 'Summarize the project',
    prompt: 'Summarize this project and suggest the next useful step.',
    icon: 'summary',
  },
  {
    title: 'Track down a bug',
    prompt: 'Help me investigate a bug. Ask what is going wrong first.',
    icon: 'bug',
  },
];

/**
 * Three suggested starts. An agent's stated purpose wins; otherwise the first fits the time of
 * day and the rest use the person's connected apps before falling back to things any Mac can do.
 */
export function welcomePrompts(
  agent?: AgentSummary,
  {
    now = new Date(),
    apps = [],
    macAccess = true,
  }: {
    now?: Date | undefined;
    apps?: readonly AppConnection[] | undefined;
    macAccess?: boolean;
  } = {},
): StarterPrompt[] {
  if (!agent) return [];
  // Personalize from the person's stated purpose, never from the model/provider or a test-like name.
  const purpose =
    agent.instructions === STARTER_INSTRUCTIONS ? '' : agent.instructions.toLocaleLowerCase();
  if (/research|sources|literature/.test(purpose)) return RESEARCH_PROMPTS;
  if (/software|repository|coding|developer/.test(purpose)) return SOFTWARE_PROMPTS;
  const connected = new Set(
    apps.filter((app) => app.status === 'connected' && app.enabled).map((app) => app.id),
  );
  const fromApps = APP_PROMPTS.filter((entry) =>
    entry.apps.some((id) => connected.has(id)),
  ).map((entry) => entry.prompt);
  return [
    TIME_OF_DAY[partOfDay(now)],
    ...fromApps,
    ...(macAccess ? MAC_PROMPTS : CHAT_PROMPTS),
  ].slice(0, 3);
}
