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

export function welcomePrompts(agent?: AgentSummary): string[] {
  if (!agent) return [];
  // Personalize from the person's stated purpose, never from the model/provider or a test-like name.
  const purpose = agent.instructions.toLocaleLowerCase();
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
