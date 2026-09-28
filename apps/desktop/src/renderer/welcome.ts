import type { AgentSummary, ThreadSummary } from './types';

export function timeGreeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
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
        (thread.preview || thread.title !== 'New thread' || thread.draft?.trim()),
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

export function welcomePrompts(agent?: AgentSummary): string[] {
  if (!agent) return [];
  // Personalize from the person's stated purpose, never from the model/provider or a test-like name.
  const purpose =
    agent.instructions === STARTER_INSTRUCTIONS ? '' : agent.instructions.toLocaleLowerCase();
  if (/research|sources|literature/.test(purpose))
    return [
      'Compare the strongest sources on a topic and show where they disagree.',
      'Turn my research notes into a concise briefing with sources.',
      'Help me investigate a question. Ask what I want to learn first.',
    ];
  if (/software|repository|coding|developer/.test(purpose))
    return [
      'Review the current changes and flag the risky parts.',
      'Summarize this project and suggest the next useful step.',
      'Help me investigate a bug. Ask what is going wrong first.',
    ];
  return [
    'Help me plan today around my calendar and priorities.',
    'Summarize the page I have open and suggest the next steps.',
    'Help me find a file. Ask me what I remember about it first.',
  ];
}
